-- ============================================================================
-- Onda 2.3 — cadastro da tool gerar_kit_documental (ação)
-- ============================================================================
-- A geração roda na edge `gerar-kit-documental` (porte da engine client-side:
-- JSZip + templates + upload em client-documents). A tool no chat apenas propõe
-- (ActionCard) e, ao confirmar, invoca a edge com o JWT do usuário — herda a RLS
-- da tela. Sem RPC nova. Concedida aos especialistas de documentação/cadastro.
-- ============================================================================
INSERT INTO public.tool_catalog (code, display_name, description, category, tool_schema, is_active)
VALUES (
  'gerar_kit_documental', 'Gerar Kit Documental',
  'Gera o kit documental do cliente (procuração, contrato de honorários, declaração de hipossuficiência, ficha cadastral) preenchido com o cadastro e salva no dossiê.',
  'acao',
  '{"name":"gerar_kit_documental","description":"Gera o kit documental do cliente (procuração, contrato de honorários, declaração de hipossuficiência e ficha cadastral de cooperado), preenchido com os dados do cadastro, e salva no dossiê do cliente com status pendente (aguardando assinatura). Idempotente: documentos já gerados não são duplicados. Use quando pedirem para gerar/emitir/preparar os documentos, o kit ou a papelada de um cliente JÁ cadastrado. Resolva o cliente antes com consultar_cliente; NUNCA peça UUID ao usuário.","parameters":{"type":"object","required":["client_id"],"properties":{"client_id":{"type":"string","description":"ID do cliente (obtido via consultar_cliente; nunca peça ao usuário)."},"client_name":{"type":"string","description":"Nome do cliente, apenas para exibição no cartão de confirmação."}}}}'::jsonb,
  true
)
ON CONFLICT (code) DO UPDATE
  SET display_name = EXCLUDED.display_name, description = EXCLUDED.description,
      category = EXCLUDED.category, tool_schema = EXCLUDED.tool_schema, is_active = true;

-- Concede aos MESMOS agentes de documentação que já têm anexar_documento_cliente
-- (Especialista Cadastro, Cadastro Rascunho, Documentação Geral).
INSERT INTO public.agent_tools (agent_id, tool_id, enabled)
SELECT DISTINCT at.agent_id, tc_new.id, true
FROM public.agent_tools at
JOIN public.tool_catalog tc_old ON tc_old.id = at.tool_id AND tc_old.code = 'anexar_documento_cliente'
CROSS JOIN public.tool_catalog tc_new
WHERE tc_new.code = 'gerar_kit_documental'
ON CONFLICT (agent_id, tool_id) DO NOTHING;
