-- TRILHA C · 6.3 — seed de allowed_tools para a tool `solicitar_checklist_documental`.
-- Achado da validação: a tool estava em 0 dos 41 agentes; o gate do edge
-- (chat-orchestrator: gatedToolNames filtra n3.allowed_tools) nunca a ofereceria,
-- então ligar a flag CHAT_DOC_CHECKLIST_ENABLED sem este seed é no-op.
--
-- Espelha EXATAMENTE o conjunto que já possui `criar_pendencia` (a primitiva que o
-- checklist encapsula, uma pendência por documento) — mesma decisão de RBAC do
-- "broaden" de 20260630160000: qualquer especialista/monitor não-redator que o
-- roteador escolha num atendimento consegue de fato chamar a tool.
--
-- Aditivo e idempotente (array_agg DISTINCT). allowed_tools é lido em runtime pelo
-- edge → efeito imediato, sem redeploy. INERTE enquanto CHAT_DOC_CHECKLIST_ENABLED
-- estiver OFF: o gate só libera a tool quando a flag ligar.

UPDATE public.agents SET allowed_tools = (
  SELECT array_agg(DISTINCT t)
  FROM unnest(allowed_tools || ARRAY['solicitar_checklist_documental']) t
) WHERE 'criar_pendencia' = ANY(allowed_tools);
