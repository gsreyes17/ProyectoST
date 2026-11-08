import { pool } from "../db.js";
import { digest, HttpError } from "../security.js";

export async function audit(
  db,
  { userId = null, appId = null, event, result = "OK", ip = null, detail = "" },
) {
  await db.query(
    "INSERT INTO audit_events(user_id,app_id,event,result,ip_address,detail) VALUES($1,$2,$3,$4,$5,$6)",
    [userId, appId, event, result, ip, detail.slice(0, 500)],
  );
}

export async function resolveApplication(req) {
  const appId = req.get("X-App-Id");
  if (!appId) {
    const { rows } = await pool.query(
      "SELECT * FROM applications WHERE is_internal AND active",
    );
    if (!rows[0])
      throw new HttpError(503, "El portal todavía no está inicializado.");
    return rows[0];
  }
  if (!/^\d+$/.test(appId))
    throw new HttpError(401, "Aplicación no autenticada.");
  const key = req.get("X-App-Key");
  if (!key || key.length > 256)
    throw new HttpError(401, "Aplicación no autenticada.");
  const { rows } = await pool.query(
    "SELECT * FROM applications WHERE id=$1 AND key_hash=$2 AND active AND NOT is_internal",
    [appId, digest(key)],
  );
  if (!rows[0]) throw new HttpError(401, "Aplicación no autenticada.");
  return rows[0];
}

export async function readSession(rawToken, appId, db = pool) {
  if (!rawToken || !/^[a-f0-9]{64}$/.test(rawToken)) return null;
  const { rows } = await db.query(
    `SELECT s.id, s.user_id, s.app_id, s.role_id, s.created_at, s.expires_at,s.mfa_verified,u.mfa_required,
    u.full_name,u.email,r.name AS role_name,r.is_system_admin,a.name AS app_name,a.slug AS app_slug
    FROM sessions s JOIN users u ON u.id=s.user_id
    JOIN applications a ON a.id=s.app_id JOIN roles r ON r.id=s.role_id AND r.app_id=s.app_id
    JOIN user_applications ua ON ua.user_id=s.user_id AND ua.app_id=s.app_id
    JOIN user_roles ur ON ur.user_id=s.user_id AND ur.role_id=s.role_id AND ur.app_id=s.app_id
    WHERE s.token_hash=$1 AND s.app_id=$2 AND s.revoked_at IS NULL AND s.expires_at>NOW()
    AND u.active AND (NOT u.mfa_required OR (u.mfa_enabled AND s.mfa_verified)) AND a.active AND r.active`,
    [digest(rawToken), appId],
  );
  return rows[0] || null;
}

export async function allowedMenus(session, db = pool) {
  const { rows } = await db.query(
    `SELECT m.* FROM menus m
    JOIN role_menus rm ON rm.menu_id=m.id AND rm.app_id=m.app_id
    LEFT JOIN menus p ON p.id=m.parent_id
    WHERE rm.role_id=$1 AND m.app_id=$2 AND m.active AND m.route IS NOT NULL
    AND (m.parent_id IS NULL OR p.active)
    ORDER BY m.position,m.id`,
    [session.role_id, session.app_id],
  );
  return rows;
}

export async function menuTree(session) {
  const leaves = await allowedMenus(session);
  const { rows: groups } = await pool.query(
    "SELECT * FROM menus WHERE app_id=$1 AND parent_id IS NULL AND route IS NULL AND active ORDER BY position,id",
    [session.app_id],
  );
  return [
    ...groups
      .map((group) => ({
        ...group,
        children: leaves.filter((leaf) => leaf.parent_id === group.id),
      }))
      .filter((group) => group.children.length),
    ...leaves
      .filter((leaf) => !leaf.parent_id)
      .map((leaf) => ({ ...leaf, children: [] })),
  ].sort((a, b) => a.position - b.position || a.id - b.id);
}

export async function revokeUser(db, userId, appId = null) {
  await db.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [userId]);
  await db.query(
    "UPDATE sessions SET revoked_at=NOW() WHERE user_id=$1 AND ($2::int IS NULL OR app_id=$2) AND revoked_at IS NULL",
    [userId, appId],
  );
  await db.query(
    "UPDATE auth_challenges SET consumed_at=NOW() WHERE user_id=$1 AND ($2::int IS NULL OR app_id=$2) AND consumed_at IS NULL",
    [userId, appId],
  );
}

export async function assertAdminRemains(db) {
  const { rowCount } =
    await db.query(`SELECT 1 FROM users u JOIN user_roles ur ON ur.user_id=u.id
    JOIN roles r ON r.id=ur.role_id JOIN applications a ON a.id=r.app_id
    WHERE u.active AND r.active AND r.is_system_admin AND a.active AND a.is_internal LIMIT 1`);
  if (!rowCount)
    throw new HttpError(
      409,
      "Debe conservarse al menos un administrador habilitado.",
    );
}
