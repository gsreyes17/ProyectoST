-- Aplicar conectado a crm_app como su propietario.
GRANT USAGE ON SCHEMA public TO crm_runtime;
REVOKE CREATE ON SCHEMA public FROM PUBLIC,crm_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON integration_access TO crm_runtime;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO crm_runtime;
DO $$ BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    REVOKE ALL ON schema_migrations FROM crm_runtime;
  END IF;
END $$;
