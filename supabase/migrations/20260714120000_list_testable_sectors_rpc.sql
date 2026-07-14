-- ============================================================================
-- Tech "Atuar como setor" — RPC list_testable_sectors()
-- ----------------------------------------------------------------------------
-- Lista os SETORES testáveis (donos de agentes pessoais ativos) com
-- nome/departamento/papel, para o seletor "Atuar como" do chat (só tech).
--
-- Por que um RPC SECURITY DEFINER e não uma query client-side: a RLS de
-- public.profiles só permite admin/dono lerem perfis alheios. O tech tem
-- app_role='tech' (não é admin), então um select em profiles de outros donos
-- voltaria vazio (mesma limitação do dropdown de responsáveis — ver
-- list_assignable_users). Aqui o gate é por role_templates.code='tech' (mesma
-- linha dos demais painéis do 9.2), então só o tech enxerga a lista.
--
-- Espelho versionado da migração aplicada em produção via MCP (2026-07-14).
-- ============================================================================

create or replace function public.list_testable_sectors()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  result jsonb;
begin
  if not exists (
    select 1 from public.profiles p
      join public.role_templates rt on rt.id = p.role_template_id
     where p.user_id = auth.uid() and rt.code = 'tech'
  ) then
    raise exception 'Acesso negado: seleção de setor restrita a tech' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.department nulls last, s.name), '[]'::jsonb)
    into result
  from (
    select distinct on (a.owner_user_id)
           a.owner_user_id                        as user_id,
           coalesce(p.display_name, '(sem nome)') as name,
           nullif(p.department, '')               as department,
           coalesce(rt.code, '(sem papel)')       as role_code
      from public.agents a
      left join public.profiles p        on p.user_id = a.owner_user_id
      left join public.role_templates rt on rt.id = p.role_template_id
     where a.is_personal = true
       and a.is_active   = true
       and a.owner_user_id is not null
     order by a.owner_user_id, p.display_name
  ) s;

  return result;
end;
$function$;

revoke all on function public.list_testable_sectors() from public;
grant execute on function public.list_testable_sectors() to authenticated;
