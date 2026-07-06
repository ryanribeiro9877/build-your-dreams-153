-- ============================================================================
-- [REMOVE-LEADS] Remoção da feature de leads + tabela `captacao_canais`
-- ----------------------------------------------------------------------------
-- Decisão de escopo: o sistema cadastra CLIENTES, não "leads". A origem ("como
-- o cliente chegou") já vive no cadastro do cliente (`clients`). A feature de
-- leads (PR #41) e a tabela redundante `captacao_canais` (semeada em 27/mai)
-- são removidas por completo.
--
-- Migration FORWARD de remoção (não editamos as migrations antigas que criaram
-- estes objetos — isso geraria drift). Bloco isolado, verificado no banco:
--   * leads: 0 linhas; captacao_canais: 3 linhas (seeds)
--   * única FK para captacao_canais é leads.canal_id
--   * lead_status usado só por leads/leads_funnel; captacao_canal_tipo só por
--     captacao_canais.tipo
--   * nenhum consumidor externo (front sem tela/hook; só tipos gerados)
--
-- INVARIANTE: NÃO toca em `clients` nem no cadastro do cliente. O campo de
-- origem do cliente permanece — é onde a origem vive agora.
-- ============================================================================

BEGIN;

-- Feature de leads (PR #41) ---------------------------------------------------
DROP VIEW IF EXISTS public.leads_funnel;
-- DROP TABLE remove junto: triggers (trg_leads_updated, trg_leads_default_assignee),
-- índices e a FK leads_canal_id_fkey.
DROP TABLE IF EXISTS public.leads;
-- Função de trigger da distribuição padrão (já sem gatilhos após o DROP TABLE).
DROP FUNCTION IF EXISTS public.leads_set_default_assignee();
DROP TYPE IF EXISTS public.lead_status;

-- captacao_canais (redundante) + enum usado apenas por ela --------------------
-- DROP TABLE remove junto o trigger trg_captacao_canais_updated e as policies.
DROP TABLE IF EXISTS public.captacao_canais;
DROP TYPE IF EXISTS public.captacao_canal_tipo;

COMMIT;

-- ============================================================================
-- Fim. clients / R-2 (cripto) / OCR / chat-orchestrator intocados.
-- ============================================================================
