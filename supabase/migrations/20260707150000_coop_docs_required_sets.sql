-- ============================================================================
-- COOP-DOCS-1 — Tipos novos + conjunto obrigatório do cooperado
-- Fatia 1 de 3 do fluxo de cadastro de cooperado.
-- Pré-requisito: 3.6 (client_documents: CHECK de document_type + status/origem +
-- auditoria) — JÁ APLICADO em 20260707140000.
--
-- Delta desta migration (aditivo/idempotente):
--   1. Estende o CHECK de document_type com 2 tipos novos
--      (contrato_honorarios, declaracao_hipossuficiencia), preservando TODOS os
--      valores atuais.
--   2. required_document_sets — o "checklist por ação" como DADO (não hardcode
--      no front): quais document_type são obrigatórios para cada set_code.
--      Seed com os 7 do conjunto `cooperado`. RLS de leitura por recepção/sócio.
--   3. client_cooperado_checklist(client_id) — view/RPC de conveniência que
--      cruza required_document_sets × client_documents e devolve, para cada um
--      dos 7, o status atual (ausente/pendente/recebido/validado/rejeitado).
--
-- Escopo (o que NÃO faz — decisão do briefing):
--   • Geração dos documentos (Fatia 2).
--   • Formulário no chat + tools do agente (Fatia 3).
--   • Enforcement de bloqueio: definir o conjunto ≠ impor a trava. Nada aqui
--     impede cadastro/edição por documento faltante. A trava (ex.: não deixar
--     virar cooperado ativo sem os 7 validados) fica para o card de Validação.
--   • R-2 intacto: client_documents não tem PII; bucket não é tocado.
--
-- Decisão (reportada): a "Ficha cadastral de Cooperado" É o termo_cooperado
-- (reuso, não tipo novo). procuracao já existia. Só contrato_honorarios e
-- declaracao_hipossuficiencia são tipos novos.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. document_type CHECK — recria incluindo os 2 tipos novos, preservando
--    todos os valores do 3.6 (superset). Mantém a ordem/comentário do 3.6.
-- ---------------------------------------------------------------------------
ALTER TABLE public.client_documents
  DROP CONSTRAINT IF EXISTS client_documents_document_type_check;
ALTER TABLE public.client_documents
  ADD CONSTRAINT client_documents_document_type_check
  CHECK (document_type IN (
    -- obrigatórios mínimos do card (3.6)
    'rg', 'cpf', 'comprovante', 'procuracao', 'contrato', 'termo_cooperado', 'outro',
    -- tipos já usados pelo cadastro / UI (3.6)
    'comprovante_residencia', 'extrato_conta', 'extrato_ir', 'extrato_inss', 'cnis', 'certidao',
    -- COOP-DOCS-1: tipos do conjunto cooperado
    'contrato_honorarios', 'declaracao_hipossuficiencia'
  ));

-- ---------------------------------------------------------------------------
-- 2. required_document_sets — "checklist por ação" como dado.
--    Quando o escritório mudar os obrigatórios, é UPDATE de dado, não deploy.
--    O card de Validação (futuro) lê daqui.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.required_document_sets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_code      text    NOT NULL,
  document_type text    NOT NULL,
  required      boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,
  UNIQUE (set_code, document_type)
);

COMMENT ON TABLE public.required_document_sets IS
  'Checklist por ação: quais document_type são obrigatórios para cada set_code (ex.: cooperado). Dado, não hardcode.';

CREATE INDEX IF NOT EXISTS idx_rds_set_code ON public.required_document_sets(set_code, sort_order);

ALTER TABLE public.required_document_sets ENABLE ROW LEVEL SECURITY;

-- SELECT por recepção/sócio (mesmo gate do 3.6). Sem policies de escrita: o
-- conjunto é gerido por migration/admin — a app não insere/edita/apaga.
DROP POLICY IF EXISTS "Recepcao/socio can view required document sets" ON public.required_document_sets;
CREATE POLICY "Recepcao/socio can view required document sets" ON public.required_document_sets
  FOR SELECT TO authenticated
  USING (is_recepcao_or_socio());

-- ---------------------------------------------------------------------------
-- 2b. Seed do conjunto `cooperado` — 7 documentos, todos obrigatórios.
--     Base (3, do 3.6): rg · cpf · comprovante
--     Cooperado (4): contrato_honorarios · declaracao_hipossuficiencia ·
--                    termo_cooperado (ficha cadastral) · procuracao
--     Idempotente via ON CONFLICT (set_code, document_type).
-- ---------------------------------------------------------------------------
INSERT INTO public.required_document_sets (set_code, document_type, required, sort_order) VALUES
  ('cooperado', 'rg',                        true, 1),
  ('cooperado', 'cpf',                       true, 2),
  ('cooperado', 'comprovante',               true, 3),
  ('cooperado', 'contrato_honorarios',       true, 4),
  ('cooperado', 'declaracao_hipossuficiencia', true, 5),
  ('cooperado', 'termo_cooperado',           true, 6),
  ('cooperado', 'procuracao',                true, 7)
ON CONFLICT (set_code, document_type) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. client_cooperado_checklist(client_id) — estado do conjunto para um cliente.
--    Para cada documento do conjunto `cooperado`, devolve o status atual:
--      ausente   → o cliente não tem nenhum documento desse tipo
--      caso haja → o "melhor" status entre os documentos desse tipo
--                  (validado > recebido > pendente > rejeitado)
--    SECURITY INVOKER (default): respeita a RLS do chamador — required_document_sets
--    (recepção/sócio) e client_documents. Quem não enxerga o conjunto recebe vazio.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.client_cooperado_checklist(p_client_id uuid)
RETURNS TABLE (
  set_code      text,
  document_type text,
  required      boolean,
  sort_order    integer,
  status        text,
  document_id   uuid,
  validated_at  timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    s.set_code,
    s.document_type,
    s.required,
    s.sort_order,
    COALESCE(d.status, 'ausente') AS status,
    d.id                          AS document_id,
    d.validated_at
  FROM public.required_document_sets s
  LEFT JOIN LATERAL (
    SELECT cd.id, cd.status, cd.validated_at
    FROM public.client_documents cd
    WHERE cd.client_id = p_client_id
      AND cd.document_type = s.document_type
    ORDER BY
      CASE cd.status
        WHEN 'validado'  THEN 4
        WHEN 'recebido'  THEN 3
        WHEN 'pendente'  THEN 2
        WHEN 'rejeitado' THEN 1
        ELSE 0
      END DESC,
      cd.validated_at DESC NULLS LAST,
      cd.created_at   DESC
    LIMIT 1
  ) d ON true
  WHERE s.set_code = 'cooperado'
  ORDER BY s.sort_order, s.document_type;
$$;

GRANT EXECUTE ON FUNCTION public.client_cooperado_checklist(uuid) TO authenticated;

COMMIT;
