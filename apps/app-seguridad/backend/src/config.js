import "./load-env.js";
import { z } from "zod";

const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    MFA_ENCRYPTION_KEY: z
      .string()
      .regex(
        /^[a-f0-9]{64}$/i,
        "MFA_ENCRYPTION_KEY debe tener 64 caracteres hexadecimales",
      ),
    COMPANY_NAME: z.string().default("Empresa por definir"),
    APP_DISPLAY_NAME: z.string().default("Portal de Seguridad"),
    ALLOWED_EMAIL_DOMAINS: z.string().default("empresa.test"),
    DISPLAY_TIME_ZONE: z.string().default("America/Lima"),
    TOTP_ISSUER_ID: z.string().default("seguridad-transversal"),
    PORT: z.coerce.number().default(4000),
    FRONTEND_PORT: z.coerce.number().default(5173),
    NODE_ENV: z.string().default("development"),
    COOKIE_SECURE: z.enum(["true", "false"]).default("false"),
  })
  .parse(process.env);

export const config = {
  ...env,
  domains: env.ALLOWED_EMAIL_DOMAINS.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
  secureCookies: env.COOKIE_SECURE === "true",
  encryptionKey: Buffer.from(env.MFA_ENCRYPTION_KEY, "hex"),
};
if (env.NODE_ENV === "production" && !config.secureCookies) {
  throw new Error("Producción requiere COOKIE_SECURE=true y HTTPS.");
}
