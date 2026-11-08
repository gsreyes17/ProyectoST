-- Aplicar conectado a seguridad_transversal como su propietario.
GRANT USAGE ON SCHEMA public TO st_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC,st_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO st_app;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO st_app;
REVOKE UPDATE,DELETE,TRUNCATE ON audit_events FROM st_app;
DO $$ BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    REVOKE ALL ON schema_migrations FROM st_app;
  END IF;
END $$;
