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
('facturacion.comprobantes', '{"numero":"F001-00001245","cliente":"Comercial Andina SAC","fecha":"2026-11-03","total":3540,"descuento":120}'),
('facturacion.comprobantes', '{"numero":"F001-00001246","cliente":"Inversiones Pacífico SA","fecha":"2026-11-04","total":12980,"descuento":650}'),
('facturacion.comprobantes', '{"numero":"B001-00008712","cliente":"Cliente varios","fecha":"2026-11-04","total":186.5,"descuento":0}'),
('facturacion.comprobantes', '{"numero":"F001-00001247","cliente":"Textiles Cusco SRL","fecha":"2026-11-07","total":2215,"descuento":75}'),
('facturacion.series', '{"serie":"F001","tipo":"Factura","correlativo":1247}'),
('facturacion.series', '{"serie":"B001","tipo":"Boleta de venta","correlativo":8712}'),
('facturacion.series', '{"serie":"FC01","tipo":"Nota de crédito","correlativo":38}'),
('facturacion.reportes', '{"indicador":"Comprobantes emitidos","periodo":"2026-10","valor":412}'),
('facturacion.reportes', '{"indicador":"Total facturado","periodo":"2026-10","valor":286450}'),
('facturacion.reportes', '{"indicador":"Notas de crédito","periodo":"2026-10","valor":5}');
