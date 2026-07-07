-- ============================================================================
-- [INT] Registro de leads — tabela `leads` + enum de funil + RLS + distribuição
-- ----------------------------------------------------------------------------
-- Frente independente do R-2/OCR: NÃO toca em clients, cripto, anexos nem no
-- chat-orchestrator. Lead ainda NÃO é cliente — contato aqui não é PII cifrada.
--
-- A ORIGEM do lead é um `captacao_canais` (FK), que já carrega `tipo` e
-- `default_assignee_role_code` (quem recebe por padrão). Não recriamos enum de
-- origem paralelo nem repetimos origem como texto livre.
--
-- REGRA DURA DO CARD: o sistema NÃO envia WhatsApp automaticamente e não deve
-- dar a entender que envia. Nenhum ponto deste schema dispara/insinua envio —
-- onde houver "contato", o front apenas gera texto para copiar. Integração de
-- envio, se um dia existir, é outra tarefa explícita.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Enum de status (funil mínimo para medição)
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.lead_status AS ENUM (
    'novo',
    'em_contato',
    'qualificado',
    'convertido',
    'perdido'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- 2. Tabela leads
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leads (
  id           UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name    TEXT NOT NULL,
  phone        TEXT,
  email        TEXT,
  -- origem: aponta para o canal de captação (traz tipo + assignee padrão)
  canal_id     UUID REFERENCES public.captacao_canais(id) ON DELETE SET NULL,
  -- campanha específica dentro do canal (ex.: nome da campanha de Meta Ads)
  campanha     TEXT,
  status       public.lead_status NOT NULL DEFAULT 'novo',
  -- a quem foi distribuído (recepção). profiles.user_id é UNIQUE.
  assigned_to  UUID REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  notes        TEXT,
  -- espaço para dados de origem (utm, id de anúncio, etc.), como captacao_canais.metadata
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_status      ON public.leads (status);
CREATE INDEX IF NOT EXISTS idx_leads_canal        ON public.leads (canal_id);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to  ON public.leads (assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_created_at   ON public.leads (created_at DESC);

COMMENT ON TABLE  public.leads               IS 'Leads de captação. Origem via FK captacao_canais (não enum paralelo). Lead != cliente: contato aqui não é PII cifrada. Sistema NÃO envia WhatsApp automático.';
COMMENT ON COLUMN public.leads.canal_id      IS 'Origem do lead: canal de captação (traz tipo + default_assignee_role_code).';
COMMENT ON COLUMN public.leads.campanha      IS 'Campanha específica dentro do canal (texto livre; ex.: nome da campanha de mídia).';
COMMENT ON COLUMN public.leads.assigned_to   IS 'Recepcionista/usuário a quem o lead foi distribuído. Preenchido por regra padrão do canal; reatribuível manualmente.';
COMMENT ON COLUMN public.leads.metadata      IS 'Dados de origem (utm, ad id, etc.), seguindo o padrão de captacao_canais.metadata.';

-- ----------------------------------------------------------------------------
-- 3. Triggers
-- ----------------------------------------------------------------------------
-- updated_at (mesma função usada por todo o projeto)
DROP TRIGGER IF EXISTS trg_leads_updated ON public.leads;
CREATE TRIGGER trg_leads_updated
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Distribuição padrão: ao inserir sem assigned_to, resolve o
-- default_assignee_role_code do canal para um usuário da recepção.
-- Regra padrão (confirmada como ponto de partida): pega um perfil com o cargo
-- do canal, de forma determinística (o mais antigo). Reatribuição é manual
-- (UPDATE). Se o canal não define papel ou não há usuário com o papel, deixa
-- NULL — a recepção reatribui na mão.
CREATE OR REPLACE FUNCTION public.leads_set_default_assignee()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_code TEXT;
BEGIN
  IF NEW.assigned_to IS NOT NULL OR NEW.canal_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT cc.default_assignee_role_code
    INTO v_role_code
    FROM public.captacao_canais cc
   WHERE cc.id = NEW.canal_id;

  IF v_role_code IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.user_id
    INTO NEW.assigned_to
    FROM public.profiles p
    JOIN public.role_templates rt ON rt.id = p.role_template_id
   WHERE rt.code = v_role_code
   ORDER BY p.created_at NULLS LAST, p.user_id
   LIMIT 1;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.leads_set_default_assignee() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_leads_default_assignee ON public.leads;
CREATE TRIGGER trg_leads_default_assignee
  BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_set_default_assignee();

-- ----------------------------------------------------------------------------
-- 4. RLS — recepção/sócio trabalham os leads; anon sem acesso
-- ----------------------------------------------------------------------------
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- SELECT: recepção + sócio (is_recepcao_or_socio já cobre socio/lider/recepcionista),
-- mais master admin/director. Sócio é o leitor do funil de marketing.
DROP POLICY IF EXISTS "leads select recepcao/socio" ON public.leads;
CREATE POLICY "leads select recepcao/socio" ON public.leads
  FOR SELECT TO authenticated
  USING (public.is_recepcao_or_socio() OR public.is_master_admin(auth.uid()));

-- INSERT: quem registra lead (recepção/sócio). O caminho de captação automática
-- (se existir) roda com service_role, que ignora RLS.
DROP POLICY IF EXISTS "leads insert recepcao/socio" ON public.leads;
CREATE POLICY "leads insert recepcao/socio" ON public.leads
  FOR INSERT TO authenticated
  WITH CHECK (public.is_recepcao_or_socio() OR public.is_master_admin(auth.uid()));

-- UPDATE: recepção/sócio (mover status, reatribuir).
DROP POLICY IF EXISTS "leads update recepcao/socio" ON public.leads;
CREATE POLICY "leads update recepcao/socio" ON public.leads
  FOR UPDATE TO authenticated
  USING (public.is_recepcao_or_socio() OR public.is_master_admin(auth.uid()))
  WITH CHECK (public.is_recepcao_or_socio() OR public.is_master_admin(auth.uid()));

-- DELETE: restrito a master admin/director (remover lead é destrutivo).
DROP POLICY IF EXISTS "leads delete admin" ON public.leads;
CREATE POLICY "leads delete admin" ON public.leads
  FOR DELETE TO authenticated
  USING (public.is_master_admin(auth.uid()));

-- Sem acesso a anon (padrão do projeto).
REVOKE ALL ON public.leads FROM anon;

-- ----------------------------------------------------------------------------
-- 5. Agregação de funil para o dashboard de marketing V2
-- ----------------------------------------------------------------------------
-- View com security_invoker: a RLS de `leads` do chamador se aplica (sócio vê
-- tudo; recepção vê o que a policy permite). Contagem por status + canal +
-- campanha, que é o que a medição de funil consome.
DROP VIEW IF EXISTS public.leads_funnel;
CREATE VIEW public.leads_funnel WITH (security_invoker = on) AS
SELECT
  l.status,
  l.canal_id,
  c.code         AS canal_code,
  c.display_name AS canal_display_name,
  l.campanha,
  count(*)::bigint AS total
FROM public.leads l
LEFT JOIN public.captacao_canais c ON c.id = l.canal_id
GROUP BY l.status, l.canal_id, c.code, c.display_name, l.campanha;

COMMENT ON VIEW public.leads_funnel IS 'Agregação de leads por status/canal/campanha para o dashboard de marketing V2. security_invoker: respeita a RLS de leads do chamador.';

REVOKE ALL ON public.leads_funnel FROM PUBLIC, anon;
GRANT SELECT ON public.leads_funnel TO authenticated;

-- ============================================================================
-- Fim. Frente independente: nada de clients/cripto/anexos/orquestrador.
-- Nenhum ponto promete/insinua envio automático de WhatsApp.
-- Captação automática (webhook/integração) fica como tarefa separada, se vier.
-- ============================================================================
