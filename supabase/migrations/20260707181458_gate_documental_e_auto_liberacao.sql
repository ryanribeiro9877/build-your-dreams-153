-- Backfill de reconciliação repo↔banco: reflete o SQL aplicado em produção
-- (schema_migrations version=20260707181458, name=gate_documental_e_auto_liberacao).
-- Base do gate (3.7): usa o checklist fixo 'cooperado' (client_cooperado_checklist).
-- O conserto para o conjunto por cliente vem nas migrations 181832 e 182104.
-- 3.7 — Gate documental + auto-liberação (pendências documentais vinculadas)
-- Reusa client_cooperado_checklist (COOP-DOCS-1), required_document_sets,
-- máquina de pendências e client_documents. Aditivo/idempotente. Não toca R-2.

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
  -- obrigatório 'cooperado' via client_cooperado_checklist; bloqueia se algum
  -- required=true não estiver 'validado'.
  IF v_client_id IS NOT NULL THEN
    SELECT
      count(*) FILTER (WHERE required),
      count(*) FILTER (WHERE required AND status = 'validado')
      INTO v_total, v_validados
    FROM public.client_cooperado_checklist(v_client_id);

    IF v_total > 0 AND v_validados < v_total THEN
      RAISE EXCEPTION
        'Gate documental: faltam documentos obrigatórios validados do cliente (% de % validados).',
        v_validados, v_total
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  SELECT COALESCE(max(position), -1) + 1 INTO v_next_pos
  FROM public.kanban_card_placements WHERE column_id = p_column_id;

  PERFORM public.kanban_move_card(p_task_id, p_column_id, v_next_pos);
END;
$$;

REVOKE ALL ON FUNCTION public.kanban_add_task_to_board(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kanban_add_task_to_board(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.kanban_add_task_to_board(UUID, UUID) IS
  'Coloca tarefa no quadro. Gate documental base (3.7): bloqueia entrada se a tarefa tem cliente e falta obrigatório validado (client_cooperado_checklist). Regras finas: Fase 7.';

CREATE OR REPLACE FUNCTION public.auto_liberar_gate_documental()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_faltando INTEGER;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'validado'
     AND NEW.client_id IS NOT NULL THEN

    SELECT count(*) FILTER (WHERE required AND status <> 'validado')
      INTO v_faltando
    FROM public.client_cooperado_checklist(NEW.client_id);

    IF v_faltando = 0 THEN
      UPDATE public.user_tasks
      SET documentation_completed_at = now(),
          updated_at = now()
      WHERE client_id = NEW.client_id
        AND documentation_completed_at IS NULL
        AND NOT is_pendencia
        AND status NOT IN ('completed', 'cancelled');

      INSERT INTO public.task_audit_log (user_task_id, actor_user_id, field, old_value, new_value)
      SELECT id, auth.uid(), 'pendencia_resolvida_auto', pendencia_estado,
             jsonb_build_object('motivo', 'gate_documental_auto',
                                'documento_validado', NEW.document_type)::text
      FROM public.user_tasks
      WHERE client_id = NEW.client_id
        AND is_pendencia
        AND pendencia_tipo IN ('documentacao', 'documental')
        AND pendencia_estado NOT IN ('resolvida', 'devolvida');

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
  'Auto-liberação do gate documental (3.7): ao validar o último obrigatório do cliente, carimba documentation_completed_at e resolve a pendência documental. Não desbloqueia status blocked genérico.';
