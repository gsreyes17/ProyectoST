import "../apps/app-seguridad/backend/src/load-env.js";
import { seed } from "../apps/app-seguridad/database/seed.js";
import { pool } from "../apps/app-seguridad/backend/src/db.js";
import { readFile, writeFile } from "node:fs/promises";
import { applications, appPath } from "./project.mjs";

try {
  const clients = await seed();
  for (const app of applications.slice(1)) {
    const client = clients.find((client) => client.slug === app.slug);
    const file = appPath(app, "backend/.env");
    const text = await readFile(file, "utf8");
    // Solo configura la integracion; las conexiones a las bases propias permanecen intactas.
    const output = text
      .replace(/^APP_ID=.*$/m, `APP_ID="${client.id}"`)
      .replace(/^APP_KEY=.*$/m, `APP_KEY="${client.key}"`);
    await writeFile(file, output);
    console.log(`${app.slug}: identificador de integracion configurado.`);
  }
} catch (error) {
  console.error("Carga inicial pendiente:", error.code || error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
