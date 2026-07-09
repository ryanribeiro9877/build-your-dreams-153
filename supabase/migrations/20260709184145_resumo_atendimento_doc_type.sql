-- ============================================================================
-- TRILHA C · 6.2 — Resumo do atendimento: adiciona 'resumo_atendimento' ao
-- vocabulário de client_documents.document_type.
--
-- Aditivo/idempotente. NÃO usar db push (R-2). Aplicado via MCP apply_migration
-- (version 20260709184145). O CHECK foi recriado a partir do conjunto VIVO de
-- produção (introspectado: 16 valores, incl. audio_atendimento) + o valor novo
-- 'resumo_atendimento' — para não regredir o SUPERSET de produção.
-- ============================================================================

ALTER TABLE public.client_documents
  DROP CONSTRAINT IF EXISTS client_documents_document_type_check;

ALTER TABLE public.client_documents
  ADD CONSTRAINT client_documents_document_type_check
  CHECK (document_type IN (
    'rg', 'cpf', 'comprovante', 'procuracao', 'contrato', 'termo_cooperado', 'outro',
    'comprovante_residencia', 'extrato_conta', 'extrato_ir', 'extrato_inss', 'cnis',
    'certidao', 'contrato_honorarios', 'declaracao_hipossuficiencia',
    'audio_atendimento', 'resumo_atendimento'
  ));
