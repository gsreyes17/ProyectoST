import "../apps/app-seguridad/backend/src/load-env.js";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { pool, transaction } from "../apps/app-seguridad/backend/src/db.js";
import { hashPassword } from "../apps/app-seguridad/backend/src/security.js";

const domain = process.env.ALLOWED_EMAIL_DOMAINS.split(",")[0].trim();
const credentials = [];
try {
  for (const [account, name, roleName] of [
    ["operador", "Operador de demostración", "Usuario normal"],
    ["supervisor", "Supervisor de demostración", "Administrador"],
  ]) {
    const email = `${account}@${domain}`;
    const password = randomBytes(18).toString("base64url");
    const hash = await hashPassword(password);
    const created = await transaction(async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(91831)");
      if (
        (await db.query("SELECT id FROM users WHERE email=$1", [email]))
          .rowCount
      )
        return false;
      const { rows: roles } = await db.query(
        `SELECT r.id,r.app_id FROM roles r JOIN applications a ON a.id=r.app_id
        WHERE a.slug IN ('crm','almacen','facturacion') AND r.name=$1 AND r.active AND a.active`,
        [roleName],
      );
      if (roles.length !== 3)
        throw new Error(
          "Faltan aplicaciones/roles iniciales. Carga db:seed o configura las cuentas desde el panel.",
        );
      const { rows } = await db.query(
        "INSERT INTO users(email,full_name,password_hash) VALUES($1,$2,$3) RETURNING id",
        [email, name, hash],
      );
      for (const role of roles) {
        await db.query(
          "INSERT INTO user_applications(user_id,app_id) VALUES($1,$2)",
          [rows[0].id, role.app_id],
        );
        await db.query(
          "INSERT INTO user_roles(user_id,app_id,role_id) VALUES($1,$2,$3)",
          [rows[0].id, role.app_id, role.id],
        );
      }
      return true;
    });
    if (created)
      credentials.push(
        `${name}\nCorreo: ${email}\nContraseña: ${password}\nRol en cada demo: ${roleName}\n`,
      );
  }
  if (credentials.length) {
    await mkdir(".local", { recursive: true });
    // No se reemplazan credenciales de cuentas existentes. Las nuevas se anexan.
    await writeFile(
      ".local/usuarios-demo.txt",
      `Credenciales de demostración — no compartir ni versionar.\nMFA debe enrolarse con tu propio autenticador.\n\n${credentials.join("\n")}\n`,
      { flag: "a" },
    );
    console.log(
      "Cuentas de demostración creadas. Credenciales en .local/usuarios-demo.txt; MFA pendiente.",
    );
  } else
    console.log(
      "Las cuentas de demostración ya existen. No se cambiaron sus credenciales ni permisos.",
    );
} catch (error) {
  console.error(
    "No se pudieron preparar las cuentas:",
    error.code || error.message,
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
