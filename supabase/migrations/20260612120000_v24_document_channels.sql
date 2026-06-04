-- ============================================================================
-- V24 — Canais de documento para os agentes lerem de fato
-- ============================================================================
-- Canal A (DOCUMENTOS DO CASO): anexos da conversa = fonte autoritativa de
--   nome/CPF/endereço/valores/contrato da parte. Nova tabela chat_attachments
--   + bucket dedicado chat-attachments + RLS (privado do dono da sessão).
-- Canal B (MODELOS DE REFERÊNCIA): document_library já existe; aqui apenas
--   reconciliamos o acervo: desativamos as duplicatas SEM texto (sobras da
--   migração V22) deixando ativas só as versões COM content_cache. A "aba
--   Markdown" (agent_documents) é APOSENTADA — a UI passa a ler document_library
--   + agent_document_links (mudança no frontend). Nada é apagado destrutivamente.
-- Idempotente: rodar 2x não duplica nem quebra.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- Canal A · 1. Bucket dedicado para anexos de conversa (privado)
-- Sem allowed_mime_types: documentos do caso podem ser PDF, docx, txt, md e
-- também imagens (RG/comprovante escaneado). Extração de texto só cobre os 4
-- tipos textuais; imagens sobem com extracted_text nulo (sinalizado na UI).
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('chat-attachments', 'chat-attachments', false, 15728640) -- 15 MB
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- Canal A · 2. Tabela de anexos do chat (documentos do caso)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_attachments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     uuid REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  message_id     uuid,                 -- mensagem que trouxe o anexo (nullable)
  user_id        uuid,
  storage_path   text NOT NULL,
  file_name      text NOT NULL,
  mime_type      text,
  file_size      integer,
  extracted_text text,                 -- texto extraído na ingestão (nullable)
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_attachments_session
  ON public.chat_attachments (session_id) WHERE is_active = true;

ALTER TABLE public.chat_attachments ENABLE ROW LEVEL SECURITY;

-- RLS: anexo é privado do dono da sessão (chat_sessions.user_id) + admin/tech.
DO $$ BEGIN
  CREATE POLICY "chat_attachments_select"
    ON public.chat_attachments FOR SELECT
    USING (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.chat_sessions s
        WHERE s.id = chat_attachments.session_id AND s.user_id = auth.uid()
      )
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'tech'::app_role)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "chat_attachments_insert"
    ON public.chat_attachments FOR INSERT
    WITH CHECK (
      auth.uid() IS NOT NULL
      AND (
        user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.chat_sessions s
          WHERE s.id = chat_attachments.session_id AND s.user_id = auth.uid()
        )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "chat_attachments_update"
    ON public.chat_attachments FOR UPDATE
    USING (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.chat_sessions s
        WHERE s.id = chat_attachments.session_id AND s.user_id = auth.uid()
      )
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'tech'::app_role)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- Canal A · 3. Storage RLS do bucket chat-attachments
-- Mesmo padrão dos demais buckets do projeto (qualquer usuário autenticado).
-- ────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE POLICY "chat_attach_storage_select"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'chat-attachments' AND auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "chat_attach_storage_insert"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'chat-attachments' AND auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "chat_attach_storage_delete"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'chat-attachments' AND auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- Canal B · 4. Reconciliação do acervo de modelos (não destrutivo)
-- Desativa duplicatas SEM texto quando existe a MESMA peça COM texto, e remove
-- os vínculos dessas duplicatas (evita seleção/exibição duplicada). Genérico e
-- idempotente — não depende de IDs fixos.
-- ────────────────────────────────────────────────────────────────────────────
UPDATE public.document_library dup
SET is_active = false, updated_at = now()
WHERE coalesce(length(dup.content_cache), 0) = 0
  AND dup.is_active = true
  AND EXISTS (
    SELECT 1 FROM public.document_library withtext
    WHERE withtext.file_name = dup.file_name
      AND withtext.id <> dup.id
      AND withtext.is_active = true
      AND coalesce(length(withtext.content_cache), 0) > 0
  );

DELETE FROM public.agent_document_links l
USING public.document_library dl
WHERE l.document_id = dl.id
  AND dl.is_active = false
  AND coalesce(length(dl.content_cache), 0) = 0;

-- Backfill: a classificação (doc_type/categoria/reu_categoria/keywords) vivia nas
-- linhas V22 (agora desativadas); copia para os modelos COM texto (re-upload) que
-- ficaram sem metadados, casando por file_name. Necessário para a seleção do N3.
UPDATE public.document_library tgt
SET doc_type       = src.doc_type,
    categoria      = src.categoria,
    reu_categoria  = src.reu_categoria,
    match_keywords = CASE WHEN coalesce(array_length(tgt.match_keywords,1),0) = 0
                          THEN src.match_keywords ELSE tgt.match_keywords END,
    updated_at     = now()
FROM public.document_library src
WHERE tgt.file_name = src.file_name
  AND tgt.is_active = true
  AND coalesce(length(tgt.content_cache),0) > 0
  AND src.is_active = false
  AND tgt.doc_type IS NULL
  AND src.doc_type IS NOT NULL;

COMMIT;

-- ============================================================================
-- NOTA DE APOSENTADORIA — agent_documents
-- A tabela public.agent_documents NÃO é dropada (preserva histórico). A partir
-- do V24 a "aba Markdown" lê/grava em document_library + agent_document_links.
-- As linhas remanescentes de agent_documents (fb778f89, a1a39b43) já têm o
-- correspondente COM texto em document_library (mesmo storage_path) e já estão
-- vinculadas ao agente, então a aba continua exibindo as mesmas peças sem perda.
-- ============================================================================
