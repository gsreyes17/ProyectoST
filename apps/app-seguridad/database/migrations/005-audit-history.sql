-- Trazabilidad ampliada. Ambas tablas son de solo anexado para la cuenta de
-- ejecución (ver permissions.sql y migrate.js): no se modifican ni se borran.

-- Historial de cambios administrativos con el estado anterior y el nuevo.
-- `before`/`after` guardan una vista legible del registro (nombres de pantallas,
-- roles y aplicaciones), nunca contraseñas, secretos MFA ni claves.
CREATE TABLE admin_changes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id INTEGER REFERENCES users(id),
  entity VARCHAR(20) NOT NULL CHECK (entity IN ('user', 'role', 'menu', 'application')),
  entity_id INTEGER NOT NULL,
  action VARCHAR(60) NOT NULL,
  before JSONB,
  after JSONB,
  ip_address VARCHAR(60)
);
CREATE INDEX admin_changes_entity ON admin_changes(entity, entity_id, created_at DESC);
CREATE INDEX admin_changes_created ON admin_changes(created_at DESC);

-- Cada pantalla solicitada por una aplicación, permitida o denegada.
CREATE TABLE access_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id INTEGER NOT NULL REFERENCES users(id),
  app_id INTEGER NOT NULL REFERENCES applications(id),
  role_id INTEGER NOT NULL,
  permission VARCHAR(80) NOT NULL,
  allowed BOOLEAN NOT NULL,
  ip_address VARCHAR(60)
);
CREATE INDEX access_log_created ON access_log(created_at DESC);
CREATE INDEX access_log_user ON access_log(user_id, created_at DESC);

REVOKE ALL ON admin_changes, access_log FROM PUBLIC;
