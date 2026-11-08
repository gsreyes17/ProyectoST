import "../src/load-env.js";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import pg from "pg";
import request from "supertest";

// Cada ejecución usa su propio esquema. No modifica cuentas ni sesiones reales.
const schema = `st_test_${randomBytes(6).toString("hex")}`;
const owner = new pg.Client({
  connectionString: process.env.MIGRATION_DATABASE_URL,
});
let app,
  pool,
  security,
  adminAgent,
  adminCsrf,
  coreId,
  appId,
  otherAppId,
  roleId,
  fullRoleId,
  menuId,
  extraMenuId,
  counter = 0;
const password = "Prueba-privada-123456";
const integrationKey = randomBytes(32).toString("hex");
const otherKey = randomBytes(32).toString("hex");

before(async () => {
  await owner.connect();
  await owner.query(`CREATE SCHEMA "${schema}"`);
  await owner.query(`SET search_path TO "${schema}"`);
  const migrations = new URL("../../database/migrations/", import.meta.url);
  for (const name of (await readdir(migrations))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    await owner.query(await readFile(new URL(name, migrations), "utf8"));
  }
  const runtime = new URL(process.env.DATABASE_URL).username;
  assert.match(runtime, /^[a-z_]+$/);
  await owner.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${runtime}"`);
  await owner.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "${schema}" TO "${runtime}"`,
  );
  await owner.query(
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "${schema}" TO "${runtime}"`,
  );
  await owner.query(
    `REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM "${runtime}"`,
  );
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  ({ pool } = await import("../src/db.js"));
  security = await import("../src/security.js");
  ({ createApp: app } = await import("../src/app.js"));
  app = app({ serveFrontend: false });
  coreId = (
    await owner.query(
      "INSERT INTO applications(slug,name,platform,is_internal) VALUES('core','Portal','Node',TRUE) RETURNING id",
    )
  ).rows[0].id;
  appId = (
    await owner.query(
      "INSERT INTO applications(slug,name,platform,key_hash) VALUES('crm','CRM','Python',$1) RETURNING id",
      [security.digest(integrationKey)],
    )
  ).rows[0].id;
  otherAppId = (
    await owner.query(
      "INSERT INTO applications(slug,name,platform,key_hash) VALUES('otro','Otro','Java',$1) RETURNING id",
      [security.digest(otherKey)],
    )
  ).rows[0].id;
  const coreRole = (
    await owner.query(
      "INSERT INTO roles(app_id,name,duration_minutes,is_system_admin) VALUES($1,'Administrador',300,TRUE) RETURNING id",
      [coreId],
    )
  ).rows[0].id;
  roleId = (
    await owner.query(
      "INSERT INTO roles(app_id,name,duration_minutes) VALUES($1,'Normal',60) RETURNING id",
      [appId],
    )
  ).rows[0].id;
  fullRoleId = (
    await owner.query(
      "INSERT INTO roles(app_id,name,duration_minutes) VALUES($1,'Supervisor',300) RETURNING id",
      [appId],
    )
  ).rows[0].id;
  menuId = (
    await owner.query(
      "INSERT INTO menus(app_id,code,name,route) VALUES($1,'crm.clientes','Clientes','/clientes') RETURNING id",
      [appId],
    )
  ).rows[0].id;
  extraMenuId = (
    await owner.query(
      "INSERT INTO menus(app_id,code,name,route) VALUES($1,'crm.reportes','Reportes','/reportes') RETURNING id",
      [appId],
    )
  ).rows[0].id;
  await owner.query(
    "INSERT INTO role_menus(role_id,menu_id,app_id) VALUES($1,$2,$3),($4,$2,$3),($4,$5,$3)",
    [roleId, menuId, appId, fullRoleId, extraMenuId],
  );
  const administrator = await newUser(coreId, [coreRole], true);
  adminAgent = request.agent(app);
  const first = await adminAgent
    .post("/api/v1/auth/login-step1")
    .send({ email: administrator.email, password })
    .expect(200);
  await adminAgent
    .post("/api/v1/auth/login-step2")
    .send({
      challenge: first.body.challenge,
      code: security.totp(administrator.secret).generate(),
    })
    .expect(200);
  const identity = await adminAgent.get("/api/v1/me").expect(200);
  adminCsrf = identity.body.csrfToken;
});

after(async () => {
  if (pool) await pool.end();
  // Solo el esquema creado por esta ejecución se elimina; nunca el esquema público.
  if (/^st_test_[a-f0-9]{12}$/.test(schema))
    await owner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await owner.end();
});

async function newUser(
  application = appId,
  roleIds = [roleId],
  enabled = false,
) {
  const email = `prueba${++counter}@empresa.test`;
  const secret = security.newTotpSecret();
  const { rows } = await owner.query(
    "INSERT INTO users(email,full_name,password_hash,mfa_enabled,totp_secret) VALUES($1,$2,$3,$4,$5) RETURNING id",
    [
      email,
      `Usuario prueba ${counter}`,
      await security.hashPassword(password),
      enabled,
      enabled ? security.encrypt(secret) : null,
    ],
  );
  const user = { ...rows[0], email, secret };
  await owner.query(
    "INSERT INTO user_applications(user_id,app_id) VALUES($1,$2)",
    [user.id, application],
  );
  for (const id of roleIds)
    await owner.query(
      "INSERT INTO user_roles(user_id,app_id,role_id) VALUES($1,$2,$3)",
      [user.id, application, id],
    );
  return user;
}
function client(
  method,
  endpoint,
  token,
  application = appId,
  key = integrationKey,
) {
  let req = request(app)
    [method](`/api/v1${endpoint}`)
    .set("X-App-Id", String(application))
    .set("X-App-Key", key);
  if (token) req = req.set("Authorization", `Bearer ${token}`);
  return req;
}
async function login(user) {
  const first = await client("post", "/auth/login-step1")
    .send({ email: user.email, password })
    .expect(200);
  const code = randomBytes(8).toString("hex");
  await owner.query(
    "INSERT INTO recovery_codes(user_id,code_hash) VALUES($1,$2)",
    [user.id, security.digest(code)],
  );
  const second = await client("post", "/auth/login-step2")
    .send({ challenge: first.body.challenge, code })
    .expect(200);
  return second.body;
}
function adminWrite(method, endpoint, body) {
  return adminAgent[method](`/api/v1/admin${endpoint}`)
    .set("X-CSRF-Token", adminCsrf)
    .send(body);
}

test("las contraseñas se almacenan como Argon2id y los secretos TOTP se cifran", async () => {
  const user = await newUser(appId, [roleId], true);
  const { rows } = await owner.query(
    "SELECT password_hash,totp_secret FROM users WHERE id=$1",
    [user.id],
  );
  assert.match(rows[0].password_hash, /^\$argon2id\$/);
  assert.notEqual(rows[0].totp_secret, user.secret);
  assert.equal(security.decrypt(rows[0].totp_secret), user.secret);
});
test("contraseña correcta no crea sesión ni permite saltar el segundo factor", async () => {
  const user = await newUser();
  const first = await client("post", "/auth/login-step1")
    .send({ email: user.email, password })
    .expect(200);
  assert.equal(first.body.state, "ENROLL_REQUIRED");
  assert.equal(first.body.sessionToken, undefined);
  await client("post", "/auth/select-role")
    .send({ selection: first.body.challenge, role_id: roleId })
    .expect(401);
  await request(app).get("/api/v1/admin/users").expect(401);
});
test("el enrolamiento confirma MFA, entrega recuperación una vez y consume el desafío", async () => {
  const user = await newUser();
  const first = await client("post", "/auth/login-step1")
    .send({ email: user.email, password })
    .expect(200);
  const enroll = await client("post", "/auth/mfa/enroll")
    .send({ challenge: first.body.challenge })
    .expect(200);
  assert.match(enroll.body.qr, /^data:image\/png;base64,/);
  const code = security.totp(enroll.body.secret).generate();
  const result = await client("post", "/auth/mfa/confirm")
    .send({ challenge: first.body.challenge, code })
    .expect(200);
  assert.equal(result.body.state, "AUTHENTICATED");
  assert.equal(result.body.recoveryCodes.length, 8);
  await client("get", "/me", result.body.sessionToken).expect(200);
  await client("post", "/auth/mfa/confirm")
    .send({ challenge: first.body.challenge, code })
    .expect(401);
  const { rows } = await owner.query(
    "SELECT token_hash FROM sessions WHERE user_id=$1",
    [user.id],
  );
  assert.notEqual(rows[0].token_hash, result.body.sessionToken);
});
test("los errores MFA persisten y cinco fallos bloquean el desafío", async () => {
  const user = await newUser(appId, [roleId], true);
  const first = await client("post", "/auth/login-step1")
    .send({ email: user.email, password })
    .expect(200);
  const valid = security.totp(user.secret).generate();
  const wrong = String((Number(valid) + 1) % 1000000).padStart(6, "0");
  for (let i = 0; i < 5; i++)
    await client("post", "/auth/login-step2")
      .send({ challenge: first.body.challenge, code: wrong })
      .expect(401);
  const count = await owner.query(
    "SELECT attempts FROM auth_challenges WHERE token_hash=$1",
    [security.digest(first.body.challenge)],
  );
  assert.equal(count.rows[0].attempts, 5);
  await client("post", "/auth/login-step2")
    .send({ challenge: first.body.challenge, code: valid })
    .expect(401);
});
test("un TOTP ya aceptado no vuelve a servir en un nuevo login", async () => {
  const user = await newUser(appId, [roleId], true);
  const code = security.totp(user.secret).generate();
  const first = await client("post", "/auth/login-step1")
    .send({ email: user.email, password })
    .expect(200);
  await client("post", "/auth/login-step2")
    .send({ challenge: first.body.challenge, code })
    .expect(200);
  const next = await client("post", "/auth/login-step1")
    .send({ email: user.email, password })
    .expect(200);
  await client("post", "/auth/login-step2")
    .send({ challenge: next.body.challenge, code })
    .expect(401);
});
test("un código de recuperación no puede reutilizarse", async () => {
  const user = await newUser(appId, [roleId], true);
  const code = randomBytes(8).toString("hex");
  await owner.query(
    "INSERT INTO recovery_codes(user_id,code_hash) VALUES($1,$2)",
    [user.id, security.digest(code)],
  );
  const first = await client("post", "/auth/login-step1")
    .send({ email: user.email, password })
    .expect(200);
  await client("post", "/auth/login-step2")
    .send({ challenge: first.body.challenge, code })
    .expect(200);
  const second = await client("post", "/auth/login-step1")
    .send({ email: user.email, password })
    .expect(200);
  await client("post", "/auth/login-step2")
    .send({ challenge: second.body.challenge, code })
    .expect(401);
});
test("un desafío MFA vencido no puede producir sesión", async () => {
  const user = await newUser(appId, [roleId], true);
  const first = await client("post", "/auth/login-step1")
    .send({ email: user.email, password })
    .expect(200);
  await owner.query(
    "UPDATE auth_challenges SET expires_at=NOW()-INTERVAL '1 second' WHERE token_hash=$1",
    [security.digest(first.body.challenge)],
  );
  await client("post", "/auth/login-step2")
    .send({
      challenge: first.body.challenge,
      code: security.totp(user.secret).generate(),
    })
    .expect(401);
});
test("seleccionar entre varios roles exige prueba posterior a MFA y de un solo uso", async () => {
  const user = await newUser(appId, [roleId, fullRoleId], true);
  const factor = await login(user);
  assert.equal(factor.state, "ROLE_REQUIRED");
  assert.equal(factor.roles.length, 2);
  assert.equal(factor.sessionToken, undefined);
  const response = await client("post", "/auth/select-role")
    .send({ selection: factor.selection, role_id: fullRoleId })
    .expect(200);
  assert.equal(response.body.role_name, "Supervisor");
  await client("post", "/auth/select-role")
    .send({ selection: factor.selection, role_id: roleId })
    .expect(401);
});
test("sesión de un rol normal dura 60 minutos y su menú no autoriza reportes", async () => {
  const user = await newUser(appId, [roleId], true);
  const session = await login(user);
  const identity = await client("get", "/me", session.sessionToken).expect(200);
  const milliseconds =
    new Date(identity.body.session.expires_at) -
    new Date(identity.body.session.created_at);
  assert.equal(milliseconds, 60 * 60000);
  assert.equal(identity.body.menus.length, 1);
  await client("post", "/auth/introspect", session.sessionToken)
    .send({ permission: "crm.clientes" })
    .expect(200);
  await client("post", "/auth/introspect", session.sessionToken)
    .send({ permission: "crm.reportes" })
    .expect(403);
});
test("la misma sesión no sirve en otra aplicación ni sin credencial de integración", async () => {
  const session = await login(await newUser(appId, [roleId], true));
  await client("get", "/me", session.sessionToken, otherAppId, otherKey).expect(
    401,
  );
  await client("get", "/me", session.sessionToken, appId, "incorrecta").expect(
    401,
  );
});
test("un administrador de una demo no administra el Core", async () => {
  const session = await login(await newUser(appId, [fullRoleId], true));
  await client("get", "/admin/users", session.sessionToken).expect(403);
});
test("las modificaciones del panel exigen CSRF y no aceptan un origen ajeno", async () => {
  await adminAgent.post("/api/v1/admin/users").send({}).expect(403);
  await adminAgent
    .post("/api/v1/admin/users")
    .set("Origin", "https://ajeno.example")
    .set("X-CSRF-Token", adminCsrf)
    .send({})
    .expect(403);
});
test("no se puede deshabilitar al último administrador", async () => {
  const identity = await adminAgent.get("/api/v1/me").expect(200);
  await adminWrite("patch", `/users/${identity.body.session.user_id}`, {
    email: identity.body.session.email,
    full_name: "Administrador",
    active: false,
  }).expect(409);
  await adminAgent.get("/api/v1/me").expect(200);
});
test("no se asignan roles/menús de otra aplicación", async () => {
  const anotherRole = (
    await owner.query(
      "INSERT INTO roles(app_id,name,duration_minutes) VALUES($1,'Ajeno',60) RETURNING id",
      [otherAppId],
    )
  ).rows[0].id;
  await adminWrite("put", `/roles/${anotherRole}/menus`, {
    menu_ids: [menuId],
  }).expect(400);
  const user = await newUser();
  await adminWrite("put", `/users/${user.id}/roles`, {
    role_ids: [anotherRole],
  }).expect(400);
});
test("cambiar menús aplica a la siguiente petición sin renovar la sesión", async () => {
  const session = await login(await newUser(appId, [roleId], true));
  await adminWrite("put", `/roles/${roleId}/menus`, { menu_ids: [] }).expect(
    200,
  );
  await client("post", "/auth/introspect", session.sessionToken)
    .send({ permission: "crm.clientes" })
    .expect(403);
  await adminWrite("put", `/roles/${roleId}/menus`, {
    menu_ids: [menuId],
  }).expect(200);
});
test("editar duración revoca sesiones y el próximo ingreso utiliza el nuevo tiempo", async () => {
  const user = await newUser(appId, [roleId], true);
  const session = await login(user);
  await adminWrite("patch", `/roles/${roleId}`, {
    app_id: appId,
    name: "Normal",
    description: "",
    duration_minutes: 1,
    active: true,
    menu_ids: [menuId],
  }).expect(200);
  await client("get", "/me", session.sessionToken).expect(401);
  const next = await login(user);
  const identity = await client("get", "/me", next.sessionToken).expect(200);
  assert.equal(
    new Date(identity.body.session.expires_at) -
      new Date(identity.body.session.created_at),
    60000,
  );
});
test("vencimiento del servidor, desactivación y cierre de sesión impiden nuevas peticiones", async () => {
  const user = await newUser(appId, [roleId], true);
  const expired = await login(user);
  await owner.query(
    "UPDATE sessions SET expires_at=NOW()-INTERVAL '1 second' WHERE token_hash=$1",
    [security.digest(expired.sessionToken)],
  );
  await client("get", "/me", expired.sessionToken).expect(401);
  const active = await login(user);
  await adminWrite("patch", `/users/${user.id}`, {
    email: user.email,
    full_name: "Desactivado",
    active: false,
  }).expect(200);
  await client("get", "/me", active.sessionToken).expect(401);
  const another = await login(await newUser(appId, [roleId], true));
  await client("post", "/auth/logout", another.sessionToken)
    .send({})
    .expect(200);
  await client("get", "/me", another.sessionToken).expect(401);
});
test("se rechazan dominios ajenos, rutas ejecutables y árboles de más de dos niveles", async () => {
  await adminWrite("post", "/users", {
    full_name: "Ajeno",
    email: "ajeno@gmail.com",
    password,
  }).expect(400);
  await adminWrite("post", "/menus", {
    app_id: appId,
    code: "crm.malo",
    name: "Malo",
    route: "javascript:alert(1)",
    parent_id: null,
    position: 1,
  }).expect(400);
  await adminWrite("post", "/menus", {
    app_id: appId,
    code: "crm.nieto",
    name: "Nieto",
    route: "/nuevo",
    parent_id: menuId,
    position: 1,
  }).expect(400);
});
test("una aplicación o rol deshabilitado invalida la comprobación de sesión", async () => {
  const session = await login(await newUser(appId, [fullRoleId], true));
  await owner.query("UPDATE roles SET active=FALSE WHERE id=$1", [fullRoleId]);
  await client("get", "/me", session.sessionToken).expect(401);
  await owner.query("UPDATE roles SET active=TRUE WHERE id=$1", [fullRoleId]);
  await owner.query("UPDATE applications SET active=FALSE WHERE id=$1", [
    appId,
  ]);
  await client("get", "/me", session.sessionToken).expect(401);
  await owner.query("UPDATE applications SET active=TRUE WHERE id=$1", [appId]);
});
test("la cuenta de ejecución puede anexar auditoría pero no modificarla ni borrarla", async () => {
  await assert.rejects(
    pool.query("UPDATE audit_events SET detail='alterado'"),
    (error) => error.code === "42501",
  );
  await assert.rejects(
    pool.query("DELETE FROM audit_events"),
    (error) => error.code === "42501",
  );
  const events = await adminAgent.get("/api/v1/admin/audit").expect(200);
  assert.ok(events.body.total > 0);
  assert.ok(events.body.items.some((event) => event.result === "DENEGADO"));
});

test("MFA configurable por usuario", async (t) => {
  // Un nuevo servidor de prueba inicia sus contadores de intentos independientes.
  const { createApp } = await import("../src/app.js");
  app = createApp({ serveFrontend: false });
  const setPolicy = (user, required) =>
    adminWrite("patch", `/users/${user.id}`, {
      email: user.email,
      full_name: "Usuario de prueba",
      active: true,
      mfa_required: required,
    }).expect(200);
  const passwordStep = (user, extra = {}) =>
    client("post", "/auth/login-step1").send({
      email: user.email,
      password,
      ...extra,
    });

  await t.test(
    "sin MFA exigido se inicia sesión sin QR y se conservan permisos y duración",
    async () => {
      const user = await newUser();
      await setPolicy(user, false);
      const response = await passwordStep(user).expect(200);
      assert.equal(response.body.state, "AUTHENTICATED");
      assert.equal(response.body.mfa_verified, false);
      assert.equal(response.body.challenge, undefined);
      const identity = await client(
        "get",
        "/me",
        response.body.sessionToken,
      ).expect(200);
      assert.equal(identity.body.session.mfa_required, false);
      assert.equal(identity.body.session.mfa_verified, false);
      assert.equal(
        new Date(identity.body.session.expires_at) -
          new Date(identity.body.session.created_at),
        60000,
      );
      await client("post", "/auth/introspect", response.body.sessionToken)
        .send({ permission: "crm.reportes" })
        .expect(403);
      await passwordStep(user, { password: "Incorrecta" }).expect(401);
    },
  );

  await t.test(
    "sin MFA exigido se siguen validando los roles asignados y la selección es de un uso",
    async () => {
      const user = await newUser(appId, [roleId, fullRoleId]);
      await setPolicy(user, false);
      const response = await passwordStep(user).expect(200);
      assert.equal(response.body.state, "ROLE_REQUIRED");
      const deniedRole = (
        await owner.query(
          "INSERT INTO roles(app_id,name) VALUES($1,'No asignado') RETURNING id",
          [appId],
        )
      ).rows[0].id;
      await client("post", "/auth/select-role")
        .send({ selection: response.body.selection, role_id: deniedRole })
        .expect(401);
      const selected = await client("post", "/auth/select-role")
        .send({ selection: response.body.selection, role_id: fullRoleId })
        .expect(200);
      assert.equal(selected.body.mfa_verified, false);
      assert.equal(selected.body.role_name, "Supervisor");
      await client("post", "/auth/select-role")
        .send({ selection: response.body.selection, role_id: roleId })
        .expect(401);
    },
  );

  await t.test(
    "volver a exigir MFA revoca sesiones y selecciones pendientes y solicita enrolamiento",
    async () => {
      const user = await newUser(appId, [roleId, fullRoleId]);
      await setPolicy(user, false);
      const first = await passwordStep(user).expect(200);
      const session = await client("post", "/auth/select-role")
        .send({ selection: first.body.selection, role_id: roleId })
        .expect(200);
      const pending = await passwordStep(user).expect(200);
      await setPolicy(user, true);
      await client("get", "/me", session.body.sessionToken).expect(401);
      await client("post", "/auth/select-role")
        .send({ selection: pending.body.selection, role_id: roleId })
        .expect(401);
      const enforced = await passwordStep(user).expect(200);
      assert.equal(enforced.body.state, "ENROLL_REQUIRED");
      const events = await owner.query(
        "SELECT detail FROM audit_events WHERE event='MFA_POLITICA_EDITADA' AND detail LIKE $1",
        [`Usuario ${user.id}:%`],
      );
      assert.equal(events.rowCount, 2);
    },
  );

  await t.test(
    "la sesión y prueba de rol sin MFA no sirven cuando la política vuelve a exigirlo",
    async () => {
      const user = await newUser(appId, [roleId, fullRoleId], true);
      await setPolicy(user, false);
      const first = await passwordStep(user).expect(200);
      const session = await client("post", "/auth/select-role")
        .send({ selection: first.body.selection, role_id: roleId })
        .expect(200);
      const pending = await passwordStep(user).expect(200);
      // Comprobación adicional incluso si un cambio externo no revocó los registros.
      await owner.query("UPDATE users SET mfa_required=TRUE WHERE id=$1", [
        user.id,
      ]);
      await client("get", "/me", session.body.sessionToken).expect(401);
      await client("post", "/auth/select-role")
        .send({ selection: pending.body.selection, role_id: roleId })
        .expect(401);
    },
  );

  await t.test(
    "desactivar la exigencia conserva el autenticador enrolado para cuando se reactive",
    async () => {
      const user = await newUser(appId, [roleId], true);
      await setPolicy(user, false);
      await passwordStep(user).expect(200);
      await adminWrite("patch", `/users/${user.id}`, {
        email: user.email,
        full_name: "Nombre editado",
        active: true,
      }).expect(200);
      const saved = await owner.query(
        "SELECT mfa_required,totp_secret FROM users WHERE id=$1",
        [user.id],
      );
      assert.equal(saved.rows[0].mfa_required, false);
      assert.equal(security.decrypt(saved.rows[0].totp_secret), user.secret);
      await setPolicy(user, true);
      const required = await passwordStep(user).expect(200);
      assert.equal(required.body.state, "MFA_REQUIRED");
    },
  );

  await t.test(
    "el navegador no puede omitir MFA ni cambiar su propia política",
    async () => {
      const required = await newUser();
      const attempt = await passwordStep(required, {
        mfa_required: false,
      }).expect(200);
      assert.equal(attempt.body.state, "ENROLL_REQUIRED");
      const optional = await newUser();
      await setPolicy(optional, false);
      const session = await passwordStep(optional).expect(200);
      await client(
        "patch",
        `/admin/users/${optional.id}`,
        session.body.sessionToken,
      )
        .send({ mfa_required: false })
        .expect(403);
      await client(
        "get",
        "/me",
        session.body.sessionToken,
        otherAppId,
        otherKey,
      ).expect(401);
    },
  );

  await t.test(
    "el alta permite configurar MFA sin imponerlo a otros usuarios",
    async () => {
      const email = `alta-sin-mfa@empresa.test`;
      const response = await adminWrite("post", "/users", {
        email,
        full_name: "Alta sin MFA",
        password,
        mfa_required: false,
      }).expect(201);
      const row = await owner.query(
        "SELECT mfa_required,mfa_enabled FROM users WHERE id=$1",
        [response.body.id],
      );
      assert.equal(row.rows[0].mfa_required, false);
      assert.equal(row.rows[0].mfa_enabled, false);
      const required = await newUser();
      assert.equal(
        (await passwordStep(required).expect(200)).body.state,
        "ENROLL_REQUIRED",
      );
    },
  );

  await t.test(
    "el portal admite la política opcional y entrega cookie HttpOnly sin exponer la sesión",
    async () => {
      const coreRole = (
        await owner.query("SELECT id FROM roles WHERE is_system_admin")
      ).rows[0].id;
      const user = await newUser(coreId, [coreRole]);
      await setPolicy(user, false);
      const agent = request.agent(app);
      const response = await agent
        .post("/api/v1/auth/login-step1")
        .send({ email: user.email, password })
        .expect(200);
      assert.equal(response.body.state, "AUTHENTICATED");
      assert.equal(response.body.sessionToken, undefined);
      assert.ok(
        response.headers["set-cookie"].some((cookie) =>
          cookie.includes("HttpOnly"),
        ),
      );
      const me = await agent.get("/api/v1/me").expect(200);
      assert.equal(me.body.session.mfa_verified, false);
      const target = await newUser();
      await agent
        .post(`/api/v1/admin/users/${target.id}/reset-password`)
        .set("X-CSRF-Token", me.body.csrfToken)
        .send({
          admin_password: password,
          new_password: "Nueva-contraseña-12345",
          identityConfirmed: true,
        })
        .expect(200);
    },
  );
});

test("las consultas habituales de sesion no consumen el limite de intentos de login", async () => {
  const { createApp } = await import("../src/app.js");
  app = createApp({ serveFrontend: false });
  const user = await newUser(appId, [roleId]);
  await owner.query("UPDATE users SET mfa_required=FALSE WHERE id=$1", [
    user.id,
  ]);
  const login = await client("post", "/auth/login-step1")
    .send({ email: user.email, password })
    .expect(200);
  for (let i = 0; i < 65; i++)
    await client("post", "/auth/introspect", login.body.sessionToken)
      .send({})
      .expect(200);
  await client("post", "/auth/login-step1")
    .send({ email: user.email, password })
    .expect(200);
  for (let i = 0; i < 13; i++)
    await client("post", "/auth/login-step1")
      .send({ email: user.email, password: "Incorrecta" })
      .expect(401);
  await client("post", "/auth/login-step1")
    .send({ email: user.email, password: "Incorrecta" })
    .expect(429);
});
