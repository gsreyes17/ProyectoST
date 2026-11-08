-- Aplicar conectado a almacen_app como su propietario.
GRANT USAGE ON SCHEMA public TO almacen_runtime;
REVOKE CREATE ON SCHEMA public FROM PUBLIC,almacen_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON integration_access TO almacen_runtime;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO almacen_runtime;
DO $$ BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    REVOKE ALL ON schema_migrations FROM almacen_runtime;
  END IF;
END $$;
