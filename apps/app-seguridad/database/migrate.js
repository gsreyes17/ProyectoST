import "../backend/src/load-env.js";
import pg from "pg";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export async function migrate(
  connectionString = process.env.MIGRATION_DATABASE_URL,
) {
  if (!connectionString) throw new Error("Configura MIGRATION_DATABASE_URL.");
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock(824173)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW())",
    );
    const folder = new URL("./migrations/", import.meta.url);
    for (const name of (await readdir(folder))
      .filter((name) => name.endsWith(".sql"))
      .sort()) {
      if (
        (
          await client.query("SELECT 1 FROM schema_migrations WHERE name=$1", [
            name,
          ])
        ).rowCount
      )
        continue;
      await client.query("BEGIN");
      try {
        await client.query(await readFile(new URL(name, folder), "utf8"));
        await client.query("INSERT INTO schema_migrations(name) VALUES ($1)", [
          name,
        ]);
        await client.query("COMMIT");
        console.log(`Migración aplicada: ${name}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    // Los roles son creados por db:setup; las credenciales de ejecución carecen de DDL.
    const runtime = new URL(process.env.DATABASE_URL).username;
    const quoted = '"' + runtime.replaceAll('"', '""') + '"';
    await client.query(`GRANT USAGE ON SCHEMA public TO ${quoted}`);
    await client.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC, ${quoted}`);
    await client.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${quoted}`,
    );
    await client.query(
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${quoted}`,
    );
    await client.query(
      `REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM ${quoted}`,
    );
    await client.query(`REVOKE ALL ON schema_migrations FROM ${quoted}`);
  } finally {
    await client.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate().catch((error) => {
    console.error(
      "No se pudieron aplicar las migraciones:",
      error.message.replace(/postgresql:\/\/[^\s]+/g, "[conexión]"),
    );
    process.exitCode = 1;
  });
}
