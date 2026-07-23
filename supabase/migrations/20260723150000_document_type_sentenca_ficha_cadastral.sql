-- ============================================================================
-- Classificação por conteúdo: amplia o CHECK de client_documents.document_type
-- ============================================================================
-- Os classificadores (visão + texto) passam a reconhecer sentenca, peticao e
-- ficha_cadastral. peticao mapeia para o já-existente 'peticao_inicial'; faltam
-- 'sentenca' e 'ficha_cadastral' no CHECK para o documento ir ao dossiê TIPADO
-- (mesmo sem item de checklist correspondente).
-- ============================================================================

ALTER TABLE public.client_documents DROP CONSTRAINT IF EXISTS client_documents_document_type_check;

ALTER TABLE public.client_documents ADD CONSTRAINT client_documents_document_type_check
  CHECK (document_type = ANY (ARRAY[
    'rg','cpf','comprovante','procuracao','contrato','termo_cooperado','outro',
    'comprovante_residencia','extrato_conta','extrato_ir','extrato_inss','cnis',
    'certidao','contrato_honorarios','declaracao_hipossuficiencia','audio_atendimento',
    'resumo_atendimento','transcricao_atendimento','peticao_inicial','minuta',
    'negativa_inss','laudo_medico','ctps','contracheque','documento_fiscal',
    'negativa_plano','comprovante_reajuste','reclame_aqui','sentenca_procedente',
    'sentenca','ficha_cadastral'
  ]::text[]));
