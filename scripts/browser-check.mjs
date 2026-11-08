import "../apps/app-seguridad/backend/src/load-env.js";
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import pg from "pg";
import { pool } from "../apps/app-seguridad/backend/src/db.js";
import {
  hashPassword,
  totp,
} from "../apps/app-seguridad/backend/src/security.js";
import { applications, backendEnv } from "./project.mjs";

const tag = randomBytes(5).toString("hex");
const adminEmail = `qa-admin-${tag}@empresa.test`;
const userEmail = `qa-user-${tag}@empresa.test`;
const password = randomBytes(18).toString("base64url");
const roleName = `QA Exposición ${tag}`;
const groupName = `QA Grupo ${tag}`;
const userName = `QA Demostración ${tag}`;
const owner = new pg.Client({
  connectionString: process.env.MIGRATION_DATABASE_URL,
});
let browser, lastPage;
const errors = [];
await mkdir(".local/screenshots", { recursive: true });

async function enterPassword(page, port, email) {
  await page.goto(`http://localhost:${port}`);
  await page.getByLabel("Correo corporativo").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
}
async function openDemoPage(page, name) {
  const authorization = page.waitForResponse((response) =>
    response.url().includes("/api/v1/demo/page?"),
  );
  await page.getByRole("link", { name, exact: true }).click();
  assert.equal((await authorization).status(), 200);
  await page.getByRole("heading", { name, exact: true }).waitFor();
  await page.locator(".demo-empty-page").waitFor();
  assert.equal((await page.locator(".demo-content").innerText()).trim(), "");
}
async function enroll(page) {
  await page.locator(".qr-enrollment").waitFor();
  await page.getByText("Ingresar la clave manualmente").click();
  const secret = await page.locator(".qr-enrollment code").innerText();
  await page
    .getByLabel("Código del autenticador", { exact: true })
    .fill(totp(secret).generate());
  await page.getByRole("button", { name: "Verificar y continuar" }).click();
  await page.locator(".recovery-grid").waitFor();
  const codes = await page.locator(".recovery-grid code").allInnerTexts();
  await page.getByLabel("He guardado mis códigos en un lugar seguro").click();
  return codes;
}
try {
  await owner.connect();
  const { rows: roles } = await pool.query(
    "SELECT id,app_id FROM roles WHERE is_system_admin",
  );
  const coreRole = roles[0];
  const { rows: users } = await pool.query(
    "INSERT INTO users(email,full_name,password_hash) VALUES($1,$2,$3) RETURNING id",
    [adminEmail, "Administrador de revisión", await hashPassword(password)],
  );
  const adminId = users[0].id;
  await pool.query(
    "INSERT INTO user_applications(user_id,app_id) VALUES($1,$2)",
    [adminId, coreRole.app_id],
  );
  await pool.query(
    "INSERT INTO user_roles(user_id,app_id,role_id) VALUES($1,$2,$3)",
    [adminId, coreRole.app_id, coreRole.id],
  );
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
    locale: "es-PE",
  });
  const adminPage = await context.newPage();
  lastPage = adminPage;
  adminPage.setDefaultTimeout(12000);
  adminPage.on("pageerror", (error) => errors.push(error.message));
  await adminPage.goto("http://localhost:4000");
  await adminPage
    .getByRole("heading", { name: "Bienvenido de nuevo" })
    .waitFor();
  await adminPage.screenshot({
    path: ".local/screenshots/login.png",
    fullPage: true,
  });
  await enterPassword(adminPage, 4000, adminEmail);
  await enroll(adminPage);
  await adminPage
    .getByRole("heading", { name: "Todo empieza con un acceso seguro." })
    .waitFor();
  await adminPage.screenshot({
    path: ".local/screenshots/portal.png",
    fullPage: true,
  });

  await adminPage
    .getByRole("button", { name: "Roles y permisos", exact: true })
    .click();
  await adminPage
    .getByRole("button", { name: "Nuevo rol", exact: true })
    .click();
  let modal = adminPage.getByRole("dialog");
  await modal
    .getByLabel("Aplicación", { exact: true })
    .selectOption({ label: "CRM Comercial" });
  await modal.getByLabel("Nombre del rol").fill(roleName);
  await modal.getByRole("button", { name: "1 hora", exact: true }).click();
  await modal.getByLabel("Clientes", { exact: false }).check();
  await modal.getByRole("button", { name: "Guardar cambios" }).click();
  await modal.waitFor({ state: "hidden" });
  await adminPage
    .getByRole("button", { name: `Editar ${roleName}`, exact: true })
    .waitFor();
  console.log("OK: crear rol y asignar menú desde el panel.");

  await adminPage.getByRole("button", { name: "Menús", exact: true }).click();
  await adminPage
    .getByRole("button", { name: "Nuevo menú", exact: true })
    .click();
  modal = adminPage.getByRole("dialog");
  await modal.getByLabel("Nombre visible").fill(groupName);
  await modal.getByLabel("Código de autorización").fill(`crm.qa${tag}`);
  await modal.getByRole("button", { name: "Guardar cambios" }).click();
  await modal.waitFor({ state: "hidden" });
  await adminPage.getByRole("button", { name: `Editar ${groupName}` }).click();
  modal = adminPage.getByRole("dialog");
  await modal.getByLabel("Nombre visible").fill(`${groupName} editado`);
  await modal.getByRole("button", { name: "Guardar cambios" }).click();
  await modal.waitFor({ state: "hidden" });
  console.log("OK: crear y editar menú desde el panel.");

  await adminPage
    .getByRole("button", { name: "Usuarios", exact: true })
    .click();
  await adminPage
    .getByRole("button", { name: "Nuevo usuario", exact: true })
    .click();
  modal = adminPage.getByRole("dialog");
  await modal.getByLabel("Nombre completo").fill(userName);
  await modal.getByLabel("Correo corporativo").fill(userEmail);
  await modal.getByLabel("Contraseña inicial").fill(password);
  for (const appName of ["CRM Comercial", "Almacén", "Facturación"])
    await modal
      .locator(".check-list")
      .first()
      .getByText(appName, { exact: true })
      .click();
  await modal
    .locator(".check-list label")
    .filter({ hasText: roleName })
    .check();
  for (const appName of ["Almacén", "Facturación"])
    await modal
      .locator(".check-list label")
      .filter({ hasText: "Usuario normal" })
      .filter({ hasText: appName })
      .check();
  await modal.getByRole("button", { name: "Guardar cambios" }).click();
  await modal.waitFor({ state: "hidden" });
  await adminPage
    .getByRole("button", { name: `Editar ${userName}`, exact: true })
    .waitFor();
  await adminPage.screenshot({
    path: ".local/screenshots/usuarios.png",
    fullPage: true,
  });
  console.log(
    "OK: crear usuario y asignarle aplicaciones y roles desde el panel.",
  );

  const userContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "es-PE",
  });
  const userPage = await userContext.newPage();
  lastPage = userPage;
  userPage.setDefaultTimeout(12000);
  userPage.on("pageerror", (error) => errors.push(error.message));
  await enterPassword(userPage, 5001, userEmail);
  const recovery = await enroll(userPage);
  await userPage
    .getByRole("heading", { name: "Inicio", exact: true })
    .waitFor();
  await openDemoPage(userPage, "Clientes");

  await userPage.screenshot({
    path: ".local/screenshots/crm.png",
    fullPage: true,
  });
  const navigation = userPage.getByRole("navigation", {
    name: "Menú principal",
  });
  assert.equal(await navigation.getByRole("link").count(), 2);
  const text = await userPage.locator(".demo-shell").innerText();
  assert.ok(!text.includes(userName) && !text.includes(roleName));
  assert.ok(!text.includes("MFA") && !text.includes("DEMONSTRACIÓN"));
  const group = navigation.getByRole("button", {
    name: "Gestión",
    exact: true,
  });
  await group.click();
  assert.equal(await group.getAttribute("aria-expanded"), "false");
  await group.click();
  await navigation
    .getByRole("link", { name: "Clientes", exact: true })
    .waitFor();
  await userPage
    .getByRole("button", { name: "Contraer barra lateral", exact: true })
    .click();
  assert.ok(
    await userPage
      .locator(".demo-shell")
      .evaluate((node) => node.classList.contains("demo-sidebar-collapsed")),
  );
  await group.click();
  await navigation
    .getByRole("link", { name: "Clientes", exact: true })
    .waitFor();
  await userPage.setViewportSize({ width: 390, height: 844 });
  await userPage
    .getByRole("button", { name: "Abrir menú", exact: true })
    .click();
  await navigation.getByRole("link", { name: "Inicio", exact: true }).click();
  await userPage
    .getByRole("heading", { name: "Inicio", exact: true })
    .waitFor();
  assert.equal(
    await userPage.locator(".demo-sidebar").getAttribute("aria-hidden"),
    "true",
  );
  const mobileWidth = await userPage.evaluate(() => ({
    body: document.body.scrollWidth,
    viewport: innerWidth,
  }));
  assert.ok(mobileWidth.body <= mobileWidth.viewport + 1);
  await userPage
    .getByRole("button", { name: "Abrir menú", exact: true })
    .click();
  await userPage.screenshot({
    path: ".local/screenshots/crm-movil.png",
    fullPage: true,
    animations: "disabled",
  });
  await userPage.keyboard.press("Escape");
  assert.equal(
    await userPage.locator(".demo-sidebar").getAttribute("aria-hidden"),
    "true",
  );
  await userPage.setViewportSize({ width: 1440, height: 1000 });
  console.log(
    "OK: sidebar compacto, grupos desplegables y menú móvil sin información adicional.",
  );
  const denied = await userPage.goto("http://localhost:5001/reportes");
  assert.equal(denied.status(), 403);
  await userPage
    .getByRole("heading", { name: "Acceso no disponible", level: 2 })
    .waitFor();
  console.log("OK: CRM Python, MFA, menú filtrado y bloqueo de URL directa.");

  for (const [index, port] of [5002, 5003].entries()) {
    await enterPassword(userPage, port, userEmail);
    await userPage
      .getByRole("button", {
        name: "Usar un código de recuperación",
        exact: true,
      })
      .click();
    await userPage
      .getByLabel("Código de recuperación", { exact: true })
      .fill(recovery[index]);
    await userPage
      .getByRole("button", { name: "Verificar y continuar" })
      .click();
    await userPage
      .getByRole("heading", { name: "Inicio", exact: true })
      .waitFor();
    const first = port === 5002 ? "Productos" : "Comprobantes";
    await openDemoPage(userPage, first);

    await userPage.screenshot({
      path: `.local/screenshots/${port === 5002 ? "almacen" : "facturacion"}.png`,
      fullPage: true,
    });
    const denied = await userPage.goto(`http://localhost:${port}/reportes`);
    assert.equal(denied.status(), 403);
    await userPage
      .getByRole("heading", { name: "Acceso no disponible", level: 2 })
      .waitFor();
    console.log(
      `OK: cliente ${port}, recuperación y autorización de página desde el backend.`,
    );
  }

  await adminPage
    .getByRole("button", { name: "Usuarios", exact: true })
    .click();
  await adminPage
    .getByRole("button", { name: `Editar ${userName}`, exact: true })
    .click();
  modal = adminPage.getByRole("dialog");
  assert.equal(
    await modal.getByLabel("Exigir doble factor", { exact: true }).isChecked(),
    true,
  );
  await modal.getByLabel("Exigir doble factor", { exact: true }).uncheck();
  await modal.getByRole("button", { name: "Guardar cambios" }).click();
  await modal.waitFor({ state: "hidden" });
  for (const port of [5001, 5002, 5003]) {
    await enterPassword(userPage, port, userEmail);
    await userPage
      .getByRole("heading", { name: "Inicio", exact: true })
      .waitFor();

    const identity = await userPage.request.get(
      `http://localhost:${port}/api/v1/me`,
    );
    assert.equal(identity.status(), 200);
    assert.equal((await identity.json()).session.mfa_verified, false);
    if (port === 5003) {
      await userPage
        .getByRole("button", { name: "Cerrar sesión", exact: true })
        .click();
      await userPage
        .getByRole("heading", { name: "Bienvenido de nuevo", exact: true })
        .waitFor();
      assert.equal(
        (
          await userPage.request.get(`http://localhost:${port}/api/v1/me`)
        ).status(),
        401,
      );
    }
    console.log(
      `OK: ingreso sin MFA en ${port} mediante política configurada desde el panel.`,
    );
  }
  await adminPage
    .getByRole("button", { name: `Editar ${userName}`, exact: true })
    .click();
  modal = adminPage.getByRole("dialog");
  await modal.getByLabel("Exigir doble factor", { exact: true }).check();
  await modal.getByRole("button", { name: "Guardar cambios" }).click();
  await modal.waitFor({ state: "hidden" });
  await enterPassword(userPage, 5001, userEmail);
  await userPage
    .getByRole("heading", { name: "Verifica tu identidad" })
    .waitFor();
  await userPage
    .getByRole("button", {
      name: "Usar un código de recuperación",
      exact: true,
    })
    .click();
  await userPage
    .getByLabel("Código de recuperación", { exact: true })
    .fill(recovery[2]);
  await userPage.getByRole("button", { name: "Verificar y continuar" }).click();
  await userPage
    .getByRole("heading", { name: "Inicio", exact: true })
    .waitFor();
  console.log(
    "OK: reactivar MFA desde el panel vuelve a exigir el segundo factor.",
  );

  await adminPage
    .getByRole("button", { name: "Roles y permisos", exact: true })
    .click();
  await adminPage
    .getByRole("button", { name: `Editar ${roleName}`, exact: true })
    .click();
  modal = adminPage.getByRole("dialog");
  await modal
    .getByRole("button", { name: "1 min · Prueba", exact: true })
    .click();
  await modal.getByRole("button", { name: "Guardar cambios" }).click();
  await modal.waitFor({ state: "hidden" });
  await userPage.goto("http://localhost:5001");
  await userPage
    .getByRole("heading", { name: "Bienvenido de nuevo" })
    .waitFor();
  console.log("OK: cambiar duración desde el panel revoca la sesión del rol.");

  await adminPage.setViewportSize({ width: 390, height: 844 });
  await adminPage.screenshot({
    path: ".local/screenshots/movil.png",
    fullPage: true,
  });
  const width = await adminPage.evaluate(() => ({
    body: document.body.scrollWidth,
    viewport: innerWidth,
  }));
  assert.ok(
    width.body <= width.viewport + 1,
    "La interfaz no debe desbordarse en móvil",
  );
  assert.deepEqual(errors, [], `Errores JavaScript: ${errors.join("; ")}`);
  console.log("OK: diseño móvil sin desbordamiento y sin errores JavaScript.");
} catch (error) {
  console.error("Errores de interfaz:", errors);
  if (lastPage)
    await lastPage
      .screenshot({ path: ".local/screenshots/error-qa.png", fullPage: true })
      .catch(() => {});
  throw error;
} finally {
  await browser?.close();
  // Limpieza acotada a las identidades/roles generados en esta ejecución.
  await owner.query("BEGIN");
  try {
    const { rows } = await owner.query(
      "SELECT id FROM users WHERE email=ANY($1::text[])",
      [[adminEmail, userEmail]],
    );
    const ids = rows.map((row) => row.id);
    for (const app of applications.slice(1)) {
      const local = new pg.Client({
        connectionString: backendEnv(app).DATABASE_URL,
      });
      try {
        await local.connect();
        await local.query(
          "DELETE FROM integration_access WHERE iam_user_id=ANY($1::int[])",
          [ids],
        );
      } finally {
        await local.end();
      }
    }
    await owner.query("DELETE FROM audit_events WHERE user_id=ANY($1::int[])", [
      ids,
    ]);
    await owner.query("DELETE FROM sessions WHERE user_id=ANY($1::int[])", [
      ids,
    ]);
    await owner.query(
      "DELETE FROM auth_challenges WHERE user_id=ANY($1::int[])",
      [ids],
    );
    await owner.query(
      "DELETE FROM recovery_codes WHERE user_id=ANY($1::int[])",
      [ids],
    );
    await owner.query("DELETE FROM user_roles WHERE user_id=ANY($1::int[])", [
      ids,
    ]);
    await owner.query(
      "DELETE FROM user_applications WHERE user_id=ANY($1::int[])",
      [ids],
    );
    await owner.query("DELETE FROM users WHERE id=ANY($1::int[])", [ids]);
    await owner.query(
      "DELETE FROM role_menus WHERE role_id IN (SELECT id FROM roles WHERE name=$1)",
      [roleName],
    );
    await owner.query("DELETE FROM roles WHERE name=$1", [roleName]);
    await owner.query("DELETE FROM menus WHERE code=$1", [`crm.qa${tag}`]);
    await owner.query("COMMIT");
  } catch (error) {
    await owner.query("ROLLBACK");
    console.error("Revisa la limpieza de los datos QA:", error.code);
  }
  await owner.end();
  await pool.end();
}
