-- ============================================================================
-- ESPELHO de migração já aplicada em produção via Supabase MCP.
-- NÃO REEXECUTAR — versionamento/histórico apenas. (Aplicada em 2 passos:
-- ocr_client_document_wiring + ocr_apply_fields_isolate_errors; consolidados
-- aqui no estado FINAL.)
--
-- FIX-OCR-WIRING — liga o OCR à aba Documentos (client_documents), que até
-- então nunca chamava OCR (a edge ocr-attachment servia só o fluxo de CHAT).
--
-- Peças (backend):
--   1. RPC apply_ocr_client_fields: auto-preenche SÓ campos vazios do cadastro
--      (o edge só passa campos com needsReview=false). CPF/RG cifrados
--      server-side (pii_encrypt); colunas de TEXTO de PII nunca são tocadas.
--      Cada campo é isolado em seu próprio bloco EXCEPTION — uma colisão de CPF
--      (constraint clients_cpf_bidx_uniq, i.e. cliente duplicado) ou data
--      inválida apenas PULA aquele campo; os demais seguem.
--   2. Config em edge_runtime_secrets: OCR_ENABLED=true, OCR_ENGINE=openai-vision,
--      OCR_VISION_MODEL=gpt-4o-mini + segredo interno OCR_INTERNAL_SECRET.
--   3. Trigger AFTER INSERT (7º de client_documents; NÃO toca os 6 existentes):
--      dispara a edge ocr-client-document via net.http_post para documento de
--      IMAGEM com notes vazio. Engole erros (nunca quebra o upload). Idempotente.
--
-- Complementa (fora deste .sql): a edge nova supabase/functions/ocr-client-document
-- e o novo motor _shared/ocr/openaiVisionExtractor.ts (engine "openai-vision",
-- usa a chave OpenAI do projeto — sem AWS).
--
-- GATE: R-9 + DPA declarados fechados pelo Ryan (autorização explícita) — por
-- isso OCR_ENABLED passa a "true". A imagem trafega à OpenAI DIRETO (mesmo canal
-- já abençoado; assertOpenAiDirect recusa modelo com "/").
--
-- Validado em produção (2026-07-16): doc de teste do João → notes preenchido +
-- linha em ai_generations (openai/gpt-4o-mini, status ok); trigger AUTO dispara
-- em INSERT de imagem; apply só-se-vazio preserva dado humano e pula CPF
-- colidente sem quebrar.
-- ============================================================================

-- 1. RPC de auto-preenchimento (só-se-vazio, erro isolado por campo) ----------
CREATE OR REPLACE FUNCTION public.apply_ocr_client_fields(p_client_id uuid, p_fields jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_applied int := 0;
  v_txt_cols text[] := ARRAY[
    'rg_issuer','rg_uf','mother_name','father_name','nationality',
    'gender','marital_status','address','city','state','zip_code'
  ];
  v_col text; v_val text; v_n int;
BEGIN
  IF p_client_id IS NULL OR p_fields IS NULL THEN RETURN 0; END IF;

  FOREACH v_col IN ARRAY v_txt_cols LOOP
    v_val := NULLIF(btrim(p_fields->>v_col), '');
    IF v_val IS NOT NULL THEN
      BEGIN
        EXECUTE format(
          'UPDATE public.clients SET %I = $1 WHERE id = $2 AND COALESCE(%I,'''') = ''''',
          v_col, v_col
        ) USING v_val, p_client_id;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        v_applied := v_applied + v_n;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END LOOP;

  v_val := NULLIF(btrim(p_fields->>'birth_date'), '');
  IF v_val IS NOT NULL THEN
    BEGIN
      UPDATE public.clients SET birth_date = to_date(v_val, 'DD/MM/YYYY')
        WHERE id = p_client_id AND birth_date IS NULL;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_applied := v_applied + v_n;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  -- CPF cifrado: só-se-vazio. Colisão de unicidade (mesmo CPF em outro cliente)
  -- ou qualquer erro apenas PULA (não afirma, não quebra).
  v_val := NULLIF(btrim(p_fields->>'cpf'), '');
  IF v_val IS NOT NULL THEN
    BEGIN
      UPDATE public.clients
        SET cpf_enc = public.pii_encrypt(v_val), cpf_bidx = public.pii_bidx(v_val)
        WHERE id = p_client_id AND cpf_enc IS NULL;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_applied := v_applied + v_n;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  v_val := NULLIF(btrim(p_fields->>'rg'), '');
  IF v_val IS NOT NULL THEN
    BEGIN
      UPDATE public.clients SET rg_enc = public.pii_encrypt(v_val)
        WHERE id = p_client_id AND rg_enc IS NULL;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_applied := v_applied + v_n;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN v_applied;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_ocr_client_fields(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_ocr_client_fields(uuid, jsonb) TO service_role;

COMMENT ON FUNCTION public.apply_ocr_client_fields(uuid, jsonb) IS
  'FIX-OCR-WIRING: auto-preenche SÓ campos vazios do cadastro a partir do OCR '
  '(needsReview=false filtrado no edge). CPF/RG cifrados server-side; colunas de '
  'texto de PII nunca são tocadas. Erro por campo é isolado. Retorna nº aplicados.';

-- 2. Config + segredo interno (edge_runtime_secrets) -------------------------
INSERT INTO public.edge_runtime_secrets (key, value) VALUES
  ('OCR_ENABLED', 'true'),
  ('OCR_ENGINE', 'openai-vision'),
  ('OCR_VISION_MODEL', 'gpt-4o-mini')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

INSERT INTO public.edge_runtime_secrets (key, value)
VALUES ('OCR_INTERNAL_SECRET', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;

-- 3. Trigger AUTO (AFTER INSERT) — 7º trigger de client_documents ------------
CREATE OR REPLACE FUNCTION public.trg_client_documents_ocr()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE v_secret text; v_enabled text;
BEGIN
  BEGIN
    IF NEW.file_path !~* '\.(png|jpe?g|webp|gif|bmp)$' THEN RETURN NEW; END IF;
    IF NEW.notes IS NOT NULL AND btrim(NEW.notes) <> '' THEN RETURN NEW; END IF;
    SELECT value INTO v_enabled FROM public.edge_runtime_secrets WHERE key = 'OCR_ENABLED';
    IF COALESCE(lower(btrim(v_enabled)), '') <> 'true' THEN RETURN NEW; END IF;
    SELECT value INTO v_secret FROM public.edge_runtime_secrets WHERE key = 'OCR_INTERNAL_SECRET';
    IF v_secret IS NULL THEN RETURN NEW; END IF;

    PERFORM net.http_post(
      url := 'https://tsltxvswzdnlmvljpryh.supabase.co/functions/v1/ocr-client-document',
      headers := jsonb_build_object('Content-Type', 'application/json', 'X-OCR-Secret', v_secret),
      body := jsonb_build_object('documentId', NEW.id)
    );
  EXCEPTION WHEN OTHERS THEN NULL; -- nunca quebra o upload por causa do OCR
  END;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_client_documents_ocr ON public.client_documents;
CREATE TRIGGER trg_client_documents_ocr
  AFTER INSERT ON public.client_documents
  FOR EACH ROW EXECUTE FUNCTION public.trg_client_documents_ocr();

REVOKE ALL ON FUNCTION public.trg_client_documents_ocr() FROM PUBLIC, anon;
