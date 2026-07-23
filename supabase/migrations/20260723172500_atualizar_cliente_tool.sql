-- ============================================================================
-- Onda 1.3 — cadastro da tool atualizar_cliente (tool_catalog + agent_tools)
-- ============================================================================
INSERT INTO public.tool_catalog (code, display_name, description, category, tool_schema, is_active)
VALUES (
  'atualizar_cliente',
  'Atualizar Cliente',
  'Corrige dados de cadastro de um cliente existente (telefone, email, endereço, etc.).',
  'acao',
  '{"name":"atualizar_cliente","description":"Corrige/atualiza dados de cadastro de um cliente que JÁ existe (telefone, email, endereço, data de nascimento, origem, tipo, status). NÃO cria cliente novo e NUNCA altera CPF/CNPJ/nome (isso só na tela). Resolva o cliente ANTES com consultar_cliente e passe client_id.","parameters":{"type":"object","required":["client_id"],"properties":{"client_id":{"type":"string","description":"id do cliente (via consultar_cliente)"},"client_nome":{"type":"string","description":"nome do cliente — apenas para exibição na confirmação"},"phone":{"type":"string","description":"telefone"},"email":{"type":"string","description":"email"},"address":{"type":"string","description":"logradouro"},"address_number":{"type":"string","description":"número"},"neighborhood":{"type":"string","description":"bairro"},"city":{"type":"string","description":"cidade"},"state":{"type":"string","description":"UF"},"zip_code":{"type":"string","description":"CEP"},"birth_date":{"type":"string","description":"data de nascimento AAAA-MM-DD"},"client_origin":{"type":"string","description":"origem do cliente"},"tipo_pessoa":{"type":"string","description":"pf ou pj"},"status":{"type":"string","description":"status do cliente"}}}}'::jsonb,
  true
)
ON CONFLICT (code) DO UPDATE
  SET display_name = EXCLUDED.display_name, description = EXCLUDED.description,
      category = EXCLUDED.category, tool_schema = EXCLUDED.tool_schema, is_active = true;

INSERT INTO public.agent_tools (agent_id, tool_id, enabled)
SELECT a.id, tc.id, true
FROM public.agents a
JOIN public.tool_catalog tc ON tc.code = 'atualizar_cliente'
WHERE a.role = 'specialist' AND (a.name ILIKE '%cadastro%' OR a.name ILIKE '%documenta%')
ON CONFLICT (agent_id, tool_id) DO NOTHING;
