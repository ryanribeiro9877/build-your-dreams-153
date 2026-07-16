-- FIX Bug #4 — distribuir_caso: assignee ausente violava user_tasks_check (23514).
-- Espelho da migração aplicada em produção via apply_migration
-- (supabase_migrations.schema_migrations version 20260716151614). NÃO reexecutar.
--
-- Duas mudanças cirúrgicas sobre a versão anterior (resto idêntico):
--   1) Guarda de responsável nulo: sem v_responsible resolvido, erro claro (P0001)
--      em vez do 23514 — necessário p/ áreas sem area_advogado_responsavel (familia/tributario).
--   2) INSERT em user_tasks passa a incluir assignee_user_id := v_responsible,
--      satisfazendo a constraint user_tasks_check (exige exatamente um assignee).
CREATE OR REPLACE FUNCTION public.distribuir_caso(p_process_id uuid, p_tipo_acao_id uuid DEFAULT NULL::uuid, p_task_type_id uuid DEFAULT NULL::uuid, p_title text DEFAULT NULL::text, p_responsible_lawyer_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid          uuid;
  v_process      public.processes;
  v_tipo_acao_id uuid;
  v_task_type_id uuid;
  v_board_id     uuid;
  v_column_id    uuid;
  v_task_id      uuid;
  v_title        text;
  v_ok           boolean;
  v_faltando     text[];
  v_area         public.legal_area;
  v_responsible  uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'distribuir_caso: não autenticado';
  end if;

  if not (public.is_recepcao_or_socio() or public.is_socio_or_advogado()) then
    raise exception 'distribuir_caso: sem permissão para distribuir' using errcode = '42501';
  end if;

  select * into v_process from public.processes where id = p_process_id;
  if v_process.id is null then
    raise exception 'distribuir_caso: processo não encontrado';
  end if;

  v_tipo_acao_id := coalesce(p_tipo_acao_id, v_process.tipo_acao_id);
  if v_tipo_acao_id is null then
    raise exception 'distribuir_caso: tipo de ação não definido (informe p_tipo_acao_id ou preencha processes.tipo_acao_id)';
  end if;

  if p_tipo_acao_id is not null and v_process.tipo_acao_id is distinct from p_tipo_acao_id then
    update public.processes set tipo_acao_id = p_tipo_acao_id, updated_at = now()
    where id = p_process_id;
  end if;

  select coalesce(p_task_type_id, t.default_task_type_id)
    into v_task_type_id
    from public.tipos_acao t
    where t.id = v_tipo_acao_id;
  if v_task_type_id is null then
    raise exception 'distribuir_caso: task_type não resolvido — informe p_task_type_id ou configure tipos_acao.default_task_type_id';
  end if;

  select id into v_board_id
    from public.kanban_boards
    where tipo_acao_id = v_tipo_acao_id
    limit 1;
  if v_board_id is null then
    raise exception 'distribuir_caso: nenhum board configurado para este tipo de ação';
  end if;

  select id into v_column_id
    from public.kanban_columns
    where board_id = v_board_id
    order by position asc, created_at asc
    limit 1;
  if v_column_id is null then
    raise exception 'distribuir_caso: board sem colunas';
  end if;

  -- §24.1: âncora documental por tipo (bloqueio duro; conteúdo ratificado pelo Dr. Rodrigo).
  select a.ok, a.faltando into v_ok, v_faltando
    from public.verificar_ancora_24_1(p_process_id, v_tipo_acao_id) a;
  if not coalesce(v_ok, true) then
    raise exception 'distribuir_caso: §24.1 — documento âncora ausente. Obrigatório pelo menos um de: %. Distribuição bloqueada até anexar.',
      array_to_string(v_faltando, ', ') using errcode = 'P0001';
  end if;

  -- responsável = override manual > já definido no processo > default por área.
  select tt.area into v_area from public.task_types tt where tt.id = v_task_type_id;
  v_responsible := coalesce(
    p_responsible_lawyer_user_id,
    v_process.responsible_lawyer_user_id,
    (select r.responsible_user_id from public.area_advogado_responsavel r where r.area = v_area)
  );

  -- FIX Bug #4 (guarda): sem responsável resolvido, a tarefa não pode nascer
  -- (user_tasks_check exige assignee). Erro claro em vez de 23514.
  if v_responsible is null then
    raise exception 'distribuir_caso: não há advogado responsável para a área "%" — informe p_responsible_lawyer_user_id, preencha processes.responsible_lawyer_user_id, ou cadastre area_advogado_responsavel para esta área.',
      coalesce(v_area::text, '(sem área)') using errcode = 'P0001';
  end if;

  if v_responsible is distinct from v_process.responsible_lawyer_user_id then
    update public.processes
      set responsible_lawyer_user_id = v_responsible, updated_at = now()
      where id = p_process_id;
  end if;

  v_title := coalesce(nullif(btrim(p_title), ''),
                      'Caso: ' || coalesce(v_process.process_number, v_process.client_name, p_process_id::text));

  -- FIX Bug #4: incluir assignee_user_id := v_responsible (satisfaz user_tasks_check).
  insert into public.user_tasks (task_type_id, title, assigner_user_id, assignee_user_id, process_id, client_id, status, situacao)
  values (v_task_type_id, v_title, v_uid, v_responsible, p_process_id, v_process.client_id, 'assigned', 'pendente')
  returning id into v_task_id;

  insert into public.kanban_card_placements (board_id, column_id, user_task_id, position)
  values (v_board_id, v_column_id, v_task_id, 0)
  on conflict (user_task_id) do update
    set board_id = excluded.board_id,
        column_id = excluded.column_id,
        position = excluded.position,
        updated_at = now();

  return v_task_id;
end;
$function$;
