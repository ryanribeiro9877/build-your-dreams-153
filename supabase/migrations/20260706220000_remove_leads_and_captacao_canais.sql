-- Backfill de reconciliação repo↔banco
-- (schema_migrations version=20260706220000, name=remove_leads_and_captacao_canais).
--
-- ATENÇÃO: o SQL original NÃO foi registrado em schema_migrations (coluna
-- statements nula no banco). Este arquivo é uma RECONSTRUÇÃO fiel ao ESTADO
-- FINAL verificado em produção: leads, leads_funnel, lead_status,
-- leads_set_default_assignee e captacao_canais estão TODOS ausentes no banco.
--
-- Remove a frente de leads/captação (revertendo 20260706213833_leads_registration
-- e a tabela captacao_canais criada em 20260527120000_v14_lexforce_org_model).
-- Idempotente (IF EXISTS) e ordenado por dependência (view → tabela leads com
-- FK → função → enum → tabela captacao_canais).

DROP VIEW IF EXISTS public.leads_funnel;

-- leads: tem FK para captacao_canais + triggers + índices (caem junto com a tabela)
DROP TABLE IF EXISTS public.leads;

DROP FUNCTION IF EXISTS public.leads_set_default_assignee();

DROP TYPE IF EXISTS public.lead_status;

-- captacao_canais: já sem dependentes após remover leads (trigger + policies + seed
-- caem com a tabela).
DROP TABLE IF EXISTS public.captacao_canais;
