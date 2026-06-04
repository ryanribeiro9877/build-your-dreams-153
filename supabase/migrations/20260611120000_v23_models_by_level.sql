-- ============================================================================
-- V23 — Modelos por nivel hierarquico (orquestracao N1->N2->N3)
-- ============================================================================
-- N1 (assistant_root) e N2 (director) sao ROTEADORES/VALIDADORES: usam um modelo
-- RAPIDO e barato (gpt-4o-mini). N3 (specialist/monitor/executor) EXECUTA/redige:
-- usa um modelo de QUALIDADE mas rapido (gpt-4o).
--
-- Motivo: gpt-5.5 (flagship reasoning) leva >115s para gerar uma peticao,
-- estourando o limite do Edge Function. Modelos da serie GPT-5/o sao lentos
-- demais para o fluxo de chat interativo. Ver patch V22 (orchestrator gotchas).
-- Idempotente.
-- ============================================================================

BEGIN;

-- Catalogo de templates: provider openai + modelo por role
UPDATE public.agent_templates
SET default_provider = 'openai', default_model = 'gpt-4o-mini'
WHERE role IN ('assistant_root', 'director', 'ceo', 'manager');

UPDATE public.agent_templates
SET default_provider = 'openai', default_model = 'gpt-4o'
WHERE role IN ('specialist', 'monitor', 'executor', 'reviewer', 'orchestrator');

-- Agentes ja instanciados (pessoais) — alinha com o nivel
UPDATE public.agents
SET provider = 'openai', model = 'gpt-4o-mini'
WHERE is_personal = true
  AND role IN ('assistant_root', 'director', 'ceo', 'manager');

UPDATE public.agents
SET provider = 'openai', model = 'gpt-4o'
WHERE is_personal = true
  AND role IN ('specialist', 'monitor', 'executor', 'reviewer', 'orchestrator');

COMMIT;
