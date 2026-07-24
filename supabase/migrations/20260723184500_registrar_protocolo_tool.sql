-- ============================================================================
-- Onda 3.1 — cadastro da tool registrar_protocolo (ação)
-- ============================================================================
-- Concedida ao Especialista Protocolo Previdenciário (o agente para onde a regra
-- de roteamento "PROTOCOLAR" já direciona). Concluir o protocolo pelo chat herda
-- o gate da tela: permissão (assignee/assigner/master) + os 2 documentos.
-- ============================================================================
INSERT INTO public.tool_catalog (code, display_name, description, category, tool_schema, is_active)
VALUES (
  'registrar_protocolo', 'Registrar Protocolo',
  'Conclui a tarefa de protocolo (protocolar_peca), respeitando o gate dos 2 documentos (Reclame Aqui + Sentença Procedente).',
  'acao',
  '{"name":"registrar_protocolo","description":"Conclui a tarefa de protocolo (protocolar_peca) de um processo/cliente — registra que a peça foi protocolada. Exige o gate 8.5: o cliente precisa ter os documentos Reclame Aqui E Sentença Procedente anexados; senão a tool informa o que falta e NÃO conclui. Resolva a tarefa antes com consultar_tarefas (título começa por \"Protocolar peça —\"); NUNCA peça UUID. Use quando disserem que protocolaram/deram entrada na peça, ou para concluir a tarefa de protocolo.","parameters":{"type":"object","required":["task_id"],"properties":{"task_id":{"type":"string","description":"ID da tarefa de protocolo (protocolar_peca), obtido via consultar_tarefas."},"task_titulo":{"type":"string","description":"Título da tarefa, apenas para exibição no cartão de confirmação."},"observacao":{"type":"string","description":"Observação opcional (ex.: número de protocolo, data) — vai para as notas da tarefa."}}}}'::jsonb,
  true
)
ON CONFLICT (code) DO UPDATE
  SET display_name = EXCLUDED.display_name, description = EXCLUDED.description,
      category = EXCLUDED.category, tool_schema = EXCLUDED.tool_schema, is_active = true;

INSERT INTO public.agent_tools (agent_id, tool_id, enabled)
SELECT a.id, tc.id, true
FROM public.agents a
JOIN public.tool_catalog tc ON tc.code = 'registrar_protocolo'
WHERE a.name = 'Especialista Protocolo Previdenciário'
ON CONFLICT (agent_id, tool_id) DO NOTHING;
