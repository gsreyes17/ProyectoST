import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { applications, appPath } from "./project.mjs";
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
  const frontend = appPath(app, "frontend");
  const require = createRequire(path.join(frontend, "package.json"));
  const vite = path.join(
    path.dirname(require.resolve("vite/package.json")),
    "bin/vite.js",
  );
  const result = spawnSync(
    process.execPath,
    [vite, "build", "--config", appPath(app, "frontend/vite.config.js")],
    { cwd: frontend, stdio: "inherit", windowsHide: true },
  );
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
