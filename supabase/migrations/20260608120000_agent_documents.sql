-- ============================================================================
-- Agent Documents — arquivos de referência (markdown, txt, pdf) na memória
-- do agente para uso como base de conhecimento nas conversas.
-- ============================================================================

-- Bucket de storage para os arquivos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'agent-documents',
  'agent-documents',
  false,
  10485760, -- 10 MB
  ARRAY[
    'text/plain',
    'text/markdown',
    'text/x-markdown',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Tabela de metadados
CREATE TABLE IF NOT EXISTS public.agent_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  uploader_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  storage_path text NOT NULL,
  file_name   text NOT NULL,
  file_size   integer NOT NULL DEFAULT 0,
  mime_type   text,
  description text,
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_documents_agent ON public.agent_documents(agent_id);

-- RLS
ALTER TABLE public.agent_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_documents_select"
  ON public.agent_documents FOR SELECT
  USING (true);

CREATE POLICY "agent_documents_insert"
  ON public.agent_documents FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "agent_documents_update"
  ON public.agent_documents FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "agent_documents_delete"
  ON public.agent_documents FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- Storage RLS
CREATE POLICY "agent_docs_storage_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'agent-documents' AND auth.uid() IS NOT NULL);

CREATE POLICY "agent_docs_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'agent-documents' AND auth.uid() IS NOT NULL);

CREATE POLICY "agent_docs_storage_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'agent-documents' AND auth.uid() IS NOT NULL);
