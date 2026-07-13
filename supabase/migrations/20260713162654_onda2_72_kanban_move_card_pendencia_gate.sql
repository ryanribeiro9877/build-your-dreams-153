-- 20260713162654_onda2_72_kanban_move_card_pendencia_gate.sql
--
-- ESPELHO de reconciliação repo<->banco (NÃO fazer `db push`).
-- Já aplicada em PRODUÇÃO via MCP (apply_migration):
--     version = 20260713162654
--     name    = onda2_72_kanban_move_card_pendencia_gate
--
-- ONDA 2 · Card 7.2 — gate de pendência.
-- Card NÃO avança de etapa (situação -> em_execucao/concluida_sucesso) se o caso
-- (process_id) tem pendência aberta em outra user_task. Mantém todo o comportamento
-- anterior de kanban_move_card; só adiciona o gate antes de mover o card.
-- Espelha o padrão do gate de validação já existente na função.
-- ============================================================================

create or replace function public.kanban_move_card(p_task_id uuid, p_column_id uuid, p_position integer default 0)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid UUID;
  v_col public.kanban_columns;
  v_task public.user_tasks;
  v_target public.task_situacao;
  v_current public.task_situacao;
  v_requires_validation BOOLEAN;
  v_validated_at TIMESTAMPTZ;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'kanban_move_card: não autenticado';
  END IF;

  SELECT * INTO v_col FROM public.kanban_columns WHERE id = p_column_id;
  IF v_col.id IS NULL THEN
    RAISE EXCEPTION 'kanban_move_card: coluna não encontrada';
  END IF;

  IF NOT public.kanban_can_access_board(v_col.board_id, v_uid) THEN
    RAISE EXCEPTION 'kanban_move_card: acesso restrito';
  END IF;

  SELECT * INTO v_task FROM public.user_tasks WHERE id = p_task_id;
  IF v_task.id IS NULL THEN
    RAISE EXCEPTION 'kanban_move_card: tarefa não encontrada';
  END IF;

  v_target := v_col.situacao;
  v_current := v_task.situacao;

  -- ONDA2/7.2 GATE: bloqueia AVANÇO de etapa quando o caso tem pendência aberta.
  -- Não bloqueia: mover a própria pendência, recuar, concluir sem sucesso ou cancelar.
  IF COALESCE(v_task.is_pendencia, false) = false
     AND v_target <> v_current
     AND v_target IN ('em_execucao','concluida_sucesso')
     AND v_task.process_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.user_tasks p
       WHERE p.process_id = v_task.process_id
         AND p.id <> v_task.id
         AND p.is_pendencia = true
         AND p.pendencia_estado = 'aberta'
     ) THEN
    RAISE EXCEPTION 'kanban_move_card: o caso possui pendência aberta — resolva a pendência antes de avançar a etapa';
  END IF;

  INSERT INTO public.kanban_card_placements (board_id, column_id, user_task_id, position)
  VALUES (v_col.board_id, p_column_id, p_task_id, COALESCE(p_position, 0))
  ON CONFLICT (user_task_id) DO UPDATE
    SET board_id = EXCLUDED.board_id,
        column_id = EXCLUDED.column_id,
        position = EXCLUDED.position,
        updated_at = now();

  IF v_target = v_current THEN
    RETURN;
  END IF;

  IF v_target = 'pendente' THEN
    UPDATE public.user_tasks
    SET status = 'assigned', situacao = 'pendente', updated_at = now()
    WHERE id = p_task_id;

  ELSIF v_target = 'em_execucao' THEN
    IF v_task.status IN ('awaiting_validation','awaiting_external','blocked') THEN
      UPDATE public.user_tasks
      SET situacao = 'em_execucao', updated_at = now()
      WHERE id = p_task_id;
    ELSE
      UPDATE public.user_tasks
      SET status = 'in_progress', situacao = 'em_execucao', updated_at = now()
      WHERE id = p_task_id;
    END IF;

  ELSIF v_target = 'concluida_sucesso' THEN
    UPDATE public.user_tasks
    SET payload = (payload - 'outcome'), updated_at = now()
    WHERE id = p_task_id AND (payload ? 'outcome');

    SELECT COALESCE(tt.requires_validation, false), ut.validated_at
      INTO v_requires_validation, v_validated_at
      FROM public.user_tasks ut
      JOIN public.task_types tt ON tt.id = ut.task_type_id
      WHERE ut.id = p_task_id;

    IF v_requires_validation AND v_validated_at IS NULL THEN
      UPDATE public.user_tasks
      SET status = 'awaiting_validation', situacao = 'em_execucao', updated_at = now()
      WHERE id = p_task_id;
    ELSE
      UPDATE public.user_tasks
      SET status = 'completed', situacao = 'concluida_sucesso',
          completed_at = COALESCE(completed_at, now()), updated_at = now()
      WHERE id = p_task_id;
    END IF;

  ELSIF v_target = 'concluida_sem_sucesso' THEN
    UPDATE public.user_tasks
    SET status = 'completed',
        situacao = 'concluida_sem_sucesso',
        payload = COALESCE(payload, '{}'::jsonb) || jsonb_build_object('outcome', 'sem_sucesso'),
        completed_at = COALESCE(completed_at, now()),
        updated_at = now()
    WHERE id = p_task_id;

  ELSIF v_target = 'cancelado' THEN
    UPDATE public.user_tasks
    SET status = 'cancelled', situacao = 'cancelado',
        cancelled_at = COALESCE(cancelled_at, now()), updated_at = now()
    WHERE id = p_task_id;
  END IF;
END;
$function$;
