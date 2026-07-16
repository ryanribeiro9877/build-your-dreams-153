-- Espelho da migração aplicada via MCP (apply_migration) em prod — NÃO reexecutar.
-- FIX: agent_consultar_usuario não casava "o sócio"/"ao sócio" (artigo/preposição).
--
-- Causa raiz: o resolvedor anterior casava por SUBSTRING de txt_fold(busca); o
-- agente passa o termo com artigo ("o sócio"), e 'o socio' não é substring de
-- 'socio' → retornava 0 (a desambiguação da opção C nunca acontecia).
--
-- Correção: resolvedor por TOKENS — (a) tokeniza a busca, (b) descarta
-- artigos/preposições pt-BR, (c) exige que TODOS os tokens significativos
-- apareçam no "haystack" do candidato (nome, display_name, e-mail, cargo,
-- código do cargo, app_roles). Superset do comportamento anterior: termos
-- simples continuam iguais; "o sócio"/"ao sócio"/"para o sócio" → 2; nome
-- completo exige todos os tokens → 1 (sem falso positivo).
--
-- Aditivo: só substitui agent_consultar_usuario; não toca txt_fold nem outras.
-- CREATE OR REPLACE preserva os grants (authenticated/service_role; sem anon).
-- Sem redeploy de edge (o edge já chama agent_consultar_usuario).

CREATE OR REPLACE FUNCTION public.agent_consultar_usuario(p_busca text)
 RETURNS TABLE(user_id uuid, name text, cargo text, email text, app_roles text[])
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
declare
  v_norm   text;
  v_tokens text[];
begin
  if not public.is_recepcao_or_socio() then
    return;
  end if;
  v_norm := public.txt_fold(btrim(coalesce(p_busca,'')));
  if v_norm = '' then
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
                       'por','com','no','na','nos','nas')
  );
  if array_length(v_tokens,1) is null then
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
$fn$;
