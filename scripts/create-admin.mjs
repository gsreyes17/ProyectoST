import "../apps/app-seguridad/backend/src/load-env.js";
import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { pool, transaction } from "../apps/app-seguridad/backend/src/db.js";
import { hashPassword } from "../apps/app-seguridad/backend/src/security.js";

const email =
  process.env.BOOTSTRAP_ADMIN_EMAIL ||
  `admin@${process.env.ALLOWED_EMAIL_DOMAINS.split(",")[0].trim()}`;
const password =
  process.env.BOOTSTRAP_ADMIN_PASSWORD || randomBytes(18).toString("base64url");
try {
  const hash = await hashPassword(password);
  const created = await transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(91831)");
    const existing = await db.query(
      "SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE r.is_system_admin",
    );
    if (existing.rowCount) return false;
    const { rows: roles } = await db.query(
      "SELECT id,app_id FROM roles WHERE is_system_admin",
    );
    if (!roles[0]) throw new Error("Ejecuta primero npm run db:seed.");
    const role = roles[0];
    const { rows: users } = await db.query(
      "INSERT INTO users(email,full_name,password_hash) VALUES($1,$2,$3) RETURNING id",
      [email.toLowerCase(), "Administrador principal", hash],
    );
    await db.query(
      "INSERT INTO user_applications(user_id,app_id) VALUES($1,$2)",
      [users[0].id, role.app_id],
    );
    await db.query(
      "INSERT INTO user_roles(user_id,app_id,role_id) VALUES($1,$2,$3)",
      [users[0].id, role.app_id, role.id],
    );
    return true;
  });
  if (created) {
    await mkdir(".local", { recursive: true });
    await writeFile(
      ".local/admin-inicial.txt",
      `Credenciales iniciales locales — no compartir ni versionar.\nCorreo: ${email}\nContraseña: ${password}\n\nAbre el portal y enrola MFA con tu propio autenticador.\nElimina este archivo después de guardar la contraseña en un gestor.\n`,
    );
    console.log(
      "Administrador creado. Credenciales en .local/admin-inicial.txt; MFA pendiente de tu enrolamiento.",
    );
  } else
    console.log(
      "Ya existe un administrador. No se cambiaron sus credenciales.",
    );
} catch (error) {
  console.error(
    "No se pudo crear el administrador:",
    error.code || error.message,
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
