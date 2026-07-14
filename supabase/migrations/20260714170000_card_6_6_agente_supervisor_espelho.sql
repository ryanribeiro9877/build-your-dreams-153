-- =====================================================================
-- Card 6.6 — Agente Supervisor  (ESPELHO / MIRROR)
-- =====================================================================
-- ATENÇÃO: este arquivo é um ESPELHO do que JÁ ESTÁ EM PRODUÇÃO.
-- Todo o backend do Card 6.6 foi construído e validado direto no banco
-- (via MCP, em transação com rollback nos testes E2E) por uma sessão
-- anterior. Este arquivo existe apenas para versionar o schema no repo.
-- NÃO reexecute contra produção — é idempotente por segurança, mas o
-- objeto já existe lá com estas mesmas definições.
--
-- Peças:
--   • Tabela user_presence_heartbeat + heartbeat_ping()/is_user_online()
--     — ponte de presença que o backend consulta (a Realtime Presence é
--       client-side/efêmera e nenhuma função de banco a alcança).
--   • Sessão dedicada "Alertas do Supervisor" + envio proativo no chat.
--   • verificar_pos_atendimento() — áudio+transcrição (por session_id do
--     payload, com fallback heurístico) + checklist documental.
--   • reverificar_atendimentos_cliente() + 2 triggers — novo documento ou
--     nova invocação do checklist refazem a verificação dos últimos 30 dias.
--   • safe_jsonb() — cast text->jsonb tolerante (client_documents.notes é
--     texto livre, não jsonb).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Presença persistente (heartbeat)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_presence_heartbeat (
  user_id uuid NOT NULL,
  last_seen_at timestamptz NOT NULL,
  CONSTRAINT user_presence_heartbeat_pkey PRIMARY KEY (user_id),
  CONSTRAINT user_presence_heartbeat_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE public.user_presence_heartbeat ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS heartbeat_select ON public.user_presence_heartbeat;
CREATE POLICY heartbeat_select ON public.user_presence_heartbeat
  FOR SELECT TO authenticated
  USING (
    (user_id = auth.uid())
    OR is_master_admin(auth.uid())
    OR has_role(auth.uid(), 'tech'::app_role)
  );
-- (sem policies de escrita: os writes vêm só do heartbeat_ping, SECURITY DEFINER)

-- ---------------------------------------------------------------------
-- Utilitário: cast text->jsonb tolerante
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.safe_jsonb(p text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
BEGIN
  RETURN p::jsonb;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$function$;

-- ---------------------------------------------------------------------
-- Heartbeat de presença
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.heartbeat_ping()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  INSERT INTO public.user_presence_heartbeat (user_id, last_seen_at)
  VALUES (auth.uid(), now())
  ON CONFLICT (user_id) DO UPDATE SET last_seen_at = now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_user_online(p_user_id uuid, p_threshold_minutes integer DEFAULT 5)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_presence_heartbeat h
    WHERE h.user_id = p_user_id
      AND h.last_seen_at > now() - (p_threshold_minutes || ' minutes')::interval
  );
$function$;

-- ---------------------------------------------------------------------
-- Identidade do Agente Supervisor (global, sem LLM)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_supervisor_agent_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT id FROM public.agents WHERE name = 'Agente Supervisor' AND is_personal = false ORDER BY created_at ASC LIMIT 1;
$function$;

-- ---------------------------------------------------------------------
-- Sessão dedicada "Alertas do Supervisor" + envio proativo no chat
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_or_create_supervisor_alert_session(p_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_id uuid; v_agent uuid;
BEGIN
  SELECT id INTO v_id FROM public.chat_sessions
  WHERE user_id = p_user_id AND metadata->>'kind' = 'supervisor_alerts'
  ORDER BY created_at ASC LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  v_agent := public.get_supervisor_agent_id();
  INSERT INTO public.chat_sessions (user_id, entry_agent_id, title, status, metadata)
  VALUES (p_user_id, v_agent, 'Alertas do Supervisor', 'active', jsonb_build_object('kind','supervisor_alerts'))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enviar_alerta_supervisor(p_user_id uuid, p_content text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_session uuid; v_agent uuid; v_seq int; v_msg_id uuid;
BEGIN
  v_session := public.get_or_create_supervisor_alert_session(p_user_id);
  v_agent := public.get_supervisor_agent_id();
  SELECT coalesce(max(sequence_number),0)+1 INTO v_seq FROM public.chat_messages WHERE session_id = v_session;

  -- user_id é NOT NULL mesmo em mensagem de agente (representa o dono da
  -- conversa, não quem "escreveu").
  INSERT INTO public.chat_messages (session_id, user_id, role, agent_id, content, sequence_number)
  VALUES (v_session, p_user_id, 'assistant', v_agent, p_content, v_seq)
  RETURNING id INTO v_msg_id;

  UPDATE public.chat_sessions
  SET message_count = coalesce(message_count,0) + 1, last_message_at = now()
  WHERE id = v_session;

  RETURN v_msg_id;
END;
$function$;

-- ---------------------------------------------------------------------
-- Verificação pós-atendimento
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verificar_pos_atendimento(p_task_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_task public.user_tasks;
  v_type public.task_types;
  v_session_id text;
  v_origem text := 'nenhuma';
  v_audio boolean := false;
  v_transcricao boolean := false;
  v_checklist boolean := false;
  v_ref_time timestamptz;
BEGIN
  SELECT * INTO v_task FROM public.user_tasks WHERE id = p_task_id;
  IF v_task.id IS NULL THEN RETURN jsonb_build_object('erro','tarefa não encontrada'); END IF;
  SELECT * INTO v_type FROM public.task_types WHERE id = v_task.task_type_id;
  IF v_type.code IS DISTINCT FROM 'atendimento_juridico_fechamento' THEN
    RETURN jsonb_build_object('erro','tarefa não é atendimento_juridico_fechamento');
  END IF;
  IF v_task.client_id IS NULL THEN RETURN jsonb_build_object('erro','tarefa sem cliente'); END IF;

  -- CORRIGIDO: referência é SEMPRE "agora" (não completed_at). A verificação
  -- inicial e a reverificação (que existe justamente pra ver o que chegou
  -- DEPOIS do fechamento) precisam do mesmo corte: o que existe até agora.
  v_ref_time := now();

  v_session_id := v_task.payload->>'session_id';
  IF v_session_id IS NOT NULL THEN
    v_origem := 'payload';
  ELSE
    SELECT public.safe_jsonb(cd.notes)->>'session_id' INTO v_session_id
    FROM public.client_documents cd
    WHERE cd.client_id = v_task.client_id AND cd.document_type = 'audio_atendimento'
      AND cd.created_at <= v_ref_time
      AND public.safe_jsonb(cd.notes) IS NOT NULL
    ORDER BY cd.created_at DESC LIMIT 1;
    IF v_session_id IS NOT NULL THEN v_origem := 'heuristica'; END IF;
  END IF;

  IF v_session_id IS NOT NULL THEN
    v_audio := EXISTS (
      SELECT 1 FROM public.client_documents
      WHERE client_id = v_task.client_id AND document_type = 'audio_atendimento'
        AND public.safe_jsonb(notes)->>'session_id' = v_session_id
    );
    v_transcricao := EXISTS (
      SELECT 1 FROM public.client_documents
      WHERE client_id = v_task.client_id AND document_type = 'transcricao_atendimento'
        AND (public.safe_jsonb(notes)->>'session_id' = v_session_id OR file_path LIKE '%/' || v_session_id || '.%')
    );
  END IF;

  -- Sinal do checklist: a tool foi invocada para o cliente (independe de ter
  -- gerado pendência). Por cliente, não por sessão (a tool não guarda sessão).
  v_checklist := EXISTS (
    SELECT 1 FROM public.agent_actions
    WHERE tool = 'solicitar_checklist_documental'
      AND args->>'cliente_id' = v_task.client_id::text
      AND created_at <= v_ref_time
  );

  RETURN jsonb_build_object(
    'audio', v_audio, 'transcricao', v_transcricao, 'checklist', v_checklist,
    'completo', (v_audio AND v_transcricao AND v_checklist),
    'session_id_origem', v_origem, 'verificado_em', now()
  );
END;
$function$;

-- ---------------------------------------------------------------------
-- Reverificação (últimos 30 dias) + notificação de resolução
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reverificar_atendimentos_cliente(p_client_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_task record; v_novo jsonb; v_lider uuid;
BEGIN
  FOR v_task IN
    SELECT ut.id, ut.payload FROM public.user_tasks ut
    JOIN public.task_types tt ON tt.id = ut.task_type_id
    WHERE tt.code = 'atendimento_juridico_fechamento'
      AND ut.client_id = p_client_id
      AND ut.status = 'completed'::public.user_task_status
      AND (ut.payload->'verificacao_pos_atendimento'->>'completo') = 'false'
      AND ut.completed_at > now() - interval '30 days'
  LOOP
    v_novo := public.verificar_pos_atendimento(v_task.id);
    IF v_novo ? 'erro' THEN CONTINUE; END IF;

    UPDATE public.user_tasks
    SET payload = coalesce(payload,'{}'::jsonb) || jsonb_build_object('verificacao_pos_atendimento', v_novo)
    WHERE id = v_task.id;

    IF (v_novo->>'completo')::boolean THEN
      SELECT p.user_id INTO v_lider
      FROM public.profiles p JOIN public.role_templates rt ON rt.id = p.role_template_id
      WHERE rt.code = 'lider_recepcao' ORDER BY p.created_at ASC LIMIT 1;
      IF v_lider IS NOT NULL THEN
        PERFORM public.enviar_alerta_supervisor(v_lider,
          '✅ Pendência de verificação resolvida — atendimento de ' ||
          coalesce((SELECT full_name FROM public.clients WHERE id = p_client_id), 'cliente') ||
          ' já tem áudio, transcrição e checklist.');
      END IF;
    END IF;
  END LOOP;
END;
$function$;

-- ---------------------------------------------------------------------
-- Funções de trigger + triggers de reverificação
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_checklist_tool_reverifica()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_cliente uuid;
BEGIN
  BEGIN
    IF NEW.tool = 'solicitar_checklist_documental' THEN
      v_cliente := (NEW.args->>'cliente_id')::uuid;
      IF v_cliente IS NOT NULL THEN
        PERFORM public.reverificar_atendimentos_cliente(v_cliente);
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_novo_documento_reverifica()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  BEGIN
    IF NEW.document_type IN ('audio_atendimento','transcricao_atendimento') AND NEW.client_id IS NOT NULL THEN
      PERFORM public.reverificar_atendimentos_cliente(NEW.client_id);
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_agent_actions_reverifica ON public.agent_actions;
CREATE TRIGGER trg_agent_actions_reverifica
  AFTER INSERT ON public.agent_actions
  FOR EACH ROW EXECUTE FUNCTION public.trg_checklist_tool_reverifica();

DROP TRIGGER IF EXISTS trg_client_documents_reverifica ON public.client_documents;
CREATE TRIGGER trg_client_documents_reverifica
  AFTER INSERT ON public.client_documents
  FOR EACH ROW EXECUTE FUNCTION public.trg_novo_documento_reverifica();

-- ---------------------------------------------------------------------
-- Grants (reflete o estado real: authenticated + service_role, sem anon)
-- ---------------------------------------------------------------------
DO $grants$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.safe_jsonb(text)',
    'public.heartbeat_ping()',
    'public.is_user_online(uuid, integer)',
    'public.get_supervisor_agent_id()',
    'public.get_or_create_supervisor_alert_session(uuid)',
    'public.enviar_alerta_supervisor(uuid, text)',
    'public.verificar_pos_atendimento(uuid)',
    'public.reverificar_atendimentos_cliente(uuid)',
    'public.trg_checklist_tool_reverifica()',
    'public.trg_novo_documento_reverifica()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC;', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role;', fn);
  END LOOP;
END;
$grants$;
