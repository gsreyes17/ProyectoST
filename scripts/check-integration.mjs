import "../apps/app-seguridad/backend/src/load-env.js";
import pg from "pg";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { applications, backendEnv } from "./project.mjs";
import { hashPassword } from "../apps/app-seguridad/backend/src/security.js";

const owner = new pg.Client({
  connectionString: backendEnv(applications[0]).MIGRATION_DATABASE_URL,
});
const tag = randomBytes(6).toString("hex");
const password = randomBytes(18).toString("base64url");
let userId;
const diagnostics = [];
async function call(port, endpoint, { method = "GET", body, cookie } = {}) {
  const response = await fetch(`http://127.0.0.1:${port}/api/v1${endpoint}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10000),
  });
  return { response, data: await response.json() };
}
try {
  // Las credenciales de cada runtime conectan a su base y rechazan las otras tres.
  for (const app of applications) {
    const env = backendEnv(app);
    const client = new pg.Client({ connectionString: env.DATABASE_URL });
    await client.connect();
    const own = (
      await client.query(
        "SELECT current_database() AS database,current_user AS database_user",
      )
    ).rows[0];
    assert.equal(own.database, app.database);
    assert.equal(own.database_user, app.runtime);
    assert.equal(
      (
        await client.query(
          "SELECT has_schema_privilege(current_user,'public','CREATE') AS can_create",
        )
      ).rows[0].can_create,
      false,
    );
    await client.end();
    for (const other of applications.filter(
      (other) => other.slug !== app.slug,
    )) {
      const url = new URL(env.DATABASE_URL);
      url.pathname = "/" + other.database;
      const forbidden = new pg.Client({
        connectionString: url.toString(),
        connectionTimeoutMillis: 3000,
      });
      try {
        await assert.rejects(
          forbidden.connect(),
          (error) => error.code === "42501",
        );
      } finally {
        await forbidden.end().catch(() => {});
      }
    }
    diagnostics.push({ ...own, other_databases_denied: true });
  }
  console.table(diagnostics);
  await owner.connect();
  userId = (
    await owner.query(
      "INSERT INTO users(email,full_name,password_hash,mfa_required) VALUES($1,$2,$3,FALSE) RETURNING id",
      [
        `qa-db-${tag}@empresa.test`,
        "Prueba de cuatro bases",
        await hashPassword(password),
      ],
    )
  ).rows[0].id;
  for (const app of applications.slice(1)) {
    const integration = backendEnv(app);
    const role = (
      await owner.query(
        "SELECT id,app_id FROM roles WHERE app_id=$1 AND name='Usuario normal' AND active",
        [integration.APP_ID],
      )
    ).rows[0];
    assert.ok(role, `Falta el rol de demostracion de ${app.slug}`);
    await owner.query(
      "INSERT INTO user_applications(user_id,app_id) VALUES($1,$2)",
      [userId, role.app_id],
    );
    await owner.query(
      "INSERT INTO user_roles(user_id,app_id,role_id) VALUES($1,$2,$3)",
      [userId, role.app_id, role.id],
    );
    const anonymous = await call(app.port, "/integration/status");
    assert.equal(anonymous.response.status, 401);
    const login = await call(app.port, "/auth/login-step1", {
      method: "POST",
      body: { email: `qa-db-${tag}@empresa.test`, password },
    });
    assert.equal(login.response.status, 200);
    assert.equal(login.data.state, "AUTHENTICATED");
    assert.equal(login.data.sessionToken, undefined);
    const cookie = login.response.headers.getSetCookie()[0].split(";")[0];
    const first = await call(app.port, "/integration/status", { cookie });
    assert.equal(first.response.status, 200);
    assert.equal(first.data.database, app.database);
    const menus = await call(app.port, "/navigation/menus", { cookie });
    const option = menus.data.flatMap((menu) =>
      menu.route ? [menu] : menu.children,
    )[0];
    assert.ok(option);
    const opened = await call(
      app.port,
      `/demo/page?path=${encodeURIComponent(option.route)}`,
      { cookie },
    );
    assert.equal(opened.response.status, 200);
    assert.equal(opened.data.database, app.database);
    assert.ok(opened.data.access_id);
    const after = await call(app.port, "/integration/status", { cookie });
    assert.equal(after.data.own_accesses, first.data.own_accesses + 1);
    const denied = await call(app.port, "/demo/page?path=/reportes", {
      cookie,
    });
    assert.equal(denied.response.status, 403);
    const final = await call(app.port, "/integration/status", { cookie });
    assert.equal(final.data.own_accesses, after.data.own_accesses);
    console.log(
      `OK ${app.slug}: IAM autoriza, ${app.database} registra el acceso, la denegacion no escribe en la base.`,
    );
  }
  console.log(
    "Integracion de cuatro bases y aislamiento de los cuatro runtimes verificados.",
  );
} finally {
  if (userId) {
    for (const app of applications.slice(1)) {
      const local = new pg.Client({
        connectionString: backendEnv(app).DATABASE_URL,
      });
      try {
        await local.connect();
        await local.query(
          "DELETE FROM integration_access WHERE iam_user_id=$1",
          [userId],
        );
      } finally {
        await local.end().catch(() => {});
      }
    }
    await owner.query("BEGIN");
    try {
      for (const table of [
        "audit_events",
        "sessions",
        "auth_challenges",
        "recovery_codes",
        "user_roles",
        "user_applications",
      ])
        await owner.query(`DELETE FROM ${table} WHERE user_id=$1`, [userId]);
      await owner.query("DELETE FROM users WHERE id=$1", [userId]);
      await owner.query("COMMIT");
    } catch (error) {
      await owner.query("ROLLBACK");
      throw error;
    }
  }
  await owner.end().catch(() => {});
}
