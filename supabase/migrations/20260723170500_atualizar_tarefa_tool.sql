-- ============================================================================
-- Onda 1.1 — cadastro da tool atualizar_tarefa (tool_catalog + agent_tools)
-- ============================================================================
-- A concessão via agent_tools dispara trg_sync_agent_allowed_tools, que
-- reconstrói agents.allowed_tools. O schema function-calling espelha o registry
-- do chat-orchestrator (fonte que vai ao LLM).
-- ============================================================================

INSERT INTO public.tool_catalog (code, display_name, description, category, tool_schema, is_active)
VALUES (
  'atualizar_tarefa',
  'Atualizar Tarefa/Card',
  'Move ou edita um card/tarefa do Kanban que já existe (status, prazo, prioridade ou título).',
  'acao',
  '{"name":"atualizar_tarefa","description":"Move ou edita um card/tarefa do Kanban que JÁ existe (status, prazo, prioridade ou título). Resolva o card ANTES com consultar_tarefas e passe task_id. NÃO cria tarefa nova.","parameters":{"type":"object","required":["task_id"],"properties":{"task_id":{"type":"string","description":"id do card (obtido via consultar_tarefas)"},"task_titulo":{"type":"string","description":"título do card, apenas para exibição na confirmação"},"status":{"type":"string","description":"novo status: a fazer, em andamento, bloqueada, aguardando validação, concluída ou cancelada"},"prazo":{"type":"string","description":"novo prazo em ISO 8601 (fuso America/Bahia); não pode ser passado"},"prioridade":{"type":"string","description":"nova prioridade: crítica, alta, média ou baixa"},"novo_titulo":{"type":"string","description":"novo título do card (renomear)"}}}}'::jsonb,
  true
)
ON CONFLICT (code) DO UPDATE
  SET display_name = EXCLUDED.display_name, description = EXCLUDED.description,
      category = EXCLUDED.category, tool_schema = EXCLUDED.tool_schema, is_active = true;

-- Concede ao Especialista Kanban de Pendências (o trigger sincroniza allowed_tools).
INSERT INTO public.agent_tools (agent_id, tool_id, enabled)
SELECT a.id, tc.id, true
FROM public.agents a
JOIN public.tool_catalog tc ON tc.code = 'atualizar_tarefa'
WHERE a.role = 'specialist' AND a.name ILIKE '%kanban%'
ON CONFLICT (agent_id, tool_id) DO NOTHING;
