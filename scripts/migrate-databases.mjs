import pg from "pg";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applications, appPath, backendEnv } from "./project.mjs";
import { migrate } from "../apps/app-seguridad/database/migrate.js";

export async function migrateApplications() {
  await migrate(backendEnv(applications[0]).MIGRATION_DATABASE_URL);
  for (const app of applications.slice(1)) {
    const env = backendEnv(app);
    const client = new pg.Client({
      connectionString: env.MIGRATION_DATABASE_URL,
    });
    await client.connect();
    try {
      await client.query("SELECT pg_advisory_lock(824174)");
      await client.query(
        "CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
      );
      const directory = appPath(app, "database/migrations");
      for (const name of (await readdir(directory))
        .filter((name) => name.endsWith(".sql"))
        .sort()) {
        if (
          (
            await client.query(
              "SELECT 1 FROM schema_migrations WHERE name=$1",
              [name],
            )
          ).rowCount
        )
          continue;
        await client.query("BEGIN");
        try {
          await client.query(
            await readFile(path.join(directory, name), "utf8"),
          );
          await client.query("INSERT INTO schema_migrations(name) VALUES($1)", [
            name,
          ]);
          await client.query("COMMIT");
          console.log(`${app.database}: ${name}`);
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      }
      // El SQL de permisos es compartible y se mantiene junto al esquema de esta app.
      await client.query(
        await readFile(appPath(app, "database/permissions.sql"), "utf8"),
      );
    } finally {
      await client.end();
    }
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrateApplications().catch((error) => {
    console.error("Migración pendiente:", error.code || error.message);
    process.exitCode = 1;
  });
}
