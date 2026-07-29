-- ============================================================================
-- ESPELHO de migração JÁ APLICADA em produção (29/07/2026). NÃO rodar `db push`.
-- Recuperada verbatim de supabase_migrations.schema_migrations.statements[1]
-- (version 20260729141531), então bate byte a byte com o que está no ar.
-- ============================================================================

-- Motores 2 e 3 — vocabulário de pendencia_tipo ampliado (aditivo).
-- O check user_tasks_pendencia_tipo_chk nasceu com os tipos do Kanban original;
-- os cards 6–10 criam pendências de tipos novos e o INSERT caía em 23514
-- (mesma classe do origem='chat' em client_documents, pega na prova de 29/07).
-- Nenhuma linha existente afetada — só adiciona valores.
ALTER TABLE public.user_tasks DROP CONSTRAINT user_tasks_pendencia_tipo_chk;
ALTER TABLE public.user_tasks ADD CONSTRAINT user_tasks_pendencia_tipo_chk
  CHECK (pendencia_tipo IS NULL OR pendencia_tipo = ANY (ARRAY[
    'documentacao','comprovante_endereco','senha_inss','reset_inss','extratos',
    'falta_documentacao','audiencia','reuniao','andamento','whatsapp','ligacao','outro',
    -- Card 6
    'reclamacao_administrativa',
    -- Card 7
    'recuperacao_senha_gov','conversao_conta_gov',
    -- Card 8
    'alvara',
    -- Card 9
    'revisao_execucao',
    -- Card 10
    'prazo_embargos','prazo_recurso','prazo_pagamento_execucao','sugestao_ajuizar_execucao'
  ]));
