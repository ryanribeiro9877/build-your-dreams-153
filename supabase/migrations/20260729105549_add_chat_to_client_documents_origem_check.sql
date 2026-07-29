-- ============================================================================
-- Motor 1 · Card 5 — 'chat' entra no CHECK de client_documents.origem
-- ============================================================================
-- ESPELHO de migração JÁ APLICADA em produção (29/07). Não rodar `db push`.
--
-- A RPC `anexar_audio_autorizacao` grava `origem='chat'`, mas o CHECK de
-- `client_documents.origem` não previa esse valor e derrubava a gravação com 23514.
-- Correção aditiva: 'chat' passa a ser aceito, junto dos valores que já existiam.
--
-- Estado do CHECK em produção depois desta migração (conferido em 29/07):
--   origem IS NULL OR origem IN ('cliente','recepcao','advogado','sistema','import','ocr','chat')
-- ============================================================================

ALTER TABLE public.client_documents DROP CONSTRAINT IF EXISTS client_documents_origem_check;

ALTER TABLE public.client_documents
  ADD CONSTRAINT client_documents_origem_check
  CHECK (
    origem IS NULL
    OR origem = ANY (ARRAY['cliente'::text, 'recepcao'::text, 'advogado'::text,
                           'sistema'::text, 'import'::text, 'ocr'::text, 'chat'::text])
  );
