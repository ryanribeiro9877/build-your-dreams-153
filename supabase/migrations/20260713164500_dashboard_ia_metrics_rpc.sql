-- Dashboard IA (subtask 9.2 "Comparativo IA x humano").
-- RPC agregada que cruza dados de todos os usuarios -> SECURITY DEFINER com
-- search_path fixo, sem anon, e gate de papel tech/socio no corpo (mesma linha
-- do hardening R-1/R-3 e do guard DashboardRoute). Retorna um JSON unico com
-- todas as series, para a pagina consumir numa chamada.
-- Aplicada em producao via MCP em 2026-07-13; versionada aqui para manter repo<->banco.
create or replace function public.dashboard_ia_metrics()
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
  -- Gate: apenas tech ou socio (role_templates.code via profiles).
  if not exists (
    select 1
      from public.profiles p
      join public.role_templates rt on rt.id = p.role_template_id
     where p.user_id = auth.uid()
       and rt.code in ('tech','socio')
  ) then
    raise exception 'Acesso negado: dashboard restrito a tech e socio'
      using errcode = '42501';
  end if;

  select coalesce(min(created_at)::date, current_date - 13),
         coalesce(max(created_at)::date, current_date)
    into d_min, d_max
    from public.chat_messages;

  select
    jsonb_build_object(
      'window', jsonb_build_object('first', d_min, 'last', d_max)
    )
    || jsonb_build_object('kpis',
      (select jsonb_build_object(
          'total_runs',   count(*),
          'success_runs', count(*) filter (where status = 'done'),
          'failed_runs',  count(*) filter (where status = 'failed'),
          'success_rate', case when count(*) = 0 then 0
                               else round(100.0 * count(*) filter (where status = 'done') / count(*), 1) end,
          'run_latency_p50_ms', coalesce(round((percentile_cont(0.5) within group (
               order by extract(epoch from (updated_at - created_at)) * 1000)
               filter (where status = 'done'))::numeric)::int, 0),
          'run_latency_p90_ms', coalesce(round((percentile_cont(0.9) within group (
               order by extract(epoch from (updated_at - created_at)) * 1000)
               filter (where status = 'done'))::numeric)::int, 0)
        ) from public.orchestration_runs)
      || (select jsonb_build_object(
          'sessions',       (select count(*) from public.chat_sessions),
          'messages_total', count(*),
          'tokens_input',   coalesce(sum(input_tokens), 0),
          'tokens_output',  coalesce(sum(output_tokens), 0)
        ) from public.chat_messages)
    )
    || jsonb_build_object('run_status',
      (select coalesce(jsonb_agg(jsonb_build_object('key', status, 'n', n) order by n desc), '[]'::jsonb)
         from (select status, count(*) n from public.orchestration_runs group by status) s))
    || jsonb_build_object('intents',
      (select coalesce(jsonb_agg(jsonb_build_object('key', coalesce(intent_category, '_none'), 'n', n) order by n desc), '[]'::jsonb)
         from (select intent_category, count(*) n from public.orchestration_runs group by intent_category) i))
    || jsonb_build_object('turns',
      (select coalesce(jsonb_agg(jsonb_build_object('key', role, 'n', n)), '[]'::jsonb)
         from (select role, count(*) n from public.chat_messages group by role) t))
    || jsonb_build_object('by_model',
      (select coalesce(jsonb_agg(jsonb_build_object(
          'model', model_used, 'messages', n, 'tokens_in', ti, 'tokens_out', tob) order by n desc), '[]'::jsonb)
         from (select model_used, count(*) n,
                      coalesce(sum(input_tokens), 0) ti, coalesce(sum(output_tokens), 0) tob
                 from public.chat_messages
                where role = 'assistant' and model_used is not null
                group by model_used) m))
    || jsonb_build_object('latency_buckets',
      (select coalesce(jsonb_agg(jsonb_build_object('key', bucket, 'n', n) order by ord), '[]'::jsonb)
         from (
           select bucket, ord, count(*) n from (
             select case
                 when ms < 5000   then '<5s'
                 when ms < 15000  then '5-15s'
                 when ms < 60000  then '15-60s'
                 when ms < 300000 then '1-5min'
                 else '>5min' end bucket,
               case
                 when ms < 5000   then 1
                 when ms < 15000  then 2
                 when ms < 60000  then 3
                 when ms < 300000 then 4
                 else 5 end ord
             from (select extract(epoch from (updated_at - created_at)) * 1000 ms
                     from public.orchestration_runs where status = 'done') x
           ) y group by bucket, ord) z))
    || jsonb_build_object('volume_daily',
      (select coalesce(jsonb_agg(jsonb_build_object(
          'date', dia, 'runs', runs, 'human', human, 'ai', ai) order by dia), '[]'::jsonb)
         from (
           select g::date as dia,
             (select count(*) from public.orchestration_runs r where r.created_at::date = g::date) runs,
             (select count(*) from public.chat_messages cm where cm.created_at::date = g::date and cm.role = 'user') human,
             (select count(*) from public.chat_messages cm where cm.created_at::date = g::date and cm.role = 'assistant') ai
           from generate_series(d_min, d_max, interval '1 day') g
         ) v))
    into result;

  return result;
end;
$$;

-- Sem anon: apenas usuarios autenticados chamam (e o corpo ainda exige tech/socio).
revoke all on function public.dashboard_ia_metrics() from public;
revoke all on function public.dashboard_ia_metrics() from anon;
grant execute on function public.dashboard_ia_metrics() to authenticated;
