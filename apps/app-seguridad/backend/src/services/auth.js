import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { pool, transaction } from "../db.js";
import { audit } from "./access.js";
import {
  digest,
  randomToken,
  hashPassword,
  verifyPassword,
  encrypt,
  decrypt,
  newTotpSecret,
  totp,
  verifyTotp,
  HttpError,
} from "../security.js";

// Evita una salida rápida cuando la cuenta no existe.
const dummyHash = await hashPassword(randomToken());

export async function loginPassword(email, password, app, ip) {
  const { rows } = await pool.query("SELECT * FROM users WHERE email=$1", [
    email,
  ]);
  const user = rows[0];
  const matches = await verifyPassword(
    user?.password_hash || dummyHash,
    password,
  );
  const roles = user
    ? await pool.query(
        `SELECT r.id FROM user_roles ur JOIN roles r ON r.id=ur.role_id
    JOIN user_applications ua ON ua.user_id=ur.user_id AND ua.app_id=ur.app_id
    WHERE ur.user_id=$1 AND ur.app_id=$2 AND r.active`,
        [user.id, app.id],
      )
    : { rowCount: 0 };
  if (!matches || !user?.active || !roles.rowCount) {
    await audit(pool, {
      userId: user?.id,
      appId: app.id,
      event: "LOGIN",
      result: "DENEGADO",
      ip,
      detail: "Credenciales o habilitación inválidas",
    });
    throw new HttpError(
      401,
      "No se pudo iniciar sesión. Revisa tus credenciales o consulta al administrador.",
    );
  }
  return transaction(async (db) => {
    // Una nueva autenticación reemplaza desafíos anteriores de la misma aplicación.
    const { rows: lockedUsers } = await db.query(
      "SELECT * FROM users WHERE id=$1 FOR UPDATE",
      [user.id],
    );
    const current = lockedUsers[0];
    const stillAllowed = await db.query(
      `SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id
      JOIN applications a ON a.id=ur.app_id WHERE ur.user_id=$1 AND ur.app_id=$2 AND r.active AND a.active`,
      [user.id, app.id],
    );
    if (
      !current?.active ||
      current.password_hash !== user.password_hash ||
      !stillAllowed.rowCount
    )
      throw new HttpError(401, "La cuenta cambió. Vuelve a iniciar sesión.");
    await db.query(
      "UPDATE auth_challenges SET consumed_at=NOW() WHERE user_id=$1 AND app_id=$2 AND consumed_at IS NULL",
      [user.id, app.id],
    );
    if (!current.mfa_required) {
      return completeAuthentication(db, user.id, app.id, ip, false);
    }
    const token = randomToken();
    const purpose = current.mfa_enabled ? "mfa" : "enroll";
    const secret = purpose === "enroll" ? encrypt(newTotpSecret()) : null;
    await db.query(
      `INSERT INTO auth_challenges(token_hash,user_id,app_id,purpose,secret_cipher,expires_at)
      VALUES($1,$2,$3,$4,$5,NOW()+INTERVAL '5 minutes')`,
      [digest(token), user.id, app.id, purpose, secret],
    );
    return {
      state: purpose === "enroll" ? "ENROLL_REQUIRED" : "MFA_REQUIRED",
      challenge: token,
      email: user.email,
    };
  });
}

export async function enrollment(challenge, appId) {
  const { rows } = await pool.query(
    `SELECT c.secret_cipher,u.email FROM auth_challenges c JOIN users u ON u.id=c.user_id
    JOIN applications a ON a.id=c.app_id WHERE c.token_hash=$1 AND c.app_id=$2 AND c.purpose='enroll'
    AND c.consumed_at IS NULL AND c.expires_at>NOW() AND c.attempts<5 AND u.active AND a.active AND NOT u.mfa_enabled`,
    [digest(challenge), appId],
  );
  if (!rows[0])
    throw new HttpError(
      401,
      "La configuración venció. Vuelve a iniciar sesión.",
    );
  const secret = decrypt(rows[0].secret_cipher);
  return {
    qr: await QRCode.toDataURL(totp(secret, rows[0].email).toString()),
    secret,
  };
}

async function issueSession(db, userId, appId, role, ip, mfaVerified) {
  const token = randomToken();
  const { rows } = await db.query(
    `INSERT INTO sessions(token_hash,user_id,app_id,role_id,expires_at,ip_address,mfa_verified)
    VALUES($1,$2,$3,$4,NOW()+make_interval(mins=>$5),$6,$7) RETURNING expires_at`,
    [
      digest(token),
      userId,
      appId,
      role.id,
      role.duration_minutes,
      ip,
      mfaVerified,
    ],
  );
  await audit(db, {
    userId,
    appId,
    event: "LOGIN",
    ip,
    detail: `Rol activo: ${role.name} · ${mfaVerified ? "Contraseña + MFA" : "Solo contraseña"}`,
  });
  return {
    state: "AUTHENTICATED",
    sessionToken: token,
    expires_at: rows[0].expires_at,
    role_name: role.name,
    mfa_verified: mfaVerified,
  };
}

// Ambos recorridos comparten selección de rol, permisos y duración de sesión.
async function completeAuthentication(
  db,
  userId,
  appId,
  ip,
  mfaVerified,
  recoveryCodes = [],
) {
  const { rows: roles } = await db.query(
    `SELECT r.id,r.name,r.duration_minutes FROM roles r JOIN user_roles ur ON ur.role_id=r.id
    JOIN user_applications ua ON ua.user_id=ur.user_id AND ua.app_id=ur.app_id
    WHERE ur.user_id=$1 AND r.app_id=$2 AND r.active ORDER BY r.name FOR SHARE OF r`,
    [userId, appId],
  );
  if (!roles.length)
    throw new HttpError(
      401,
      "No tienes un rol habilitado. Consulta al administrador.",
    );
  if (roles.length === 1) {
    return {
      ...(await issueSession(db, userId, appId, roles[0], ip, mfaVerified)),
      recoveryCodes,
    };
  }
  const selection = randomToken();
  await db.query(
    `INSERT INTO auth_challenges(token_hash,user_id,app_id,purpose,expires_at,mfa_verified)
    VALUES($1,$2,$3,'role',NOW()+INTERVAL '2 minutes',$4)`,
    [digest(selection), userId, appId, mfaVerified],
  );
  return { state: "ROLE_REQUIRED", selection, roles, recoveryCodes };
}

export async function verifySecondFactor(
  challenge,
  code,
  appId,
  ip,
  enrolling = false,
) {
  const outcome = await transaction(async (db) => {
    const { rows } = await db.query(
      `SELECT c.*,u.email,u.totp_secret,u.last_totp_step,u.mfa_enabled FROM auth_challenges c
      JOIN users u ON u.id=c.user_id JOIN applications a ON a.id=c.app_id
      WHERE c.token_hash=$1 AND c.app_id=$2 AND c.purpose=$3 AND c.consumed_at IS NULL
      AND c.expires_at>NOW() AND c.attempts<5 AND u.active AND a.active FOR UPDATE OF c,u`,
      [digest(challenge), appId, enrolling ? "enroll" : "mfa"],
    );
    const entry = rows[0];
    if (!entry)
      return {
        error: "El desafío venció o ya fue utilizado. Inicia sesión otra vez.",
      };
    if (enrolling === entry.mfa_enabled)
      return { error: "El estado de MFA cambió. Inicia sesión otra vez." };
    await db.query(
      "UPDATE auth_challenges SET attempts=attempts+1 WHERE id=$1",
      [entry.id],
    );
    const secret = decrypt(enrolling ? entry.secret_cipher : entry.totp_secret);
    const normalizedRecovery = code.replaceAll("-", "").toLowerCase();
    let step = null;
    let valid = false;
    if (!enrolling && /^[a-f0-9]{16}$/.test(normalizedRecovery)) {
      valid =
        (
          await db.query(
            "UPDATE recovery_codes SET consumed_at=NOW() WHERE user_id=$1 AND code_hash=$2 AND consumed_at IS NULL RETURNING id",
            [entry.user_id, digest(normalizedRecovery)],
          )
        ).rowCount > 0;
    } else {
      step = verifyTotp(secret, code);
      valid =
        step !== null &&
        (entry.last_totp_step === null || step > Number(entry.last_totp_step));
    }
    if (!valid) {
      await audit(db, {
        userId: entry.user_id,
        appId,
        event: "MFA",
        result: "DENEGADO",
        ip,
        detail: "Código inválido o reutilizado",
      });
      return {
        error:
          "Código inválido o ya utilizado. Espera el siguiente código e inténtalo otra vez.",
      };
    }
    await db.query("UPDATE auth_challenges SET consumed_at=NOW() WHERE id=$1", [
      entry.id,
    ]);
    await db.query(
      `UPDATE users SET last_totp_step=COALESCE($1,last_totp_step),
      totp_secret=COALESCE($2,totp_secret),mfa_enabled=TRUE WHERE id=$3`,
      [step, enrolling ? entry.secret_cipher : null, entry.user_id],
    );
    const recoveryCodes = [];
    if (enrolling) {
      await db.query("DELETE FROM recovery_codes WHERE user_id=$1", [
        entry.user_id,
      ]);
      for (let i = 0; i < 8; i++) {
        const raw = randomBytes(8).toString("hex");
        recoveryCodes.push(raw.match(/.{4}/g).join("-"));
        await db.query(
          "INSERT INTO recovery_codes(user_id,code_hash) VALUES($1,$2)",
          [entry.user_id, digest(raw)],
        );
      }
    }
    await audit(db, {
      userId: entry.user_id,
      appId,
      event: enrolling ? "MFA_ENROLADO" : "MFA",
      ip,
    });
    return completeAuthentication(
      db,
      entry.user_id,
      appId,
      ip,
      true,
      recoveryCodes,
    );
  });
  if (outcome.error) throw new HttpError(401, outcome.error);
  return outcome;
}

export async function selectRole(selection, roleId, appId, ip) {
  const result = await transaction(async (db) => {
    const { rows } = await db.query(
      `SELECT c.id,c.user_id,c.mfa_verified,r.id AS role_id,r.name,r.duration_minutes FROM auth_challenges c
      JOIN users u ON u.id=c.user_id JOIN applications a ON a.id=c.app_id
      JOIN user_applications ua ON ua.user_id=u.id AND ua.app_id=c.app_id
      JOIN user_roles ur ON ur.user_id=u.id AND ur.app_id=c.app_id
      JOIN roles r ON r.id=ur.role_id AND r.app_id=c.app_id
      WHERE c.token_hash=$1 AND c.app_id=$2 AND c.purpose='role' AND c.consumed_at IS NULL
      AND c.expires_at>NOW() AND u.active AND (NOT u.mfa_required OR (u.mfa_enabled AND c.mfa_verified))
      AND a.active AND r.active AND r.id=$3 FOR UPDATE OF c,u FOR SHARE OF r`,
      [digest(selection), appId, roleId],
    );
    const role = rows[0];
    if (!role) return null;
    await db.query("UPDATE auth_challenges SET consumed_at=NOW() WHERE id=$1", [
      role.id,
    ]);
    return issueSession(
      db,
      role.user_id,
      appId,
      {
        id: role.role_id,
        name: role.name,
        duration_minutes: role.duration_minutes,
      },
      ip,
      role.mfa_verified,
    );
  });
  if (!result)
    throw new HttpError(
      401,
      "Selección inválida o vencida. Vuelve a iniciar sesión.",
    );
  return result;
}
