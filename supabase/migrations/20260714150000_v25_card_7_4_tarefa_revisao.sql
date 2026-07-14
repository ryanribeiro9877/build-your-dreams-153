-- Card 7.4 — Tarefa de revisão humana (backend-first)
-- Decisões (Ryan/Rodrigo, 2026-07-14):
--   (1) Responsável = vínculo user_id no processo  -> nova coluna processes.responsible_lawyer_user_id
--   (2) Âncora do gatilho = FIM DA CONFECÇÃO         -> status='completed' + situacao='concluida_sucesso'
--   (3) Fallback sem responsável / auto-revisão      -> atribui ao Sócio + notifica Líder de Recepção
--   (+) Ampliar role_task_matrix: advogados passam a poder executar 'revisar_peca'
--
-- Nota de implementação: a criação da tarefa NÃO usa create_user_task porque o gatilho roda
-- como o advogado que concluiu a confecção (sem can_assign em revisar_peca) e o fallback não
-- tem assignee. Segue-se o padrão das funções-irmãs distribuir_caso/criar_pendencia:
-- insert direto em user_tasks dentro de uma RPC SECURITY DEFINER vetada (search_path='').

-- ────────────────────────────────────────────────────────────────────────────
-- 1) Vínculo real do advogado responsável no processo (aditivo)
-- ────────────────────────────────────────────────────────────────────────────
alter table public.processes
  add column if not exists responsible_lawyer_user_id uuid
    references auth.users(id) on delete set null;

create index if not exists idx_processes_responsible_lawyer_user_id
  on public.processes(responsible_lawyer_user_id);

comment on column public.processes.responsible_lawyer_user_id is
  'Card 7.4: advogado responsável (user_id) usado para atribuir a revisão da peça. '
  'responsible_lawyer (texto) permanece como legado. Populado na distribuição/atribuição.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2) Ampliar elegibilidade: advogados podem EXECUTAR revisar_peca (idempotente)
-- ────────────────────────────────────────────────────────────────────────────
insert into public.role_task_matrix (task_type_id, role_template_id, can_execute, can_assign, is_default_assignee)
select tt.id, rt.id, true, false, false
from public.task_types tt
join public.role_templates rt
  on rt.code in ('adv_confeccao_geral','adv_previdenciario','adv_audiencia_execucao','adv_protocolo')
where tt.code = 'revisar_peca'
on conflict (task_type_id, role_template_id) do nothing;

-- ────────────────────────────────────────────────────────────────────────────
-- 3) Criador canônico da tarefa de revisão
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.criar_tarefa_revisao(
  p_process_id         uuid,
  p_confeccao_task_id  uuid default null,
  p_client_document_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_caller    uuid;
  v_process   public.processes;
  v_rev_type  uuid;
  v_sla       integer;
  v_doc_id    uuid;
  v_redator   uuid;
  v_resp      uuid;
  v_resp_role uuid;
  v_eligible  boolean;
  v_assignee  uuid;
  v_fallback  boolean := false;
  v_reason    text := null;
  v_socio     uuid;
  v_lider     uuid;
  v_title     text;
  v_deadline  timestamptz;
  v_task_id   uuid;
  v_board_id  uuid;
  v_col_id    uuid;
  v_existing  uuid;
begin
  v_caller := auth.uid();
  if v_caller is null then
    raise exception 'criar_tarefa_revisao: não autenticado';
  end if;

  -- Gate por papel (disciplina R-1): só quem opera o fluxo jurídico/recepção.
  if not (public.is_socio_or_advogado()
          or public.is_recepcao_or_socio()
          or public.is_master_admin(v_caller)) then
    raise exception 'criar_tarefa_revisao: sem permissão' using errcode = '42501';
  end if;

  select * into v_process from public.processes where id = p_process_id;
  if v_process.id is null then
    raise exception 'criar_tarefa_revisao: processo % não encontrado', p_process_id;
  end if;

  select id, default_sla_hours into v_rev_type, v_sla
  from public.task_types
  where code = 'revisar_peca' and is_active = true;
  if v_rev_type is null then
    raise exception 'criar_tarefa_revisao: task_type revisar_peca ausente/inativo';
  end if;

  -- Referência da peça: usa o document passado ou resolve pela tarefa de confecção.
  v_doc_id := p_client_document_id;
  if v_doc_id is null and p_confeccao_task_id is not null then
    select id into v_doc_id
    from public.client_documents
    where task_id = p_confeccao_task_id
      and document_type in ('minuta','peticao_inicial')
    order by created_at desc
    limit 1;
  end if;

  -- Idempotência: não duplicar revisão EM ABERTO para a mesma peça/confecção/processo.
  select id into v_existing
  from public.user_tasks
  where task_type_id = v_rev_type
    and process_id = p_process_id
    and status not in ('completed'::public.user_task_status, 'cancelled'::public.user_task_status)
    and (
      (p_confeccao_task_id is not null and payload->>'confeccao_task_id' = p_confeccao_task_id::text)
      or (v_doc_id is not null and payload->>'client_document_id' = v_doc_id::text)
      or (p_confeccao_task_id is null and v_doc_id is null)
    )
  limit 1;
  if v_existing is not null then
    return v_existing;
  end if;

  -- Redator = executor da confecção (para evitar auto-revisão).
  if p_confeccao_task_id is not null then
    select assignee_user_id into v_redator
    from public.user_tasks where id = p_confeccao_task_id;
  end if;

  -- Responsável do processo + elegibilidade para revisar.
  v_resp := v_process.responsible_lawyer_user_id;
  if v_resp is not null then
    select role_template_id into v_resp_role from public.profiles where user_id = v_resp;
    v_eligible := v_resp_role is not null
                  and public.is_role_eligible_for_task(v_rev_type, v_resp_role);
  end if;

  -- Sócio e Líder de Recepção (destinos do fallback).
  select p.user_id into v_socio
  from public.profiles p join public.role_templates rt on rt.id = p.role_template_id
  where rt.code = 'socio' order by p.created_at asc limit 1;
  select p.user_id into v_lider
  from public.profiles p join public.role_templates rt on rt.id = p.role_template_id
  where rt.code = 'lider_recepcao' order by p.created_at asc limit 1;

  -- Decisão de atribuição (com fallback obrigatório — nunca órfã).
  if v_resp is null then
    v_fallback := true; v_reason := 'sem_responsavel';
  elsif v_resp = v_redator then
    v_fallback := true; v_reason := 'auto_revisao';   -- quem redigiu não revisa
  elsif not coalesce(v_eligible, false) then
    v_fallback := true; v_reason := 'responsavel_nao_elegivel';
  end if;

  v_assignee := case when v_fallback then v_socio else v_resp end;
  if v_assignee is null then
    raise exception 'criar_tarefa_revisao: sem revisor nem Sócio para atribuir (processo %)', p_process_id;
  end if;

  v_deadline := now() + (coalesce(v_sla, 24) || ' hours')::interval;
  v_title := 'Revisar peça — ' ||
             coalesce(nullif(btrim(v_process.process_number), ''), v_process.client_name, p_process_id::text);

  insert into public.user_tasks (
    task_type_id, title, description, assigner_user_id, assignee_user_id,
    process_id, client_id, status, situacao, priority, deadline_at, payload
  ) values (
    v_rev_type, v_title,
    case when v_fallback
         then 'Revisão sem revisor definido (' || v_reason ||
              '): o Sócio deve revisar ou reatribuir ao advogado responsável.'
         else null end,
    v_caller, v_assignee,
    p_process_id, v_process.client_id,
    'assigned'::public.user_task_status, 'pendente'::public.task_situacao,
    'high'::public.task_priority, v_deadline,
    jsonb_build_object(
      'source', 'card_7_4_auto',
      'confeccao_task_id', p_confeccao_task_id,
      'client_document_id', v_doc_id,
      'responsible_lawyer_user_id', v_resp,
      'redator_user_id', v_redator,
      'fallback', v_fallback,
      'fallback_reason', v_reason
    )
  ) returning id into v_task_id;

  -- Posiciona o card no board do tipo de ação (coluna "Pendente"). Não-fatal.
  if v_process.tipo_acao_id is not null then
    select b.id into v_board_id
    from public.kanban_boards b where b.tipo_acao_id = v_process.tipo_acao_id limit 1;
    if v_board_id is not null then
      select c.id into v_col_id
      from public.kanban_columns c
      where c.board_id = v_board_id and c.situacao = 'pendente'::public.task_situacao
      order by c.position asc limit 1;
      if v_col_id is not null then
        insert into public.kanban_card_placements (board_id, column_id, user_task_id, position)
        values (v_board_id, v_col_id, v_task_id, 0)
        on conflict (user_task_id) do update
          set board_id = excluded.board_id, column_id = excluded.column_id,
              position = excluded.position, updated_at = now();
      end if;
    end if;
  end if;

  -- Fallback: alerta Sócio + Líder de Recepção para atribuírem o revisor.
  if v_fallback then
    insert into public.bottleneck_notifications (user_id, alert_type, severity, department, message, agent_name)
    select u, 'revisao_sem_responsavel', 'warning', 'revisao',
           'Revisão sem revisor definido (' || v_reason || '): ' || v_title || '. Atribua o revisor.',
           'Sistema - Revisão'
    from (
      select v_socio as u where v_socio is not null
      union
      select v_lider     where v_lider is not null
    ) s;
  end if;

  return v_task_id;
end;
$function$;

revoke all on function public.criar_tarefa_revisao(uuid, uuid, uuid) from public, anon;
grant execute on function public.criar_tarefa_revisao(uuid, uuid, uuid) to authenticated;

comment on function public.criar_tarefa_revisao(uuid, uuid, uuid) is
  'Card 7.4: cria a tarefa revisar_peca ao fim da confecção. Atribui ao advogado responsável '
  '(processes.responsible_lawyer_user_id) quando elegível e distinto do redator; caso contrário '
  'ao Sócio (fallback) notificando o Líder de Recepção. Idempotente por peça/confecção em aberto.';

-- ────────────────────────────────────────────────────────────────────────────
-- 4) Gancho: fim da confecção (status -> completed / concluida_sucesso)
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.trg_confeccao_completa_cria_revisao()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_stage public.org_stage;
begin
  if new.status = 'completed'::public.user_task_status
     and old.status is distinct from new.status
     and new.situacao = 'concluida_sucesso'::public.task_situacao
     and coalesce(new.is_pendencia, false) = false
     and new.process_id is not null then

    select stage into v_stage from public.task_types where id = new.task_type_id;

    if v_stage = 'confeccao'::public.org_stage then
      begin
        perform public.criar_tarefa_revisao(new.process_id, new.id, null);
      exception when others then
        -- Nunca deixar a conclusão da confecção falhar por causa da revisão.
        raise warning 'trg_confeccao_completa_cria_revisao: falha ao criar revisão p/ task %: % / %',
          new.id, sqlstate, sqlerrm;
      end;
    end if;
  end if;
  return new;
end;
$function$;

-- Trigger function não deve ser chamável diretamente por clientes (disciplina R-1).
revoke all on function public.trg_confeccao_completa_cria_revisao() from public, anon;

drop trigger if exists trg_user_tasks_confeccao_revisao on public.user_tasks;
create trigger trg_user_tasks_confeccao_revisao
  after update of status on public.user_tasks
  for each row
  when (new.status = 'completed'::public.user_task_status
        and old.status is distinct from new.status)
  execute function public.trg_confeccao_completa_cria_revisao();
