-- Espelho da migração aplicada via MCP (apply_migration) em prod — NÃO reexecutar.
-- FIX: agente não resolve/desambigua o destinatário ("o sócio").
-- Cria o helper de fold de acento + o resolvedor determinístico de usuário
-- atribuível. Aditivo: não altera list_assignable_users nem funções existentes.

-- Helper: minúsculas + remove acento (unaccent não está instalado neste projeto)
CREATE OR REPLACE FUNCTION public.txt_fold(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $fold$
  SELECT lower(translate(coalesce(p,''),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'))
$fold$;

-- Resolvedor de usuário atribuível (espelha o padrão do agent_consultar_cliente).
-- Mesmo conjunto de candidatos que list_assignable_users (ativo + com login).
-- Casa por: nome, display_name, e-mail (e só o local), cargo, código do cargo e app_role.
CREATE OR REPLACE FUNCTION public.agent_consultar_usuario(p_busca text)
 RETURNS TABLE(user_id uuid, name text, cargo text, email text, app_roles text[])
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $fn$
declare
  v_norm text;
begin
  if not public.is_recepcao_or_socio() then
    return;
  end if;
  v_norm := public.txt_fold(btrim(coalesce(p_busca,'')));
  if v_norm = '' then
    return;
  end if;
  return query
  with base as (
    select p.user_id,
           coalesce(nullif(btrim(p.full_name),''), nullif(btrim(p.display_name),''), 'Sem nome') as name,
           p.full_name, p.display_name,
           rt.code as rt_code, rt.display_name as cargo,
           au.email::text as email,
           (select array_agg(ur.role::text order by ur.role::text)
              from public.user_roles ur where ur.user_id = p.user_id) as app_roles
      from public.profiles p
      left join public.role_templates rt on rt.id = p.role_template_id
      left join auth.users au on au.id = p.user_id
     where p.user_id is not null
       and (rt.id is null or rt.has_login is not false)
       and p.activation_status = 'ativo'
  )
  select b.user_id, b.name, b.cargo, b.email, b.app_roles
    from base b
   where public.txt_fold(b.name)                    like '%'||v_norm||'%'
      or public.txt_fold(b.full_name)               like '%'||v_norm||'%'
      or public.txt_fold(b.display_name)            like '%'||v_norm||'%'
      or public.txt_fold(b.email)                   like '%'||v_norm||'%'
      or public.txt_fold(split_part(b.email,'@',1)) like '%'||v_norm||'%'
      or public.txt_fold(b.cargo)                   like '%'||v_norm||'%'
      or public.txt_fold(b.rt_code)                 like '%'||v_norm||'%'
      or exists (select 1 from unnest(coalesce(b.app_roles,'{}'::text[])) r
                  where public.txt_fold(r) like '%'||v_norm||'%')
   order by b.name
   limit 10;
end;
$fn$;

-- Grants espelhando os irmãos (agent_consultar_cliente / list_assignable_users):
-- authenticated + service_role; SEM anon/public.
REVOKE ALL ON FUNCTION public.agent_consultar_usuario(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agent_consultar_usuario(text) TO authenticated, service_role;
