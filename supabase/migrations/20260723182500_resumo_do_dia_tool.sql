-- ============================================================================
-- Onda 2.4 — cadastro da tool resumo_do_dia (consulta)
-- ============================================================================
INSERT INTO public.tool_catalog (code, display_name, description, category, tool_schema, is_active)
VALUES (
  'resumo_do_dia', 'Resumo do Dia', 'Resumo do dia do usuário (tarefas, atendimentos, audiências, pendências, notificações).', 'consulta',
  '{"name":"resumo_do_dia","description":"Resumo do dia do PRÓPRIO usuário: tarefas com prazo hoje, tarefas atrasadas, atendimentos do dia, audiências próximas (7 dias), pendências abertas e notificações não lidas. Uma resposta única, sem confirmação.","parameters":{"type":"object","required":[],"properties":{}}}'::jsonb, true
)
ON CONFLICT (code) DO UPDATE
  SET display_name = EXCLUDED.display_name, description = EXCLUDED.description,
      category = EXCLUDED.category, tool_schema = EXCLUDED.tool_schema, is_active = true;

INSERT INTO public.agent_tools (agent_id, tool_id, enabled)
SELECT a.id, tc.id, true
FROM public.agents a
JOIN public.tool_catalog tc ON tc.code = 'resumo_do_dia'
WHERE a.role = 'assistant_root'
ON CONFLICT (agent_id, tool_id) DO NOTHING;
