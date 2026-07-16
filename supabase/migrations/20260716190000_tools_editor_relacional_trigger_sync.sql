-- Editor de Tools por agente (área tech) — unificação no modelo RELACIONAL com
-- TRIGGER-SYNC para o array legado (decisão do Ryan: Path C).
--
-- Contexto (Passo 0, provado): o edge (chat-orchestrator) NÃO lê o relacional —
-- só `agents.allowed_tools` (+ READ_TOOL_NAMES hardcoded no entry_consulta). O
-- relacional (tool_catalog + agent_tools) já é a base da aba "Tools" do AgentDetail,
-- mas estava vazio (1 tool: delegate) e inócuo. A leitora oficial get_agent_tools
-- usa o relacional.
--
-- Estratégia (uma fonte de verdade = agent_tools):
--   A) Popular tool_catalog com TODAS as 15 tools do registry do edge (descrições/
--      schemas reais). `delegate` já existia e permanece.
--   B) Migrar agents.allowed_tools -> agent_tools (idempotente).
--   TRIGGER) agent_tools -> agents.allowed_tools: mantém o array (que o edge lê) como
--      CACHE derivado do relacional. Assim a UI (que escreve em agent_tools) tem efeito
--      no runtime IMEDIATO, sem reescrever/deployar o edge.
--   D) RPC set_agent_tools(agent_id, codes[]) — ponto único de escrita, gated por tech,
--      valida codes, marca is_overridden. (A aba atual escreve direto em agent_tools —
--      já RLS-gated por tech; a RPC fica como entrada sancionada/opcional.)
--
-- CAVEAT honesto: `delegate` é entrada de catálogo SEM implementação no registry do
-- edge (a delegação real é o roteador N1/N2→N3). Ligá-la é gravado fielmente, mas é
-- INERTE no runtime (toolsFor ignora codes fora do registry). As 15 tools reais, sim,
-- surtem efeito.

-- ─────────────────────────────────────────────────────────────────────────────
-- FASE A — catálogo com todas as tools do registry (idempotente por code).
-- ─────────────────────────────────────────────────────────────────────────────
WITH seed AS (
  SELECT * FROM jsonb_to_recordset($seed$[
    {"code":"consultar_cliente","display_name":"Consultar Cliente","category":"consulta","icon":"🔍","sort_order":20,
     "description":"Busca clientes por nome ou CPF. Use antes de cadastrar (evita duplicata) ou para responder dados do cliente.",
     "tool_schema":{"name":"consultar_cliente","parameters":{"type":"object","required":["busca"],"properties":{"busca":{"type":"string","description":"nome ou CPF do cliente"}}}}},
    {"code":"consultar_usuario","display_name":"Consultar Usuário","category":"consulta","icon":"🧑‍💼","sort_order":21,
     "description":"Resolve o DESTINATÁRIO (colaborador do escritório) por papel/cargo ('o sócio', 'a recepção', 'o tech', 'o previdenciário'), nome, e-mail, 'admin' ou app_role. Use SEMPRE antes de distribuir_caso/criar_card_tarefa para obter o user_id. Passe o termo do pedido cru (ex.: 'sócio'). Regras: NENHUM resultado → não invente destinatário; UM → siga; MAIS DE UM → LISTE (nome + cargo) e PERGUNTE qual.",
     "tool_schema":{"name":"consultar_usuario","parameters":{"type":"object","required":["busca"],"properties":{"busca":{"type":"string","description":"papel/cargo, nome, e-mail, 'admin' ou app_role do destinatário"}}}}},
    {"code":"consultar_processo","display_name":"Consultar Processo","category":"consulta","icon":"📁","sort_order":22,
     "description":"Busca processos por número ou nome do cliente.",
     "tool_schema":{"name":"consultar_processo","parameters":{"type":"object","required":["busca"],"properties":{"busca":{"type":"string","description":"número do processo ou nome"}}}}},
    {"code":"consultar_tarefas","display_name":"Consultar Tarefas","category":"consulta","icon":"🗂️","sort_order":23,
     "description":"Lista tarefas/cards. Filtros opcionais por cliente, responsável ou status.",
     "tool_schema":{"name":"consultar_tarefas","parameters":{"type":"object","required":[],"properties":{"client_id":{"type":"string","description":"id do cliente (opcional)"},"assignee_user_id":{"type":"string","description":"id do responsável (opcional)"},"status":{"type":"string","description":"status (opcional)"}}}}},
    {"code":"consultar_documentos","display_name":"Consultar Documentos","category":"consulta","icon":"📄","sort_order":24,
     "description":"Lista os documentos já anexados de um cliente.",
     "tool_schema":{"name":"consultar_documentos","parameters":{"type":"object","required":["client_id"],"properties":{"client_id":{"type":"string","description":"id do cliente"}}}}},
    {"code":"consultar_cep","display_name":"Consultar CEP","category":"consulta","icon":"📍","sort_order":25,
     "description":"Consulta um CEP (ViaCEP→BrasilAPI→OpenCEP) e retorna logradouro, bairro, cidade e UF. Use no cadastro quando o usuário informar o CEP: consulte, MOSTRE o endereço e peça confirmação ANTES de gravar. Nunca invente endereço.",
     "tool_schema":{"name":"consultar_cep","parameters":{"type":"object","required":["cep"],"properties":{"cep":{"type":"string","description":"CEP com 8 dígitos (com ou sem máscara)"}}}}},
    {"code":"cadastrar_cliente","display_name":"Cadastrar Cliente","category":"acao","icon":"➕","sort_order":40,
     "description":"Cria um novo cliente. Confirme os dados com o usuário; deixe [A PREENCHER] o que faltar.",
     "tool_schema":{"name":"cadastrar_cliente","parameters":{"type":"object","required":["full_name"],"properties":{"full_name":{"type":"string"},"cpf":{"type":"string"},"cnpj":{"type":"string"},"tipo_pessoa":{"type":"string","enum":["fisica","juridica"]},"email":{"type":"string"},"phone":{"type":"string"},"zip_code":{"type":"string"},"address":{"type":"string"},"address_number":{"type":"string"},"address_complement":{"type":"string"},"neighborhood":{"type":"string"},"city":{"type":"string"},"state":{"type":"string"}}}}},
    {"code":"criar_pendencia","display_name":"Criar Pendência","category":"acao","icon":"📌","sort_order":41,
     "description":"Cria uma pendência interna (documentação, senha INSS, comprovante, etc.). Atribuída ao responsável indicado ou a quem cria.",
     "tool_schema":{"name":"criar_pendencia","parameters":{"type":"object","required":["tipo","titulo"],"properties":{"tipo":{"type":"string","enum":["documentacao","comprovante_endereco","senha_inss","reset_inss","extratos","falta_documentacao","audiencia","reuniao","andamento","whatsapp","outro"]},"titulo":{"type":"string"},"cliente_id":{"type":"string"},"descricao":{"type":"string"},"responsavel_user_id":{"type":"string"},"prazo":{"type":"string"},"data_fatal":{"type":"string"}}}}},
    {"code":"resolver_pendencia","display_name":"Resolver Pendência","category":"acao","icon":"✅","sort_order":42,
     "description":"Marca uma pendência como resolvida; devolve ao gerador automaticamente quando aplicável.",
     "tool_schema":{"name":"resolver_pendencia","parameters":{"type":"object","required":["pendencia_id"],"properties":{"pendencia_id":{"type":"string"},"resolucao":{"type":"string"}}}}},
    {"code":"transferir_pendencia","display_name":"Transferir Pendência","category":"acao","icon":"🔁","sort_order":43,
     "description":"Transfere uma pendência para outro departamento e/ou responsável.",
     "tool_schema":{"name":"transferir_pendencia","parameters":{"type":"object","required":["pendencia_id"],"properties":{"pendencia_id":{"type":"string"},"departamento_destino":{"type":"string"},"responsavel_destino":{"type":"string"}}}}},
    {"code":"solicitar_documentos","display_name":"Solicitar Documentos","category":"acao","icon":"📨","sort_order":44,
     "description":"Solicita documentos a outro assistente/colaborador.",
     "tool_schema":{"name":"solicitar_documentos","parameters":{"type":"object","required":["to_user_id","documentos"],"properties":{"to_user_id":{"type":"string"},"client_id":{"type":"string"},"documentos":{"type":"array","items":{"type":"string"}}}}}},
    {"code":"solicitar_checklist_documental","display_name":"Solicitar Checklist Documental","category":"acao","icon":"🧾","sort_order":45,
     "description":"Registra como PENDENTES os documentos que faltam de um cliente para uma ação/réu. Resolva o cliente com consultar_cliente ANTES e passe cliente_id. Cria UMA pendência documental por documento.",
     "tool_schema":{"name":"solicitar_checklist_documental","parameters":{"type":"object","required":["cliente_id","documentos"],"properties":{"cliente_id":{"type":"string"},"documentos":{"type":"array","items":{"type":"string"}},"reu":{"type":"string"},"responsavel_user_id":{"type":"string"},"prazo":{"type":"string"}}}}},
    {"code":"pedir_acesso_arquivos","display_name":"Pedir Acesso a Arquivos","category":"acao","icon":"🔑","sort_order":46,
     "description":"Pede acesso a arquivos a outro colaborador.",
     "tool_schema":{"name":"pedir_acesso_arquivos","parameters":{"type":"object","required":["to_user_id","descricao"],"properties":{"to_user_id":{"type":"string"},"descricao":{"type":"string"},"motivo":{"type":"string"}}}}},
    {"code":"distribuir_caso","display_name":"Distribuir Caso","category":"acao","icon":"⚖️","sort_order":47,
     "description":"Distribui um caso ao Kanban do seu tipo de ação: cria e placa o card na coluna inicial do board. Resolva o processo com consultar_processo ANTES. Quando o pedido indicar destinatário ('ao sócio'), resolva com consultar_usuario e passe responsible_lawyer_user_id. Sem ele, vai ao responsável da área. Bloqueado se houver pendência aberta (gate §24.1).",
     "tool_schema":{"name":"distribuir_caso","parameters":{"type":"object","required":["process_id"],"properties":{"process_id":{"type":"string"},"tipo_acao_id":{"type":"string"},"task_type_id":{"type":"string"},"title":{"type":"string"},"responsible_lawyer_user_id":{"type":"string"}}}}},
    {"code":"criar_card_tarefa","display_name":"Criar Card/Tarefa","category":"acao","icon":"🗒️","sort_order":48,
     "description":"Cria um card/tarefa atribuído a um colaborador. Resolva 'assignee_user_id' com consultar_usuario antes.",
     "tool_schema":{"name":"criar_card_tarefa","parameters":{"type":"object","required":["title","assignee_user_id","task_type_id"],"properties":{"title":{"type":"string"},"assignee_user_id":{"type":"string"},"deadline_at":{"type":"string"},"area":{"type":"string"},"prioridade":{"type":"string","enum":["critical","high","medium","low"]},"client_id":{"type":"string"},"task_type_id":{"type":"string"},"descricao":{"type":"string"}}}}}
  ]$seed$::jsonb) AS x(code text, display_name text, description text, category text, icon text, sort_order int, tool_schema jsonb)
)
INSERT INTO public.tool_catalog (code, display_name, description, category, icon, sort_order, tool_schema, is_active)
SELECT code, display_name, description, category, icon, sort_order, tool_schema, true FROM seed
ON CONFLICT (code) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description  = EXCLUDED.description,
  category     = EXCLUDED.category,
  icon         = EXCLUDED.icon,
  sort_order   = EXCLUDED.sort_order,
  tool_schema  = EXCLUDED.tool_schema,
  is_active    = true,
  updated_at   = now();

-- ─────────────────────────────────────────────────────────────────────────────
-- FASE B — migra agents.allowed_tools -> agent_tools (idempotente).
-- Todo code em allowed_tools já existe no catálogo (verificado). Vínculos delegate
-- já existentes permanecem (ON CONFLICT DO NOTHING).
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.agent_tools (agent_id, tool_id, enabled, config)
SELECT a.id, tc.id, true, '{}'::jsonb
FROM public.agents a
CROSS JOIN LATERAL unnest(a.allowed_tools) AS u(code)
JOIN public.tool_catalog tc ON tc.code = u.code
WHERE a.allowed_tools IS NOT NULL
ON CONFLICT (agent_id, tool_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- TRIGGER — agent_tools -> agents.allowed_tools (array = cache derivado do relacional).
-- É o que faz a UI (que escreve em agent_tools) surtir efeito no edge SEM reescrevê-lo.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_agent_allowed_tools()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v_agent uuid;
BEGIN
  v_agent := COALESCE(NEW.agent_id, OLD.agent_id);
  UPDATE public.agents a
  SET allowed_tools = COALESCE((
        SELECT array_agg(tc.code ORDER BY tc.code)
        FROM public.agent_tools at2
        JOIN public.tool_catalog tc ON tc.id = at2.tool_id
        WHERE at2.agent_id = v_agent AND at2.enabled = true AND tc.is_active = true
      ), ARRAY[]::text[])
  WHERE a.id = v_agent;
  RETURN COALESCE(NEW, OLD);
END;
$fn$;

DROP TRIGGER IF EXISTS trg_sync_agent_allowed_tools ON public.agent_tools;
CREATE TRIGGER trg_sync_agent_allowed_tools
AFTER INSERT OR UPDATE OR DELETE ON public.agent_tools
FOR EACH ROW EXECUTE FUNCTION public.sync_agent_allowed_tools();

-- Resync único: alinha allowed_tools ao estado atual de agent_tools (incorpora os
-- vínculos delegate pré-existentes). Nenhum code é perdido — a Fase B já copiou todos
-- os codes de allowed_tools para agent_tools ANTES deste passo.
UPDATE public.agents a
SET allowed_tools = COALESCE((
      SELECT array_agg(tc.code ORDER BY tc.code)
      FROM public.agent_tools at2
      JOIN public.tool_catalog tc ON tc.id = at2.tool_id
      WHERE at2.agent_id = a.id AND at2.enabled = true AND tc.is_active = true
    ), ARRAY[]::text[])
WHERE EXISTS (SELECT 1 FROM public.agent_tools at3 WHERE at3.agent_id = a.id);

-- ─────────────────────────────────────────────────────────────────────────────
-- FASE D — set_agent_tools: ponto único de escrita, gated por tech, valida codes,
-- substitui os vínculos do agente e marca is_overridden. O trigger acima sincroniza
-- allowed_tools automaticamente.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_agent_tools(p_agent_id uuid, p_tool_codes text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v_bad text; v_codes text[] := COALESCE(p_tool_codes, ARRAY[]::text[]);
BEGIN
  IF NOT public.has_role(auth.uid(), 'tech'::public.app_role) THEN
    RAISE EXCEPTION 'set_agent_tools: acesso negado (requer papel tech)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.agents WHERE id = p_agent_id) THEN
    RAISE EXCEPTION 'set_agent_tools: agente % inexistente', p_agent_id;
  END IF;
  -- valida os codes contra o catálogo (ativos)
  SELECT string_agg(c, ', ') INTO v_bad
  FROM unnest(v_codes) AS c
  WHERE NOT EXISTS (SELECT 1 FROM public.tool_catalog tc WHERE tc.code = c AND tc.is_active = true);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'set_agent_tools: tool(s) inexistente(s)/inativa(s): %', v_bad;
  END IF;
  -- remove os vínculos que saíram do conjunto desejado
  DELETE FROM public.agent_tools at
  USING public.tool_catalog tc
  WHERE at.agent_id = p_agent_id AND at.tool_id = tc.id
    AND NOT (tc.code = ANY(v_codes));
  -- insere/habilita os marcados
  INSERT INTO public.agent_tools (agent_id, tool_id, enabled, config)
  SELECT p_agent_id, tc.id, true, '{}'::jsonb
  FROM public.tool_catalog tc
  WHERE tc.code = ANY(v_codes)
  ON CONFLICT (agent_id, tool_id) DO UPDATE SET enabled = true;
  -- marca override manual
  UPDATE public.agents SET is_overridden = true WHERE id = p_agent_id;
END;
$fn$;

-- Grants: sem anon/public (REVOKE FROM PUBLIC não cobre anon — revoga explícito).
REVOKE ALL ON FUNCTION public.set_agent_tools(uuid, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_agent_tools(uuid, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_agent_tools(uuid, text[]) TO authenticated, service_role;
