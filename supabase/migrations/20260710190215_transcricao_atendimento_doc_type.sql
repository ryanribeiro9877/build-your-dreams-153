-- ============================================================================
-- TRILHA C — Transcrição do atendimento: adiciona 'transcricao_atendimento' ao
-- vocabulário de client_documents.document_type.
--
-- Aditivo/idempotente. NÃO usar db push (R-2). Aplicado via MCP apply_migration.
-- O CHECK é recriado a partir do conjunto VIVO de produção (17 valores, incl.
-- audio_atendimento + resumo_atendimento) + o valor novo 'transcricao_atendimento'
-- — para não regredir o SUPERSET de produção. Sem este valor, o INSERT da edge
-- transcribe-attendance-audio falha (insert_failed) no CHECK.
-- ============================================================================

ALTER TABLE public.client_documents
  DROP CONSTRAINT IF EXISTS client_documents_document_type_check;

ALTER TABLE public.client_documents
  ADD CONSTRAINT client_documents_document_type_check
  CHECK (document_type IN (
    'rg', 'cpf', 'comprovante', 'procuracao', 'contrato', 'termo_cooperado', 'outro',
    'comprovante_residencia', 'extrato_conta', 'extrato_ir', 'extrato_inss', 'cnis',
    'certidao', 'contrato_honorarios', 'declaracao_hipossuficiencia',
    'audio_atendimento', 'resumo_atendimento', 'transcricao_atendimento'
  ));
