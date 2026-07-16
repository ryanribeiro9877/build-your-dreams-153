-- ============================================================================
-- PACOTE B (banco) — Monitoramento de creditos por provedor.
-- Snapshots externos (fetched_at + status) para OpenRouter (que expoe saldo) e
-- estimativa por uso p/ OpenAI (sem API de saldo p/ chave padrao). Nunca inventa:
-- sem snapshot/erro -> available:false com razao declarada.
-- Mapeamento de faturamento: ai_generations.provider anthropic+sakana+openrouter
-- -> fatura OpenRouter; openai -> fatura OpenAI. Gasto NAO filtra is_tech_test
-- (chamada de teste consome credito real do provedor). Custo e' piso.
-- Aplicada em producao via MCP em 2026-07-16; versionada aqui p/ repo<->banco.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.provider_credit_snapshots (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider          text NOT NULL,                    -- 'openrouter' | 'openai'
  kind              text NOT NULL DEFAULT 'reported', -- 'reported' | 'estimated'
  credits_total     numeric,
  credits_used      numeric,
  credits_remaining numeric,
  currency          text DEFAULT 'USD',
  status            text NOT NULL DEFAULT 'ok',       -- 'ok' | 'error'
  error_msg         text,
  raw               jsonb,
  fetched_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pcs_provider_fetched
  ON public.provider_credit_snapshots(provider, fetched_at DESC);

CREATE TABLE IF NOT EXISTS public.provider_budgets (
  provider     text PRIMARY KEY,
  budget_usd   numeric NOT NULL,
  budget_start date NOT NULL DEFAULT current_date,
  notes        text,
  updated_by   uuid,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Acesso so via funcao definer / service_role (edge). Sem leitura direta / sem policy.
ALTER TABLE public.provider_credit_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_budgets          ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Leitora agregada (gated tech/socio). Devolve um JSON unico.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dashboard_provider_credits()
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare
  result jsonb;
  v_or_ok       public.provider_credit_snapshots%rowtype;   -- ultimo snapshot ok openrouter
  v_or_last     public.provider_credit_snapshots%rowtype;   -- ultimo snapshot (qualquer status)
  v_or_reported jsonb;
  or_total numeric; or_d7 numeric; or_d30 numeric;
  oa_total numeric; oa_d7 numeric; oa_d30 numeric;
  oa_burn_daily numeric; oa_proj_30d numeric;
  v_budget public.provider_budgets%rowtype;
  oa_spent_since numeric; oa_remaining numeric; oa_runway numeric;
  oa_estimated jsonb;
begin
  if not exists (
    select 1 from public.profiles p
      join public.role_templates rt on rt.id = p.role_template_id
     where p.user_id = auth.uid() and rt.code in ('tech','socio')
  ) then
    raise exception 'Acesso negado: restrito a tech e socio' using errcode = '42501';
  end if;

  -- ---- OpenRouter: reported (ultimo snapshot ok) ----
  select * into v_or_ok from public.provider_credit_snapshots
   where provider='openrouter' and status='ok' order by fetched_at desc limit 1;
  select * into v_or_last from public.provider_credit_snapshots
   where provider='openrouter' order by fetched_at desc limit 1;

  if v_or_ok.id is null then
    v_or_reported := jsonb_build_object(
      'available', false,
      'reason', case when v_or_last.id is null
                     then 'Sem coleta ainda (job nao executou ou nao deployado)'
                     else 'Ultima coleta falhou: ' || coalesce(v_or_last.error_msg,'erro desconhecido') end,
      'last_error_at', v_or_last.fetched_at);
  else
    v_or_reported := jsonb_build_object(
      'available', true,
      'credits_total',     v_or_ok.credits_total,
      'credits_used',      v_or_ok.credits_used,
      'credits_remaining', v_or_ok.credits_remaining,
      'currency',          coalesce(v_or_ok.currency,'USD'),
      'fetched_at',        v_or_ok.fetched_at,
      'stale',             (now() - v_or_ok.fetched_at) > interval '24 hours',
      'last_error_at',     case when v_or_last.status='error' then v_or_last.fetched_at else null end);
  end if;

  -- ---- gasto proprio por fatura (piso) ----
  select coalesce(sum(cost_usd),0),
         coalesce(sum(cost_usd) filter (where created_at >= now() - interval '7 days'),0),
         coalesce(sum(cost_usd) filter (where created_at >= now() - interval '30 days'),0)
    into or_total, or_d7, or_d30
    from public.ai_generations where provider in ('anthropic','sakana','openrouter');

  select coalesce(sum(cost_usd),0),
         coalesce(sum(cost_usd) filter (where created_at >= now() - interval '7 days'),0),
         coalesce(sum(cost_usd) filter (where created_at >= now() - interval '30 days'),0)
    into oa_total, oa_d7, oa_d30
    from public.ai_generations where provider = 'openai';

  oa_burn_daily := round(oa_d7 / 7.0, 6);
  oa_proj_30d   := round(oa_burn_daily * 30, 6);

  -- ---- OpenAI: budget opcional -> remaining/runway estimados ----
  select * into v_budget from public.provider_budgets where provider='openai';
  oa_estimated := jsonb_build_object(
    'total_usd',      round(oa_total,6),
    'd7',             round(oa_d7,6),
    'd30',            round(oa_d30,6),
    'burn_daily_7d',  oa_burn_daily,
    'projection_30d', oa_proj_30d,
    'cost_is_lower_bound', true);

  if v_budget.provider is not null then
    select coalesce(sum(cost_usd),0) into oa_spent_since
      from public.ai_generations
     where provider='openai' and created_at >= v_budget.budget_start;
    oa_remaining := round(v_budget.budget_usd - oa_spent_since, 6);
    oa_runway := case when oa_burn_daily > 0 then round(oa_remaining / oa_burn_daily, 1) else null end;
    oa_estimated := oa_estimated || jsonb_build_object(
      'budget_usd',            v_budget.budget_usd,
      'budget_start',          v_budget.budget_start,
      'spent_since_budget',    round(oa_spent_since,6),
      'remaining_estimated',   oa_remaining,
      'runway_days_estimated', oa_runway);
  end if;

  result := jsonb_build_object(
    'openrouter', jsonb_build_object(
        'reported', v_or_reported,
        'our_spend_usd', jsonb_build_object(
            'total', round(or_total,6), 'd7', round(or_d7,6), 'd30', round(or_d30,6),
            'burn_daily_7d', round(or_d7/7.0,6), 'cost_is_lower_bound', true)),
    'openai', jsonb_build_object(
        'reported', jsonb_build_object(
            'available', false,
            'reason', 'OpenAI nao expoe saldo de credito via API para chave padrao'),
        'estimated', oa_estimated),
    'notes', jsonb_build_object(
        'billing_map', 'ai_generations.provider anthropic+sakana+openrouter -> fatura OpenRouter; openai -> fatura OpenAI',
        'cost_disclaimer', 'Custo proprio e piso (lower bound); nunca inventa saldo. Indisponivel = indisponivel.',
        'generated_at', now()));
  return result;
end;
$$;
revoke all on function public.dashboard_provider_credits() from public;
revoke all on function public.dashboard_provider_credits() from anon;
grant execute on function public.dashboard_provider_credits() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- set_provider_budget: upsert do credito comprado (gated tech/socio).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_provider_budget(
  p_provider text, p_budget_usd numeric, p_start date default current_date, p_notes text default null)
returns void language plpgsql security definer set search_path to '' as $$
begin
  if not exists (
    select 1 from public.profiles p
      join public.role_templates rt on rt.id = p.role_template_id
     where p.user_id = auth.uid() and rt.code in ('tech','socio')
  ) then
    raise exception 'Acesso negado: restrito a tech e socio' using errcode = '42501';
  end if;
  if p_budget_usd is null or p_budget_usd < 0 then
    raise exception 'budget_usd invalido' using errcode = '22023';
  end if;

  insert into public.provider_budgets(provider, budget_usd, budget_start, notes, updated_by, updated_at)
  values (p_provider, p_budget_usd, coalesce(p_start, current_date), p_notes, auth.uid(), now())
  on conflict (provider) do update
     set budget_usd = excluded.budget_usd,
         budget_start = excluded.budget_start,
         notes = excluded.notes,
         updated_by = excluded.updated_by,
         updated_at = now();
end;
$$;
revoke all on function public.set_provider_budget(text,numeric,date,text) from public;
revoke all on function public.set_provider_budget(text,numeric,date,text) from anon;
grant execute on function public.set_provider_budget(text,numeric,date,text) to authenticated, service_role;
