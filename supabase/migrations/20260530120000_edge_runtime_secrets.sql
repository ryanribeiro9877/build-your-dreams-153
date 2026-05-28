-- Secrets para edge functions (lidos com service_role; sem policies = sem acesso via API pública)

CREATE TABLE IF NOT EXISTS public.edge_runtime_secrets (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.edge_runtime_secrets ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.edge_runtime_secrets IS
  'Configuração Resend/Site URL/Turnstile para edge functions. Popular via scripts/sync-edge-secrets-to-db.mjs';

CREATE OR REPLACE FUNCTION public.get_edge_runtime_secret(p_key TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT value FROM public.edge_runtime_secrets WHERE key = p_key LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_edge_runtime_secret(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_edge_runtime_secret(TEXT) TO service_role;
