import dotenv from "dotenv";
import pg from "pg";
import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHmac, timingSafeEqual } from "node:crypto";

dotenv.config({
  path: fileURLToPath(new URL("./.env", import.meta.url)),
  quiet: true,
});
const settings = {
  ...JSON.parse(readFileSync(new URL("./app.json", import.meta.url))),
  id: Number(process.env.APP_ID),
  key: process.env.APP_KEY,
  port: Number(process.env.PORT || 5003),
};
const coreUrl = process.env.CORE_URL;
if (!settings.id || !settings.key || !coreUrl || !process.env.DATABASE_URL)
  throw new Error(
    "Configura el .env privado de Facturacion y ejecuta db:seed.",
  );
const db = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 3000,
});
db.on("error", () =>
  console.error("Se perdio una conexion con la base de Facturacion."),
);
const cookieName = "st_demo_facturacion_session";
const secure = process.env.COOKIE_SECURE === "true";
const cookieOptions = { httpOnly: true, secure, sameSite: "lax", path: "/" };
const csrf = (token) =>
  createHmac("sha256", settings.key).update(`csrf:${token}`).digest("hex");
const app = express();
app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "img-src": ["'self'", "data:"],
        "upgrade-insecure-requests": secure ? [] : null,
      },
    },
    strictTransportSecurity: secure ? undefined : false,
  }),
);
app.use(express.json({ limit: "24kb" }), cookieParser());
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) res.set("Cache-Control", "no-store");
  const origin = req.get("Origin");
  if (
    req.method !== "GET" &&
    origin &&
    ![
      `http://localhost:${settings.port}`,
      `http://127.0.0.1:${settings.port}`,
      `http://localhost:${process.env.FRONTEND_PORT || 5176}`,
      `http://127.0.0.1:${process.env.FRONTEND_PORT || 5176}`,
    ].includes(origin)
  )
    return res.status(403).json({ error: "Origen no permitido." });
  next();
});
async function upstream(endpoint, req, body, method) {
  const response = await fetch(`${coreUrl}/api/v1${endpoint}`, {
    method: method || req.method,
    headers: {
      "X-App-Id": String(settings.id),
      "X-App-Key": settings.key,
      "Content-Type": "application/json",
      ...(req.cookies[cookieName]
        ? { Authorization: `Bearer ${req.cookies[cookieName]}` }
        : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(5000),
  });
  return { status: response.status, data: await response.json() };
}
app.get("/api/v1/public/config", async (req, res) => {
  const result = await upstream("/public/config", req);
  res.status(result.status).json({
    ...result.data,
    mode: "demo",
    appName: settings.name,
    slug: settings.slug,
    color: settings.color,
    description: settings.description,
  });
});
const authPaths = new Set([
  "/auth/login-step1",
  "/auth/login-step2",
  "/auth/mfa/enroll",
  "/auth/mfa/confirm",
  "/auth/select-role",
]);
app.post("/api/v1/auth/{*route}", async (req, res) => {
  const endpoint = req.path.replace("/api/v1", "");
  if (endpoint === "/auth/logout") {
    const expected = req.cookies[cookieName]
      ? csrf(req.cookies[cookieName])
      : "";
    const incoming = req.get("X-CSRF-Token") || "";
    if (
      !expected ||
      incoming.length !== expected.length ||
      !timingSafeEqual(Buffer.from(incoming), Buffer.from(expected))
    )
      return res
        .status(403)
        .json({ error: "Verificación de solicitud inválida." });
  } else if (!authPaths.has(endpoint))
    return res.status(404).json({ error: "Endpoint no disponible." });
  const result = await upstream(endpoint, req, req.body);
  if (result.data.sessionToken) {
    res.cookie(cookieName, result.data.sessionToken, {
      ...cookieOptions,
      expires: new Date(result.data.expires_at),
    });
    result.data.csrfToken = csrf(result.data.sessionToken);
    delete result.data.sessionToken;
  }
  if (endpoint === "/auth/logout") res.clearCookie(cookieName, cookieOptions);
  res.status(result.status).json(result.data);
});
app.get("/api/v1/me", async (req, res) => {
  const result = await upstream("/me", req);
  if (result.status === 200)
    result.data.csrfToken = csrf(req.cookies[cookieName]);
  res.status(result.status).json(result.data);
});
app.get("/api/v1/navigation/menus", async (req, res) => {
  const result = await upstream("/navigation/menus", req);
  res.status(result.status).json(result.data);
});
async function authorizePage(route, req) {
  const page = settings.pages.find((page) => page.route === route);
  if (!page) return { status: 404, data: { error: "Página no encontrada." } };
  const result = await upstream(
    "/auth/introspect",
    req,
    { permission: page.code },
    "POST",
  );
  return result.status === 200
    ? { status: 200, data: page, session: result.data.session }
    : result;
}
app.get("/api/v1/integration/status", async (req, res) => {
  const permission = await upstream("/auth/introspect", req, {}, "POST");
  if (permission.status !== 200)
    return res.status(permission.status).json(permission.data);
  const { rows } = await db.query(
    `SELECT current_database() AS database,current_user AS database_user,
    (SELECT count(*)::int FROM integration_access WHERE iam_user_id=$1) AS own_accesses`,
    [permission.data.session.user_id],
  );
  res.json({ application: "facturacion", ...rows[0] });
});
app.get("/api/v1/demo/page", async (req, res) => {
  const result = await authorizePage(req.query.path, req);
  if (result.status !== 200) return res.status(result.status).json(result.data);
  // La autorizacion ya se completo. Solo ahora se consulta la base de esta app.
  const { rows } = await db.query(
    `INSERT INTO integration_access(iam_user_id,permission_code,route)
    VALUES($1,$2,$3) RETURNING id,current_database() AS database`,
    [result.session.user_id, result.data.code, result.data.route],
  );
  res.json({
    ...result.data,
    database: rows[0].database,
    access_id: rows[0].id,
  });
});
app.use("/api", (req, res) =>
  res.status(404).json({ error: "Endpoint no disponible." }),
);
const frontend = fileURLToPath(new URL("../frontend/dist/", import.meta.url));
app.use(express.static(frontend, { index: false }));
app.get("/{*route}", async (req, res) => {
  const status =
    req.path === "/" ? 200 : (await authorizePage(req.path, req)).status;
  res.status(status).sendFile(`${frontend}/index.html`);
});
app.use((error, req, res, next) =>
  res.status(error.status || 503).json({
    error: "El servicio de seguridad no está disponible. Intenta nuevamente.",
  }),
);
app.listen(settings.port, "127.0.0.1", () =>
  console.log(`Facturación: http://localhost:${settings.port}`),
);
