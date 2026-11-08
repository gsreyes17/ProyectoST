-- La política (exigir MFA) es independiente del enrolamiento del autenticador.
ALTER TABLE users ADD COLUMN mfa_required BOOLEAN NOT NULL DEFAULT TRUE;

-- Todas las sesiones anteriores a esta migración completaron MFA obligatorio.
ALTER TABLE sessions ADD COLUMN mfa_verified BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE sessions ALTER COLUMN mfa_verified SET DEFAULT FALSE;

-- Una prueba de selección de rol conserva el nivel de autenticación alcanzado.
ALTER TABLE auth_challenges ADD COLUMN mfa_verified BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE auth_challenges SET mfa_verified=TRUE WHERE purpose='role';
