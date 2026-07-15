-- ============================================================================
-- ESPELHO da migração já aplicada em produção via Supabase MCP.
-- NÃO REEXECUTAR — versionamento/histórico apenas.
--
-- [INT] Google Agenda — sync reuniões (início + conclusão, parte construível)
-- Itens 1-2 do checklist "início" (criar conta Google + fazer OAuth) são
-- humanos, de Ryan — não fazem parte desta migração. Isto cobre o resto.
--
-- ACHADO IMPORTANTE (corrigido nesta sessão, antes de ir para produção): já
-- existiam triggers `trg_meetings_notify_create` (cria tarefa + alerta de
-- chat) e `trg_meetings_notify_reschedule` (alerta de reagendamento) cobrindo
-- 100% do item 4 do checklist. Uma primeira versão desta migração criava um
-- gatilho redundante (`trg_meetings_notify` / `trg_meeting_created_notify`)
-- que teria causado DOIS alertas por reunião criada — capturado em teste
-- E2E antes de qualquer uso real e removido. Este espelho já reflete o
-- estado final, sem a duplicata.
--
-- Validado em produção via teste E2E transacional com ROLLBACK: reunião
-- criada gera exatamente 1 tarefa + 1 alerta (mecanismo pré-existente,
-- confirmado intacto); reagendar gera o 2º alerta (pré-existente); update
-- não quebra mesmo sem credenciais Google configuradas; leitura de
-- credenciais retorna {configured:false} antes de configurar e o JSON
-- correto depois.
-- ============================================================================

-- 1) Config singleton (mesmo padrão de business_hours_config) ---------------
CREATE TABLE IF NOT EXISTS public.google_calendar_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  vault_secret_id uuid REFERENCES vault.secrets(id),
  calendar_id text,
  account_email text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.google_calendar_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.google_calendar_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS google_cal_config_select ON public.google_calendar_config;
CREATE POLICY google_cal_config_select ON public.google_calendar_config
  FOR SELECT TO authenticated
  USING (public.is_master_admin(auth.uid()) OR public.has_role(auth.uid(),'tech'::public.app_role));
REVOKE ALL ON public.google_calendar_config FROM public, anon;
GRANT SELECT ON public.google_calendar_config TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.google_calendar_config FROM authenticated;

-- 2) Leitura das credenciais decifradas (só a edge function, via service_role) -
CREATE OR REPLACE FUNCTION public.get_google_calendar_credentials()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '', 'vault'
AS $fn$
DECLARE v_cfg record; v_secret jsonb;
BEGIN
  SELECT c.vault_secret_id, c.calendar_id, c.account_email, s.decrypted_secret
    INTO v_cfg
  FROM public.google_calendar_config c
  LEFT JOIN vault.decrypted_secrets s ON s.id = c.vault_secret_id
  WHERE c.id = true;

  IF v_cfg.decrypted_secret IS NULL THEN
    RETURN jsonb_build_object('configured', false);
  END IF;

  v_secret := v_cfg.decrypted_secret::jsonb;
  RETURN jsonb_build_object(
    'configured', true,
    'calendar_id', v_cfg.calendar_id,
    'client_id', v_secret->>'client_id',
    'client_secret', v_secret->>'client_secret',
    'refresh_token', v_secret->>'refresh_token'
  );
END;
$fn$;
REVOKE ALL ON FUNCTION public.get_google_calendar_credentials() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_google_calendar_credentials() TO service_role;

-- 3) Secret interno para o trigger autenticar a chamada à edge function -----
-- (token aleatório gerado uma vez; Ryan precisa espelhar o MESMO valor como
--  secret de edge function GOOGLE_SYNC_SECRET — ver instruções de deploy)
DO $$
DECLARE v_existing uuid;
BEGIN
  SELECT id INTO v_existing FROM vault.secrets WHERE name = 'google_sync_internal_auth';
  IF v_existing IS NULL THEN
    PERFORM vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'google_sync_internal_auth',
      'Header X-Sync-Secret que o trigger de meetings/audiencias usa para chamar google-calendar-sync.');
  END IF;
END $$;

-- 4) Gatilho: sync automático (reuniões + audiências) via pg_net -----------
CREATE OR REPLACE FUNCTION public.trg_sync_calendar_record()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE v_token text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_token FROM vault.decrypted_secrets WHERE name = 'google_sync_internal_auth';
    IF v_token IS NULL THEN RETURN NEW; END IF;
    PERFORM net.http_post(
      url := 'https://tsltxvswzdnlmvljpryh.supabase.co/functions/v1/google-calendar-sync',
      headers := jsonb_build_object('Content-Type','application/json','X-Sync-Secret', v_token),
      body := jsonb_build_object('recordType', TG_ARGV[0], 'recordId', NEW.id)
    );
  EXCEPTION WHEN OTHERS THEN NULL; -- nunca quebra criar/editar por causa do sync
  END;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_meetings_sync ON public.meetings;
CREATE TRIGGER trg_meetings_sync
AFTER INSERT OR UPDATE ON public.meetings
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_calendar_record('meeting');

DROP TRIGGER IF EXISTS trg_audiencias_sync ON public.audiencias;
CREATE TRIGGER trg_audiencias_sync
AFTER INSERT OR UPDATE ON public.audiencias
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_calendar_record('audiencia');

REVOKE ALL ON FUNCTION public.trg_sync_calendar_record() FROM public, anon;

-- NOTA: o item 4 do checklist "início" (notificar advogado em tarefa+chat na
-- criação) já estava 100% coberto por triggers pré-existentes
-- (trg_meetings_notify_create / trg_meetings_notify_reschedule) — nada
-- precisou ser criado para isso. Ver observação no topo deste arquivo.
