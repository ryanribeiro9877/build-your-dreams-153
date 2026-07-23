-- ============================================================================
-- Onda 1.5 — cadastro das tools reagendar_atendimento + cancelar_atendimento
-- ============================================================================
INSERT INTO public.tool_catalog (code, display_name, description, category, tool_schema, is_active) VALUES
(
  'reagendar_atendimento', 'Reagendar Atendimento',
  'Reagenda um atendimento de cliente existente para nova data/hora.', 'acao',
  '{"name":"reagendar_atendimento","description":"Reagenda um atendimento/reunião de cliente que JÁ existe para nova data/hora. Resolva o atendimento ANTES com minha_agenda e passe meeting_id. Valida expediente (seg-sex 08-11/13-16, fuso Bahia).","parameters":{"type":"object","required":["meeting_id","nova_data","nova_hora"],"properties":{"meeting_id":{"type":"string","description":"id do atendimento (via minha_agenda)"},"atendimento_desc":{"type":"string","description":"descrição do atendimento (cliente/data atual) — só para exibição"},"nova_data":{"type":"string","description":"nova data AAAA-MM-DD"},"nova_hora":{"type":"string","description":"novo horário HH:MM"}}}}'::jsonb,
  true
),
(
  'cancelar_atendimento', 'Cancelar Atendimento',
  'Cancela um atendimento de cliente existente.', 'acao',
  '{"name":"cancelar_atendimento","description":"Cancela um atendimento/reunião de cliente que JÁ existe. Resolva o atendimento ANTES com minha_agenda e passe meeting_id.","parameters":{"type":"object","required":["meeting_id"],"properties":{"meeting_id":{"type":"string","description":"id do atendimento (via minha_agenda)"},"atendimento_desc":{"type":"string","description":"descrição do atendimento — só para exibição"},"motivo":{"type":"string","description":"motivo do cancelamento (opcional)"}}}}'::jsonb,
  true
)
ON CONFLICT (code) DO UPDATE
  SET display_name = EXCLUDED.display_name, description = EXCLUDED.description,
      category = EXCLUDED.category, tool_schema = EXCLUDED.tool_schema, is_active = true;

INSERT INTO public.agent_tools (agent_id, tool_id, enabled)
SELECT a.id, tc.id, true
FROM public.agents a
JOIN public.tool_catalog tc ON tc.code IN ('reagendar_atendimento','cancelar_atendimento')
WHERE a.role = 'specialist' AND a.name ILIKE '%agenda%'
ON CONFLICT (agent_id, tool_id) DO NOTHING;
