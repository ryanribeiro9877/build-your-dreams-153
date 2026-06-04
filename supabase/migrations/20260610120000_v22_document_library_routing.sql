-- ============================================================================
-- V22 — Biblioteca compartilhada de modelos + roteamento por exclusividade
-- ============================================================================
-- Cria:
--   1. document_library (modelos tagueados, sem dono)
--   2. agent_document_links (ponte agente <-> modelo)
--   3. routing_exclusivities (exclusividade por reu)
--   4. Migra os 2 docs existentes de agent_documents para a nova estrutura
-- Idempotente: rodar 2x nao duplica.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Biblioteca compartilhada de modelos
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.document_library (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path    text,
  file_name       text NOT NULL,
  mime_type       text,
  file_size       integer,
  doc_type        text,
  categoria       text,
  reu_categoria   text,
  match_keywords  text[] DEFAULT '{}',
  content_cache   text,
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_library_doc_type
  ON public.document_library (doc_type) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_document_library_categoria
  ON public.document_library (categoria) WHERE is_active = true;

ALTER TABLE public.document_library ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "document_library_select"
    ON public.document_library FOR SELECT
    USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "document_library_insert"
    ON public.document_library FOR INSERT
    WITH CHECK (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'tech'::app_role)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "document_library_update"
    ON public.document_library FOR UPDATE
    USING (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'tech'::app_role)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "document_library_delete"
    ON public.document_library FOR DELETE
    USING (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'tech'::app_role)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Ponte agente <-> modelo
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_document_links (
  agent_id    uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.document_library(id) ON DELETE CASCADE,
  PRIMARY KEY (agent_id, document_id)
);

ALTER TABLE public.agent_document_links ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "agent_document_links_select"
    ON public.agent_document_links FOR SELECT
    USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "agent_document_links_insert"
    ON public.agent_document_links FOR INSERT
    WITH CHECK (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'tech'::app_role)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "agent_document_links_delete"
    ON public.agent_document_links FOR DELETE
    USING (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'tech'::app_role)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Exclusividade de roteamento por reu
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.routing_exclusivities (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reu_pattern text NOT NULL,
  owner_role  text NOT NULL,
  notes       text
);

ALTER TABLE public.routing_exclusivities ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "routing_exclusivities_select"
    ON public.routing_exclusivities FOR SELECT
    USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "routing_exclusivities_admin"
    ON public.routing_exclusivities FOR ALL
    USING (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'tech'::app_role)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seeds de exclusividade (idempotentes)
INSERT INTO public.routing_exclusivities (reu_pattern, owner_role, notes)
SELECT v.* FROM (VALUES
  ('%agiproteg%', 'socio', 'Exclusivo do socio'),
  ('%agibank%',   'socio', 'Exclusivo do socio'),
  ('%facta%',     'socio', 'Facta Seguros — exclusivo do socio')
) AS v(reu_pattern, owner_role, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM public.routing_exclusivities r WHERE r.reu_pattern = v.reu_pattern
);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Migracao dos 2 documentos existentes de agent_documents -> document_library
-- ────────────────────────────────────────────────────────────────────────────

-- Doc 1: Peticao Inicial 1 - Seguro SUSEP
INSERT INTO public.document_library (
  id, storage_path, file_name, mime_type, file_size,
  doc_type, categoria, reu_categoria, match_keywords, content_cache
)
SELECT
  gen_random_uuid(),
  ad.storage_path,
  ad.file_name,
  ad.mime_type,
  ad.file_size,
  'inexistencia_relacao_juridica',
  'seguro_susep',
  'seguradora',
  ARRAY['susep', 'seguro', 'seguradora', 'kovr', 'indenizacao'],
  NULL
FROM public.agent_documents ad
WHERE ad.id = '6787636e-e9e6-4abb-81d5-29291f91527d'
  AND NOT EXISTS (
    SELECT 1 FROM public.document_library dl
    WHERE dl.storage_path = ad.storage_path
  );

-- Doc 2: Peticao Geral - Inexistencia de relacao juridica
INSERT INTO public.document_library (
  id, storage_path, file_name, mime_type, file_size,
  doc_type, categoria, reu_categoria, match_keywords, content_cache
)
SELECT
  gen_random_uuid(),
  ad.storage_path,
  ad.file_name,
  ad.mime_type,
  ad.file_size,
  'inexistencia_relacao_juridica',
  'consignado_fraude',
  'banco',
  ARRAY['consignado', 'fraude', 'banco', 'rmc', 'rcc', 'inexistencia'],
  NULL
FROM public.agent_documents ad
WHERE ad.id = '0835194f-478f-4ead-9da0-d1db60f90841'
  AND NOT EXISTS (
    SELECT 1 FROM public.document_library dl
    WHERE dl.storage_path = ad.storage_path
  );

-- Criar links agente <-> modelo para o agente original (Especialista Confeccao Bancario)
INSERT INTO public.agent_document_links (agent_id, document_id)
SELECT '3e1548ac-925c-4444-9eb6-b5718f7ead3f', dl.id
FROM public.document_library dl
WHERE dl.storage_path IN (
  SELECT ad.storage_path FROM public.agent_documents ad
  WHERE ad.agent_id = '3e1548ac-925c-4444-9eb6-b5718f7ead3f'
)
ON CONFLICT (agent_id, document_id) DO NOTHING;

COMMIT;
