-- Registros de negocio de la demo. `module` es el código de la pantalla definido en
-- backend/app.json y `data` contiene sus columnas. `iam_user_id` es el usuario central
-- que creó el registro (referencia externa, sin FK); NULL en los datos de ejemplo.
CREATE TABLE records (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  module VARCHAR(80) NOT NULL,
  data JSONB NOT NULL,
  iam_user_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX records_module ON records(module, id);

INSERT INTO records(module, data) VALUES
('almacen.productos', '{"codigo":"PR-0001","nombre":"Caja de cartón 40x30","stock":1250,"costo":2.4}'),
('almacen.productos', '{"codigo":"PR-0002","nombre":"Cinta de embalaje 48 mm","stock":380,"costo":3.1}'),
('almacen.productos', '{"codigo":"PR-0003","nombre":"Pallet de madera estándar","stock":96,"costo":38.5}'),
('almacen.productos', '{"codigo":"PR-0004","nombre":"Film estirable 500 m","stock":210,"costo":21}'),
('almacen.movimientos', '{"fecha":"2026-11-02","producto":"Caja de cartón 40x30","tipo":"Ingreso","cantidad":500}'),
('almacen.movimientos', '{"fecha":"2026-11-05","producto":"Pallet de madera estándar","tipo":"Salida","cantidad":24}'),
('almacen.movimientos', '{"fecha":"2026-11-09","producto":"Cinta de embalaje 48 mm","tipo":"Salida","cantidad":60}'),
('almacen.reportes', '{"indicador":"Productos con stock bajo","periodo":"2026-10","valor":3}'),
('almacen.reportes', '{"indicador":"Ingresos registrados","periodo":"2026-10","valor":41}'),
('almacen.reportes', '{"indicador":"Salidas registradas","periodo":"2026-10","valor":57}');
