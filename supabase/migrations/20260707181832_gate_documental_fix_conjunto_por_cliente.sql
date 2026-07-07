-- FIX: gate e auto-liberação devem usar o CONJUNTO CERTO por cliente
-- (cooperado vs nao_cooperado), não o checklist fixo em 'cooperado'.
-- Sem isso, um cliente nao_cooperado nunca completa (cobra o termo_cooperado
-- que ele legitimamente não tem) -> gate sempre bloqueia, auto-liberação nunca dispara.

-- 1) Checklist PARAMETRIZADO por set_code (generaliza o client_cooperado_checklist)
create or replace function public.client_document_checklist(p_client_id uuid, p_set_code text)
returns table (document_type text, required boolean, sort_order integer, status text)
language sql
stable
security invoker
set search_path to 'public'
as $fn$
  select
    r.document_type,
    r.required,
    r.sort_order,
    coalesce((
      select case
        when bool_or(d.status = 'validado')  then 'validado'
        when bool_or(d.status = 'recebido')  then 'recebido'
        when bool_or(d.status = 'pendente')  then 'pendente'
        when bool_or(d.status = 'rejeitado') then 'rejeitado'
        else 'ausente'
      end
      from public.client_documents d
      where d.client_id = p_client_id and d.document_type = r.document_type
    ), 'ausente') as status
  from public.required_document_sets r
  where r.set_code = p_set_code
  order by r.sort_order;
$fn$;

-- 2) GATE: usar o conjunto do cliente
create or replace function public.kanban_add_task_to_board(p_task_id uuid, p_column_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_uid UUID;
  v_col public.kanban_columns;
  v_next_pos INTEGER;
  v_client_id UUID;
  v_set TEXT;
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

  -- GATE DOCUMENTAL (base): só quando a tarefa tem cliente. Usa o CONJUNTO
  -- correto por cliente (cooperado vs nao_cooperado) via client_required_set.
  IF v_client_id IS NOT NULL THEN
    v_set := public.client_required_set(v_client_id);

    SELECT
      count(*) FILTER (WHERE required),
      count(*) FILTER (WHERE required AND status = 'validado')
      INTO v_total, v_validados
    FROM public.client_document_checklist(v_client_id, v_set);

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
$function$;

-- 3) AUTO-LIBERAÇÃO: usar o conjunto do cliente (mantém tudo o mais igual,
--    inclusive NÃO tocar em 'blocked' genérico)
create or replace function public.auto_liberar_gate_documental()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_set TEXT;
  v_faltando INTEGER;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'validado'
     AND NEW.client_id IS NOT NULL THEN

    v_set := public.client_required_set(NEW.client_id);

    SELECT count(*) FILTER (WHERE required AND status <> 'validado')
      INTO v_faltando
    FROM public.client_document_checklist(NEW.client_id, v_set);

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
$function$;