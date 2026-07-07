-- ============================================================================
-- 3.7 — Gate documental + auto-liberação (pendências documentais vinculadas)
--
-- Reusa integralmente a infra COOP-DOCS já existente:
--   * client_required_set(client_id) → 'cooperado' | 'nao_cooperado'
--     (deriva de is_cliente_cooperado = tem termo_cooperado validado).
--   * required_document_sets (conjuntos 'cooperado' 7 obrig. / 'nao_cooperado' 6 obrig.).
--   * client_documents (status: pendente/recebido/validado/rejeitado).
--   * user_tasks (client_id, is_pendencia, pendencia_tipo, pendencia_estado,
--     documentation_completed_at, status) + máquina de pendências
--     (criar/transferir/resolver_pendencia).
--
-- Delta desta migration (aditivo/idempotente):
--   1. GATE em kanban_add_task_to_board: antes de kanban_move_card, se a tarefa
--      tem client_id e falta algum obrigatório validado do CONJUNTO do cliente → RAISE.
--   2. Trigger de AUTO-LIBERAÇÃO em client_documents (AFTER UPDATE OF status):
--      quando o ÚLTIMO obrigatório do conjunto do cliente vira 'validado', carimba
--      documentation_completed_at nas tarefas do cliente e resolve a(s)
--      pendência(s) documental(is).
--
-- Decisões (reportadas):
--   * Conjunto do gate = client_required_set(client_id) — NÃO fixo em 'cooperado'.
--     O briefing supunha que só existia 'cooperado' (COOP-DOCS-1); o banco já tem
--     'nao_cooperado' + o resolvedor client_required_set (COOP-DOCS-2). Fixar em
--     'cooperado' bloquearia clientes nao_cooperado por um termo_cooperado que não
--     lhes é exigido. Usar client_required_set é o "salvo indicação contrária" do
--     briefing e mantém o reuso da infra COOP-DOCS. (Confirmar com o Ryan.)
--   * Escopo base: TODA tarefa com client_id é gateada; tarefa sem cliente passa.
--     Regras finas (por estágio/área/exceções) ficam para a Fase 7 (fora de escopo).
--   * Auto-liberação segura: carimba documentation_completed_at + resolve pendência
--     documental. NÃO mexe em status 'blocked' genérico (bloqueio pode não ser
--     documental) — desbloqueio automático fica fora deste card.
--
-- NÃO toca em R-2 (nenhuma coluna _enc/cpf_bidx). NÃO reescreve nenhuma função de
-- Kanban/pendência além da inserção do gate em kanban_add_task_to_board.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. GATE documental em kanban_add_task_to_board
--    (corpo idêntico ao de produção + bloco do gate antes de kanban_move_card)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kanban_add_task_to_board(
  p_task_id UUID,
  p_column_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_col public.kanban_columns;
  v_next_pos INTEGER;
  v_client_id UUID;
  v_total INTEGER;
  v_validados INTEGER;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'kanban_add_task_to_board: não autenticado';
  END IF;

  SELECT * INTO v_col FROM public.kanban_columns WHERE id = p_column_id;
  IF v_col.id IS NULL THEN
    RAISE EXCEPTION 'kanban_add_task_to_board: coluna não encontrada';
  END IF;

  IF NOT public.kanban_can_access_board(v_col.board_id, v_uid) THEN
    RAISE EXCEPTION 'kanban_add_task_to_board: acesso restrito';
  END IF;

  SELECT client_id INTO v_client_id
  FROM public.user_tasks WHERE id = p_task_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'kanban_add_task_to_board: tarefa não encontrada';
  END IF;

  -- GATE DOCUMENTAL (base): só quando a tarefa tem cliente. Confere o conjunto
  -- obrigatório do cliente (client_required_set) contra client_documents;
  -- bloqueia se algum required=true não estiver 'validado'.
  IF v_client_id IS NOT NULL THEN
    SELECT
      count(*) FILTER (WHERE r.required),
      count(*) FILTER (WHERE r.required AND EXISTS (
        SELECT 1 FROM public.client_documents d
        WHERE d.client_id = v_client_id
          AND d.document_type = r.document_type
          AND d.status = 'validado'))
      INTO v_total, v_validados
    FROM public.required_document_sets r
    WHERE r.set_code = public.client_required_set(v_client_id);

    IF v_total > 0 AND v_validados < v_total THEN
      RAISE EXCEPTION
        'Gate documental: faltam documentos obrigatórios validados do cliente (% de % validados).',
        v_validados, v_total
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Próxima posição ao fim da coluna.
  SELECT COALESCE(max(position), -1) + 1 INTO v_next_pos
  FROM public.kanban_card_placements WHERE column_id = p_column_id;

  PERFORM public.kanban_move_card(p_task_id, p_column_id, v_next_pos);
END;
$$;

REVOKE ALL ON FUNCTION public.kanban_add_task_to_board(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kanban_add_task_to_board(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.kanban_add_task_to_board(UUID, UUID) IS
  'Coloca tarefa no quadro. Gate documental base (3.7): bloqueia entrada se a tarefa tem cliente e falta obrigatório validado do conjunto client_required_set. Regras finas: Fase 7.';

-- ---------------------------------------------------------------------------
-- 2. AUTO-LIBERAÇÃO — trigger em client_documents
--    Ao validar o ÚLTIMO obrigatório do conjunto do cliente:
--      (a) carimba documentation_completed_at nas tarefas (não-pendência) do
--          cliente que ainda aguardavam documentação;
--      (b) resolve a(s) pendência(s) documental(is) do cliente (ação de sistema:
--          espelha o efeito de resolver_pendencia sem o gate RBAC, pois o ator é
--          quem validou o documento, não necessariamente o dono da pendência).
--    Enquanto faltar obrigatório, não faz nada.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_liberar_gate_documental()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_faltando INTEGER;
BEGIN
  -- Só age quando um documento passou a 'validado'.
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'validado'
     AND NEW.client_id IS NOT NULL THEN

    -- Ainda falta algum obrigatório não-validado no conjunto do cliente?
    SELECT count(*) FILTER (WHERE r.required AND NOT EXISTS (
             SELECT 1 FROM public.client_documents d
             WHERE d.client_id = NEW.client_id
               AND d.document_type = r.document_type
               AND d.status = 'validado'))
      INTO v_faltando
    FROM public.required_document_sets r
    WHERE r.set_code = public.client_required_set(NEW.client_id);

    -- Só libera no "todos validados".
    IF v_faltando = 0 THEN

      -- (a) Carimba documentation_completed_at nas tarefas do cliente que
      --     aguardavam documentação (exclui pendências e tarefas encerradas).
      UPDATE public.user_tasks
      SET documentation_completed_at = now(),
          updated_at = now()
      WHERE client_id = NEW.client_id
        AND documentation_completed_at IS NULL
        AND NOT is_pendencia
        AND status NOT IN ('completed', 'cancelled');

      -- (b) Audita antes de resolver (captura o estado anterior da pendência).
      INSERT INTO public.task_audit_log (user_task_id, actor_user_id, field, old_value, new_value)
      SELECT id, auth.uid(), 'pendencia_resolvida_auto', pendencia_estado,
             jsonb_build_object('motivo', 'gate_documental_auto',
                                'documento_validado', NEW.document_type)::text
      FROM public.user_tasks
      WHERE client_id = NEW.client_id
        AND is_pendencia
        AND pendencia_tipo IN ('documentacao', 'documental')
        AND pendencia_estado NOT IN ('resolvida', 'devolvida');

      -- Resolve a(s) pendência(s) documental(is) do cliente.
      UPDATE public.user_tasks
      SET pendencia_estado = 'resolvida',
          status = 'completed',
          completed_at = COALESCE(completed_at, now()),
          payload = COALESCE(payload, '{}'::jsonb) || jsonb_build_object(
                      'resolucao', 'Documentos obrigatórios validados (auto-liberação gate documental)',
                      'resolvida_em', now()),
          updated_at = now()
      WHERE client_id = NEW.client_id
        AND is_pendencia
        AND pendencia_tipo IN ('documentacao', 'documental')
        AND pendencia_estado NOT IN ('resolvida', 'devolvida');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_client_documents_auto_liberar ON public.client_documents;
CREATE TRIGGER trg_client_documents_auto_liberar
  AFTER UPDATE OF status ON public.client_documents
  FOR EACH ROW EXECUTE FUNCTION public.auto_liberar_gate_documental();

COMMENT ON FUNCTION public.auto_liberar_gate_documental() IS
  'Auto-liberação do gate documental (3.7): ao validar o último obrigatório do conjunto do cliente, carimba documentation_completed_at e resolve a pendência documental. Não desbloqueia status blocked genérico.';

COMMIT;
