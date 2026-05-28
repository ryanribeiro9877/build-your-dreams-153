-- ============================================================================
-- API de integração externa — auditoria + helpers de schema
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.integration_api_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT,
  client_ip TEXT,
  payload_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  status_code INTEGER NOT NULL,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integration_audit_created
  ON public.integration_api_audit_log (created_at DESC);

ALTER TABLE public.integration_api_audit_log ENABLE ROW LEVEL SECURITY;

-- Somente service_role / edge functions gravam e leem (sem policy para authenticated)
COMMENT ON TABLE public.integration_api_audit_log IS
  'Auditoria de chamadas à edge function integration-api. Acesso via service_role.';

CREATE OR REPLACE FUNCTION public.integration_list_tables()
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT array_agg(table_name::text ORDER BY table_name)
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE';
$$;

REVOKE ALL ON FUNCTION public.integration_list_tables() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.integration_list_tables() TO service_role;

CREATE OR REPLACE FUNCTION public.integration_list_rpcs()
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT array_agg(p.proname::text ORDER BY p.proname)
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'f';
$$;

REVOKE ALL ON FUNCTION public.integration_list_rpcs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.integration_list_rpcs() TO service_role;

COMMIT;
