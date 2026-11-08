import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));
export const applications = [
  {
    slug: "seguridad",
    directory: "apps/app-seguridad",
    database: "seguridad_transversal",
    owner: "st_owner",
    runtime: "st_app",
    port: 4000,
    frontendPort: 5173,
  },
  {
    slug: "crm",
    directory: "apps/app-crm",
    database: "crm_app",
    owner: "crm_owner",
    runtime: "crm_runtime",
    port: 5001,
    frontendPort: 5174,
  },
  {
    slug: "almacen",
    directory: "apps/app-almacen",
    database: "almacen_app",
    owner: "almacen_owner",
    runtime: "almacen_runtime",
    port: 5002,
    frontendPort: 5175,
  },
  {
    slug: "facturacion",
    directory: "apps/app-facturacion",
    database: "facturacion_app",
    owner: "facturacion_owner",
    runtime: "facturacion_runtime",
    port: 5003,
    frontendPort: 5176,
  },
];
export const appPath = (app, relative = "") =>
  path.join(projectRoot, app.directory, relative);
export const backendEnv = (app) =>
  parse(readFileSync(appPath(app, "backend/.env")));
export const localEnv = () =>
  parse(readFileSync(path.join(projectRoot, ".env")));
