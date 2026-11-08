-- Datos locales de la app: el usuario central es una referencia externa sin FK entre bases.
CREATE TABLE integration_access (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  iam_user_id INTEGER NOT NULL,
  permission_code VARCHAR(80) NOT NULL,
  route VARCHAR(180) NOT NULL,
  visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX integration_access_user ON integration_access(iam_user_id,visited_at DESC);
COMMENT ON TABLE integration_access IS 'Prueba de integracion: solo se inserta despues de validar permiso y sesion en IAM';
