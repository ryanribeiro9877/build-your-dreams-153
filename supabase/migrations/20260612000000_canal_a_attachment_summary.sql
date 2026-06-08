-- Canal A — Finalização: resumo estruturado por anexo (cache).
-- Estratégia A: ao usar um anexo pela 1a vez, o orquestrador gera um resumo
-- estruturado (parcelas/totais, teses, campos) e cacheia aqui, evitando injetar
-- texto cru (que estourava o contexto e trazia o cabeçalho do PROJUDI).
-- Idempotente e não-destrutivo.

ALTER TABLE public.chat_attachments
  ADD COLUMN IF NOT EXISTS summary text;

ALTER TABLE public.chat_attachments
  ADD COLUMN IF NOT EXISTS summary_generated_at timestamptz;

COMMENT ON COLUMN public.chat_attachments.summary IS
  'Resumo estruturado do documento (Canal A), gerado na 1a utilização e reusado. Fonte para injeção no N3 em vez do extracted_text cru.';
COMMENT ON COLUMN public.chat_attachments.summary_generated_at IS
  'Quando o summary foi gerado (cache). NULL = ainda não resumido.';
