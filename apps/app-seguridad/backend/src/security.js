import {
  randomBytes,
  createHash,
  createCipheriv,
  createDecipheriv,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import argon2 from "argon2";
import * as OTPAuth from "otpauth";
import { config } from "./config.js";

export const randomToken = () => randomBytes(32).toString("hex");
export const digest = (token) =>
  createHash("sha256").update(token).digest("hex");
export const hashPassword = (password) =>
  argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
export const verifyPassword = (hash, password) => argon2.verify(hash, password);
export const csrfToken = (session) =>
  createHmac("sha256", config.encryptionKey)
    .update(`csrf:${session}`)
    .digest("hex");
export function equalToken(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function encrypt(text) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", config.encryptionKey, iv);
  const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data]
    .map((value) => value.toString("base64"))
    .join(".");
}
export function decrypt(text) {
  const [iv, tag, data] = text
    .split(".")
    .map((value) => Buffer.from(value, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", config.encryptionKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}
export function totp(secret, label) {
  return new OTPAuth.TOTP({
    issuer: config.TOTP_ISSUER_ID,
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}
export const newTotpSecret = () => new OTPAuth.Secret({ size: 20 }).base32;
export function verifyTotp(secret, code) {
  if (!/^\d{6}$/.test(code)) return null;
  const delta = totp(secret).validate({ token: code, window: 1 });
  return delta === null ? null : Math.floor(Date.now() / 30000) + delta;
}
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export function validate(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success)
    throw new HttpError(
      400,
      result.error.issues[0]?.message || "Revisa los datos ingresados.",
    );
  return result.data;
}
