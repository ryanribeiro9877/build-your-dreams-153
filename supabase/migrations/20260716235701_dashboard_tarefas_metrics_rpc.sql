-- PACOTE C — religa "Dashboard de Tarefas" (/dashboard) e "Central de Eficiencia"
-- (/eficiencia), hoje mortos lendo agent_tasks (0 linhas), a' fonte real user_tasks.
-- Padrao das dashboards 9.2: SECURITY DEFINER, search_path fixo, exclui is_test por
-- padrao, declara frescor (generated_at). Escopo por papel (sem vazamento):
--   gestao (tech/socio/lider_recepcao) -> global; demais -> so as proprias tarefas
--   (assignee_user_id = auth.uid()). /eficiencia e' ProtectedRoute (papeis operacionais),
--   por isso o gate e' "autenticado" e o escopo restringe o que cada um ve'.
-- Aplicada em producao via MCP em 2026-07-16; versionada aqui p/ repo<->banco.
CREATE OR REPLACE FUNCTION public.dashboard_tarefas_metrics(p_include_test boolean default false)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare
  result jsonb;
  v_uid uuid := auth.uid();
  v_is_gestao boolean;
  d_min date; d_max date;
begin
  if v_uid is null then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  select exists(
    select 1 from public.profiles p
      join public.role_templates rt on rt.id = p.role_template_id
     where p.user_id = v_uid and rt.code in ('tech','socio','lider_recepcao')
  ) into v_is_gestao;

  d_max := current_date; d_min := current_date - 13;

  with base as (
    select * from public.user_tasks u
     where (p_include_test or not u.is_test)
       and (v_is_gestao or u.assignee_user_id = v_uid)
  ),
  dept as (
    select coalesce(departamento_atual::text,'_none') dep,
           count(*) total,
           count(*) filter (where status in ('draft','assigned')) pending,
           count(*) filter (where coalesce(data_fatal, deadline_at::date) < current_date
                              and status not in ('completed','cancelled')) overdue,
           count(*) filter (where priority='critical') critical
      from base group by 1
  )
  select jsonb_build_object(
    'scope', case when v_is_gestao then 'global' else 'pessoal' end,
    'kpis', jsonb_build_object(
      'total',           (select count(*) from base),
      'pending',         (select count(*) from base where status in ('draft','assigned')),
      'in_progress',     (select count(*) from base where status='in_progress'),
      'overdue',         (select count(*) from base where coalesce(data_fatal, deadline_at::date) < current_date and status not in ('completed','cancelled')),
      'critical',        (select count(*) from base where priority='critical'),
      'completed',       (select count(*) from base where status='completed'),
      'pendencias_open', (select count(*) from base where is_pendencia and status not in ('completed','cancelled')),
      'completion_rate', (select case when count(*)>0 then round(100.0*count(*) filter (where status='completed')/count(*)) else 0 end from base)
    ),
    'by_area', (select coalesce(jsonb_agg(jsonb_build_object('key',k,'n',n) order by n desc),'[]'::jsonb)
                 from (select coalesce(area::text,'_none') k, count(*) n from base group by 1) s),
    'by_priority', (select coalesce(jsonb_agg(jsonb_build_object('key',priority::text,'n',n) order by n desc),'[]'::jsonb)
                 from (select priority, count(*) n from base group by priority) s),
    'by_status', (select coalesce(jsonb_agg(jsonb_build_object('key',status::text,'n',n) order by n desc),'[]'::jsonb)
                 from (select status, count(*) n from base group by status) s),
    'by_situacao', (select coalesce(jsonb_agg(jsonb_build_object('key',coalesce(situacao::text,'_none'),'n',n) order by n desc),'[]'::jsonb)
                 from (select situacao, count(*) n from base group by situacao) s),
    'by_department', (select coalesce(jsonb_agg(jsonb_build_object(
                        'key',dep,'total',total,'pending',pending,'overdue',overdue,'critical',critical,
                        'score', least(100, overdue*15 + critical*10 + greatest(0,pending-5)*3)) order by total desc),'[]'::jsonb)
                 from dept),
    'trend_daily', (select coalesce(jsonb_agg(jsonb_build_object('date',g::date,
                        'n',(select count(*) from base b where b.created_at::date=g::date)) order by g),'[]'::jsonb)
                 from generate_series(d_min,d_max,interval '1 day') g),
    'generated_at', now()
  ) into result;
  return result;
end;
$$;
revoke all on function public.dashboard_tarefas_metrics(boolean) from public;
revoke all on function public.dashboard_tarefas_metrics(boolean) from anon;
grant execute on function public.dashboard_tarefas_metrics(boolean) to authenticated;
