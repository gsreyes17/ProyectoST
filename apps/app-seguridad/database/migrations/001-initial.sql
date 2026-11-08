CREATE TABLE applications (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(300) NOT NULL DEFAULT '',
  platform VARCHAR(60) NOT NULL,
  key_hash TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  is_internal BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX one_internal_application ON applications ((is_internal)) WHERE is_internal;

CREATE TABLE users (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email VARCHAR(180) UNIQUE NOT NULL CHECK (email = lower(email)),
  full_name VARCHAR(160) NOT NULL,
  password_hash TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  totp_secret TEXT,
  mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  last_totp_step BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (NOT mfa_enabled OR totp_secret IS NOT NULL)
);

CREATE TABLE user_applications (
  user_id INTEGER NOT NULL REFERENCES users(id),
  app_id INTEGER NOT NULL REFERENCES applications(id),
  PRIMARY KEY (user_id, app_id)
);

CREATE TABLE roles (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  app_id INTEGER NOT NULL REFERENCES applications(id),
  name VARCHAR(80) NOT NULL,
  description VARCHAR(300) NOT NULL DEFAULT '',
  duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (duration_minutes BETWEEN 1 AND 1440),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  is_system_admin BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (id, app_id),
  UNIQUE (app_id, name)
);
CREATE UNIQUE INDEX one_system_admin_role ON roles ((is_system_admin)) WHERE is_system_admin;

CREATE TABLE user_roles (
  user_id INTEGER NOT NULL REFERENCES users(id),
  app_id INTEGER NOT NULL REFERENCES applications(id),
  role_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id, app_id) REFERENCES user_applications(user_id, app_id),
  FOREIGN KEY (role_id, app_id) REFERENCES roles(id, app_id)
);

CREATE TABLE menus (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  app_id INTEGER NOT NULL REFERENCES applications(id),
  code VARCHAR(80) NOT NULL,
  name VARCHAR(100) NOT NULL,
  route VARCHAR(180),
  icon VARCHAR(40) NOT NULL DEFAULT 'layout',
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  parent_id INTEGER,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (id, app_id),
  UNIQUE (app_id, code),
  FOREIGN KEY (parent_id, app_id) REFERENCES menus(id, app_id),
  CHECK (parent_id IS NULL OR parent_id <> id),
  CHECK (route IS NULL OR (route ~ '^/[a-zA-Z0-9/_-]*$' AND route !~ '^//'))
);

CREATE FUNCTION validate_menu_tree() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM menus WHERE id=NEW.parent_id AND app_id=NEW.app_id AND parent_id IS NULL AND route IS NULL
  ) THEN RAISE EXCEPTION 'El padre debe ser un grupo raíz de la misma aplicación' USING ERRCODE='23514'; END IF;
  IF EXISTS (SELECT 1 FROM menus WHERE parent_id=NEW.id) AND (NEW.parent_id IS NOT NULL OR NEW.route IS NOT NULL) THEN
    RAISE EXCEPTION 'Un grupo con hijos debe permanecer en la raíz y sin ruta' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER menu_tree BEFORE INSERT OR UPDATE ON menus FOR EACH ROW EXECUTE FUNCTION validate_menu_tree();

CREATE TABLE role_menus (
  role_id INTEGER NOT NULL,
  menu_id INTEGER NOT NULL,
  app_id INTEGER NOT NULL,
  PRIMARY KEY (role_id, menu_id),
  FOREIGN KEY (role_id, app_id) REFERENCES roles(id, app_id),
  FOREIGN KEY (menu_id, app_id) REFERENCES menus(id, app_id)
);

CREATE TABLE auth_challenges (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token_hash TEXT UNIQUE NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  app_id INTEGER NOT NULL REFERENCES applications(id),
  purpose VARCHAR(20) NOT NULL CHECK (purpose IN ('enroll', 'mfa', 'role')),
  secret_cipher TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX challenges_user ON auth_challenges(user_id, app_id, created_at);

CREATE TABLE sessions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token_hash TEXT UNIQUE NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  app_id INTEGER NOT NULL REFERENCES applications(id),
  role_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  ip_address VARCHAR(60),
  FOREIGN KEY (role_id, app_id) REFERENCES roles(id, app_id)
);
CREATE INDEX sessions_user ON sessions(user_id, app_id);
CREATE INDEX sessions_expiry ON sessions(expires_at) WHERE revoked_at IS NULL;

CREATE TABLE recovery_codes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  code_hash TEXT NOT NULL,
  consumed_at TIMESTAMPTZ,
  UNIQUE (user_id, code_hash)
);

CREATE TABLE audit_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id INTEGER REFERENCES users(id),
  app_id INTEGER REFERENCES applications(id),
  event VARCHAR(60) NOT NULL,
  result VARCHAR(30) NOT NULL,
  ip_address VARCHAR(60),
  detail VARCHAR(500) NOT NULL DEFAULT ''
);
CREATE INDEX audit_created ON audit_events(created_at DESC);
CREATE INDEX audit_user ON audit_events(user_id, created_at DESC);

-- El rol de ejecución puede anexar auditoría, nunca modificarla o borrarla.
REVOKE ALL ON audit_events FROM PUBLIC;
