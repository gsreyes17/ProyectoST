-- Ejecutar con psql como administrador, conectado a postgres y SIN una transaccion global.
-- Quien ejecuta este SQL proporciona ocho contrasenas mediante variables privadas de psql.
-- No colocar contrasenas reales en este archivo ni versionar un archivo de variables.
\set ON_ERROR_STOP on

SELECT bool_and(length(password)>=24 AND password NOT LIKE 'CAMBIAR%') AS passwords_valid
FROM (VALUES (:'st_owner_password'),(:'st_app_password'),(:'crm_owner_password'),(:'crm_runtime_password'),
  (:'almacen_owner_password'),(:'almacen_runtime_password'),(:'facturacion_owner_password'),(:'facturacion_runtime_password')) AS provided(password)
\gset
\if :passwords_valid
\else
  \echo 'Define ocho contrasenas aleatorias de al menos 24 caracteres antes de instalar.'
  \quit 1
\endif

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM (VALUES ('seguridad_transversal','st_owner'),('crm_app','crm_owner'),
      ('almacen_app','almacen_owner'),('facturacion_app','facturacion_owner')) AS desired(database_name,owner_name)
    JOIN pg_database actual ON actual.datname=desired.database_name
    WHERE pg_get_userbyid(actual.datdba)<>desired.owner_name
  ) THEN RAISE EXCEPTION 'Una base existente tiene otro propietario. No se modifica.'; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('st_owner','st_app','crm_owner','crm_runtime',
    'almacen_owner','almacen_runtime','facturacion_owner','facturacion_runtime') AND (rolsuper OR rolcreatedb OR rolcreaterole))
  THEN RAISE EXCEPTION 'Un rol existente tiene privilegios incompatibles. No se modifica.'; END IF;
END $$;

SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE', role_name, role_password)
FROM (VALUES
  ('st_owner', :'st_owner_password'), ('st_app', :'st_app_password'),
  ('crm_owner', :'crm_owner_password'), ('crm_runtime', :'crm_runtime_password'),
  ('almacen_owner', :'almacen_owner_password'), ('almacen_runtime', :'almacen_runtime_password'),
  ('facturacion_owner', :'facturacion_owner_password'), ('facturacion_runtime', :'facturacion_runtime_password')
) AS desired(role_name, role_password)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name)
\gexec

SELECT format('CREATE DATABASE %I OWNER %I', database_name, owner_name)
FROM (VALUES
  ('seguridad_transversal', 'st_owner'), ('crm_app', 'crm_owner'),
  ('almacen_app', 'almacen_owner'), ('facturacion_app', 'facturacion_owner')
) AS desired(database_name, owner_name)
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname=database_name)
\gexec

REVOKE CONNECT,TEMPORARY ON DATABASE seguridad_transversal FROM PUBLIC;
REVOKE CONNECT,TEMPORARY ON DATABASE crm_app FROM PUBLIC;
REVOKE CONNECT,TEMPORARY ON DATABASE almacen_app FROM PUBLIC;
REVOKE CONNECT,TEMPORARY ON DATABASE facturacion_app FROM PUBLIC;
GRANT CONNECT ON DATABASE seguridad_transversal TO st_owner,st_app;
GRANT CONNECT ON DATABASE crm_app TO crm_owner,crm_runtime;
GRANT CONNECT ON DATABASE almacen_app TO almacen_owner,almacen_runtime;
GRANT CONNECT ON DATABASE facturacion_app TO facturacion_owner,facturacion_runtime;
