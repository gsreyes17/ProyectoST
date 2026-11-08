import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { applications, appPath, backendEnv, projectRoot } from "./project.mjs";
import { jdbcFile } from "./setup-java.mjs";

const selected = process.argv[2];
if (selected && !applications.some((app) => app.slug === selected))
  throw new Error("Selecciona seguridad, crm, almacen o facturacion.");
const targets = applications.filter(
  (app) => !selected || app.slug === selected,
);
for (const app of targets) {
  if (!existsSync(appPath(app, "frontend/dist/index.html")))
    throw new Error(`Compila el frontend de ${app.slug} con pnpm run build.`);
  if (!existsSync(appPath(app, "backend/.env")))
    throw new Error(`Configura ${app.directory}/backend/.env.`);
}
const java = targets.find((app) => app.slug === "almacen");
const javaClasses = appPath(
  applications.find((app) => app.slug === "almacen"),
  "backend/.local/classes",
);
if (java) {
  if (!existsSync(jdbcFile))
    throw new Error("Ejecuta primero pnpm run java:setup.");
  mkdirSync(javaClasses, { recursive: true });
  const compile = spawnSync(
    "javac",
    [
      "-encoding",
      "UTF-8",
      "-d",
      javaClasses,
      ...["Json", "Config", "Database", "Main"].map((name) =>
        appPath(java, `backend/src/${name}.java`),
      ),
    ],
    { stdio: "inherit", windowsHide: true },
  );
  if (compile.error || compile.status !== 0) process.exit(compile.status || 1);
}
const children = [];
let closing = false;
function close(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill();
  setTimeout(() => process.exit(code), 500);
}
for (const app of targets) {
  const env = { ...process.env, ...backendEnv(app) };
  delete env.POSTGRES_ADMIN_PASSWORD;
  const python = path.join(
    projectRoot,
    process.platform === "win32"
      ? ".venv/Scripts/python.exe"
      : ".venv/bin/python",
  );
  const command =
    app.slug === "crm"
      ? python
      : app.slug === "almacen"
        ? "java"
        : process.execPath;
  const args =
    app.slug === "seguridad"
      ? ["src/server.js"]
      : app.slug === "facturacion"
        ? ["app.js"]
        : app.slug === "crm"
          ? [
              "-m",
              "uvicorn",
              "main:app",
              "--host",
              "127.0.0.1",
              "--port",
              String(env.PORT),
              "--no-access-log",
            ]
          : [
              "-Dfile.encoding=UTF-8",
              "-cp",
              javaClasses + path.delimiter + jdbcFile,
              "Main",
            ];
  const child = spawn(command, args, {
    cwd: appPath(app, "backend"),
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  children.push(child);
  child.on("error", (error) => {
    console.error(`No se pudo iniciar ${app.slug}: ${error.code}`);
    close(1);
  });
  child.on("exit", (code) => {
    if (!closing && code !== null) close(code || 1);
  });
}
process.on("SIGINT", () => close());
process.on("SIGTERM", () => close());
