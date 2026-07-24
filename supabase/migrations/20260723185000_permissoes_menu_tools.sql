-- ============================================================================
-- Onda 3.2 — permissões de menu pelo chat (definir_permissao_menu + listar)
-- ============================================================================
-- SEM RPC nova: wrappers finos das RPCs já existentes e ADMIN-gated da tela
-- /configuracoes/permissoes (admin_set_user_menu / admin_clear_user_menu /
-- admin_list_menu_permissions — todas com has_role(admin) interno, 42501 senão).
-- O chat herda o gate: só admin executa. definir_permissao_menu espelha o
-- tri-state da tela: conceder=set(true), revogar=set(false), padrao=clear.
-- Concedidas ao assistant_root (ação de admin cross-cutting, não de especialista).
-- ============================================================================
INSERT INTO public.tool_catalog (code, display_name, description, category, tool_schema, is_active)
VALUES
(
  'definir_permissao_menu', 'Definir Permissão de Menu',
  'Concede, revoga ou volta ao padrão o acesso de um colaborador a um menu do sistema (ação de admin).',
  'acao',
  '{"name":"definir_permissao_menu","description":"Gerencia o acesso de um COLABORADOR a um MENU/tela do sistema (ação de ADMIN; só admin executa). acao=conceder libera; acao=revogar bloqueia explicitamente; acao=padrao volta ao padrão do papel (remove o override). Resolva o colaborador antes com consultar_usuario; NUNCA peça UUID. menu_key deve ser uma das chaves válidas.","parameters":{"type":"object","required":["user_id","menu_key","acao"],"properties":{"user_id":{"type":"string","description":"ID do colaborador (via consultar_usuario; nunca peça ao usuário)."},"user_nome":{"type":"string","description":"Nome do colaborador, só para exibição no cartão."},"menu_key":{"type":"string","enum":["dashboard","clientes","recepcao_juridico","prazos_audiencias","agenda","tarefas","kanban","kpis","dashboard_ia","administracao","configuracoes"],"description":"Chave do menu. Mapeie o nome dito pelo usuário: Dashboard=dashboard, Clientes=clientes, Recepção & Jurídico=recepcao_juridico, Prazos & Audiências=prazos_audiencias, Agenda=agenda, Tarefas=tarefas, Kanban=kanban, KPIs Eficiência=kpis, Dashboard IA=dashboard_ia, Administração=administracao, Configurações=configuracoes."},"menu_label":{"type":"string","description":"Nome legível do menu, só para exibição no cartão."},"acao":{"type":"string","enum":["conceder","revogar","padrao"],"description":"conceder = liberar; revogar = bloquear explicitamente; padrao = voltar ao padrão do papel."}}}}'::jsonb,
  true
),
(
  'listar_permissoes_menu', 'Listar Permissões de Menu',
  'Lista os overrides de permissão de menu por colaborador (ação de admin).',
  'consulta',
  '{"name":"listar_permissoes_menu","description":"Lista as permissões de menu personalizadas (overrides) de todos os colaboradores — quem teve algum menu concedido ou revogado explicitamente, e por quem. Ação de ADMIN (só admin). Sem parâmetros.","parameters":{"type":"object","required":[],"properties":{}}}'::jsonb,
  true
)
ON CONFLICT (code) DO UPDATE
  SET display_name = EXCLUDED.display_name, description = EXCLUDED.description,
      category = EXCLUDED.category, tool_schema = EXCLUDED.tool_schema, is_active = true;

INSERT INTO public.agent_tools (agent_id, tool_id, enabled)
SELECT a.id, tc.id, true
FROM public.agents a
JOIN public.tool_catalog tc ON tc.code IN ('definir_permissao_menu','listar_permissoes_menu')
WHERE a.role = 'assistant_root'
ON CONFLICT (agent_id, tool_id) DO NOTHING;
