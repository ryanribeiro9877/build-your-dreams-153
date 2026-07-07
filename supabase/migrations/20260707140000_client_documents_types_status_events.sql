-- ============================================================================
-- 3.6 — Documentos do cliente: tipos (CHECK) + status + origem + log de auditoria
-- Pré-requisito: R-9b (bucket `client-documents` já privado + policies escopadas
-- por is_recepcao_or_socio) — JÁ APLICADO.
--
-- Delta desta migration (aditivo/idempotente):
--   1. CHECK em document_type (vocabulário de tipos).
--   2. Colunas status / origem (com CHECK) + validated_by / validated_at.
--   3. Tabela de auditoria client_document_events (sobrevive à exclusão do doc:
--      FK ON DELETE SET NULL) + triggers de upload/exclusão/validação/status.
--   4. Policy de UPDATE (recepção/sócio) para mexer no status.
--
-- NÃO toca em R-2 (`_enc`/`cpf_bidx`) — client_documents não tem coluna PII.
-- A regra de "quais documentos são obrigatórios por ação" e o enforcement fino
-- de "quem valida" ficam para o card de Validação (fora de escopo aqui).
--
-- Decisão (reportada): o CHECK de document_type é um SUPERSET — inclui os tipos
-- obrigatórios mínimos do card (rg, cpf, comprovante, procuracao, contrato,
-- termo_cooperado, outro) E os tipos que o cadastro (ClientForm) e a UI já
-- emitem hoje (comprovante_residencia, extrato_conta, extrato_ir, extrato_inss,
-- cnis, certidao). Assim o vocabulário mínimo do card é garantido/enforceável
-- sem quebrar o fluxo de cadastro existente nem degradar documentos reais.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. document_type CHECK (vocabulário de tipos)
-- ---------------------------------------------------------------------------
ALTER TABLE public.client_documents
  DROP CONSTRAINT IF EXISTS client_documents_document_type_check;
ALTER TABLE public.client_documents
  ADD CONSTRAINT client_documents_document_type_check
  CHECK (document_type IN (
    -- obrigatórios mínimos do card
    'rg', 'cpf', 'comprovante', 'procuracao', 'contrato', 'termo_cooperado', 'outro',
    -- tipos já usados pelo cadastro / UI (mantidos para não quebrar)
    'comprovante_residencia', 'extrato_conta', 'extrato_ir', 'extrato_inss', 'cnis', 'certidao'
  ));

-- ---------------------------------------------------------------------------
-- 2. status / origem / validated_by / validated_at
-- ---------------------------------------------------------------------------
ALTER TABLE public.client_documents
  ADD COLUMN IF NOT EXISTS status       text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS origem       text,
  ADD COLUMN IF NOT EXISTS validated_by uuid,
  ADD COLUMN IF NOT EXISTS validated_at timestamptz;

ALTER TABLE public.client_documents
  DROP CONSTRAINT IF EXISTS client_documents_status_check;
ALTER TABLE public.client_documents
  ADD CONSTRAINT client_documents_status_check
  CHECK (status IN ('pendente', 'recebido', 'validado', 'rejeitado'));

ALTER TABLE public.client_documents
  DROP CONSTRAINT IF EXISTS client_documents_origem_check;
ALTER TABLE public.client_documents
  ADD CONSTRAINT client_documents_origem_check
  CHECK (origem IS NULL OR origem IN ('cliente', 'recepcao', 'advogado', 'sistema', 'import', 'ocr'));

-- ---------------------------------------------------------------------------
-- 3. Tabela de auditoria — sobrevive à exclusão do documento
--    (FK document_id ON DELETE SET NULL; details denormaliza nome/tipo).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_document_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES public.client_documents(id) ON DELETE SET NULL,
  client_id   uuid NOT NULL,
  event       text NOT NULL CHECK (event IN ('upload', 'exclusao', 'validacao', 'rejeicao', 'status_change')),
  actor       uuid,
  at          timestamptz NOT NULL DEFAULT now(),
  details     jsonb
);

CREATE INDEX IF NOT EXISTS idx_cde_document ON public.client_document_events(document_id);
CREATE INDEX IF NOT EXISTS idx_cde_client   ON public.client_document_events(client_id, at DESC);

ALTER TABLE public.client_document_events ENABLE ROW LEVEL SECURITY;

-- SELECT via is_recepcao_or_socio(); INSERT só via trigger (SECURITY DEFINER),
-- nunca pela app — não há policy de INSERT/UPDATE/DELETE.
DROP POLICY IF EXISTS "Recepcao/socio can view doc events" ON public.client_document_events;
CREATE POLICY "Recepcao/socio can view doc events" ON public.client_document_events
  FOR SELECT TO authenticated
  USING (is_recepcao_or_socio());

-- ---------------------------------------------------------------------------
-- 3b. Trigger de log (AFTER INSERT/DELETE/UPDATE OF status)
--     SECURITY DEFINER para inserir no log apesar da ausência de policy de INSERT.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_client_document_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.client_document_events (document_id, client_id, event, actor, details)
    VALUES (NEW.id, NEW.client_id, 'upload', auth.uid(),
      jsonb_build_object(
        'document_name', NEW.document_name,
        'document_type', NEW.document_type,
        'origem', NEW.origem,
        'status', NEW.status));
    RETURN NEW;

  ELSIF (TG_OP = 'DELETE') THEN
    -- document_id fica NULL (FK SET NULL); nome/tipo denormalizados em details
    -- para o log continuar legível após a exclusão do documento.
    INSERT INTO public.client_document_events (document_id, client_id, event, actor, details)
    VALUES (NULL, OLD.client_id, 'exclusao', auth.uid(),
      jsonb_build_object(
        'document_name', OLD.document_name,
        'document_type', OLD.document_type,
        'file_path', OLD.file_path));
    RETURN OLD;

  ELSIF (TG_OP = 'UPDATE') THEN
    IF (NEW.status IS DISTINCT FROM OLD.status) THEN
      IF (NEW.status = 'validado') THEN
        INSERT INTO public.client_document_events (document_id, client_id, event, actor, details)
        VALUES (NEW.id, NEW.client_id, 'validacao', auth.uid(),
          jsonb_build_object('from', OLD.status, 'to', NEW.status));
      ELSIF (NEW.status = 'rejeitado') THEN
        INSERT INTO public.client_document_events (document_id, client_id, event, actor, details)
        VALUES (NEW.id, NEW.client_id, 'rejeicao', auth.uid(),
          jsonb_build_object('from', OLD.status, 'to', NEW.status));
      ELSE
        INSERT INTO public.client_document_events (document_id, client_id, event, actor, details)
        VALUES (NEW.id, NEW.client_id, 'status_change', auth.uid(),
          jsonb_build_object('from', OLD.status, 'to', NEW.status));
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_client_documents_log_ins ON public.client_documents;
CREATE TRIGGER trg_client_documents_log_ins
  AFTER INSERT ON public.client_documents
  FOR EACH ROW EXECUTE FUNCTION public.log_client_document_event();

DROP TRIGGER IF EXISTS trg_client_documents_log_del ON public.client_documents;
CREATE TRIGGER trg_client_documents_log_del
  AFTER DELETE ON public.client_documents
  FOR EACH ROW EXECUTE FUNCTION public.log_client_document_event();

DROP TRIGGER IF EXISTS trg_client_documents_log_upd ON public.client_documents;
CREATE TRIGGER trg_client_documents_log_upd
  AFTER UPDATE OF status ON public.client_documents
  FOR EACH ROW EXECUTE FUNCTION public.log_client_document_event();

-- ---------------------------------------------------------------------------
-- 3c. Carimbo de validação: preenche validated_by/at quando o status vira
--     validado/rejeitado, por qualquer caminho (defensivo — não depende da app).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stamp_client_document_validation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.status IS DISTINCT FROM OLD.status) AND NEW.status IN ('validado', 'rejeitado') THEN
    NEW.validated_by := auth.uid();
    NEW.validated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_client_documents_stamp_validation ON public.client_documents;
CREATE TRIGGER trg_client_documents_stamp_validation
  BEFORE UPDATE OF status ON public.client_documents
  FOR EACH ROW EXECUTE FUNCTION public.stamp_client_document_validation();

-- ---------------------------------------------------------------------------
-- 4. Policy de UPDATE (recepção/sócio) — hoje não existia UPDATE.
--    Enforcement fino de "quem valida" (validado/rejeitado só advogado/sócio)
--    fica para o card de Validação.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Recepcao can update documents" ON public.client_documents;
CREATE POLICY "Recepcao can update documents" ON public.client_documents
  FOR UPDATE TO authenticated
  USING (is_recepcao_or_socio())
  WITH CHECK (is_recepcao_or_socio());

COMMIT;
