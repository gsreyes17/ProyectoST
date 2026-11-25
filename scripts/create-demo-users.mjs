import "../apps/app-seguridad/backend/src/load-env.js";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { pool, transaction } from "../apps/app-seguridad/backend/src/db.js";
import { hashPassword } from "../apps/app-seguridad/backend/src/security.js";

// Cuentas para revisar la vista de cada rol. El correo usa el dominio
// configurado (ALLOWED_EMAIL_DOMAINS), por ejemplo ana.torres@zentra.com.
// `roles` indica, por aplicación, el rol o los roles asignados; con dos roles
// en una misma app se demuestra la selección de rol después del ingreso.
const accounts = [
  {
    account: "operador",
    name: "Operador de demostración",
    area: "Usuario normal en las tres aplicaciones",
    roles: {
      crm: "Usuario normal",
      almacen: "Usuario normal",
      facturacion: "Usuario normal",
    },
    mfa: true,
  },
  {
    account: "supervisor",
    name: "Supervisor de demostración",
    area: "Administrador en las tres aplicaciones",
    roles: {
      crm: "Administrador",
      almacen: "Administrador",
      facturacion: "Administrador",
    },
    mfa: true,
  },
  {
    account: "ana.torres",
    name: "Ana Torres",
    area: "Ventas · CRM: Usuario normal",
    roles: { crm: "Usuario normal" },
  },
  {
    account: "luis.ramos",
    name: "Luis Ramos",
    area: "Jefe comercial · CRM: Administrador",
    roles: { crm: "Administrador" },
  },
  {
    account: "carla.mendoza",
    name: "Carla Mendoza",
    area: "Almacén · Almacén: Usuario normal",
    roles: { almacen: "Usuario normal" },
  },
  {
    account: "jorge.salas",
    name: "Jorge Salas",
    area: "Jefe de almacén · Almacén: Administrador",
    roles: { almacen: "Administrador" },
  },
  {
    account: "patricia.vega",
    name: "Patricia Vega",
    area: "Facturación · Facturación: Usuario normal",
    roles: { facturacion: "Usuario normal" },
  },
  {
    account: "miguel.castro",
    name: "Miguel Castro",
    area: "Contador · Facturación: Administrador",
    roles: { facturacion: "Administrador" },
  },
  {
    account: "rosa.diaz",
    name: "Rosa Díaz",
    area: "Analista · Analista en las tres aplicaciones (solo Reportes)",
    roles: { crm: "Analista", almacen: "Analista", facturacion: "Analista" },
  },
  {
    account: "sofia.quispe",
    name: "Sofía Quispe",
    area: "Gerencia · elige rol en CRM (Administrador o Analista); Administrador en Almacén y Facturación",
    roles: {
      crm: ["Administrador", "Analista"],
      almacen: "Administrador",
      facturacion: "Administrador",
    },
  },
];

// Rol «Analista»: solo la pantalla de reportes de cada aplicación. Si ya
// existe se conserva tal cual, con los permisos que tenga.
async function ensureAnalystRoles(db) {
  for (const slug of ["crm", "almacen", "facturacion"]) {
    const { rows: apps } = await db.query(
      "SELECT id,name FROM applications WHERE slug=$1 AND active",
      [slug],
    );
    if (!apps[0]) continue;
    const { rows: created } = await db.query(
      `INSERT INTO roles(app_id,name,description,duration_minutes) VALUES($1,'Analista',$2,60)
      ON CONFLICT(app_id,name) DO NOTHING RETURNING id`,
      [apps[0].id, `Consulta de reportes de ${apps[0].name}`],
    );
    if (!created[0]) continue;
    await db.query(
      `INSERT INTO role_menus(role_id,menu_id,app_id)
      SELECT $1,id,app_id FROM menus WHERE app_id=$2 AND code=$3`,
      [created[0].id, apps[0].id, `${slug}.reportes`],
    );
  }
}

const domain = process.env.ALLOWED_EMAIL_DOMAINS.split(",")[0].trim();
const credentials = [];
try {
  await transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(91831)");
    await ensureAnalystRoles(db);
  });
  for (const { account, name, area, roles, mfa = false } of accounts) {
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
      const wanted = Object.entries(roles).flatMap(([slug, names]) =>
        [names].flat().map((role) => ({ slug, role })),
      );
      const found = [];
      for (const { slug, role } of wanted) {
        const { rows } = await db.query(
          `SELECT r.id,r.app_id FROM roles r JOIN applications a ON a.id=r.app_id
          WHERE a.slug=$1 AND r.name=$2 AND r.active AND a.active`,
          [slug, role],
        );
        if (!rows[0])
          throw new Error(
            `Falta el rol ${role} en ${slug}. Carga db:seed o créalo desde el panel.`,
          );
        found.push(rows[0]);
      }
      const { rows } = await db.query(
        "INSERT INTO users(email,full_name,password_hash,mfa_required) VALUES($1,$2,$3,$4) RETURNING id",
        [email, name, hash, mfa],
      );
      for (const appId of new Set(found.map((role) => role.app_id)))
        await db.query(
          "INSERT INTO user_applications(user_id,app_id) VALUES($1,$2)",
          [rows[0].id, appId],
        );
      for (const role of found)
        await db.query(
          "INSERT INTO user_roles(user_id,app_id,role_id) VALUES($1,$2,$3)",
          [rows[0].id, role.app_id, role.id],
        );
      return true;
    });
    if (created)
      credentials.push(
        `${name} — ${area}\nCorreo: ${email}\nContraseña: ${password}\nDoble factor: ${mfa ? "exigido (se enrola al primer ingreso)" : "no exigido"}\n`,
      );
  }
  if (credentials.length) {
    await mkdir(".local", { recursive: true });
    // No se reemplazan credenciales de cuentas existentes. Las nuevas se anexan.
    await writeFile(
      ".local/usuarios-demo.txt",
      `Credenciales de demostración — no compartir ni versionar.\n\n${credentials.join("\n")}\n`,
      { flag: "a" },
    );
    console.log(
      `${credentials.length} cuentas de demostración creadas. Credenciales en .local/usuarios-demo.txt.`,
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
