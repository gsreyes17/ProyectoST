import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { pool } from "./db.js";
import {
  HttpError,
  validate,
  csrfToken,
  equalToken,
  digest,
} from "./security.js";
import {
  resolveApplication,
  readSession,
  allowedMenus,
  menuTree,
  audit,
} from "./services/access.js";
import {
  loginPassword,
  enrollment,
  verifySecondFactor,
  selectRole,
} from "./services/auth.js";
import { admin } from "./routes/admin.js";
import { demos } from "./demo-catalog.js";

const cookieName = "st_core_session";
const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: config.secureCookies,
  path: "/",
};
const tokenSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "El desafío no es válido.");
const knownOrigins = new Set(
  [config.PORT, config.FRONTEND_PORT].flatMap((port) => [
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
    `https://localhost:${port}`,
    `https://127.0.0.1:${port}`,
  ]),
);
const frontend = fileURLToPath(
  new URL("../../frontend/dist/", import.meta.url),
);

export function createApp({ serveFrontend = true } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(
    helmet({
      crossOriginOpenerPolicy: { policy: "same-origin" },
      contentSecurityPolicy: {
        directives: {
          "img-src": ["'self'", "data:"],
          "upgrade-insecure-requests": config.secureCookies ? [] : null,
        },
      },
      strictTransportSecurity: config.secureCookies ? undefined : false,
    }),
  );
  app.use(express.json({ limit: "24kb" }));
  app.use(cookieParser());
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.get("Origin") &&
      !knownOrigins.has(req.get("Origin"))
    )
      throw new HttpError(403, "Origen no permitido.");
    next();
  });
  app.get("/api/health", async (req, res) => {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  });
  app.get("/api/v1/public/config", (req, res) =>
    res.json({
      companyName: config.COMPANY_NAME,
      appName: config.APP_DISPLAY_NAME,
      timeZone: config.DISPLAY_TIME_ZONE,
      domains: config.domains,
      mode: "core",
      demos: demos.map(({ slug, name, port, color }) => ({
        slug,
        name,
        port,
        color,
      })),
    }),
  );
  const authLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error:
        "Demasiados intentos. Espera unos minutos antes de volver a intentar.",
    },
  });
  const accountLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 15,
    keyGenerator: (req) =>
      digest(
        String(req.body.email || "")
          .trim()
          .toLowerCase(),
      ),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error:
        "Demasiados intentos para esta cuenta. Intenta nuevamente en 15 minutos.",
    },
  });
  // La introspeccion de una sesion ya autenticada es una consulta habitual,
  // no un intento de login. Mantener el limite en los pasos de autenticacion.
  app.use(
    [
      "/api/v1/auth/login-step1",
      "/api/v1/auth/login-step2",
      "/api/v1/auth/mfa/enroll",
      "/api/v1/auth/mfa/confirm",
      "/api/v1/auth/select-role",
    ],
    authLimit,
  );
  const application = async (req, res, next) => {
    req.application = await resolveApplication(req);
    next();
  };
  const authenticate = async (req, res, next) => {
    const bearer = req.get("Authorization");
    req.rawToken = req.application.is_internal
      ? req.cookies[cookieName]
      : bearer?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    req.session = await readSession(req.rawToken, req.application.id);
    if (!req.session)
      throw new HttpError(
        401,
        "Tu sesión venció o fue revocada. Vuelve a iniciar sesión.",
      );
    next();
  };
  const csrf = (req, res, next) => {
    if (
      req.application.is_internal &&
      !["GET", "HEAD"].includes(req.method) &&
      !equalToken(req.get("X-CSRF-Token"), csrfToken(req.rawToken))
    )
      throw new HttpError(
        403,
        "La verificación de la solicitud falló. Recarga la página.",
      );
    next();
  };
  function finish(req, res, result) {
    if (result.sessionToken && req.application.is_internal) {
      res.cookie(cookieName, result.sessionToken, {
        ...cookieOptions,
        expires: new Date(result.expires_at),
      });
      const { sessionToken, ...safe } = result;
      return res.json({ ...safe, csrfToken: csrfToken(sessionToken) });
    }
    res.json(result);
  }
  app.post(
    "/api/v1/auth/login-step1",
    accountLimit,
    application,
    async (req, res) => {
      const data = validate(
        z.object({
          email: z.email().max(180),
          password: z.string().min(1).max(128),
        }),
        req.body,
      );
      finish(
        req,
        res,
        await loginPassword(
          data.email.trim().toLowerCase(),
          data.password,
          req.application,
          req.ip,
        ),
      );
    },
  );
  app.post("/api/v1/auth/mfa/enroll", application, async (req, res) => {
    const data = validate(z.object({ challenge: tokenSchema }), req.body);
    res.json(await enrollment(data.challenge, req.application.id));
  });
  for (const [endpoint, enrolling] of [
    ["mfa/confirm", true],
    ["login-step2", false],
  ]) {
    app.post(`/api/v1/auth/${endpoint}`, application, async (req, res) => {
      const data = validate(
        z.object({ challenge: tokenSchema, code: z.string().min(6).max(30) }),
        req.body,
      );
      finish(
        req,
        res,
        await verifySecondFactor(
          data.challenge,
          data.code.trim(),
          req.application.id,
          req.ip,
          enrolling,
        ),
      );
    });
  }
  app.post("/api/v1/auth/select-role", application, async (req, res) => {
    const data = validate(
      z.object({
        selection: tokenSchema,
        role_id: z.number().int().positive(),
      }),
      req.body,
    );
    finish(
      req,
      res,
      await selectRole(
        data.selection,
        data.role_id,
        req.application.id,
        req.ip,
      ),
    );
  });
  app.get("/api/v1/me", application, authenticate, async (req, res) =>
    res.json({
      session: req.session,
      csrfToken: req.application.is_internal
        ? csrfToken(req.rawToken)
        : undefined,
      menus: await menuTree(req.session),
    }),
  );
  app.post(
    "/api/v1/auth/logout",
    application,
    authenticate,
    csrf,
    async (req, res) => {
      await pool.query("UPDATE sessions SET revoked_at=NOW() WHERE id=$1", [
        req.session.id,
      ]);
      await audit(pool, {
        userId: req.session.user_id,
        appId: req.application.id,
        event: "LOGOUT",
        ip: req.ip,
      });
      if (req.application.is_internal)
        res.clearCookie(cookieName, cookieOptions);
      res.json({ ok: true });
    },
  );
  app.post(
    "/api/v1/auth/introspect",
    application,
    authenticate,
    csrf,
    async (req, res) => {
      const data = validate(
        z.object({ permission: z.string().max(80).optional() }),
        req.body,
      );
      const permissions = await allowedMenus(req.session);
      if (
        data.permission &&
        !permissions.some((menu) => menu.code === data.permission)
      ) {
        await audit(pool, {
          userId: req.session.user_id,
          appId: req.application.id,
          event: "ACCESO",
          result: "DENEGADO",
          ip: req.ip,
          detail: data.permission,
        });
        throw new HttpError(403, "Tu rol no tiene acceso a esta página.");
      }
      res.json({
        valid: true,
        session: req.session,
        permissions: permissions.map((menu) => menu.code),
      });
    },
  );
  app.get(
    "/api/v1/navigation/menus",
    application,
    authenticate,
    async (req, res) => res.json(await menuTree(req.session)),
  );
  app.use("/api/v1/admin", application, authenticate, csrf, admin);
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "Endpoint no encontrado." }),
  );
  if (serveFrontend) {
    app.use(express.static(frontend, { index: false, maxAge: 0 }));
    app.get("/{*route}", (req, res) =>
      res.sendFile(path.join(frontend, "index.html")),
    );
  }
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const codes = {
      23505: [409, "Ya existe un registro con esos datos."],
      23503: [400, "La asignación no es válida para esa aplicación."],
      23514: [400, "Revisa la jerarquía, la ruta y los límites del registro."],
      "22P02": [400, "Identificador o dato no válido."],
    };
    const known = codes[error.code];
    const status = error.status || known?.[0] || 500;
    if (status >= 500)
      console.error("Error de solicitud:", error.code || error.name);
    res.status(status).json({
      error:
        known?.[1] ||
        (status < 500
          ? error.message
          : "No se pudo completar la operación. Comprueba PostgreSQL e inténtalo de nuevo."),
    });
  });
  return app;
}
