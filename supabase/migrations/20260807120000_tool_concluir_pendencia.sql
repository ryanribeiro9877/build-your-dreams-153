-- ============================================================================
-- Tool `concluir_pendencia` — dar baixa em pendência/tarefa pelo chat
-- ============================================================================
-- Item 6 do briefing de 06/08 ("FECHAR PENDÊNCIA GENÉRICA PELO CHAT", 17.5):
-- pela TELA o `✔ Concluir` funciona em todos os tipos; pelo CHAT não havia
-- caminho para pendência/tarefa genérica.
--
-- Esta migration é ADITIVA e não cria capacidade nova no banco: nenhuma RPC é
-- criada ou alterada. Ela só (1) registra a tool no catálogo e (2) a concede aos
-- agentes que JÁ podem criar/editar pendência. Quem pode concluir continua sendo
-- decidido dentro de `resolver_pendencia` (guard `pode_operar_pendencia`) e de
-- `update_user_task_status` (assignee/assigner/master).
--
-- POR QUE A TOOL NÃO USA `_fechar_pendencia`, como o briefing pediu: aquela
-- função NÃO confere permissão nenhuma (helper interno, prefixo `_`, feito para
-- ser chamado de dentro de RPCs que já checaram). Exposta a uma tool de chat,
-- qualquer usuário fecharia pendência alheia informando o id. `resolver_pendencia`
-- grava os mesmos três campos (status + pendencia_estado + completed_at), audita
-- em `task_audit_log`, devolve a pendência ao setor de origem quando é o caso —
-- e faz isso COM o guard.

INSERT INTO public.tool_catalog (code, display_name, description, category, icon, sort_order, tool_schema)
VALUES (
  'concluir_pendencia',
  'Concluir Pendência/Tarefa',
  'Dá baixa em uma pendência ou tarefa existente (equivalente ao botão Concluir da tela), com observação.',
  'acao',
  '✔️',
  42,  -- ao lado de criar_pendencia (41): criar e concluir andam juntas
  jsonb_build_object(
    'name', 'concluir_pendencia',
    'description', 'Dá BAIXA em uma pendência ou tarefa que já existe — equivalente ao botão "✔ Concluir" da tela, com observação. Vale para qualquer tipo, inclusive pendência genérica. Resolva a pendência ANTES com consultar_tarefas e passe o task_id. Se a pendência veio de outro setor ela é DEVOLVIDA à origem, e se o tipo exigir validação vai para aguardando validação — repasse as notas devolvidas em vez de afirmar que encerrou.',
    'parameters', jsonb_build_object(
      'type', 'object',
      'required', jsonb_build_array('task_id'),
      'properties', jsonb_build_object(
        'task_id', jsonb_build_object('type', 'string', 'description', 'id da pendência/tarefa (obtido via consultar_tarefas; nunca peça ao usuário).'),
        'task_titulo', jsonb_build_object('type', 'string', 'description', 'título da pendência, apenas para exibição no cartão de confirmação.'),
        'observacao', jsonb_build_object('type', 'string', 'description', 'como foi resolvida, em uma frase (vai para as notas e para a auditoria).')
      )
    )
  )
)
ON CONFLICT (code) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      description  = EXCLUDED.description,
      tool_schema  = EXCLUDED.tool_schema,
      is_active    = true,
      updated_at   = now();

-- Concessão: quem já cria pendência (criar_pendencia) ou edita card
-- (atualizar_tarefa), mais todo "Meu Assistente" (assistant_root) — que é o
-- portador que `resolveSpecialistWithTool` prefere ao rotear o objeto.
INSERT INTO public.agent_tools (agent_id, tool_id, enabled)
SELECT a.id, novo.id, true
FROM public.agents a
CROSS JOIN (SELECT id FROM public.tool_catalog WHERE code = 'concluir_pendencia') AS novo
WHERE a.is_active
  AND (
    a.role = 'assistant_root'
    OR EXISTS (
      SELECT 1 FROM public.agent_tools at
      JOIN public.tool_catalog tc ON tc.id = at.tool_id
      WHERE at.agent_id = a.id AND at.enabled
        AND tc.code IN ('criar_pendencia', 'atualizar_tarefa')
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.agent_tools at2
    WHERE at2.agent_id = a.id AND at2.tool_id = novo.id
  );
