-- ============================================================================
-- Onda 1.4 — cadastro da tool minha_agenda (consulta)
-- ============================================================================
INSERT INTO public.tool_catalog (code, display_name, description, category, tool_schema, is_active)
VALUES (
  'minha_agenda',
  'Minha Agenda',
  'Consulta a agenda do próprio usuário (atendimentos, audiências e prazos).',
  'consulta',
  '{"name":"minha_agenda","description":"Consulta a agenda do PRÓPRIO usuário (atendimentos, audiências e prazos) num intervalo de datas. Sem intervalo = hoje. Resposta direta, sem confirmação.","parameters":{"type":"object","required":[],"properties":{"de":{"type":"string","description":"data inicial AAAA-MM-DD (opcional; default = hoje)"},"ate":{"type":"string","description":"data final AAAA-MM-DD (opcional; default = mesmo dia de de)"}}}}'::jsonb,
  true
)
ON CONFLICT (code) DO UPDATE
  SET display_name = EXCLUDED.display_name, description = EXCLUDED.description,
      category = EXCLUDED.category, tool_schema = EXCLUDED.tool_schema, is_active = true;

-- Meu Assistente (assistant_root, todos os usuários) + Agenda + Kanban.
INSERT INTO public.agent_tools (agent_id, tool_id, enabled)
SELECT a.id, tc.id, true
FROM public.agents a
JOIN public.tool_catalog tc ON tc.code = 'minha_agenda'
WHERE a.role = 'assistant_root'
   OR (a.role = 'specialist' AND (a.name ILIKE '%agenda%' OR a.name ILIKE '%kanban%'))
ON CONFLICT (agent_id, tool_id) DO NOTHING;
