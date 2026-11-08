import pg from "pg";
import { applications, backendEnv, localEnv } from "./project.mjs";
import { migrateApplications } from "./migrate-databases.mjs";

const quoteId = (value) => '"' + value.replaceAll('"', '""') + '"';
const quoteValue = (value) => "'" + value.replaceAll("'", "''") + "'";
const install = localEnv();
const admin = new pg.Client({
  host: install.POSTGRES_ADMIN_HOST || "127.0.0.1",
  port: Number(install.POSTGRES_ADMIN_PORT || 5432),
  user: install.POSTGRES_ADMIN_USER || "postgres",
  password:
    process.env.POSTGRES_ADMIN_PASSWORD ||
    install.POSTGRES_ADMIN_PASSWORD ||
    undefined,
  database: "postgres",
  connectionTimeoutMillis: 5000,
});
try {
  await admin.connect();
  const version = Number(
    (await admin.query("SHOW server_version_num")).rows[0].server_version_num,
  );
  if (Math.floor(version / 10000) !== 17)
    throw new Error("Se requiere PostgreSQL 17.");
  // Validar todos los destinos antes de modificar roles o permisos.
  for (const app of applications) {
    const env = backendEnv(app);
    for (const [key, role] of [
      ["MIGRATION_DATABASE_URL", app.owner],
      ["DATABASE_URL", app.runtime],
    ]) {
      const url = new URL(env[key]);
      if (
        url.pathname !== `/${app.database}` ||
        decodeURIComponent(url.username) !== role ||
        !url.password
      )
        throw new Error(`Configuracion invalida de ${app.slug}.`);
      if (
        url.hostname !== install.POSTGRES_ADMIN_HOST &&
        !(
          url.hostname === "127.0.0.1" &&
          install.POSTGRES_ADMIN_HOST === "localhost"
        )
      )
        throw new Error(
          "Las conexiones deben apuntar al servidor de instalacion.",
        );
      const existing = await admin.query(
        "SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=$1",
        [role],
      );
      if (
        existing.rows.some(
          (row) => row.rolsuper || row.rolcreatedb || row.rolcreaterole,
        )
      )
        throw new Error(
          `El rol ${role} existente tiene privilegios incompatibles.`,
        );
    }
    const database = await admin.query(
      "SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1",
      [app.database],
    );
    if (database.rowCount && database.rows[0].owner !== app.owner)
      throw new Error(
        `La base ${app.database} ya existe con otro propietario; se conserva sin cambios.`,
      );
  }
  for (const app of applications) {
    const env = backendEnv(app);
    for (const key of ["MIGRATION_DATABASE_URL", "DATABASE_URL"]) {
      const url = new URL(env[key]);
      const role = decodeURIComponent(url.username);
      if (
        !(await admin.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [role]))
          .rowCount
      ) {
        await admin.query(
          `CREATE ROLE ${quoteId(role)} LOGIN PASSWORD ${quoteValue(decodeURIComponent(url.password))} NOSUPERUSER NOCREATEDB NOCREATEROLE`,
        );
        console.log(`Rol creado: ${role}`);
      }
    }
    if (
      !(
        await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [
          app.database,
        ])
      ).rowCount
    ) {
      await admin.query(
        `CREATE DATABASE ${quoteId(app.database)} OWNER ${quoteId(app.owner)}`,
      );
      console.log(`Base creada: ${app.database}`);
    }
    await admin.query(
      `GRANT CONNECT ON DATABASE ${quoteId(app.database)} TO ${quoteId(app.owner)},${quoteId(app.runtime)}`,
    );
    await admin.query(
      `REVOKE CONNECT,TEMPORARY ON DATABASE ${quoteId(app.database)} FROM PUBLIC`,
    );
  }
  await migrateApplications();
  console.log(
    "Cuatro bases preparadas. No se modificaron las cuentas ni las contrasenas existentes.",
  );
} catch (error) {
  console.error("Instalacion pendiente:", error.code || error.message);
  process.exitCode = 1;
} finally {
  await admin.end().catch(() => {});
}
