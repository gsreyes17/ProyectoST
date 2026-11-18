-- Capacidades: elementos protegidos dentro de una pantalla (opción de menú).
-- grid = ver la grilla, button = ejecutar una acción, column = ver/editar una columna sensible.
-- El menú concede la entrada a la pantalla; la capacidad concede cada elemento.
CREATE TABLE capabilities (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  app_id INTEGER NOT NULL REFERENCES applications(id),
  menu_id INTEGER NOT NULL,
  code VARCHAR(120) NOT NULL,
  name VARCHAR(100) NOT NULL,
  kind VARCHAR(10) NOT NULL CHECK (kind IN ('grid', 'button', 'column')),
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (id, app_id),
  UNIQUE (app_id, code),
  FOREIGN KEY (menu_id, app_id) REFERENCES menus(id, app_id)
);
CREATE INDEX capabilities_menu ON capabilities(menu_id);

CREATE TABLE role_capabilities (
  role_id INTEGER NOT NULL,
  capability_id INTEGER NOT NULL,
  app_id INTEGER NOT NULL,
  PRIMARY KEY (role_id, capability_id),
  FOREIGN KEY (role_id, app_id) REFERENCES roles(id, app_id),
  FOREIGN KEY (capability_id, app_id) REFERENCES capabilities(id, app_id)
);
