-- Aplicar conectado a facturacion_app como su propietario.
GRANT USAGE ON SCHEMA public TO facturacion_runtime;
REVOKE CREATE ON SCHEMA public FROM PUBLIC,facturacion_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON integration_access TO facturacion_runtime;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO facturacion_runtime;
DO $$ BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    REVOKE ALL ON schema_migrations FROM facturacion_runtime;
  END IF;
END $$;
