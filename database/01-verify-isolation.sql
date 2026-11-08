-- Ejecutar como administrador en postgres. Todos los valores esperados son true.
SELECT desired.role_name, desired.own_database,
  has_database_privilege(desired.role_name, desired.own_database, 'CONNECT') AS connects_to_own_database,
  NOT EXISTS (
    SELECT 1 FROM unnest(ARRAY['seguridad_transversal','crm_app','almacen_app','facturacion_app']) AS other(database_name)
    WHERE database_name<>desired.own_database AND has_database_privilege(desired.role_name,database_name,'CONNECT')
  ) AS other_databases_denied
FROM (VALUES ('st_app','seguridad_transversal'), ('crm_runtime','crm_app'),
  ('almacen_runtime','almacen_app'), ('facturacion_runtime','facturacion_app'))
AS desired(role_name,own_database);
