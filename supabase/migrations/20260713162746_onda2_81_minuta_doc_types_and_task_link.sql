-- 20260713162746_onda2_81_minuta_doc_types_and_task_link.sql
--
-- ESPELHO de reconciliação repo<->banco (NÃO fazer `db push`).
-- Já aplicada em PRODUÇÃO via MCP (apply_migration):
--     version = 20260713162746
--     name    = onda2_81_minuta_doc_types_and_task_link
--
-- ONDA 2 · Card 8.1 — inicial por IA no Kanban (DB-side).
-- (a) novos document_type: peticao_inicial, minuta.
-- (b) vínculo da minuta ao card (user_task); client_id já existia.
-- "Ligar o pipeline de petição" é front/edge (fora desta migration).
-- ============================================================================

alter table public.client_documents drop constraint if exists client_documents_document_type_check;
alter table public.client_documents add constraint client_documents_document_type_check
  check (document_type = any (array[
    'rg','cpf','comprovante','procuracao','contrato','termo_cooperado','outro',
    'comprovante_residencia','extrato_conta','extrato_ir','extrato_inss','cnis','certidao',
    'contrato_honorarios','declaracao_hipossuficiencia',
    'audio_atendimento','resumo_atendimento','transcricao_atendimento',
    'peticao_inicial','minuta'
  ]::text[]));

alter table public.client_documents
  add column if not exists task_id uuid references public.user_tasks(id);

create index if not exists idx_client_documents_task_id
  on public.client_documents(task_id);

comment on column public.client_documents.task_id is
  'ONDA2/8.1: card (user_task) que originou o documento — ex.: minuta gerada na etapa de confecção de inicial.';
