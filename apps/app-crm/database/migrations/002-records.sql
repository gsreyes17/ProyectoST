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
('crm.clientes', '{"nombre":"Comercial Andina SAC","ruc":"20481234567","ciudad":"Lima","limite_credito":45000}'),
('crm.clientes', '{"nombre":"Distribuidora del Sur EIRL","ruc":"20539876541","ciudad":"Arequipa","limite_credito":18000}'),
('crm.clientes', '{"nombre":"Inversiones Pacífico SA","ruc":"20100456789","ciudad":"Trujillo","limite_credito":72000}'),
('crm.clientes', '{"nombre":"Textiles Cusco SRL","ruc":"20605551234","ciudad":"Cusco","limite_credito":9500}'),
('crm.oportunidades', '{"cliente":"Comercial Andina SAC","etapa":"Propuesta","monto":28500,"margen":22}'),
('crm.oportunidades', '{"cliente":"Inversiones Pacífico SA","etapa":"Negociación","monto":64000,"margen":17.5}'),
('crm.oportunidades', '{"cliente":"Textiles Cusco SRL","etapa":"Contacto inicial","monto":7200,"margen":31}'),
('crm.reportes', '{"indicador":"Clientes nuevos","periodo":"2026-10","valor":14}'),
('crm.reportes', '{"indicador":"Oportunidades ganadas","periodo":"2026-10","valor":6}'),
('crm.reportes', '{"indicador":"Monto en negociación","periodo":"2026-10","valor":99700}');
