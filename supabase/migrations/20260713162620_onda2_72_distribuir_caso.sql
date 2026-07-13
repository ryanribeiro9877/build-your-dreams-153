-- 20260713162620_onda2_72_distribuir_caso.sql
--
-- ESPELHO de reconciliação repo<->banco (NÃO fazer `db push`).
-- Já aplicada em PRODUÇÃO via MCP (apply_migration):
--     version = 20260713162620
--     name    = onda2_72_distribuir_caso
--
-- ONDA 2 · Card 7.2 — distribuição automática do caso ao board tipado.
-- Resolve tipo -> task_type -> board -> coluna inicial; cria e placa o card.
-- O passo §24.1 (checagem de condições) fica como TODO (norma pendente).
-- Revoke de anon em migration separada (20260713162958).
-- ============================================================================

create or replace function public.distribuir_caso(
  p_process_id   uuid,
  p_tipo_acao_id uuid default null,
  p_task_type_id uuid default null,
  p_title        text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid          uuid;
  v_process      public.processes;
  v_tipo_acao_id uuid;
  v_task_type_id uuid;
  v_board_id     uuid;
  v_column_id    uuid;
  v_task_id      uuid;
  v_title        text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'distribuir_caso: não autenticado';
  end if;

  select * into v_process from public.processes where id = p_process_id;
  if v_process.id is null then
    raise exception 'distribuir_caso: processo não encontrado';
  end if;

  -- 1) resolve o tipo de ação (param tem prioridade; senão o que está no processo)
  v_tipo_acao_id := coalesce(p_tipo_acao_id, v_process.tipo_acao_id);
  if v_tipo_acao_id is null then
    raise exception 'distribuir_caso: tipo de ação não definido (informe p_tipo_acao_id ou preencha processes.tipo_acao_id)';
  end if;

  -- 2) persiste o tipo no processo se veio por parâmetro
  if p_tipo_acao_id is not null and v_process.tipo_acao_id is distinct from p_tipo_acao_id then
    update public.processes set tipo_acao_id = p_tipo_acao_id, updated_at = now()
    where id = p_process_id;
  end if;

  -- 3) resolve o task_type do card (param -> default do tipo -> erro claro)
  select coalesce(p_task_type_id, t.default_task_type_id)
    into v_task_type_id
    from public.tipos_acao t
    where t.id = v_tipo_acao_id;
  if v_task_type_id is null then
    raise exception 'distribuir_caso: task_type não resolvido — informe p_task_type_id ou configure tipos_acao.default_task_type_id';
  end if;

  -- 4) acha o board com esse tipo de ação
  select id into v_board_id
    from public.kanban_boards
    where tipo_acao_id = v_tipo_acao_id
    limit 1;
  if v_board_id is null then
    raise exception 'distribuir_caso: nenhum board configurado para este tipo de ação';
  end if;

  -- 5) coluna inicial = menor position do board
  select id into v_column_id
    from public.kanban_columns
    where board_id = v_board_id
    order by position asc, created_at asc
    limit 1;
  if v_column_id is null then
    raise exception 'distribuir_caso: board sem colunas';
  end if;

  -- §24.1 (checagem das condições de distribuição): TODO — bloqueado (conteúdo da norma pendente).

  -- 6) cria o card (user_task) do caso
  v_title := coalesce(nullif(btrim(p_title), ''),
                      'Caso: ' || coalesce(v_process.process_number, v_process.client_name, p_process_id::text));

  insert into public.user_tasks (task_type_id, title, assigner_user_id, process_id, client_id, status, situacao)
  values (v_task_type_id, v_title, v_uid, p_process_id, v_process.client_id, 'assigned', 'pendente')
  returning id into v_task_id;

  -- 7) placa na coluna inicial (respeita UNIQUE(user_task_id): 1 task em 1 board só)
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

grant execute on function public.distribuir_caso(uuid, uuid, uuid, text) to authenticated;
