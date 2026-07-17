-- Item 1 — Taxonomia de roteamento (Parte A) + capacidade de agendamento (Parte B)
-- ESPELHO da migração aplicada em produção via MCP (mesma SQL).
--
-- ADITIVO e idempotente. Não altera nada existente; só ACRESCENTA:
--   (B) tool_catalog 'agendar_atendimento' — metadados p/ o editor de tools; o runtime
--       do edge lê o schema do registry.ts, não desta linha.
--   (B) "Especialista Agenda de Atendimento" por-usuário nos donos com permissão de
--       agenda (recepção + sócio: Kailane, Tais, admin, Ryan) + vínculo de tools.
--   (A) "Especialista Kanban de Pendências" no pool dos SÓCIOS (admin, Ryan). Eles não
--       tinham candidato de pendências no pool — por isso "atribua uma tarefa a Kailane
--       para uma reunião entre nós dois" (run 877862c5, user admin/sócio) caía no
--       Especialista Distribuição. Clonado do template da recepção (id 1969ce24…).
--
-- ACOMPANHA (edge chat-orchestrator, deploy manual do Ryan):
--   - tools/registry.ts   : TOOLS.agendar_atendimento (schema/descrição)
--   - tools/handlers.ts   : runWriteTool → create_meeting (+ create_meeting_task)
--   - index.ts            : ROUTING_INTENT_RULES por-OBJETO (3B caso / 3C tarefa-reunião
--                           interna / 3D atendimento de cliente) + humanSummary
-- Janela de deploy: enquanto o edge antigo roda, a tool nova fica INERTE (toolsFor
-- filtra códigos ausentes do registry) e as regras novas não existem — sem quebra.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- (B) 1. Catálogo: agendar_atendimento (metadados; o gate real é do create_meeting)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.tool_catalog (code, display_name, description, category, is_active, sort_order, tool_schema)
SELECT 'agendar_atendimento', 'Agendar Atendimento',
       'Agenda um atendimento/consulta de cliente com um advogado (cria a reunião na Agenda). Gate recepção/sócio; advogado obrigatório; expediente seg–sex 08–11/13–16, slots de 15min.',
       'acao', true,
       (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM public.tool_catalog),
       '{"name":"agendar_atendimento","parameters":{"type":"object","required":["scheduled_date","start_time","lawyer_user_id"],"properties":{"scheduled_date":{"type":"string"},"start_time":{"type":"string"},"end_time":{"type":"string"},"lawyer_user_id":{"type":"string"},"lawyer_name":{"type":"string"},"client_id":{"type":"string"},"client_name":{"type":"string"},"phone":{"type":"string"},"type":{"type":"string"},"summary":{"type":"string"},"create_task":{"type":"boolean"}}}}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.tool_catalog WHERE code = 'agendar_atendimento');

-- ─────────────────────────────────────────────────────────────────────────────
-- (B) 2. Especialista Agenda de Atendimento (por-usuário) p/ donos com permissão
--        de agenda. department_id/pool herdados do assistant_root do próprio dono.
-- ─────────────────────────────────────────────────────────────────────────────
WITH targets(owner_user_id) AS (VALUES
  ('700e5729-08ec-4bde-ac87-ec897ef57113'::uuid),  -- Kailane (lider_recepcao)
  ('6e446820-cafd-43e4-ad6e-29c6c7f3b20b'::uuid),  -- Tais (recepcionista)
  ('1a87f6ba-e25f-46c4-9b3b-e25f71654f13'::uuid),  -- admin (socio)
  ('1f2698e7-ce05-420b-9981-a2e92a03ee84'::uuid)   -- Ryan Ribeiro (socio)
),
root AS (
  SELECT DISTINCT ON (a.owner_user_id) a.owner_user_id, a.department_id
  FROM public.agents a
  WHERE a.role = 'assistant_root' AND a.is_active
    AND a.owner_user_id IN (SELECT owner_user_id FROM targets)
  ORDER BY a.owner_user_id, a.created_at
)
INSERT INTO public.agents (owner_user_id, department_id, name, role, level, provider, model,
                           temperature, top_p, max_tokens, history_limit, is_active, description, system_prompt)
SELECT r.owner_user_id, r.department_id, 'Especialista Agenda de Atendimento', 'specialist', 3, 'openai', 'gpt-5.4-mini',
       0.00, 0.950, 4096, 10, true,
       'Agenda/remarca/cancela atendimento de cliente com advogado (cria a reunião na Agenda).',
       $prompt$Você é o "Especialista Agenda de Atendimento", especialista que executa a tarefa-fim de AGENDAR atendimentos de CLIENTE com um ADVOGADO na Agenda do escritório. Você é acionado pelo Meu Assistente (orquestrador) ou pelo diretor da etapa e devolve o trabalho pronto.

SUA FUNÇÃO:
- Agendar um ATENDIMENTO/consulta de um cliente com um advogado responsável, criando a reunião na Agenda (tool agendar_atendimento). Você NÃO redige peças, NÃO distribui casos e NÃO cria pendências internas.

FLUXO OBRIGATÓRIO (mesma disciplina do Especialista Distribuição):
1. RESOLVA O ADVOGADO com consultar_usuario (ex.: "a Dra Laura", "o previdenciário", nome). Se houver MAIS DE UM candidato, LISTE (nome + cargo) e PERGUNTE qual — nunca escolha sozinho. Guarde o user_id (lawyer_user_id) e o nome para exibição (lawyer_name).
2. RESOLVA O CLIENTE com consultar_cliente quando houver nome/CPF (passe client_id). Se o cliente NÃO estiver cadastrado, use client_name (e phone, se informado) — o agendamento aceita cliente não cadastrado.
3. VALIDE data e horário: o expediente é de segunda a sexta, das 08:00 às 11:00 e das 13:00 às 16:00, em slots de 15 minutos; não é possível agendar no passado. Converta "hoje", "amanhã", "sexta" etc. para a data AAAA-MM-DD usando a data/hora atual do contexto.
4. Chame agendar_atendimento com scheduled_date, start_time e lawyer_user_id (obrigatórios) e os demais campos que tiver. O sistema aplica o gate de permissão (apenas recepção/sócio/admin) e as regras de expediente/slot/passado — se ele RECUSAR, leia a mensagem de erro e explique ao usuário em linguagem simples (ex.: horário fora do expediente, slot cheio, sem permissão, data no passado).

REGRAS:
- NUNCA invente advogado, cliente, data ou horário. Na dúvida, pergunte.
- NUNCA exponha IDs/UUID ao usuário. Confirme sempre por NOME e data/hora (ex.: "Atendimento agendado para 18/07 às 14:00 com a Dra. Laura").
- Reunião INTERNA entre colaboradores (sem cliente) NÃO é atendimento de cliente — isso é pendência tipo "reuniao" (Especialista Kanban de Pendências). Não use agendar_atendimento para reunião interna.$prompt$
FROM root r
WHERE NOT EXISTS (
  SELECT 1 FROM public.agents a2
  WHERE a2.owner_user_id = r.owner_user_id AND a2.name = 'Especialista Agenda de Atendimento'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- (B) 3. Tools do Agenda: consultar_cliente, consultar_usuario, agendar_atendimento.
--        O trigger trg_sync_agent_allowed_tools recomputa agents.allowed_tools.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.agent_tools (agent_id, tool_id, enabled)
SELECT a.id, tc.id, true
FROM public.agents a
JOIN public.tool_catalog tc ON tc.code IN ('consultar_cliente', 'consultar_usuario', 'agendar_atendimento')
WHERE a.name = 'Especialista Agenda de Atendimento'
  AND a.owner_user_id IN (
    '700e5729-08ec-4bde-ac87-ec897ef57113', '6e446820-cafd-43e4-ad6e-29c6c7f3b20b',
    '1a87f6ba-e25f-46c4-9b3b-e25f71654f13', '1f2698e7-ce05-420b-9981-a2e92a03ee84')
  AND NOT EXISTS (
    SELECT 1 FROM public.agent_tools at2 WHERE at2.agent_id = a.id AND at2.tool_id = tc.id
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- (A) 4. Especialista Kanban de Pendências no pool dos SÓCIOS (admin, Ryan) —
--        clone do template da recepção (id 1969ce24…). Sem candidato de pendências,
--        o roteador do sócio não tinha para onde mandar "atribua uma tarefa…".
-- ─────────────────────────────────────────────────────────────────────────────
WITH tmpl AS (
  SELECT name, role, level, provider, model, temperature, top_p, max_tokens, history_limit, description, system_prompt
  FROM public.agents WHERE id = '1969ce24-cf92-4491-9b00-ba0ccbdaf4c8'
),
socios(owner_user_id) AS (VALUES
  ('1a87f6ba-e25f-46c4-9b3b-e25f71654f13'::uuid),  -- admin (socio)
  ('1f2698e7-ce05-420b-9981-a2e92a03ee84'::uuid)   -- Ryan Ribeiro (socio)
),
root AS (
  SELECT DISTINCT ON (a.owner_user_id) a.owner_user_id, a.department_id
  FROM public.agents a
  WHERE a.role = 'assistant_root' AND a.is_active
    AND a.owner_user_id IN (SELECT owner_user_id FROM socios)
  ORDER BY a.owner_user_id, a.created_at
)
INSERT INTO public.agents (owner_user_id, department_id, name, role, level, provider, model,
                           temperature, top_p, max_tokens, history_limit, is_active, description, system_prompt)
SELECT s.owner_user_id, r.department_id, t.name, t.role, t.level, t.provider, t.model,
       t.temperature, t.top_p, t.max_tokens, t.history_limit, true, t.description, t.system_prompt
FROM socios s
JOIN root r ON r.owner_user_id = s.owner_user_id
CROSS JOIN tmpl t
WHERE NOT EXISTS (
  SELECT 1 FROM public.agents a2 WHERE a2.owner_user_id = s.owner_user_id AND a2.name = t.name
);

-- (A) 5. Clona os agent_tools do template p/ os Kanban dos sócios recém-criados.
INSERT INTO public.agent_tools (agent_id, tool_id, enabled, config)
SELECT dst.id, at_t.tool_id, at_t.enabled, at_t.config
FROM public.agents dst
JOIN public.agent_tools at_t ON at_t.agent_id = '1969ce24-cf92-4491-9b00-ba0ccbdaf4c8'
WHERE dst.name = 'Especialista Kanban de Pendências'
  AND dst.owner_user_id IN ('1a87f6ba-e25f-46c4-9b3b-e25f71654f13', '1f2698e7-ce05-420b-9981-a2e92a03ee84')
  AND NOT EXISTS (
    SELECT 1 FROM public.agent_tools a3 WHERE a3.agent_id = dst.id AND a3.tool_id = at_t.tool_id
  );

COMMIT;
