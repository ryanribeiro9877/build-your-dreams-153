-- ============================================================================
-- Onda 1.2 — cadastro da tool comentar_card (backend add_task_comment PRONTO)
-- ============================================================================
-- Sem RPC nova: usa add_task_comment(p_task_id, p_body), que já tem gate
-- kanban_can_edit_task + rejeita comentário vazio. Só cadastra a tool e concede.
-- ============================================================================

INSERT INTO public.tool_catalog (code, display_name, description, category, tool_schema, is_active)
VALUES (
  'comentar_card',
  'Comentar em Card',
  'Adiciona um comentário a um card/tarefa do Kanban.',
  'acao',
  '{"name":"comentar_card","description":"Adiciona um comentário a um card/tarefa do Kanban. Resolva o card ANTES com consultar_tarefas e passe task_id.","parameters":{"type":"object","required":["task_id","comentario"],"properties":{"task_id":{"type":"string","description":"id do card (obtido via consultar_tarefas)"},"task_titulo":{"type":"string","description":"título do card — apenas para exibição na confirmação"},"comentario":{"type":"string","description":"texto do comentário"}}}}'::jsonb,
  true
)
ON CONFLICT (code) DO UPDATE
  SET display_name = EXCLUDED.display_name, description = EXCLUDED.description,
      category = EXCLUDED.category, tool_schema = EXCLUDED.tool_schema, is_active = true;

INSERT INTO public.agent_tools (agent_id, tool_id, enabled)
SELECT a.id, tc.id, true
FROM public.agents a
JOIN public.tool_catalog tc ON tc.code = 'comentar_card'
WHERE a.role = 'specialist' AND a.name ILIKE '%kanban%'
ON CONFLICT (agent_id, tool_id) DO NOTHING;
