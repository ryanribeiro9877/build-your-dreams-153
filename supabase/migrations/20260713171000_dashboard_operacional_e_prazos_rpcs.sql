-- Dashboards 9.2 (2) Recepcao+Juridico e (3) Prazos+Audiencias.
-- Scaffolds auto-populantes: hoje retornam zeros/vazios (banco de recepcao/juridico
-- foi zerado na limpeza 9.1) e "acendem" sozinhos quando entrar cadastro/processo/
-- prazo/audiencia real. Mesmo padrao de seguranca da dashboard_ia_metrics:
-- SECURITY DEFINER, search_path fixo, sem anon, gate tech/socio inline.
-- Aplicada em producao via MCP em 2026-07-13; versionada aqui para manter repo<->banco.

-- (2) Operacional: recepcao + juridico
create or replace function public.dashboard_operacional_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  result jsonb;
  d_min date;
  d_max date;
begin
  if not exists (
    select 1 from public.profiles p
      join public.role_templates rt on rt.id = p.role_template_id
     where p.user_id = auth.uid() and rt.code in ('tech','socio')
  ) then
    raise exception 'Acesso negado: dashboard restrito a tech e socio' using errcode = '42501';
  end if;

  select current_date - 29, current_date into d_min, d_max;

  select
    jsonb_build_object('kpis', jsonb_build_object(
        'clients_total',   (select count(*) from public.clients),
        'processes_total', (select count(*) from public.processes),
        'docs_total',      (select count(*) from public.client_documents),
        'tasks_total',     (select count(*) from public.user_tasks),
        'tasks_active',    (select count(*) from public.user_tasks where status not in ('completed','cancelled')),
        'pendencias_open', (select count(*) from public.user_tasks where is_pendencia and status not in ('completed','cancelled'))
      ))
    || jsonb_build_object('clients_by_origin',
        (select coalesce(jsonb_agg(jsonb_build_object('key', coalesce(client_origin,'_none'), 'n', n) order by n desc), '[]'::jsonb)
           from (select client_origin, count(*) n from public.clients group by client_origin) s))
    || jsonb_build_object('clients_by_status',
        (select coalesce(jsonb_agg(jsonb_build_object('key', coalesce(status,'_none'), 'n', n) order by n desc), '[]'::jsonb)
           from (select status, count(*) n from public.clients group by status) s))
    || jsonb_build_object('docs_by_type',
        (select coalesce(jsonb_agg(jsonb_build_object('key', coalesce(document_type,'_none'), 'n', n) order by n desc), '[]'::jsonb)
           from (select document_type, count(*) n from public.client_documents group by document_type) s))
    || jsonb_build_object('tasks_by_status',
        (select coalesce(jsonb_agg(jsonb_build_object('key', status::text, 'n', n) order by n desc), '[]'::jsonb)
           from (select status, count(*) n from public.user_tasks group by status) s))
    || jsonb_build_object('tasks_by_priority',
        (select coalesce(jsonb_agg(jsonb_build_object('key', priority::text, 'n', n) order by n desc), '[]'::jsonb)
           from (select priority, count(*) n from public.user_tasks group by priority) s))
    || jsonb_build_object('processes_by_status',
        (select coalesce(jsonb_agg(jsonb_build_object('key', coalesce(status,'_none'), 'n', n) order by n desc), '[]'::jsonb)
           from (select status, count(*) n from public.processes group by status) s))
    || jsonb_build_object('new_clients_daily',
        (select coalesce(jsonb_agg(jsonb_build_object('date', g::date,
             'n', (select count(*) from public.clients c where c.created_at::date = g::date)) order by g), '[]'::jsonb)
           from generate_series(d_min, d_max, interval '1 day') g))
    into result;
  return result;
end;
$$;

revoke all on function public.dashboard_operacional_metrics() from public;
revoke all on function public.dashboard_operacional_metrics() from anon;
grant execute on function public.dashboard_operacional_metrics() to authenticated;

-- (3) Prazos + Audiencias
create or replace function public.dashboard_prazos_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  result jsonb;
begin
  if not exists (
    select 1 from public.profiles p
      join public.role_templates rt on rt.id = p.role_template_id
     where p.user_id = auth.uid() and rt.code in ('tech','socio')
  ) then
    raise exception 'Acesso negado: dashboard restrito a tech e socio' using errcode = '42501';
  end if;

  select
    jsonb_build_object('kpis', jsonb_build_object(
        'prazos_vencidos', (select count(*) from public.user_tasks
             where status not in ('completed','cancelled') and coalesce(data_fatal, deadline_at::date) < current_date),
        'prazos_7d', (select count(*) from public.user_tasks
             where status not in ('completed','cancelled') and coalesce(data_fatal, deadline_at::date) between current_date and current_date + 7),
        'prazos_30d', (select count(*) from public.user_tasks
             where status not in ('completed','cancelled') and coalesce(data_fatal, deadline_at::date) between current_date and current_date + 30),
        'audiencias_futuras', (select count(*) from public.audiencias
             where data_hora >= now() and status not in ('cancelada','realizada')),
        'proc_hearings', (select count(*) from public.processes where next_hearing_date >= now()),
        'cards_criticos', (select count(*) from public.kanban_card_criticidade
             where vence_em is not null and vence_em < now() + interval '3 day')
      ))
    || jsonb_build_object('deadline_buckets',
        (select coalesce(jsonb_agg(jsonb_build_object('key', bucket, 'n', n) order by ord), '[]'::jsonb)
           from (
             select bucket, ord, count(*) n from (
               select case
                   when dl < current_date          then 'Vencido'
                   when dl <= current_date + 3      then 'Até 3 dias'
                   when dl <= current_date + 7      then 'Até 7 dias'
                   when dl <= current_date + 30     then 'Até 30 dias'
                   else '> 30 dias' end bucket,
                 case
                   when dl < current_date          then 0
                   when dl <= current_date + 3      then 1
                   when dl <= current_date + 7      then 2
                   when dl <= current_date + 30     then 3
                   else 4 end ord
               from (select coalesce(data_fatal, deadline_at::date) dl
                       from public.user_tasks
                      where status not in ('completed','cancelled')
                        and coalesce(data_fatal, deadline_at::date) is not null) t
             ) a group by bucket, ord) b))
    || jsonb_build_object('audiencias_by_status',
        (select coalesce(jsonb_agg(jsonb_build_object('key', status::text, 'n', n) order by n desc), '[]'::jsonb)
           from (select status, count(*) n from public.audiencias group by status) s))
    || jsonb_build_object('criticidade_by_estado',
        (select coalesce(jsonb_agg(jsonb_build_object('key', coalesce(estado,'_none'), 'n', n) order by n desc), '[]'::jsonb)
           from (select estado, count(*) n from public.kanban_card_criticidade group by estado) s))
    || jsonb_build_object('proximas_audiencias',
        (select coalesce(jsonb_agg(jsonb_build_object(
             'when', data_hora, 'client', client_name, 'tipo', tipo_acao, 'advogado', advogado_nome, 'status', status::text) order by data_hora), '[]'::jsonb)
           from (select data_hora, client_name, tipo_acao, advogado_nome, status
                   from public.audiencias
                  where data_hora >= now() and status not in ('cancelada','realizada')
                  order by data_hora limit 10) a))
    into result;
  return result;
end;
$$;

revoke all on function public.dashboard_prazos_metrics() from public;
revoke all on function public.dashboard_prazos_metrics() from anon;
grant execute on function public.dashboard_prazos_metrics() to authenticated;
