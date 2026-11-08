import { Router } from "express";
import { z } from "zod";
import { pool, transaction } from "../db.js";
import { config } from "../config.js";
import {
  validate,
  HttpError,
  hashPassword,
  randomToken,
  digest,
  verifyPassword,
  decrypt,
  verifyTotp,
} from "../security.js";
import { audit, revokeUser, assertAdminRemains } from "../services/access.js";
import { demos } from "../demo-catalog.js";
import { rateLimit } from "express-rate-limit";
import { readSession } from "../services/access.js";

export const admin = Router();
admin.use((req, res, next) => {
  if (!req.session?.is_system_admin || !req.application.is_internal)
    throw new HttpError(
      403,
      "Solo el administrador del portal puede realizar esta operación.",
    );
  next();
});
const idSchema = z.coerce.number().int().positive();
const label = z
  .string()
  .trim()
  .min(2, "Ingresa al menos 2 caracteres.")
  .max(100);
const ids = z.array(z.number().int().positive()).max(200);
const userSchema = z.object({
  email: z
    .email()
    .max(180)
    .transform((value) => value.toLowerCase().trim()),
  full_name: label.max(160),
  password: z
    .string()
    .min(12, "La contraseña debe tener al menos 12 caracteres.")
    .max(128),
  active: z.boolean().default(true),
  mfa_required: z.boolean().default(true),
});
const roleSchema = z.object({
  app_id: idSchema,
  name: label.max(80),
  description: z.string().max(300).default(""),
  duration_minutes: z.coerce.number().int().min(1).max(1440),
  active: z.boolean().default(true),
  menu_ids: ids.default([]),
});
const menuSchema = z.object({
  app_id: idSchema,
  code: z.string().regex(/^[a-z][a-z0-9_.-]{1,79}$/),
  name: label,
  route: z
    .string()
    .regex(/^\/[a-zA-Z0-9/_-]*$/)
    .max(180)
    .nullable(),
  parent_id: idSchema.nullable(),
  position: z.coerce.number().int().min(0).max(1000),
  icon: z.string().max(40).default("layout"),
  active: z.boolean().default(true),
});
const appSchema = z.object({
  name: label,
  slug: z.string().regex(/^[a-z][a-z0-9-]{1,49}$/),
  platform: label.max(60),
  description: z.string().max(300).default(""),
  active: z.boolean().default(true),
});
function allowedEmail(email) {
  if (!config.domains.includes(email.split("@")[1]))
    throw new HttpError(
      400,
      `Usa uno de estos dominios: ${config.domains.join(", ")}.`,
    );
}
async function existing(db, table, id) {
  // table proviene solo de constantes internas de este módulo.
  const { rows } = await db.query(`SELECT * FROM ${table} WHERE id=$1`, [id]);
  if (!rows[0]) throw new HttpError(404, "Registro no encontrado.");
  return rows[0];
}
async function change(req, event, work) {
  return transaction(async (db) => {
    // Serializa cambios administrativos para proteger al último administrador.
    await db.query("SELECT pg_advisory_xact_lock(91831)");
    const currentSession = await readSession(
      req.rawToken,
      req.application.id,
      db,
    );
    if (!currentSession?.is_system_admin)
      throw new HttpError(401, "Tu sesión administrativa ya no está vigente.");
    const result = await work(db);
    await assertAdminRemains(db);
    await audit(db, {
      userId: req.session.user_id,
      appId: req.application.id,
      event,
      ip: req.ip,
      detail: `Registro ${req.params.id || result?.id || "nuevo"}`,
    });
    return result;
  });
}

admin.get("/overview", async (req, res) => {
  const { rows } = await pool.query(`SELECT
    (SELECT COUNT(*)::int FROM users WHERE active) AS users,
    (SELECT COUNT(*)::int FROM applications WHERE active AND NOT is_internal) AS applications,
    (SELECT COUNT(*)::int FROM roles WHERE active) AS roles,
    (SELECT COUNT(*)::int FROM sessions WHERE revoked_at IS NULL AND expires_at>NOW()) AS sessions,
    (SELECT COUNT(*)::int FROM users WHERE mfa_enabled AND active) AS mfa_users,
    (SELECT COUNT(*)::int FROM audit_events WHERE result='DENEGADO' AND created_at>NOW()-INTERVAL '24 hours') AS denied`);
  const { rows: recent } =
    await pool.query(`SELECT e.*,u.full_name,a.name AS app_name FROM audit_events e
    LEFT JOIN users u ON u.id=e.user_id LEFT JOIN applications a ON a.id=e.app_id ORDER BY e.id DESC LIMIT 6`);
  res.json({ ...rows[0], recent });
});
admin.get("/catalog", (req, res) => res.json(demos));
admin.get("/users", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const search = String(req.query.search || "").slice(0, 100);
  const { rows } = await pool.query(
    `SELECT u.id,u.email,u.full_name,u.active,u.mfa_enabled,u.mfa_required,u.created_at,
    COALESCE((SELECT json_agg(ua.app_id) FROM user_applications ua WHERE ua.user_id=u.id),'[]') AS app_ids,
    COALESCE((SELECT json_agg(ur.role_id) FROM user_roles ur WHERE ur.user_id=u.id),'[]') AS role_ids,
    COUNT(*) OVER()::int AS total FROM users u WHERE u.email ILIKE $1 OR u.full_name ILIKE $1 ORDER BY u.id LIMIT 50 OFFSET $2`,
    [`%${search}%`, (page - 1) * 50],
  );
  res.json({ items: rows, total: rows[0]?.total || 0, page, limit: 50 });
});
admin.post("/users", async (req, res) => {
  const data = validate(userSchema, req.body);
  allowedEmail(data.email);
  const passwordHash = await hashPassword(data.password);
  const user = await change(req, "USUARIO_CREADO", async (db) => {
    const { rows } = await db.query(
      "INSERT INTO users(email,full_name,password_hash,active,mfa_required) VALUES($1,$2,$3,$4,$5) RETURNING id",
      [
        data.email,
        data.full_name,
        passwordHash,
        data.active,
        data.mfa_required,
      ],
    );
    return rows[0];
  });
  res.status(201).json(user);
});
admin.patch("/users/:id", async (req, res) => {
  const id = validate(idSchema, req.params.id);
  const data = validate(
    userSchema
      .omit({ password: true })
      .extend({ mfa_required: z.boolean().optional() }),
    req.body,
  );
  res.json(
    await change(req, "USUARIO_EDITADO", async (db) => {
      const previous = await existing(db, "users", id);
      const mfaRequired = data.mfa_required ?? previous.mfa_required;
      if (previous.email !== data.email) allowedEmail(data.email);
      await db.query(
        "UPDATE users SET email=$1,full_name=$2,active=$3,mfa_required=$4 WHERE id=$5",
        [data.email, data.full_name, data.active, mfaRequired, id],
      );
      if (
        !data.active ||
        previous.email !== data.email ||
        previous.mfa_required !== mfaRequired
      )
        await revokeUser(db, id);
      if (previous.mfa_required !== mfaRequired) {
        await audit(db, {
          userId: req.session.user_id,
          appId: req.application.id,
          event: "MFA_POLITICA_EDITADA",
          ip: req.ip,
          detail: `Usuario ${id}: doble factor ${mfaRequired ? "exigido" : "no exigido"}`,
        });
      }
      return { id };
    }),
  );
});
admin.put("/users/:id/applications", async (req, res) => {
  const id = validate(idSchema, req.params.id);
  const selected = validate(z.object({ app_ids: ids }), req.body).app_ids;
  res.json(
    await change(req, "APLICACIONES_ASIGNADAS", async (db) => {
      await existing(db, "users", id);
      await revokeUser(db, id);
      await db.query(
        "DELETE FROM user_roles WHERE user_id=$1 AND NOT(app_id=ANY($2::int[]))",
        [id, selected],
      );
      await db.query(
        "DELETE FROM user_applications WHERE user_id=$1 AND NOT(app_id=ANY($2::int[]))",
        [id, selected],
      );
      for (const appId of new Set(selected))
        await db.query(
          "INSERT INTO user_applications(user_id,app_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [id, appId],
        );
      return { id };
    }),
  );
});
admin.put("/users/:id/roles", async (req, res) => {
  const id = validate(idSchema, req.params.id);
  const selected = validate(z.object({ role_ids: ids }), req.body).role_ids;
  res.json(
    await change(req, "ROLES_ASIGNADOS", async (db) => {
      await existing(db, "users", id);
      await revokeUser(db, id);
      await db.query("DELETE FROM user_roles WHERE user_id=$1", [id]);
      for (const roleId of new Set(selected)) {
        const role = await existing(db, "roles", roleId);
        await db.query(
          "INSERT INTO user_roles(user_id,app_id,role_id) VALUES($1,$2,$3)",
          [id, role.app_id, roleId],
        );
      }
      return { id };
    }),
  );
});
admin.get("/applications", async (req, res) =>
  res.json(
    (
      await pool.query(
        "SELECT id,slug,name,description,platform,active,is_internal,created_at FROM applications ORDER BY id",
      )
    ).rows,
  ),
);
admin.post("/applications", async (req, res) => {
  const data = validate(appSchema, req.body);
  const key = randomToken();
  const app = await change(req, "APLICACION_CREADA", async (db) => {
    const { rows } = await db.query(
      "INSERT INTO applications(slug,name,platform,description,active,key_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
      [
        data.slug,
        data.name,
        data.platform,
        data.description,
        data.active,
        digest(key),
      ],
    );
    return rows[0];
  });
  res.status(201).json({ ...app, key });
});
admin.patch("/applications/:id", async (req, res) => {
  const id = validate(idSchema, req.params.id);
  const data = validate(appSchema, req.body);
  res.json(
    await change(req, "APLICACION_EDITADA", async (db) => {
      const previous = await existing(db, "applications", id);
      if (previous.is_internal && !data.active)
        throw new HttpError(
          409,
          "El portal interno debe permanecer habilitado.",
        );
      if (previous.slug !== data.slug)
        throw new HttpError(
          400,
          "El identificador de aplicación permanece estable.",
        );
      await db.query(
        "UPDATE applications SET name=$1,platform=$2,description=$3,active=$4 WHERE id=$5",
        [data.name, data.platform, data.description, data.active, id],
      );
      if (!data.active) {
        await db.query(
          "UPDATE sessions SET revoked_at=NOW() WHERE app_id=$1 AND revoked_at IS NULL",
          [id],
        );
        await db.query(
          "UPDATE auth_challenges SET consumed_at=NOW() WHERE app_id=$1 AND consumed_at IS NULL",
          [id],
        );
      }
      return { id };
    }),
  );
});
admin.post("/applications/:id/rotate-key", async (req, res) => {
  const id = validate(idSchema, req.params.id);
  const key = randomToken();
  await change(req, "CREDENCIAL_ROTADA", async (db) => {
    const app = await existing(db, "applications", id);
    if (app.is_internal)
      throw new HttpError(
        400,
        "El portal interno no utiliza clave de integración.",
      );
    await db.query("UPDATE applications SET key_hash=$1 WHERE id=$2", [
      digest(key),
      id,
    ]);
  });
  res.json({ key });
});
admin.get("/roles", async (req, res) =>
  res.json(
    (
      await pool.query(`SELECT r.*,a.name AS app_name,
  COALESCE((SELECT json_agg(rm.menu_id) FROM role_menus rm WHERE rm.role_id=r.id),'[]') AS menu_ids,
  (SELECT COUNT(*)::int FROM user_roles ur WHERE ur.role_id=r.id) AS users_count
  FROM roles r JOIN applications a ON a.id=r.app_id ORDER BY r.id`)
    ).rows,
  ),
);
async function setRoleMenus(db, roleId, appId, selected) {
  await db.query("DELETE FROM role_menus WHERE role_id=$1", [roleId]);
  for (const menuId of new Set(selected)) {
    const menu = await existing(db, "menus", menuId);
    if (menu.app_id !== appId || !menu.route)
      throw new HttpError(400, "Selecciona opciones de la misma aplicación.");
    await db.query(
      "INSERT INTO role_menus(role_id,menu_id,app_id) VALUES($1,$2,$3)",
      [roleId, menuId, appId],
    );
  }
}
admin.post("/roles", async (req, res) => {
  const data = validate(roleSchema, req.body);
  res.status(201).json(
    await change(req, "ROL_CREADO", async (db) => {
      if ((await existing(db, "applications", data.app_id)).is_internal)
        throw new HttpError(400, "El rol administrativo interno es reservado.");
      const { rows } = await db.query(
        "INSERT INTO roles(app_id,name,description,duration_minutes,active) VALUES($1,$2,$3,$4,$5) RETURNING id",
        [
          data.app_id,
          data.name,
          data.description,
          data.duration_minutes,
          data.active,
        ],
      );
      await setRoleMenus(db, rows[0].id, data.app_id, data.menu_ids);
      return rows[0];
    }),
  );
});
admin.patch("/roles/:id", async (req, res) => {
  const id = validate(idSchema, req.params.id);
  const data = validate(roleSchema, req.body);
  res.json(
    await change(req, "ROL_EDITADO", async (db) => {
      const previous = await existing(db, "roles", id);
      if (previous.app_id !== data.app_id)
        throw new HttpError(400, "No se puede mover el rol a otra aplicación.");
      await db.query(
        "UPDATE roles SET name=$1,description=$2,duration_minutes=$3,active=$4 WHERE id=$5",
        [data.name, data.description, data.duration_minutes, data.active, id],
      );
      await setRoleMenus(db, id, data.app_id, data.menu_ids);
      if (!data.active || previous.duration_minutes !== data.duration_minutes) {
        await db.query(
          "UPDATE sessions SET revoked_at=NOW() WHERE role_id=$1 AND revoked_at IS NULL",
          [id],
        );
        await db.query(
          "UPDATE auth_challenges SET consumed_at=NOW() WHERE app_id=$1 AND consumed_at IS NULL",
          [data.app_id],
        );
      }
      return { id };
    }),
  );
});
admin.put("/roles/:id/menus", async (req, res) => {
  const id = validate(idSchema, req.params.id);
  const selected = validate(z.object({ menu_ids: ids }), req.body).menu_ids;
  res.json(
    await change(req, "MENUS_ASIGNADOS", async (db) => {
      const role = await existing(db, "roles", id);
      await setRoleMenus(db, id, role.app_id, selected);
      return { id };
    }),
  );
});
admin.get("/menus", async (req, res) =>
  res.json(
    (
      await pool.query(
        "SELECT m.*,a.name AS app_name FROM menus m JOIN applications a ON a.id=m.app_id ORDER BY m.app_id,m.position,m.id",
      )
    ).rows,
  ),
);
async function saveMenu(req, update) {
  const data = validate(menuSchema, req.body);
  const id = update ? validate(idSchema, req.params.id) : null;
  return change(req, update ? "MENU_EDITADO" : "MENU_CREADO", async (db) => {
    const app = await existing(db, "applications", data.app_id);
    if (app.is_internal)
      throw new HttpError(400, "La navegación interna es reservada.");
    if (id) {
      const previous = await existing(db, "menus", id);
      if (previous.app_id !== data.app_id || previous.code !== data.code)
        throw new HttpError(
          400,
          "El código y la aplicación permanecen estables.",
        );
      await db.query(
        "UPDATE menus SET name=$1,route=$2,icon=$3,position=$4,parent_id=$5,active=$6 WHERE id=$7",
        [
          data.name,
          data.route,
          data.icon,
          data.position,
          data.parent_id,
          data.active,
          id,
        ],
      );
      return { id };
    }
    return (
      await db.query(
        "INSERT INTO menus(app_id,code,name,route,icon,position,parent_id,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
        [
          data.app_id,
          data.code,
          data.name,
          data.route,
          data.icon,
          data.position,
          data.parent_id,
          data.active,
        ],
      )
    ).rows[0];
  });
}
admin.post("/menus", async (req, res) =>
  res.status(201).json(await saveMenu(req, false)),
);
admin.patch("/menus/:id", async (req, res) =>
  res.json(await saveMenu(req, true)),
);
admin.get("/sessions", async (req, res) =>
  res.json(
    (
      await pool.query(`SELECT s.id,s.created_at,s.expires_at,s.ip_address,u.full_name,u.email,r.name AS role_name,a.name AS app_name
  FROM sessions s JOIN users u ON u.id=s.user_id JOIN roles r ON r.id=s.role_id JOIN applications a ON a.id=s.app_id
  WHERE s.revoked_at IS NULL AND s.expires_at>NOW() ORDER BY s.created_at DESC LIMIT 200`)
    ).rows,
  ),
);
admin.post("/sessions/:id/revoke", async (req, res) => {
  const id = validate(idSchema, req.params.id);
  await change(req, "SESION_REVOCADA", (db) =>
    db.query("UPDATE sessions SET revoked_at=NOW() WHERE id=$1", [id]),
  );
  res.json({ ok: true });
});

// Reautenticación según la política vigente del administrador.
async function reauthenticate(req, db) {
  const data = validate(
    z.object({
      admin_password: z.string().max(128),
      admin_code: z.string().max(30).default(""),
      identityConfirmed: z.literal(true, {
        error: "Confirma que verificaste la identidad del usuario.",
      }),
    }),
    req.body,
  );
  const { rows } = await db.query(
    "SELECT * FROM users WHERE id=$1 FOR UPDATE",
    [req.session.user_id],
  );
  const actor = rows[0];
  const step =
    actor?.mfa_required && actor?.totp_secret
      ? verifyTotp(decrypt(actor.totp_secret), data.admin_code)
      : null;
  const verified =
    actor && (await verifyPassword(actor.password_hash, data.admin_password));
  if (
    !verified ||
    (actor.mfa_required &&
      (step === null || step <= Number(actor.last_totp_step)))
  )
    throw new HttpError(
      403,
      "Reautenticación inválida. Usa un código nuevo del autenticador.",
    );
  if (actor.mfa_required)
    await db.query("UPDATE users SET last_totp_step=$1 WHERE id=$2", [
      step,
      actor.id,
    ]);
}
const recoveryLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: "Demasiados intentos de recuperación. Intenta en 15 minutos.",
  },
});
admin.post("/users/:id/reset-mfa", recoveryLimit, async (req, res) => {
  const id = validate(idSchema, req.params.id);
  await change(req, "MFA_RESTABLECIDO", async (db) => {
    await reauthenticate(req, db);
    await existing(db, "users", id);
    await revokeUser(db, id);
    await db.query("DELETE FROM recovery_codes WHERE user_id=$1", [id]);
    await db.query(
      "UPDATE users SET totp_secret=NULL,last_totp_step=NULL,mfa_enabled=FALSE WHERE id=$1",
      [id],
    );
  });
  res.json({ ok: true });
});
admin.post("/users/:id/reset-password", recoveryLimit, async (req, res) => {
  const id = validate(idSchema, req.params.id);
  const password = validate(z.string().min(12).max(128), req.body.new_password);
  const hash = await hashPassword(password);
  await change(req, "CLAVE_RESTABLECIDA", async (db) => {
    await reauthenticate(req, db);
    await existing(db, "users", id);
    await revokeUser(db, id);
    await db.query("UPDATE users SET password_hash=$1 WHERE id=$2", [hash, id]);
  });
  res.json({ ok: true });
});
admin.get("/audit", async (req, res) => {
  const search = String(req.query.search || "").slice(0, 100);
  const result = String(req.query.result || "");
  const page = Math.max(1, Number(req.query.page) || 1);
  const from =
    req.query.from && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from)
      ? req.query.from
      : null;
  const until =
    req.query.until && /^\d{4}-\d{2}-\d{2}$/.test(req.query.until)
      ? req.query.until
      : null;
  const { rows } = await pool.query(
    `SELECT e.*,u.full_name,u.email,a.name AS app_name,COUNT(*) OVER()::int AS total
    FROM audit_events e LEFT JOIN users u ON u.id=e.user_id LEFT JOIN applications a ON a.id=e.app_id
    WHERE (COALESCE(u.full_name,'') ILIKE $1 OR COALESCE(u.email,'') ILIKE $1 OR e.event ILIKE $1 OR COALESCE(a.name,'') ILIKE $1)
    AND ($2='' OR e.result=$2) AND ($3::date IS NULL OR e.created_at >= $3::date)
    AND ($4::date IS NULL OR e.created_at < $4::date+INTERVAL '1 day') ORDER BY e.id DESC LIMIT 50 OFFSET $5`,
    [`%${search}%`, result, from, until, (page - 1) * 50],
  );
  res.json({ items: rows, total: rows[0]?.total || 0, page, limit: 50 });
});
