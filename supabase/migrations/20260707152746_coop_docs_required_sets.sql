-- Backfill de reconciliação repo↔banco: reflete o SQL aplicado em produção
-- (schema_migrations version=20260707152746, name=coop_docs_required_sets).
-- COOP-DOCS-1: tipos novos + conjunto obrigatório do cooperado (idempotente)

-- 1) CHECK de document_type: preserva os 13 e adiciona os 2 novos
alter table public.client_documents drop constraint if exists client_documents_document_type_check;
alter table public.client_documents add constraint client_documents_document_type_check
  check (document_type = any (array[
    'rg','cpf','comprovante','procuracao','contrato','termo_cooperado','outro',
    'comprovante_residencia','extrato_conta','extrato_ir','extrato_inss','cnis','certidao',
    'contrato_honorarios','declaracao_hipossuficiencia'
  ]));

-- 2) required_document_sets: o "checklist por ação" como dado
create table if not exists public.required_document_sets (
  id uuid primary key default gen_random_uuid(),
  set_code text not null,
  document_type text not null,
  required boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (set_code, document_type)
);

alter table public.required_document_sets enable row level security;

drop policy if exists "required_document_sets read recepcao socio" on public.required_document_sets;
create policy "required_document_sets read recepcao socio"
  on public.required_document_sets for select to authenticated
  using (public.is_recepcao_or_socio());

-- seed do conjunto 'cooperado' (7), idempotente
insert into public.required_document_sets (set_code, document_type, required, sort_order) values
  ('cooperado','rg',true,1),
  ('cooperado','cpf',true,2),
  ('cooperado','comprovante',true,3),
  ('cooperado','contrato_honorarios',true,4),
  ('cooperado','declaracao_hipossuficiencia',true,5),
  ('cooperado','termo_cooperado',true,6),
  ('cooperado','procuracao',true,7)
on conflict (set_code, document_type) do nothing;

-- 3) RPC de checklist do cooperado por cliente (SECURITY INVOKER: respeita RLS do chamador)
create or replace function public.client_cooperado_checklist(p_client_id uuid)
returns table (document_type text, required boolean, sort_order integer, status text)
language sql
stable
security invoker
set search_path to 'public'
as $fn$
  select
    r.document_type,
    r.required,
    r.sort_order,
    coalesce((
      select case
        when bool_or(d.status = 'validado')  then 'validado'
        when bool_or(d.status = 'recebido')  then 'recebido'
        when bool_or(d.status = 'pendente')  then 'pendente'
        when bool_or(d.status = 'rejeitado') then 'rejeitado'
        else 'ausente'
      end
      from public.client_documents d
      where d.client_id = p_client_id and d.document_type = r.document_type
    ), 'ausente') as status
  from public.required_document_sets r
  where r.set_code = 'cooperado'
  order by r.sort_order;
$fn$;
