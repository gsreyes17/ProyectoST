import { spawnSync } from "node:child_process";
import { applications, appPath, projectRoot } from "./project.mjs";
import path from "node:path";

const selected = process.argv[2];
if (selected && !applications.some((app) => app.slug === selected))
  throw new Error(
    "Aplicación desconocida. Usa seguridad, crm, almacen o facturacion.",
  );
for (const app of applications.filter(
  (app) => !selected || app.slug === selected,
)) {
  console.log(`Compilando frontend: ${app.slug}`);
  const result = spawnSync(
    process.execPath,
    [
      path.join(projectRoot, "node_modules/vite/bin/vite.js"),
      "build",
      "--config",
      appPath(app, "frontend/vite.config.js"),
    ],
    { cwd: projectRoot, stdio: "inherit", windowsHide: true },
  );
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
