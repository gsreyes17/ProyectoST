import "../backend/src/load-env.js";
import { fileURLToPath } from "node:url";
import { pool, transaction } from "../backend/src/db.js";
import { digest } from "../backend/src/security.js";
import { demos } from "../backend/src/demo-catalog.js";

export async function seed() {
  const clients = [];
  await transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(91831)");
    const { rows: apps } =
      await db.query(`INSERT INTO applications(slug,name,platform,is_internal) VALUES('core','Portal de Seguridad','Node.js · React',TRUE)
      ON CONFLICT(slug) DO UPDATE SET slug=EXCLUDED.slug RETURNING id`);
    await db.query(
      `INSERT INTO roles(app_id,name,description,duration_minutes,is_system_admin) VALUES($1,'Administrador del sistema','Administración de la seguridad transversal',300,TRUE) ON CONFLICT DO NOTHING`,
      [apps[0].id],
    );
    for (const demo of demos) {
      const key = process.env[`${demo.slug.toUpperCase()}_APP_KEY`];
      if (!key || key.length < 32)
        throw new Error(
          `Configura ${demo.slug.toUpperCase()}_APP_KEY con una clave aleatoria.`,
        );
      const { rows } = await db.query(
        `INSERT INTO applications(slug,name,description,platform,key_hash) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(slug) DO UPDATE SET slug=EXCLUDED.slug RETURNING id,key_hash,name,description,platform`,
        [demo.slug, demo.name, demo.description, demo.platform, digest(key)],
      );
      if (rows[0].key_hash !== digest(key))
        throw new Error(
          `La clave local de ${demo.slug} no coincide. Actualiza .env tras una rotación; seed no sobrescribe credenciales.`,
        );
      const appId = rows[0].id;
      const { rows: groups } = await db.query(
        `INSERT INTO menus(app_id,code,name,position) VALUES($1,$2,'Gestión',0)
        ON CONFLICT(app_id,code) DO UPDATE SET code=EXCLUDED.code RETURNING id`,
        [appId, `${demo.slug}.gestion`],
      );
      const menuIds = [];
      for (const [position, page] of demo.pages.entries()) {
        const { rows: menus } = await db.query(
          `INSERT INTO menus(app_id,code,name,route,icon,position,parent_id) VALUES($1,$2,$3,$4,$5,$6,$7)
          ON CONFLICT(app_id,code) DO UPDATE SET code=EXCLUDED.code RETURNING id`,
          [
            appId,
            page.code,
            page.name,
            page.route,
            page.icon,
            position,
            groups[0].id,
          ],
        );
        menuIds.push(menus[0].id);
      }
      const existingRoles = await db.query(
        "SELECT 1 FROM roles WHERE app_id=$1 LIMIT 1",
        [appId],
      );
      for (const [name, duration, selected] of existingRoles.rowCount
        ? []
        : [
            ["Administrador", 300, menuIds],
            ["Usuario normal", 60, menuIds.slice(0, 1)],
          ]) {
        const { rows: roles } = await db.query(
          `INSERT INTO roles(app_id,name,description,duration_minutes) VALUES($1,$2,$3,$4) ON CONFLICT(app_id,name) DO NOTHING RETURNING id`,
          [appId, name, `${name} de ${demo.name}`, duration],
        );
        if (roles[0])
          for (const menuId of selected)
            await db.query(
              "INSERT INTO role_menus(role_id,menu_id,app_id) VALUES($1,$2,$3)",
              [roles[0].id, menuId, appId],
            );
      }
      clients.push({
        ...demo,
        name: rows[0].name,
        description: rows[0].description,
        platform: rows[0].platform,
        id: appId,
        key,
      });
    }
  });
  console.log(
    "Aplicaciones, roles y menús iniciales preparados. No se modificaron usuarios ni permisos existentes.",
  );
  return clients;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seed()
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
