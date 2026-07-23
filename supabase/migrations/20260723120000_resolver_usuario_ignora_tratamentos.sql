-- ============================================================================
-- Resolver de usuário por NOME: ignorar pronomes de tratamento
-- ============================================================================
-- Antes, agent_consultar_usuario exigia que TODOS os tokens da busca (fora um
-- punhado de stopwords gramaticais) casassem no índice de busca do usuário.
-- Pronomes de tratamento ("Dr", "Dra", "Senhor", "Senhora"...) não estavam na
-- lista, então buscas como "Dr Rodrigo", "Senhor Rodrigo" ou "Dra Laura"
-- retornavam vazio (o token "dr"/"senhor" não existe em nenhum nome).
--
-- Esta migração acrescenta os tratamentos comuns à lista de palavras ignoradas,
-- de modo que o roteamento passe a ser feito pelo NOME da pessoa. Nenhuma outra
-- lógica muda (RBAC, 1ª pessoa e o casamento por substring permanecem iguais).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.agent_consultar_usuario(p_busca text)
 RETURNS TABLE(user_id uuid, name text, cargo text, email text, app_roles text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid    uuid := auth.uid();
  v_norm   text;
  v_tokens text[];
begin
  v_norm := public.txt_fold(btrim(coalesce(p_busca,'')));
  if v_norm = '' or v_uid is null then
    return;
  end if;
  v_tokens := array(
    select t2 from (
      select regexp_replace(tok, '[^a-z0-9]', '', 'g') AS t2
      from unnest(regexp_split_to_array(v_norm, '\s+')) tok
    ) s
    where s.t2 <> ''
      and s.t2 not in ('o','a','os','as','ao','aos','um','uma','uns','umas',
                       'de','do','da','dos','das','e','para','pra','pro',
                       'por','com','no','na','nos','nas',
                       -- pronomes de tratamento (roteamento é pelo NOME, não pelo título)
                       'dr','dra','drs','doutor','doutora',
                       'sr','sra','srs','sras','srta',
                       'senhor','senhora','senhores','senhoras','senhorita')
  );
  if array_length(v_tokens,1) is null then
    return;
  end if;

  if v_tokens <@ ARRAY['mim','eu','me','comigo','meu','minha','mesmo','mesma','proprio','propria']::text[] then
    return query
    select p.user_id,
           coalesce(nullif(btrim(p.full_name),''), nullif(btrim(p.display_name),''), 'Sem nome'),
           rt.display_name, au.email::text,
           (select array_agg(ur.role::text order by ur.role::text)
              from public.user_roles ur where ur.user_id = p.user_id)
      from public.profiles p
      left join public.role_templates rt on rt.id = p.role_template_id
      left join auth.users au on au.id = p.user_id
     where p.user_id = v_uid
       and p.activation_status = 'ativo';
    return;
  end if;

  if not public.is_recepcao_or_socio() then
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
  ),
  sel as (
    select b.*,
           public.txt_fold(concat_ws(' ',
             b.name, b.full_name, b.display_name, b.email,
             split_part(b.email,'@',1), b.cargo, b.rt_code,
             array_to_string(b.app_roles,' '))) as hay
      from base b
  )
  select s.user_id, s.name, s.cargo, s.email, s.app_roles
    from sel s
   where not exists (select 1 from unnest(v_tokens) t where position(t in s.hay) = 0)
   order by s.name
   limit 10;
end;
$function$;
