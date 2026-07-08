-- Backfill de reconciliação repo↔banco: reflete o SQL aplicado em produção
-- (schema_migrations version=20260708192538, name=fix_search_clients_document_checklist_set_code).
--
-- FIX (CLIENTES-BUSCA-404): search_clients chamava public.client_document_checklist(c.id)
-- com 1 argumento no ramo do filtro `docs_completos`. A função foi refatorada em
-- 2026-07-07 (migration 20260707181832) para exigir (p_client_id uuid, p_set_code text).
-- Como o RETURN QUERY planeja a query INTEIRA antes de executar, o Postgres resolve
-- todas as referências de função no plano e falha com 42883 (undefined_function) —
-- mesmo com filtros vazios, pois o ramo nem chega a rodar. O PostgREST mapeia 42883
-- para HTTP 404, o que fazia a tela de Gestão de Clientes nunca listar ("404 na RPC").
--
-- Correção: derivar o conjunto documental do cliente com public.client_required_set(c.id)
-- (o mesmo padrão do gate documental, migration 20260707181832) e passar como 2º
-- argumento. Mudança mínima: só as 2 ocorrências do ramo `docs_completos`; o restante
-- da função permanece idêntico.

CREATE OR REPLACE FUNCTION public.search_clients(p_filtros jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(id uuid, full_name text, status text, client_origin text, city text, state text, gov_br_profile text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_cpf text := nullif(p_filtros->>'cpf','');
begin
  if not public.is_recepcao_or_socio() then
    raise exception 'Acesso negado: apenas recepção ou sócio podem buscar clientes'
      using errcode = '42501';
  end if;

  return query
  select c.id, c.full_name, c.status, c.client_origin, c.city, c.state,
         c.gov_br_profile, c.created_at
  from public.clients c
  where
    -- ── DIRETOS ──────────────────────────────────────────────
    (p_filtros->>'nome' is null       or c.full_name ilike '%'||(p_filtros->>'nome')||'%')
    and (p_filtros->>'email' is null  or c.email ilike '%'||(p_filtros->>'email')||'%')
    and (p_filtros->>'telefone' is null or c.phone ilike '%'||(p_filtros->>'telefone')||'%')
    and (p_filtros->>'cidade' is null or c.city ilike '%'||(p_filtros->>'cidade')||'%')
    and (p_filtros->>'uf' is null     or c.state = (p_filtros->>'uf'))
    and (p_filtros->>'status' is null or c.status = (p_filtros->>'status'))
    and (p_filtros->>'origem' is null or c.client_origin = (p_filtros->>'origem'))
    and (p_filtros->>'tipo_pessoa' is null or c.tipo_pessoa = (p_filtros->>'tipo_pessoa'))
    and (p_filtros->>'ativo' is null  or
         (case when (p_filtros->>'ativo')::boolean then c.status = 'ativo' else c.status <> 'ativo' end))
    and (p_filtros->>'gov' is null    or
         (case when (p_filtros->>'gov')::boolean then c.gov_br_profile is not null else c.gov_br_profile is null end))
    and (p_filtros->>'criado_de' is null  or c.created_at >= (p_filtros->>'criado_de')::timestamptz)
    and (p_filtros->>'criado_ate' is null or c.created_at <= (p_filtros->>'criado_ate')::timestamptz)
    -- ── CPF (match EXATO por índice cego) ────────────────────
    and (v_cpf is null or c.cpf_bidx = public.pii_bidx(v_cpf))
    -- ── INDIRETOS (EXISTS) ───────────────────────────────────
    -- responsável: cliente com tarefa atribuída a um usuário
    and (p_filtros->>'responsavel_id' is null or exists (
          select 1 from public.user_tasks t
          where t.client_id = c.id and t.assignee_user_id = (p_filtros->>'responsavel_id')::uuid))
    -- pendência aberta
    and (p_filtros->>'tem_pendencia' is null or
         (case when (p_filtros->>'tem_pendencia')::boolean
               then exists (select 1 from public.user_tasks t where t.client_id = c.id and t.is_pendencia = true)
               else not exists (select 1 from public.user_tasks t where t.client_id = c.id and t.is_pendencia = true) end))
    -- tipo de ação (task_type_id em tarefa do cliente)
    and (p_filtros->>'task_type_id' is null or exists (
          select 1 from public.user_tasks t
          where t.client_id = c.id and t.task_type_id = (p_filtros->>'task_type_id')::uuid))
    -- possui documento de um tipo (contrato/procuração/termo/etc)
    and (p_filtros->>'tem_documento_tipo' is null or exists (
          select 1 from public.client_documents d
          where d.client_id = c.id and d.document_type = (p_filtros->>'tem_documento_tipo')))
    -- docs completos: nenhum item pendente no conjunto exigido do cliente
    -- (usa o conjunto do cliente via client_required_set — 2 args, ver cabeçalho)
    and (p_filtros->>'docs_completos' is null or
         (case when (p_filtros->>'docs_completos')::boolean
               then not exists (select 1 from public.client_document_checklist(c.id, public.client_required_set(c.id)) ck where ck.status <> 'validado')
               else exists     (select 1 from public.client_document_checklist(c.id, public.client_required_set(c.id)) ck where ck.status <> 'validado') end))
    -- tem processo / protocolado
    and (p_filtros->>'tem_processo' is null or
         (case when (p_filtros->>'tem_processo')::boolean
               then exists (select 1 from public.processes p where p.client_id = c.id)
               else not exists (select 1 from public.processes p where p.client_id = c.id) end))
    -- tem audiência marcada (processo com next_hearing_date futura)
    and (p_filtros->>'tem_audiencia' is null or
         (case when (p_filtros->>'tem_audiencia')::boolean
               then exists (select 1 from public.processes p where p.client_id = c.id and p.next_hearing_date is not null)
               else not exists (select 1 from public.processes p where p.client_id = c.id and p.next_hearing_date is not null) end))
  order by c.full_name;
end;
$function$;
