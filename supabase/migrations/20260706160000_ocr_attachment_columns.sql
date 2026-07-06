-- ============================================================================
-- OCR (Briefing 1) — colunas de auditoria em chat_attachments
-- ============================================================================
-- Aditiva e NÃO destrutiva: só adiciona metadados de OCR. NÃO toca em
-- extracted_text (já existe e continua sendo o texto lido). Rodar 2x é seguro.
--
--   ocr_engine     text     -- motor usado ("stub" | "textract" | ...)
--   ocr_confidence numeric  -- confiança geral do extrator (0..1)
--   ocr_fields     jsonb    -- campos estruturados (cpf/rg/nome/...) — vazio no stub
-- ============================================================================

BEGIN;

ALTER TABLE public.chat_attachments
  ADD COLUMN IF NOT EXISTS ocr_engine     text,
  ADD COLUMN IF NOT EXISTS ocr_confidence numeric,
  ADD COLUMN IF NOT EXISTS ocr_fields     jsonb;

COMMENT ON COLUMN public.chat_attachments.ocr_engine IS
  'Motor de OCR que populou extracted_text (stub/textract/...). Null = não passou por OCR.';
COMMENT ON COLUMN public.chat_attachments.ocr_confidence IS
  'Confiança geral (0..1) reportada pelo extrator de OCR.';
COMMENT ON COLUMN public.chat_attachments.ocr_fields IS
  'Campos estruturados extraídos pelo OCR (jsonb). Vazio no stub; preenchido no Briefing 2.';

COMMIT;
