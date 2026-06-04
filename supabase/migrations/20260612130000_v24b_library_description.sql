-- ============================================================================
-- V24b — coluna description em document_library
-- ============================================================================
-- A "aba Markdown" (antiga agent_documents) é aposentada e passa a gravar em
-- document_library + agent_document_links. A UI mantém o campo de descrição por
-- documento; document_library ainda não tinha essa coluna. Idempotente.
-- ============================================================================

ALTER TABLE public.document_library
  ADD COLUMN IF NOT EXISTS description text;
