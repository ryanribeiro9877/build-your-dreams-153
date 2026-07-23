-- ============================================================================
-- Onda 2.1 — cadastro da tool criar_processo (tool_catalog + agent_tools)
-- ============================================================================
INSERT INTO public.tool_catalog (code, display_name, description, category, tool_schema, is_active)
VALUES (
  'criar_processo', 'Criar Processo', 'Cria um processo novo para um cliente.', 'acao',
  '{"name":"criar_processo","description":"Cria um processo NOVO para um cliente. Resolva o cliente ANTES com consultar_cliente e passe client_id. O tipo de ação define a área. Número é opcional (sem número fica \"(a distribuir)\"). Se o número já existir, o processo NÃO é criado. Gate: advogado, sócio ou admin.","parameters":{"type":"object","required":["client_id"],"properties":{"client_id":{"type":"string","description":"id do cliente (via consultar_cliente)"},"client_nome":{"type":"string","description":"nome do cliente — só para exibição"},"tipo_acao":{"type":"string","description":"tipo de ação/assunto (ex.: desconto indevido, RMC/RCC) — resolve a área"},"numero":{"type":"string","description":"número do processo (opcional)"},"reu":{"type":"string","description":"réu/parte contrária (opcional)"},"notes":{"type":"string","description":"observações (opcional)"}}}}'::jsonb, true
)
ON CONFLICT (code) DO UPDATE
  SET display_name = EXCLUDED.display_name, description = EXCLUDED.description,
      category = EXCLUDED.category, tool_schema = EXCLUDED.tool_schema, is_active = true;

INSERT INTO public.agent_tools (agent_id, tool_id, enabled)
SELECT a.id, tc.id, true
FROM public.agents a
JOIN public.tool_catalog tc ON tc.code = 'criar_processo'
WHERE a.role = 'assistant_root'
   OR (a.role = 'specialist' AND (a.name ILIKE '%confec%' OR a.name ILIKE '%distribu%'))
ON CONFLICT (agent_id, tool_id) DO NOTHING;
