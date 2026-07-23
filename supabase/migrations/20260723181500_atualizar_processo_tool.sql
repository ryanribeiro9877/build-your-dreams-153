-- ============================================================================
-- Onda 2.2 — cadastro da tool atualizar_processo (tool_catalog + agent_tools)
-- ============================================================================
INSERT INTO public.tool_catalog (code, display_name, description, category, tool_schema, is_active)
VALUES (
  'atualizar_processo', 'Atualizar Processo', 'Registra andamento / atualiza um processo existente.', 'acao',
  '{"name":"atualizar_processo","description":"Registra um andamento ou atualiza um processo que JÁ existe (andamento, status, próxima audiência). Resolva o processo ANTES com consultar_processo e passe process_id. Andamento é gravado com sua autoria e data. Gate: advogado responsável, sócio ou admin.","parameters":{"type":"object","required":["process_id"],"properties":{"process_id":{"type":"string","description":"id do processo (via consultar_processo)"},"processo_desc":{"type":"string","description":"número/descrição do processo — só para exibição"},"andamento":{"type":"string","description":"texto do andamento (registrado com autor e data)"},"status":{"type":"string","description":"novo status do processo (opcional)"},"next_hearing_date":{"type":"string","description":"data/hora da próxima audiência em ISO 8601 (opcional)"}}}}'::jsonb, true
)
ON CONFLICT (code) DO UPDATE
  SET display_name = EXCLUDED.display_name, description = EXCLUDED.description,
      category = EXCLUDED.category, tool_schema = EXCLUDED.tool_schema, is_active = true;

INSERT INTO public.agent_tools (agent_id, tool_id, enabled)
SELECT a.id, tc.id, true
FROM public.agents a
JOIN public.tool_catalog tc ON tc.code = 'atualizar_processo'
WHERE a.role = 'assistant_root'
   OR (a.role = 'specialist' AND (a.name ILIKE '%confec%' OR a.name ILIKE '%distribu%'))
ON CONFLICT (agent_id, tool_id) DO NOTHING;
