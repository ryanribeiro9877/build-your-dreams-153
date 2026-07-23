-- ============================================================================
-- Onda 1.6 — cadastro das tools criar_audiencia + consultar_audiencias
-- ============================================================================
INSERT INTO public.tool_catalog (code, display_name, description, category, tool_schema, is_active) VALUES
(
  'criar_audiencia', 'Criar Audiência', 'Marca uma audiência para um processo.', 'acao',
  '{"name":"criar_audiencia","description":"Marca uma audiência para um processo. Resolva o processo ANTES com consultar_processo e passe process_id. Data futura. Gate: advogado do processo, sócio ou admin.","parameters":{"type":"object","required":["process_id","data","hora","tipo"],"properties":{"process_id":{"type":"string","description":"id do processo (via consultar_processo)"},"processo_desc":{"type":"string","description":"número/descrição do processo — só para exibição"},"data":{"type":"string","description":"data AAAA-MM-DD"},"hora":{"type":"string","description":"horário HH:MM"},"tipo":{"type":"string","description":"tipo da audiência (ex.: Instrução, Conciliação, Una)"},"local":{"type":"string","description":"local/link (opcional)"},"notes":{"type":"string","description":"observações (opcional)"}}}}'::jsonb, true
),
(
  'consultar_audiencias', 'Consultar Audiências', 'Consulta audiências num intervalo.', 'consulta',
  '{"name":"consultar_audiencias","description":"Consulta audiências num intervalo de datas (todas, ou de um processo específico). Escopo por papel (advogado vê as suas; sócio/admin/recepção todas).","parameters":{"type":"object","required":["de","ate"],"properties":{"de":{"type":"string","description":"data inicial AAAA-MM-DD"},"ate":{"type":"string","description":"data final AAAA-MM-DD"},"process_id":{"type":"string","description":"filtrar por um processo (opcional)"}}}}'::jsonb, true
)
ON CONFLICT (code) DO UPDATE
  SET display_name = EXCLUDED.display_name, description = EXCLUDED.description,
      category = EXCLUDED.category, tool_schema = EXCLUDED.tool_schema, is_active = true;

INSERT INTO public.agent_tools (agent_id, tool_id, enabled)
SELECT a.id, tc.id, true
FROM public.agents a
JOIN public.tool_catalog tc ON tc.code IN ('criar_audiencia','consultar_audiencias')
WHERE a.role = 'assistant_root'
   OR (a.role = 'specialist' AND (a.name ILIKE '%agenda%' OR a.name ILIKE '%confec%'))
ON CONFLICT (agent_id, tool_id) DO NOTHING;
