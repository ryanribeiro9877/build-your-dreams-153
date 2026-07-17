-- Catálogo das tools de revisão + grants (revisor e executores).
-- Espelho da migração aplicada via MCP em 2026-07-17 (name: tool_catalog_revisao_grants).
-- Notas de esquema conferidas: tool_catalog.code é UNIQUE (tool_catalog_code_key);
-- display_name/description são NOT NULL; agent_tools tem UNIQUE (agent_id, tool_id)
-- (agent_tools_agent_id_tool_id_key) e coluna enabled default true; o trigger
-- sync_agent_allowed_tools espelha agent_tools → agents.allowed_tools (lido pelo edge).

-- 1) Catálogo: as 2 tools de revisão (delegate e salvar_peca já existiam no catálogo)
INSERT INTO public.tool_catalog (code, display_name, description, category, is_active)
VALUES
  ('get_revisao_peca_context', 'Ler contexto de revisão', 'Lê a peça e os metadados de uma tarefa revisar_peca para avaliação antes de decidir.', 'consulta', true),
  ('decidir_revisao_peca', 'Decidir revisão de peça', 'Aprova (com aceite de responsabilidade) ou devolve uma revisão de peça.', 'acao', true)
ON CONFLICT (code) DO UPDATE SET is_active = true, category = EXCLUDED.category;

-- 2) Grant das 2 tools de revisão ao(s) "Diretor Jurídico — Revisão" (todos os donos)
INSERT INTO public.agent_tools (agent_id, tool_id, enabled)
SELECT a.id, tc.id, true
FROM public.agents a
JOIN public.tool_catalog tc ON tc.code IN ('get_revisao_peca_context','decidir_revisao_peca')
WHERE a.role = 'director' AND a.name = 'Diretor Jurídico — Revisão' AND a.is_active
ON CONFLICT (agent_id, tool_id) DO NOTHING;

-- 3) Grant salvar_peca a todos os executores (specialist ativos)
INSERT INTO public.agent_tools (agent_id, tool_id, enabled)
SELECT a.id, tc.id, true
FROM public.agents a
JOIN public.tool_catalog tc ON tc.code = 'salvar_peca'
WHERE a.role = 'specialist' AND a.is_active
ON CONFLICT (agent_id, tool_id) DO NOTHING;
