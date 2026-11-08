import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parse } from "dotenv";
import path from "node:path";
import { applications, appPath, projectRoot, backendEnv } from "./project.mjs";

const rootFile = path.join(projectRoot, ".env");
const legacy = existsSync(rootFile) ? parse(readFileSync(rootFile)) : {};
const secret = () => randomBytes(32).toString("hex");
for (const app of applications) {
  const target = appPath(app, "backend/.env");
  if (existsSync(target)) {
    console.log(`${app.slug}: configuracion existente conservada.`);
    continue;
  }
  const values = parse(readFileSync(appPath(app, "backend/.env.example")));
  for (const [key, value] of Object.entries(values)) {
    if (app.slug === "seguridad" && legacy[key] !== undefined)
      values[key] = legacy[key];
    else if (key === "APP_KEY")
      values[key] = backendEnv(applications[0])[
        `${app.slug.toUpperCase()}_APP_KEY`
      ];
    else if (value.includes("GENERAR"))
      values[key] = value.replace(
        /GENERAR_32_BYTES_HEXADECIMALES|GENERAR/g,
        () => secret(),
      );
  }
  writeFileSync(
    target,
    Object.entries(values)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join("\n") + "\n",
  );
  console.log(`${app.slug}: .env privado creado.`);
}
// La configuracion global solo sirve para instalar las bases; los runtimes usan su propio .env.
const rootValues = parse(readFileSync(path.join(projectRoot, ".env.example")));
for (const key of Object.keys(rootValues))
  rootValues[key] = legacy[key] ?? rootValues[key];
writeFileSync(
  rootFile,
  Object.entries(rootValues)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join("\n") + "\n",
);
console.log(
  "Configuracion global de instalacion preparada sin mostrar secretos.",
);
