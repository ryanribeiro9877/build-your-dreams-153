-- ============================================================================
-- V16 (2/2) — Acesso técnico (tech) + aba de Crons
--   1) Tabela cron_jobs (config das crons gerenciada pela aba técnica).
--   2) Edição de agentes/departamentos/permissões passa a exigir o papel `tech`
--      (antes era `admin`). Só o acesso técnico do dev edita prompt/provider/etc.
-- Depende da migração 20260529170000_add_tech_role.sql (valor 'tech' já commitado).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Tabela de configuração das crons
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cron_jobs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL UNIQUE,
  description  text,
  schedule     text NOT NULL,                       -- expressão cron, ex: '*/5 * * * *'
  target       text NOT NULL,                        -- alvo: edge function / RPC, ex: 'oab-process-sync'
  params       jsonb NOT NULL DEFAULT '{}'::jsonb,    -- parâmetros do job
  enabled      boolean NOT NULL DEFAULT true,
  last_run_at  timestamptz,
  last_status  text,
  created_by   uuid DEFAULT auth.uid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cron_jobs_enabled ON public.cron_jobs (enabled);

-- updated_at automático (função genérica já existe no projeto)
DROP TRIGGER IF EXISTS trg_cron_jobs_updated_at ON public.cron_jobs;
CREATE TRIGGER trg_cron_jobs_updated_at
  BEFORE UPDATE ON public.cron_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: somente o papel técnico (tech) lê e gerencia as crons.
ALTER TABLE public.cron_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tech manage cron_jobs" ON public.cron_jobs;
CREATE POLICY "Tech manage cron_jobs"
  ON public.cron_jobs FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'tech'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'tech'::app_role));

-- Job placeholder da OAB (desabilitado; o MCP externo da OAB entra na próxima onda).
INSERT INTO public.cron_jobs (name, description, schedule, target, enabled)
VALUES (
  'oab-process-sync',
  'Sincroniza processos da OAB dos advogados, casa com o cliente e notifica advogado/recepção. Pendente: conector/MCP externo da OAB.',
  '0 * * * *',
  'oab-process-sync',
  false
)
ON CONFLICT (name) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2) Edição de agentes/departamentos/permissões: admin -> tech
--    (somente o acesso técnico do dev edita prompt/provider/configs)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins manage agents" ON public.agents;
CREATE POLICY "Tech manage agents"
  ON public.agents FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'tech'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'tech'::app_role));

DROP POLICY IF EXISTS "Admins manage departments" ON public.departments;
CREATE POLICY "Tech manage departments"
  ON public.departments FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'tech'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'tech'::app_role));

DROP POLICY IF EXISTS "Admins manage agent_permissions" ON public.agent_permissions;
CREATE POLICY "Tech manage agent_permissions"
  ON public.agent_permissions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'tech'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'tech'::app_role));

-- ============================================================================
-- Como conceder o acesso técnico a um usuário (rodar manualmente, com o uid do dev):
--   INSERT INTO public.user_roles (user_id, role)
--   VALUES ('<UID_DO_DEV>', 'tech') ON CONFLICT DO NOTHING;
-- (SELECT de agents/departments segue liberado p/ leitura; só o WRITE exige tech.)
-- ============================================================================
