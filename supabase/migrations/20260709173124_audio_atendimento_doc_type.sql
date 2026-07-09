-- ============================================================================
-- TRILHA C · 6.1 — Áudio de atendimento: adiciona 'audio_atendimento' ao
-- vocabulário de client_documents.document_type.
--
-- Aditivo/idempotente. NÃO usar db push (R-2). Aplicado via MCP apply_migration
-- (version 20260709173124). O CHECK foi recriado a partir do conjunto VIVO de
-- produção (introspectado via pg_get_constraintdef em 2026-07-09) + o valor novo
-- 'audio_atendimento' — para não regredir o SUPERSET de produção
-- (contrato_honorarios, declaracao_hipossuficiencia não estão em migrations
-- anteriores do repo; desync repo↔banco conhecido).
-- ============================================================================

ALTER TABLE public.client_documents
  DROP CONSTRAINT IF EXISTS client_documents_document_type_check;

ALTER TABLE public.client_documents
  ADD CONSTRAINT client_documents_document_type_check
  CHECK (document_type IN (
    'rg', 'cpf', 'comprovante', 'procuracao', 'contrato', 'termo_cooperado', 'outro',
    'comprovante_residencia', 'extrato_conta', 'extrato_ir', 'extrato_inss', 'cnis',
    'certidao', 'contrato_honorarios', 'declaracao_hipossuficiencia',
    'audio_atendimento'
  ));
