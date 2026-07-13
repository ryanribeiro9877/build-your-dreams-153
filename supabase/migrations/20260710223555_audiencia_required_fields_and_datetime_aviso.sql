-- 20260710223555_audiencia_required_fields_and_datetime_aviso.sql
--
-- ESPELHO de reconciliação repo<->banco (NÃO fazer `db push`).
-- Já aplicada em PRODUÇÃO via MCP (apply_migration), registrada em
-- supabase_migrations.schema_migrations como:
--     version = 20260710223555
--     name    = audiencia_required_fields_and_datetime_aviso
--
-- [8.3] Endurece create_audiencia: processo + advogado OBRIGATÓRIOS (bloqueio).
-- Adiciona helper audiencia_datetime_aviso(): regra de data como AVISO (não bloqueia).
-- Janela 08:00–19:00, seg–sex, fora de feriado — reaproveita business_hours_config
-- (timezone, workdays, open_time) + tabela holidays, igual ao is_business_datetime,
-- só trocando o teto (17:00 → 19:00) e sem barrar (é aviso, não backstop).
-- ============================================================================

-- 1) create_audiencia com processo + advogado obrigatórios --------------------
create or replace function public.create_audiencia(
  p_client_id uuid, p_process_id uuid, p_data_hora timestamptz,
  p_tipo_acao text default null, p_parte_contraria text default null,
  p_link_local text default null, p_advogado_user_id uuid default null,
  p_observacoes text default null, p_docs jsonb default '[]'::jsonb
) returns uuid language plpgsql security definer set search_path to 'public' as $fn$
declare v_id uuid; v_client_name text; v_proc_number text;
begin
  if auth.uid() is null then raise exception 'create_audiencia: não autenticado'; end if;
  if not public.audiencias_can_manage() then
    raise exception 'create_audiencia: sem permissão' using errcode='42501';
  end if;
  if p_data_hora is null then raise exception 'create_audiencia: data/hora obrigatória'; end if;
  -- Regra do escritório: processo e advogado são obrigatórios.
  if p_process_id is null then
    raise exception 'create_audiencia: processo é obrigatório' using errcode='23514';
  end if;
  if p_advogado_user_id is null then
    raise exception 'create_audiencia: advogado é obrigatório' using errcode='23514';
  end if;

  select full_name into v_client_name from public.clients where id = p_client_id;
  select process_number into v_proc_number from public.processes where id = p_process_id;

  insert into public.audiencias (
    client_id, client_name, process_id, process_number, tipo_acao, parte_contraria,
    data_hora, link_local, advogado_user_id, observacoes, docs, origem, created_by
  ) values (
    p_client_id, v_client_name, p_process_id, v_proc_number, p_tipo_acao, p_parte_contraria,
    p_data_hora, p_link_local, p_advogado_user_id, p_observacoes, coalesce(p_docs,'[]'::jsonb),
    'manual', auth.uid()
  ) returning id into v_id;
  return v_id;
end $fn$;
revoke all on function public.create_audiencia(uuid,uuid,timestamptz,text,text,text,uuid,text,jsonb) from public, anon;
grant execute on function public.create_audiencia(uuid,uuid,timestamptz,text,text,text,uuid,text,jsonb) to authenticated, service_role;

-- 2) Helper de AVISO de data (read-only; front chama pra alertar, não bloqueia) -
create or replace function public.audiencia_datetime_aviso(p_ts timestamptz)
returns text language plpgsql stable security definer set search_path to 'public' as $fn$
declare
  c public.business_hours_config;
  v_tz text := 'America/Sao_Paulo';
  v_workdays int[] := array[1,2,3,4,5];
  v_open int := 8*60;      -- piso: 08:00 (config open_time se houver)
  v_close int := 19*60;    -- teto fixo da audiência: 19:00
  v_local timestamp; v_hm int;
begin
  if p_ts is null then return ''; end if;
  select * into c from public.business_hours_config where id = true;
  if found then
    v_tz := coalesce(c.timezone, v_tz);
    v_workdays := coalesce(c.workdays, v_workdays);
    if c.open_time is not null then
      v_open := extract(hour from c.open_time)::int*60 + extract(minute from c.open_time)::int;
    end if;
  end if;
  v_local := p_ts at time zone v_tz;
  if not (extract(isodow from v_local)::int = any (v_workdays)) then
    return 'fim de semana / dia não útil';
  end if;
  if exists (select 1 from public.holidays h where h.day = v_local::date) then
    return 'feriado';
  end if;
  v_hm := extract(hour from v_local)::int*60 + extract(minute from v_local)::int;
  if v_hm < v_open  then return 'antes do horário de expediente (08:00)'; end if;
  if v_hm >= v_close then return 'após as 19:00'; end if;
  return '';
end $fn$;
revoke all on function public.audiencia_datetime_aviso(timestamptz) from public, anon;
grant execute on function public.audiencia_datetime_aviso(timestamptz) to authenticated, service_role;
