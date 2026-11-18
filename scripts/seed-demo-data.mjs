import pg from "pg";
import { readFile } from "node:fs/promises";
import { applications, appPath, backendEnv } from "./project.mjs";

// Datos de ejemplo para llenar las grillas de las demos. Cada app lee su propio
// `database/seed-data.json` y escribe solo en su base, con su usuario de ejecución.
// Es repetible: un registro idéntico que ya existe no se vuelve a insertar, y no
// se modifica ni se borra ningún registro creado desde las pantallas.
try {
  for (const app of applications.slice(1)) {
    const data = JSON.parse(
      await readFile(appPath(app, "database/seed-data.json"), "utf8"),
    );
    const { pages } = JSON.parse(
      await readFile(appPath(app, "backend/app.json"), "utf8"),
    );
    const client = new pg.Client({
      connectionString: backendEnv(app).DATABASE_URL,
    });
    await client.connect();
    try {
      let added = 0;
      for (const [module, records] of Object.entries(data)) {
        const page = pages.find((page) => page.code === module);
        if (!page)
          throw new Error(`${app.slug}: ${module} no existe en app.json.`);
        const keys = page.columns.map((column) => column.key).sort();
        for (const record of records) {
          if (Object.keys(record).sort().join() !== keys.join())
            throw new Error(
              `${app.slug}: un registro de ${module} no coincide con sus columnas.`,
            );
          const { rowCount } = await client.query(
            `INSERT INTO records(module,data) SELECT $1::varchar,$2::jsonb
            WHERE NOT EXISTS (SELECT 1 FROM records WHERE module=$1::varchar AND data=$2::jsonb)`,
            [module, JSON.stringify(record)],
          );
          added += rowCount;
        }
      }
      console.log(
        `${app.database}: ${added} registros de ejemplo agregados${added ? "" : " (ya estaban cargados)"}.`,
      );
    } finally {
      await client.end();
    }
  }
} catch (error) {
  console.error("Datos de ejemplo pendientes:", error.code || error.message);
  process.exitCode = 1;
}
