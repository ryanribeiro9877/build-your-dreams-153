-- ============================================================================
-- ESPELHO das migrações já aplicadas em produção via Supabase MCP.
-- NÃO REEXECUTAR — versionamento/histórico apenas.
--
-- Card 8.2 — Revisão humana + log de aprovação
-- 1) task_approval_log — ato de decisão (aprovar/devolver) com ACEITE obrigatório
--    na aprovação (responsabilidade assumida). Só a RPC grava.
-- 2) decidir_revisao_peca(...) — único caminho para decidir uma revisar_peca.
-- 3) criar_tarefa_protocolo(...) — cria a tarefa de protocolo (fallback:
--    responsável elegível > adv_protocolo > Sócio + avisa Líder de Recepção).
-- 4) Gatilho trg_user_tasks_revisao_protocolo — revisão aprovada cria protocolo
--    automaticamente. Defesa em profundidade: exige payload.revisao_decisao=
--    'aprovar' gravado por decidir_revisao_peca, não só status=completed —
--    isso impede que um "Concluir" genérico libere protocolo sem aceite.
-- 5) get_revisao_peca_context(...) — leitura consolidada para a tela.
--
-- NOTA DE CORREÇÃO: a primeira versão de decidir_revisao_peca continha um bug
-- (has_role(caller,'socio'::app_role) — 'socio' é role_templates.code, não um
-- valor do enum app_role; nunca chegou a rodar em produção sem correção,
-- capturado no teste E2E antes de qualquer uso real). A versão abaixo já é a
-- corrigida (usa apenas is_master_admin, que já cobre "cargo socio").
--
-- Validado em produção via teste E2E transacional com ROLLBACK (nada
-- persistido): caminho feliz (aprovar → protocolo criado, log aceite=true),
-- devolver (confecção reaberta, revisão cancelada, protocolo NÃO criado),
-- aprovar sem aceite (exceção), bypass via update direto (protocolo NÃO
-- criado — defesa em profundidade), auto-revisão (fallback correto p/ Sócio).
-- ============================================================================

-- 1) Log de aprovação --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.task_approval_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_task_id  uuid NOT NULL REFERENCES public.user_tasks(id) ON DELETE CASCADE,
  decided_by    uuid NOT NULL REFERENCES auth.users(id),
  decisao       text NOT NULL CHECK (decisao IN ('aprovar','devolver')),
  aceite        boolean NOT NULL DEFAULT false,
  observacoes   text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_approval_log_task ON public.task_approval_log(user_task_id);

ALTER TABLE public.task_approval_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS approval_log_select ON public.task_approval_log;
CREATE POLICY approval_log_select ON public.task_approval_log
  FOR SELECT TO authenticated
  USING (
    decided_by = auth.uid()
    OR public.is_master_admin(auth.uid())
    OR public.has_role(auth.uid(), 'tech'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_tasks ut
      WHERE ut.id = task_approval_log.user_task_id
        AND (ut.assignee_user_id = auth.uid() OR ut.assigner_user_id = auth.uid())
    )
  );
-- Sem policy de INSERT/UPDATE/DELETE para authenticated: só a função
-- SECURITY DEFINER grava. IMPORTANTE: Supabase concede grants de tabela por
-- default privilege ao criar — por isso os REVOKE explícitos abaixo (não
-- basta a ausência de policy; sem o REVOKE, o grant de tabela permitia INSERT
-- mesmo sem policy correspondente — achado do teste de hardening desta sessão).
REVOKE ALL ON public.task_approval_log FROM public, anon;
GRANT SELECT ON public.task_approval_log TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.task_approval_log FROM authenticated;

-- 2) Decisão da revisão -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decidir_revisao_peca(
  p_task_id uuid,
  p_decisao text,
  p_observacoes text DEFAULT NULL,
  p_aceite boolean DEFAULT false
)
RETURNS public.user_task_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_caller  uuid;
  v_task    public.user_tasks;
  v_type    public.task_types;
  v_conf_id uuid;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'decidir_revisao_peca: não autenticado';
  END IF;

  IF p_decisao NOT IN ('aprovar','devolver') THEN
    RAISE EXCEPTION 'decidir_revisao_peca: decisão inválida (use aprovar ou devolver)';
  END IF;

  SELECT * INTO v_task FROM public.user_tasks WHERE id = p_task_id;
  IF v_task.id IS NULL THEN
    RAISE EXCEPTION 'decidir_revisao_peca: tarefa não encontrada';
  END IF;

  SELECT * INTO v_type FROM public.task_types WHERE id = v_task.task_type_id;
  IF v_type.code IS DISTINCT FROM 'revisar_peca' THEN
    RAISE EXCEPTION 'decidir_revisao_peca: tarefa não é do tipo revisar_peca';
  END IF;

  IF v_task.status IN ('completed'::public.user_task_status, 'cancelled'::public.user_task_status) THEN
    RAISE EXCEPTION 'decidir_revisao_peca: esta revisão já foi encerrada (status=%)', v_task.status;
  END IF;

  -- 'socio' é role_templates.code, não app_role — is_master_admin já cobre
  -- "cargo socio" (além de director / e-mail master) na própria definição.
  IF NOT (
    v_task.assignee_user_id = v_caller
    OR public.is_master_admin(v_caller)
  ) THEN
    RAISE EXCEPTION 'decidir_revisao_peca: sem permissão para decidir esta revisão' USING errcode = '42501';
  END IF;

  IF p_decisao = 'aprovar' AND NOT p_aceite THEN
    RAISE EXCEPTION 'decidir_revisao_peca: aprovar exige confirmar o aceite de responsabilidade (p_aceite=true)';
  END IF;

  INSERT INTO public.task_approval_log (user_task_id, decided_by, decisao, aceite, observacoes)
  VALUES (p_task_id, v_caller, p_decisao, (p_decisao = 'aprovar' AND p_aceite), p_observacoes);

  IF p_decisao = 'aprovar' THEN
    UPDATE public.user_tasks
    SET status = 'completed'::public.user_task_status,
        situacao = 'concluida_sucesso'::public.task_situacao,
        validator_user_id = v_caller,
        validated_at = now(),
        completed_at = coalesce(completed_at, now()),
        payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
          'revisao_decisao', 'aprovar',
          'revisao_aceite', true,
          'revisao_decidida_por', v_caller,
          'revisao_decidida_em', now()
        ),
        updated_at = now()
    WHERE id = p_task_id;
  ELSE
    v_conf_id := (v_task.payload->>'confeccao_task_id')::uuid;
    IF v_conf_id IS NOT NULL THEN
      UPDATE public.user_tasks
      SET status = 'in_progress'::public.user_task_status,
          situacao = 'em_execucao'::public.task_situacao,
          updated_at = now()
      WHERE id = v_conf_id
        AND status NOT IN ('completed'::public.user_task_status, 'cancelled'::public.user_task_status);
    END IF;

    UPDATE public.user_tasks
    SET status = 'cancelled'::public.user_task_status,
        situacao = 'cancelado'::public.task_situacao,
        cancelled_at = now(),
        cancellation_reason = 'Devolvida na revisão: ' || coalesce(p_observacoes, '(sem observações)'),
        payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
          'revisao_decisao', 'devolver',
          'revisao_decidida_por', v_caller,
          'revisao_decidida_em', now()
        ),
        updated_at = now()
    WHERE id = p_task_id;
  END IF;

  RETURN (SELECT status FROM public.user_tasks WHERE id = p_task_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.decidir_revisao_peca(uuid, text, text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.decidir_revisao_peca(uuid, text, text, boolean) TO authenticated;

-- 3) Criação da tarefa de protocolo (chamável pela trigger E manualmente) ----
CREATE OR REPLACE FUNCTION public.criar_tarefa_protocolo(
  p_process_id uuid,
  p_revisao_task_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_caller     uuid;
  v_process    public.processes;
  v_prot_type  uuid;
  v_sla        integer;
  v_doc_id     uuid;
  v_resp       uuid;
  v_resp_role  uuid;
  v_eligible   boolean;
  v_adv_prot   uuid;
  v_assignee   uuid;
  v_fallback   boolean := false;
  v_reason     text := NULL;
  v_socio      uuid;
  v_lider      uuid;
  v_title      text;
  v_deadline   timestamptz;
  v_task_id    uuid;
  v_board_id   uuid;
  v_col_id     uuid;
  v_existing   uuid;
BEGIN
  v_caller := auth.uid();

  -- Chamada direta exige permissão; a trigger roda sem sessão de usuário
  -- (auth.uid() is null) — aceito propositalmente (evento de sistema já
  -- autorizado pela aprovação que a disparou).
  IF v_caller IS NOT NULL AND NOT (
    public.is_socio_or_advogado() OR public.is_recepcao_or_socio() OR public.is_master_admin(v_caller)
  ) THEN
    RAISE EXCEPTION 'criar_tarefa_protocolo: sem permissão' USING errcode = '42501';
  END IF;

  SELECT * INTO v_process FROM public.processes WHERE id = p_process_id;
  IF v_process.id IS NULL THEN
    RAISE EXCEPTION 'criar_tarefa_protocolo: processo % não encontrado', p_process_id;
  END IF;

  SELECT id, default_sla_hours INTO v_prot_type, v_sla
  FROM public.task_types WHERE code = 'protocolar_peca' AND is_active = true;
  IF v_prot_type IS NULL THEN
    RAISE EXCEPTION 'criar_tarefa_protocolo: task_type protocolar_peca ausente/inativo';
  END IF;

  IF p_revisao_task_id IS NOT NULL THEN
    SELECT (payload->>'client_document_id')::uuid INTO v_doc_id
    FROM public.user_tasks WHERE id = p_revisao_task_id;
  END IF;

  SELECT id INTO v_existing
  FROM public.user_tasks
  WHERE task_type_id = v_prot_type
    AND process_id = p_process_id
    AND status NOT IN ('completed'::public.user_task_status, 'cancelled'::public.user_task_status)
    AND (
      (p_revisao_task_id IS NOT NULL AND payload->>'revisao_task_id' = p_revisao_task_id::text)
      OR (p_revisao_task_id IS NULL)
    )
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  v_resp := v_process.responsible_lawyer_user_id;
  IF v_resp IS NOT NULL THEN
    SELECT role_template_id INTO v_resp_role FROM public.profiles WHERE user_id = v_resp;
    v_eligible := v_resp_role IS NOT NULL AND public.is_role_eligible_for_task(v_prot_type, v_resp_role);
  END IF;

  IF NOT coalesce(v_eligible, false) THEN
    SELECT p.user_id INTO v_adv_prot
    FROM public.profiles p JOIN public.role_templates rt ON rt.id = p.role_template_id
    WHERE rt.code = 'adv_protocolo' ORDER BY p.created_at ASC LIMIT 1;
  END IF;

  SELECT p.user_id INTO v_socio
  FROM public.profiles p JOIN public.role_templates rt ON rt.id = p.role_template_id
  WHERE rt.code = 'socio' ORDER BY p.created_at ASC LIMIT 1;
  SELECT p.user_id INTO v_lider
  FROM public.profiles p JOIN public.role_templates rt ON rt.id = p.role_template_id
  WHERE rt.code = 'lider_recepcao' ORDER BY p.created_at ASC LIMIT 1;

  IF coalesce(v_eligible, false) THEN
    v_assignee := v_resp;
  ELSIF v_adv_prot IS NOT NULL THEN
    v_assignee := v_adv_prot;
  ELSE
    v_fallback := true;
    v_reason := CASE WHEN v_resp IS NULL THEN 'sem_responsavel' ELSE 'responsavel_nao_elegivel' END;
    v_assignee := v_socio;
  END IF;

  IF v_assignee IS NULL THEN
    RAISE EXCEPTION 'criar_tarefa_protocolo: sem revisor de protocolo nem Sócio para atribuir (processo %)', p_process_id;
  END IF;

  v_deadline := now() + (coalesce(v_sla, 8) || ' hours')::interval;
  v_title := 'Protocolar peça — ' ||
             coalesce(nullif(btrim(v_process.process_number), ''), v_process.client_name, p_process_id::text);

  INSERT INTO public.user_tasks (
    task_type_id, title, description, assigner_user_id, assignee_user_id,
    process_id, client_id, status, situacao, priority, deadline_at, payload
  ) VALUES (
    v_prot_type, v_title,
    CASE WHEN v_fallback
         THEN 'Protocolo sem responsável elegível (' || v_reason || '): o Sócio deve protocolar ou reatribuir.'
         ELSE NULL END,
    v_caller, v_assignee,
    p_process_id, v_process.client_id,
    'assigned'::public.user_task_status, 'pendente'::public.task_situacao,
    'high'::public.task_priority, v_deadline,
    jsonb_build_object(
      'source', 'card_8_2_auto',
      'revisao_task_id', p_revisao_task_id,
      'client_document_id', v_doc_id,
      'fallback', v_fallback,
      'fallback_reason', v_reason
    )
  ) RETURNING id INTO v_task_id;

  IF v_process.tipo_acao_id IS NOT NULL THEN
    SELECT b.id INTO v_board_id FROM public.kanban_boards b WHERE b.tipo_acao_id = v_process.tipo_acao_id LIMIT 1;
    IF v_board_id IS NOT NULL THEN
      SELECT c.id INTO v_col_id FROM public.kanban_columns c
      WHERE c.board_id = v_board_id AND c.situacao = 'pendente'::public.task_situacao
      ORDER BY c.position ASC LIMIT 1;
      IF v_col_id IS NOT NULL THEN
        INSERT INTO public.kanban_card_placements (board_id, column_id, user_task_id, position)
        VALUES (v_board_id, v_col_id, v_task_id, 0)
        ON CONFLICT (user_task_id) DO UPDATE
          SET board_id = excluded.board_id, column_id = excluded.column_id,
              position = excluded.position, updated_at = now();
      END IF;
    END IF;
  END IF;

  IF v_fallback THEN
    INSERT INTO public.bottleneck_notifications (user_id, alert_type, severity, department, message, agent_name)
    SELECT u, 'protocolo_sem_responsavel', 'warning', 'protocolo',
           'Protocolo sem responsável elegível (' || v_reason || '): ' || v_title || '. Atribua o protocolista.',
           'Sistema - Protocolo'
    FROM (SELECT v_socio AS u WHERE v_socio IS NOT NULL UNION SELECT v_lider WHERE v_lider IS NOT NULL) s;
  END IF;

  RETURN v_task_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.criar_tarefa_protocolo(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.criar_tarefa_protocolo(uuid, uuid) TO authenticated;

-- 4) Gatilho: revisão aprovada → cria protocolo automaticamente -------------
CREATE OR REPLACE FUNCTION public.trg_revisao_aprovada_cria_protocolo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_code text;
BEGIN
  BEGIN
    SELECT tt.code INTO v_code FROM public.task_types tt WHERE tt.id = NEW.task_type_id;
    IF v_code = 'revisar_peca' AND NEW.payload->>'revisao_decisao' = 'aprovar' AND NEW.process_id IS NOT NULL THEN
      PERFORM public.criar_tarefa_protocolo(NEW.process_id, NEW.id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- nunca quebra a conclusão da revisão por causa da criação do protocolo
    NULL;
  END;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_user_tasks_revisao_protocolo ON public.user_tasks;
CREATE TRIGGER trg_user_tasks_revisao_protocolo
AFTER UPDATE OF status ON public.user_tasks
FOR EACH ROW
WHEN (NEW.status = 'completed'::public.user_task_status AND OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.trg_revisao_aprovada_cria_protocolo();

REVOKE ALL ON FUNCTION public.trg_revisao_aprovada_cria_protocolo() FROM public, anon;

-- 5) Leitura consolidada para a tela -----------------------------------------
CREATE OR REPLACE FUNCTION public.get_revisao_peca_context(p_task_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_caller uuid;
  v_task   public.user_tasks;
  v_type   public.task_types;
  v_result jsonb;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'get_revisao_peca_context: não autenticado';
  END IF;

  SELECT * INTO v_task FROM public.user_tasks WHERE id = p_task_id;
  IF v_task.id IS NULL THEN
    RAISE EXCEPTION 'get_revisao_peca_context: tarefa não encontrada';
  END IF;

  SELECT * INTO v_type FROM public.task_types WHERE id = v_task.task_type_id;
  IF v_type.code IS DISTINCT FROM 'revisar_peca' THEN
    RAISE EXCEPTION 'get_revisao_peca_context: tarefa não é do tipo revisar_peca';
  END IF;

  IF NOT (v_task.assignee_user_id = v_caller OR public.is_master_admin(v_caller)) THEN
    RAISE EXCEPTION 'get_revisao_peca_context: sem permissão' USING errcode = '42501';
  END IF;

  SELECT jsonb_build_object(
    'task', jsonb_build_object(
      'id', v_task.id, 'title', v_task.title, 'status', v_task.status,
      'deadline_at', v_task.deadline_at, 'created_at', v_task.created_at
    ),
    'process', (
      SELECT jsonb_build_object('id', p.id, 'process_number', p.process_number, 'client_name', p.client_name)
      FROM public.processes p WHERE p.id = v_task.process_id
    ),
    'client_document', (
      SELECT jsonb_build_object(
        'id', cd.id, 'document_name', cd.document_name, 'document_type', cd.document_type,
        'file_path', cd.file_path, 'mime_type', cd.mime_type, 'created_at', cd.created_at
      )
      FROM public.client_documents cd WHERE cd.id = (v_task.payload->>'client_document_id')::uuid
    ),
    'redator_name', (
      SELECT full_name FROM public.profiles WHERE user_id = (v_task.payload->>'redator_user_id')::uuid
    ),
    'fallback', v_task.payload->'fallback',
    'fallback_reason', v_task.payload->>'fallback_reason',
    'approval_history', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'decisao', l.decisao, 'aceite', l.aceite, 'observacoes', l.observacoes,
        'created_at', l.created_at, 'decided_by_name', pr.full_name
      ) ORDER BY l.created_at), '[]'::jsonb)
      FROM public.task_approval_log l
      LEFT JOIN public.profiles pr ON pr.user_id = l.decided_by
      WHERE l.user_task_id = v_task.id
    )
  ) INTO v_result;

  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_revisao_peca_context(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_revisao_peca_context(uuid) TO authenticated;
