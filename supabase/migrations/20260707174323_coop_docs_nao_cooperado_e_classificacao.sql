-- Backfill de reconciliação repo↔banco: reflete o SQL aplicado em produção
-- (schema_migrations version=20260707174323, name=coop_docs_nao_cooperado_e_classificacao).
-- Conjunto 'nao_cooperado' (os 6, sem termo_cooperado) + função de classificação por presença do termo validado

-- 1) seed do conjunto nao_cooperado (idempotente) — mesma ordem, sem termo_cooperado
insert into public.required_document_sets (set_code, document_type, required, sort_order) values
  ('nao_cooperado','rg',true,1),
  ('nao_cooperado','cpf',true,2),
  ('nao_cooperado','comprovante',true,3),
  ('nao_cooperado','contrato_honorarios',true,4),
  ('nao_cooperado','declaracao_hipossuficiencia',true,5),
  ('nao_cooperado','procuracao',true,6)
on conflict (set_code, document_type) do nothing;

-- 2) classificação: cooperado = possui termo_cooperado VALIDADO
create or replace function public.is_cliente_cooperado(p_client_id uuid)
returns boolean
language sql
stable
security invoker
set search_path to 'public'
as $fn$
  select exists (
    select 1 from public.client_documents d
    where d.client_id = p_client_id
      and d.document_type = 'termo_cooperado'
      and d.status = 'validado'
  );
$fn$;

-- 3) conveniência: retorna o set_code aplicável ao cliente
create or replace function public.client_required_set(p_client_id uuid)
returns text
language sql
stable
security invoker
set search_path to 'public'
as $fn$
  select case when public.is_cliente_cooperado(p_client_id) then 'cooperado' else 'nao_cooperado' end;
$fn$;
