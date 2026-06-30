# Chat Agêntico (ações do sistema via tool-calling) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao chat principal a capacidade de executar ações reais do sistema (consultar dados, cadastrar cliente, criar card de tarefa, solicitar documentos/acesso) via function-calling, com confirmação humana para escrita e sem escalonamento de privilégio.

**Architecture:** Function-calling nativo adicionado ao `callLLM` do edge `chat-orchestrator` (Deno). Um loop de ferramentas roda no ramo de **chamada única** do estado `executing_n3`, só para agentes com `allowed_tools`. Leitura executa na hora; escrita vira um **cartão de ação** (status `awaiting_confirmation`) que só grava após o usuário confirmar — a execução roda com a identidade do usuário (JWT). Sem permissão → a ação é encaminhada como pendência ao Admin. Redatores de peça ficam intocados.

**Tech Stack:** Deno (Supabase Edge Functions), TypeScript, Supabase (Postgres + RLS + RPCs), React + Vite + TanStack Query, vitest (front), `deno test` (edge).

**Restrição de testes:** o orquestrador é Deno; `deno` pode não estar instalado localmente (o `npm test` é vitest, só para `src/`). Por isso: lógica pura do edge fica em arquivos próprios testados com `deno test`; lógica de front em vitest; onde não houver runner, a verificação é `npx tsc --noEmit` + `npm run build` + smoke manual descrito. Cada task diz qual verificação usar.

**Spec:** `docs/superpowers/specs/2026-06-30-chat-agentico-acoes-design.md`

---

## Estrutura de arquivos

**Edge (`supabase/functions/chat-orchestrator/`)**
- Create `tools/registry.ts` — definição (schema OpenAI) das ferramentas + lista por nome. Puro, testável.
- Create `tools/toolSchemas.test.ts` — `deno test` dos schemas/validação de args.
- Create `tools/rbac.ts` — `decideActionRoute(perms, tool)` → `"execute" | "pendencia"`. Puro, testável.
- Create `tools/rbac.test.ts` — `deno test`.
- Create `tools/handlers.ts` — execução real de cada ferramenta (leitura com service-role; escrita com client do usuário). Recebe clients por injeção (testável com mocks).
- Modify `index.ts` — `callOpenAICompatible` (tools/tool_calls), loop em `executing_n3`, modo `confirm`, status `awaiting_confirmation`.

**Migrations (`supabase/migrations/`)**
- Create `<ts>_agent_tools_actions.sql` — `agents.allowed_tools`, `orchestration_runs.pending_actions`, tabela `agent_actions`, RLS, seeds.

**Front (`src/`)**
- Create `src/components/chat/ActionCard.tsx` — cartão Confirmar/Cancelar.
- Create `src/components/chat/__tests__/ActionCard.test.tsx` — vitest.
- Create `src/hooks/useActionConfirm.ts` — chama o modo `confirm`.
- Modify o componente que renderiza mensagens do chat (identificar em Task 12) — render do `action_proposal`.
- Modify `src/integrations/supabase/types.ts` — regen após migration.

---

## Fase 0 — Schema e tipos

### Task 1: Migration — colunas, tabela de auditoria, seeds

**Files:**
- Create: `supabase/migrations/<TIMESTAMP>_agent_tools_actions.sql` (use timestamp real no formato `YYYYMMDDHHMMSS`, posterior à última migration existente)

- [ ] **Step 1: Escrever a migration**

```sql
-- Chat agêntico: ferramentas por agente, ações pendentes e auditoria.

-- 1. Ferramentas habilitadas por agente (vazio = sem tool-calling).
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS allowed_tools text[] NOT NULL DEFAULT '{}';

-- 2. Ações propostas aguardando confirmação no run.
ALTER TABLE public.orchestration_runs
  ADD COLUMN IF NOT EXISTS pending_actions jsonb;

-- 3. Auditoria de ações do chat.
CREATE TABLE IF NOT EXISTS public.agent_actions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      uuid REFERENCES public.orchestration_runs(id) ON DELETE SET NULL,
  session_id  uuid REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id    uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  tool        text NOT NULL,
  args        jsonb NOT NULL DEFAULT '{}'::jsonb,
  status      text NOT NULL DEFAULT 'proposed'
              CHECK (status IN ('proposed','confirmed','executed','failed','cancelled','routed_pendencia')),
  result      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  executed_at timestamptz
);

ALTER TABLE public.agent_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user sees own agent_actions" ON public.agent_actions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.is_master_admin(auth.uid()));

CREATE POLICY "user inserts own agent_actions" ON public.agent_actions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user updates own agent_actions" ON public.agent_actions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_agent_actions_session ON public.agent_actions(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_actions_user ON public.agent_actions(user_id);

-- 4. Seed: habilitar ferramentas no assistente principal e na recepção/triagem.
-- assistant_root: todas as ferramentas v1.
UPDATE public.agents
SET allowed_tools = ARRAY[
  'consultar_cliente','consultar_usuario','consultar_tarefas','consultar_processo','consultar_documentos',
  'cadastrar_cliente','criar_card_tarefa','solicitar_documentos','pedir_acesso_arquivos'
]
WHERE role = 'assistant_root';

-- recepção/triagem: cadastro + consultas (sem criar card direto; cai em pendência se pedir).
UPDATE public.agents
SET allowed_tools = ARRAY[
  'consultar_cliente','consultar_usuario','consultar_tarefas','consultar_documentos',
  'cadastrar_cliente','solicitar_documentos','pedir_acesso_arquivos'
]
WHERE role IN ('specialist','executor','monitor')
  AND (lower(name) LIKE '%recep%' OR lower(name) LIKE '%triagem%' OR lower(name) LIKE '%cadastro%');
```

> NOTA: confirmar o nome real do role do agente raiz (`assistant_root`) lendo `loadSubAgents`/seeds em `index.ts` e nas migrations V14; ajustar o `WHERE` se o valor diferir.

- [ ] **Step 2: Aplicar via MCP Supabase**

Aplicar com a ferramenta `apply_migration` (project `tsltxvswzdnlmvljpryh`), name `agent_tools_actions`. Conferir com `list_tables` que `agent_actions` existe e `agents.allowed_tools` aparece.

- [ ] **Step 3: Regenerar tipos**

Run: `npm run types:regen` (ou `generate_typescript_types` via MCP). Verifica que `agent_actions` e `allowed_tools`/`pending_actions` entraram em `src/integrations/supabase/types.ts`.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: 0 erros.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/ src/integrations/supabase/types.ts
git commit -m "feat(chat-acoes): schema allowed_tools/pending_actions/agent_actions + seeds"
```

---

## Fase 1 — `callLLM` com suporte a tools

### Task 2: Adicionar `tools`/`tool_calls` ao `callOpenAICompatible`

**Files:**
- Modify: `supabase/functions/chat-orchestrator/index.ts` (função `callOpenAICompatible`, ~l.186-316; interface de opts ~l.186; `callLLM` ~l.320-330)

- [ ] **Step 1: Estender a interface de opções e o corpo da requisição**

Na interface de opções do `callOpenAICompatible`, adicionar:
```typescript
  tools?: Array<{ type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }> | null;
  toolChoice?: "auto" | "none" | null;
```
No corpo da requisição (após montar `body`), antes do bloco de streaming:
```typescript
if (opts.tools && opts.tools.length > 0) {
  body.tools = opts.tools;
  body.tool_choice = opts.toolChoice ?? "auto";
}
```

- [ ] **Step 2: Parsear `tool_calls` da resposta (modo não-streaming)**

No ramo NÃO-streaming (onde hoje extrai `content`), também extrair tool_calls:
```typescript
const choice = json.choices?.[0]?.message ?? {};
const toolCalls = Array.isArray(choice.tool_calls) ? choice.tool_calls : [];
// retornar toolCalls junto do content (ver Step 3 do tipo de retorno)
```
Garantir que, quando há `tools`, a chamada NÃO use streaming (o loop de ferramentas usa resposta completa). No loop (Task 6) sempre chamamos sem `onDelta`.

- [ ] **Step 3: Incluir `toolCalls` no objeto de retorno**

Onde a função retorna `{ content, rawModel, inputTokens, outputTokens }`, adicionar `toolCalls` (default `[]`). Tipar o retorno com um campo `toolCalls: Array<{ id: string; function: { name: string; arguments: string } }>`.

- [ ] **Step 4: Propagar pelo `callLLM`**

`callLLM` repassa `tools`/`toolChoice` para `callOpenAICompatible` e retorna `toolCalls`.

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit -p tsconfig.app.json` (o edge não é coberto pelo tsconfig do app; rodar também, se houver Deno: `deno check supabase/functions/chat-orchestrator/index.ts`).
Expected: sem erros novos de tipo no front; `deno check` ok se disponível.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/chat-orchestrator/index.ts
git commit -m "feat(chat-acoes): callLLM suporta tools/tool_calls (OpenAI+OpenRouter)"
```

---

## Fase 2 — Registry, RBAC e handlers (lógica pura, testável)

### Task 3: Registry de ferramentas (schemas)

**Files:**
- Create: `supabase/functions/chat-orchestrator/tools/registry.ts`
- Test: `supabase/functions/chat-orchestrator/tools/toolSchemas.test.ts`

- [ ] **Step 1: Escrever o teste primeiro** (`deno test`)

```typescript
import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { TOOLS, toolsFor, isWriteTool } from "./registry.ts";

Deno.test("toolsFor filtra pelo allowed_tools do agente", () => {
  const t = toolsFor(["consultar_cliente", "cadastrar_cliente"]);
  assertEquals(t.map((x) => x.function.name).sort(), ["cadastrar_cliente", "consultar_cliente"]);
});

Deno.test("isWriteTool classifica leitura vs escrita", () => {
  assertEquals(isWriteTool("consultar_cliente"), false);
  assertEquals(isWriteTool("cadastrar_cliente"), true);
  assertEquals(isWriteTool("criar_card_tarefa"), true);
});

Deno.test("todo write tool tem schema de parâmetros", () => {
  for (const name of ["cadastrar_cliente","criar_card_tarefa","solicitar_documentos","pedir_acesso_arquivos"]) {
    const def = TOOLS[name];
    assert(def, `faltou ${name}`);
    assert(def.function.parameters, `faltou parameters em ${name}`);
  }
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `deno test supabase/functions/chat-orchestrator/tools/toolSchemas.test.ts`
Expected: FAIL (registry.ts não existe). Se `deno` não estiver instalado, pular execução e seguir; a verificação será por `deno check` em CI.

- [ ] **Step 3: Implementar o registry**

```typescript
export interface ToolDef {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

const READ_TOOLS = new Set([
  "consultar_cliente", "consultar_usuario", "consultar_tarefas", "consultar_processo", "consultar_documentos",
]);

export function isWriteTool(name: string): boolean {
  return !READ_TOOLS.has(name);
}

const str = (description: string) => ({ type: "string", description });

export const TOOLS: Record<string, ToolDef> = {
  consultar_cliente: { type: "function", function: {
    name: "consultar_cliente",
    description: "Busca clientes por nome ou CPF. Use antes de cadastrar (evita duplicata) ou para responder dados do cliente.",
    parameters: { type: "object", properties: { busca: str("nome ou CPF do cliente") }, required: ["busca"] },
  }},
  consultar_usuario: { type: "function", function: {
    name: "consultar_usuario",
    description: "Busca usuários/colaboradores do escritório por nome. Use para resolver 'para quem' antes de criar um card.",
    parameters: { type: "object", properties: { busca: str("nome do colaborador") }, required: ["busca"] },
  }},
  consultar_tarefas: { type: "function", function: {
    name: "consultar_tarefas",
    description: "Lista tarefas/cards. Filtros opcionais por cliente, responsável ou status.",
    parameters: { type: "object", properties: {
      client_id: str("id do cliente (opcional)"),
      assignee_user_id: str("id do responsável (opcional)"),
      status: str("status (opcional)"),
    }, required: [] },
  }},
  consultar_processo: { type: "function", function: {
    name: "consultar_processo",
    description: "Busca processos por número ou nome do cliente.",
    parameters: { type: "object", properties: { busca: str("número do processo ou nome") }, required: ["busca"] },
  }},
  consultar_documentos: { type: "function", function: {
    name: "consultar_documentos",
    description: "Lista os documentos já anexados de um cliente.",
    parameters: { type: "object", properties: { client_id: str("id do cliente") }, required: ["client_id"] },
  }},
  cadastrar_cliente: { type: "function", function: {
    name: "cadastrar_cliente",
    description: "Cria um novo cliente. Confirme os dados com o usuário; deixe [A PREENCHER] o que faltar.",
    parameters: { type: "object", properties: {
      full_name: str("nome completo / razão social"),
      cpf: str("CPF (pessoa física)"),
      cnpj: str("CNPJ (pessoa jurídica)"),
      tipo_pessoa: { type: "string", enum: ["fisica", "juridica"], description: "tipo de pessoa" },
      email: str("e-mail"),
      phone: str("telefone/celular"),
    }, required: ["full_name"] },
  }},
  criar_card_tarefa: { type: "function", function: {
    name: "criar_card_tarefa",
    description: "Cria um card/tarefa atribuído a um colaborador. Resolva 'responsavel' com consultar_usuario antes.",
    parameters: { type: "object", properties: {
      title: str("o que deve ser feito"),
      assignee_user_id: str("id do responsável (de consultar_usuario)"),
      deadline_at: str("prazo em ISO 8601 (ex.: 2026-07-03T18:00:00-03:00)"),
      area: str("área jurídica (opcional)"),
      prioridade: { type: "string", enum: ["critical","high","medium","low"], description: "prioridade" },
      client_id: str("id do cliente (opcional)"),
      task_type_id: str("id do tipo de tarefa"),
      descricao: str("detalhes (opcional)"),
    }, required: ["title", "assignee_user_id", "task_type_id"] },
  }},
  solicitar_documentos: { type: "function", function: {
    name: "solicitar_documentos",
    description: "Solicita documentos a outro assistente/colaborador.",
    parameters: { type: "object", properties: {
      to_user_id: str("id de quem recebe a solicitação"),
      client_id: str("id do cliente relacionado"),
      documentos: { type: "array", items: { type: "string" }, description: "lista de documentos pedidos" },
    }, required: ["to_user_id", "documentos"] },
  }},
  pedir_acesso_arquivos: { type: "function", function: {
    name: "pedir_acesso_arquivos",
    description: "Pede acesso a arquivos a outro colaborador.",
    parameters: { type: "object", properties: {
      to_user_id: str("id de quem concede acesso"),
      descricao: str("quais arquivos"),
      motivo: str("por que precisa"),
    }, required: ["to_user_id", "descricao"] },
  }},
};

export function toolsFor(allowed: string[] | null | undefined): ToolDef[] {
  if (!allowed || allowed.length === 0) return [];
  return allowed.filter((n) => TOOLS[n]).map((n) => TOOLS[n]);
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `deno test supabase/functions/chat-orchestrator/tools/toolSchemas.test.ts`
Expected: PASS (se Deno disponível; senão `deno check` em CI).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/chat-orchestrator/tools/registry.ts supabase/functions/chat-orchestrator/tools/toolSchemas.test.ts
git commit -m "feat(chat-acoes): registry de ferramentas + testes de schema"
```

### Task 4: Decisão RBAC (executar vs pendência)

**Files:**
- Create: `supabase/functions/chat-orchestrator/tools/rbac.ts`
- Test: `supabase/functions/chat-orchestrator/tools/rbac.test.ts`

- [ ] **Step 1: Teste primeiro**

```typescript
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { decideActionRoute } from "./rbac.ts";

Deno.test("admin pode criar card → execute", () => {
  assertEquals(decideActionRoute({ isMaster: true, canAssignTask: false }, "criar_card_tarefa"), "execute");
});
Deno.test("recepção sem can_assign → pendencia", () => {
  assertEquals(decideActionRoute({ isMaster: false, canAssignTask: false }, "criar_card_tarefa"), "pendencia");
});
Deno.test("cadastrar_cliente sempre execute (qualquer autenticado)", () => {
  assertEquals(decideActionRoute({ isMaster: false, canAssignTask: false }, "cadastrar_cliente"), "execute");
});
Deno.test("solicitar_documentos sempre execute", () => {
  assertEquals(decideActionRoute({ isMaster: false, canAssignTask: false }, "solicitar_documentos"), "execute");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `deno test supabase/functions/chat-orchestrator/tools/rbac.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

```typescript
export interface ActionPerms { isMaster: boolean; canAssignTask: boolean; }

// Ferramentas que exigem permissão de atribuição (gate do create_user_task).
const NEEDS_ASSIGN = new Set(["criar_card_tarefa"]);

export function decideActionRoute(perms: ActionPerms, tool: string): "execute" | "pendencia" {
  if (NEEDS_ASSIGN.has(tool)) {
    return perms.isMaster || perms.canAssignTask ? "execute" : "pendencia";
  }
  return "execute"; // cadastrar_cliente, solicitar_documentos, pedir_acesso_arquivos: qualquer autenticado
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `deno test supabase/functions/chat-orchestrator/tools/rbac.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/chat-orchestrator/tools/rbac.ts supabase/functions/chat-orchestrator/tools/rbac.test.ts
git commit -m "feat(chat-acoes): decisão de roteamento RBAC (execute vs pendência)"
```

### Task 5: Handlers de execução

**Files:**
- Create: `supabase/functions/chat-orchestrator/tools/handlers.ts`

- [ ] **Step 1: Implementar leitura (service-role) e escrita (client do usuário)**

```typescript
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// READ — recebe o client admin (service-role) e o user_id para escopar.
export async function runReadTool(admin: SupabaseClient, userId: string, name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "consultar_cliente": {
      const q = String(args.busca ?? "").trim();
      const { data } = await admin.from("clients")
        .select("id, full_name, cpf, status")
        .or(`full_name.ilike.%${q}%,cpf.ilike.%${q}%`).limit(10);
      return data ?? [];
    }
    case "consultar_usuario": {
      const q = String(args.busca ?? "").trim();
      const { data } = await admin.from("profiles")
        .select("user_id, display_name, role_template_id").ilike("display_name", `%${q}%`).limit(10);
      return data ?? [];
    }
    case "consultar_tarefas": {
      let qb = admin.from("user_tasks").select("id, title, status, priority, deadline_at, assignee_user_id, client_id");
      if (args.client_id) qb = qb.eq("client_id", String(args.client_id));
      if (args.assignee_user_id) qb = qb.eq("assignee_user_id", String(args.assignee_user_id));
      if (args.status) qb = qb.eq("status", String(args.status));
      const { data } = await qb.limit(20);
      return data ?? [];
    }
    case "consultar_processo": {
      const q = String(args.busca ?? "").trim();
      const { data } = await admin.from("processes").select("*").or(`numero.ilike.%${q}%`).limit(10);
      return data ?? [];
    }
    case "consultar_documentos": {
      const { data } = await admin.from("client_documents")
        .select("id, document_type, document_name, created_at").eq("client_id", String(args.client_id)).limit(50);
      return data ?? [];
    }
    default:
      throw new Error(`ferramenta de leitura desconhecida: ${name}`);
  }
}

// WRITE — recebe um client com a IDENTIDADE DO USUÁRIO (JWT), para RLS/RBAC valerem.
export async function runWriteTool(userClient: SupabaseClient, userId: string, name: string, args: Record<string, unknown>): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  try {
    switch (name) {
      case "cadastrar_cliente": {
        const payload: Record<string, unknown> = { created_by: userId, full_name: args.full_name, status: "ativo" };
        for (const k of ["cpf","cnpj","tipo_pessoa","email","phone"]) if (args[k]) payload[k] = args[k];
        const { data, error } = await userClient.from("clients").insert(payload).select("id, full_name").single();
        if (error) return { ok: false, error: error.message };
        return { ok: true, result: data };
      }
      case "criar_card_tarefa": {
        const { data, error } = await userClient.rpc("create_user_task", {
          p_task_type_id: args.task_type_id, p_assignee_user_id: args.assignee_user_id,
          p_title: args.title, p_description: args.descricao ?? null, p_client_id: args.client_id ?? null,
          p_priority: args.prioridade ?? "medium", p_deadline_at: args.deadline_at ?? null,
          p_area: args.area ?? null, p_payload: {}, p_external_kanban_ref: null,
        });
        if (error) return { ok: false, error: error.message };
        return { ok: true, result: { task_id: data } };
      }
      case "solicitar_documentos": {
        const { data, error } = await userClient.rpc("create_inter_assistant_request", {
          p_to_user_id: args.to_user_id, p_request_type: "solicitar_documentacao",
          p_payload: { client_id: args.client_id ?? null, documentos: args.documentos ?? [] },
          p_related_task_id: null, p_expires_in_hours: 72,
        });
        if (error) return { ok: false, error: error.message };
        return { ok: true, result: { request_id: data } };
      }
      case "pedir_acesso_arquivos": {
        const { data, error } = await userClient.rpc("create_inter_assistant_request", {
          p_to_user_id: args.to_user_id, p_request_type: "pedir_acesso_a_arquivos",
          p_payload: { descricao: args.descricao, motivo: args.motivo ?? null },
          p_related_task_id: null, p_expires_in_hours: 72,
        });
        if (error) return { ok: false, error: error.message };
        return { ok: true, result: { request_id: data } };
      }
      default:
        return { ok: false, error: `ferramenta de escrita desconhecida: ${name}` };
    }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? "erro" };
  }
}

// Encaminha como pendência quando o usuário não tem permissão para a ação.
export async function routeAsPendencia(userClient: SupabaseClient, adminUserId: string, tool: string, args: Record<string, unknown>): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const { data, error } = await userClient.rpc("create_inter_assistant_request", {
    p_to_user_id: adminUserId, p_request_type: "aprovar_acao_chat",
    p_payload: { tool, args }, p_related_task_id: null, p_expires_in_hours: 72,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, result: { request_id: data, routed: true } };
}
```

> NOTA: confirmar nomes de colunas de `processes` (campo de número) e de `profiles` (display_name/role_template_id) com `list_tables`/types; ajustar selects. `aprovar_acao_chat` deve ser aceito como `request_type` (texto livre) — verificar se há CHECK constraint em `inter_assistant_requests.request_type`; se houver, adicionar o valor na migration da Task 1.

- [ ] **Step 2: Verificar tipos**

Run: `deno check supabase/functions/chat-orchestrator/tools/handlers.ts` (se Deno disponível).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/chat-orchestrator/tools/handlers.ts
git commit -m "feat(chat-acoes): handlers de leitura/escrita + roteamento de pendência"
```

---

## Fase 3 — Loop de ferramentas e proposta de ação

### Task 6: Loop de ferramentas no `executing_n3` (ramo de chamada única)

**Files:**
- Modify: `supabase/functions/chat-orchestrator/index.ts` (ramo de chamada única do `executing_n3`, ~l.1837-1869; topo do arquivo p/ imports)

- [ ] **Step 1: Importar o registry/handlers e carregar `allowed_tools` do agente**

No topo: `import { TOOLS, toolsFor, isWriteTool } from "./tools/registry.ts"; import { runReadTool } from "./tools/handlers.ts";`
Garantir que `loadAgent`/`AgentRow` incluam `allowed_tools` no `select` (adicionar a coluna nos selects de agentes, ~l.335-354).

- [ ] **Step 2: Implementar o loop antes da geração textual normal**

No ramo de chamada única, quando `n3.allowed_tools?.length`:
```typescript
const tools = toolsFor(n3.allowed_tools);
if (tools.length > 0) {
  const toolMsgs: Array<{ role: string; content: string; tool_call_id?: string; name?: string }> = [];
  const MAX_READ_ITERS = 4;
  for (let i = 0; i < MAX_READ_ITERS; i++) {
    const r = await callLLM(admin, {
      model: n3.model || "gpt-4o", cacheableSystem: stableSystem, systemPrompt: summaryBlock || null,
      history: [...history, ...toolMsgs], userMessage: run.original_message,
      temperature: n3.temperature, top_p: n3.top_p, maxTokens: n3.max_tokens ?? 2000,
      timeoutMs: N3_BLOCK_TIMEOUT_MS, tools, toolChoice: "auto",
    });
    if (!r.toolCalls || r.toolCalls.length === 0) {
      // sem ferramentas → resposta final normal (usa r.content como draft)
      await upd({ status: "validating_n2", draft: r.content, n3_usage: { /* ... */ } });
      return fireNextStep(runId, supabaseUrl, serviceKey);
    }
    const writeCall = r.toolCalls.find((c) => isWriteTool(c.function.name));
    if (writeCall) {
      // ESCRITA → propõe e pausa (Task 7)
      return await proposeAction(admin, run, n3, writeCall, supabaseUrl, serviceKey);
    }
    // só LEITURA → executa e realimenta
    for (const c of r.toolCalls) {
      const args = safeJson(c.function.arguments);
      const data = await runReadTool(admin, run.user_id, c.function.name, args);
      toolMsgs.push({ role: "assistant", content: "", tool_call_id: c.id, name: c.function.name });
      toolMsgs.push({ role: "tool", tool_call_id: c.id, name: c.function.name, content: JSON.stringify(data).slice(0, 8000) });
    }
  }
  // estourou o teto de leituras → segue com geração textual sem ferramentas (fallback)
}
```
Adicionar helper `safeJson(s)` (try/catch → `{}`).

> NOTA: o formato exato das mensagens `tool`/`assistant.tool_calls` no histórico precisa casar com o que `callLLM` monta em `messages`. Ajustar `loadSessionHistory`/montagem de `messages` para repassar `tool_call_id`/`tool_calls` quando presentes (a API exige a mensagem `assistant` com `tool_calls` seguida das mensagens `tool`).

- [ ] **Step 3: Verificar**

Run: `deno check supabase/functions/chat-orchestrator/index.ts` (se disponível) + `npx tsc --noEmit -p tsconfig.app.json` (front não afetado).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/chat-orchestrator/index.ts
git commit -m "feat(chat-acoes): loop de ferramentas (leitura) no executing_n3"
```

### Task 7: Proposta de ação de escrita (status `awaiting_confirmation`)

**Files:**
- Modify: `supabase/functions/chat-orchestrator/index.ts` (nova função `proposeAction` + imports RBAC/handlers)

- [ ] **Step 1: Implementar `proposeAction`**

```typescript
import { decideActionRoute } from "./tools/rbac.ts";
import { isWriteTool } from "./tools/registry.ts";

async function loadActionPerms(admin: SupabaseClient, userId: string): Promise<{ isMaster: boolean; canAssignTask: boolean }> {
  const { data: m } = await admin.rpc("is_master_admin", { _user_id: userId });
  // can_assign: existe alguma linha can_assign=true no role_task_matrix do role do usuário?
  const { data: prof } = await admin.from("profiles").select("role_template_id").eq("user_id", userId).maybeSingle();
  let canAssign = false;
  if (prof?.role_template_id) {
    const { data: rows } = await admin.from("role_task_matrix")
      .select("can_assign").eq("role_template_id", prof.role_template_id).eq("can_assign", true).limit(1);
    canAssign = !!(rows && rows.length);
  }
  return { isMaster: !!m, canAssignTask: canAssign };
}

function humanSummary(tool: string, args: Record<string, unknown>): string {
  switch (tool) {
    case "cadastrar_cliente": return `Cadastrar cliente "${args.full_name ?? "[A PREENCHER]"}"${args.cpf ? `, CPF ${args.cpf}` : ""}.`;
    case "criar_card_tarefa": return `Criar card "${args.title}" para o responsável indicado${args.deadline_at ? `, prazo ${args.deadline_at}` : ""}.`;
    case "solicitar_documentos": return `Solicitar documentos (${(args.documentos as string[] ?? []).join(", ")}).`;
    case "pedir_acesso_arquivos": return `Pedir acesso a arquivos: ${args.descricao ?? ""}.`;
    default: return `Executar ${tool}.`;
  }
}

async function proposeAction(admin: SupabaseClient, run: any, n3: any, call: { id: string; function: { name: string; arguments: string } }, supabaseUrl: string, serviceKey: string) {
  const tool = call.function.name;
  const args = safeJson(call.function.arguments);
  const perms = await loadActionPerms(admin, run.user_id);
  const route = decideActionRoute(perms, tool); // "execute" | "pendencia"

  // registra a ação proposta na auditoria
  const { data: actionRow } = await admin.from("agent_actions").insert({
    run_id: run.id, session_id: run.session_id, user_id: run.user_id, agent_id: n3.id,
    tool, args, status: route === "pendencia" ? "routed_pendencia" : "proposed",
  }).select("id").single();

  const proposal = {
    action_id: actionRow?.id, tool, args,
    resumo: humanSummary(tool, args),
    route, // "execute" → cartão Confirmar; "pendencia" → cartão Encaminhar ao Admin
  };

  // mensagem-cartão no chat
  const seq = await nextSeq(admin, run.session_id);
  await admin.from("chat_messages").insert({
    session_id: run.session_id, user_id: run.user_id, role: "assistant",
    content: route === "pendencia"
      ? `Você não tem permissão para essa ação. Posso **encaminhar ao Admin** para aprovação. ${proposal.resumo}`
      : `Confirme a ação: ${proposal.resumo}`,
    agent_id: n3.id, sequence_number: seq,
    metadata: { kind: "action_proposal", proposal },
  });

  await admin.from("orchestration_runs").update({
    status: "awaiting_confirmation", pending_actions: [proposal], updated_at: new Date().toISOString(),
  }).eq("id", run.id);
  // NÃO chama fireNextStep: o run pausa até a confirmação do usuário.
}
```

- [ ] **Step 2: Tratar `awaiting_confirmation` no watchdog**

Garantir que o watchdog que mata runs órfãos **ignore** `awaiting_confirmation` (não é run travado; está esperando humano). Localizar a query do watchdog e adicionar `awaiting_confirmation` à lista de status não-coletáveis.

- [ ] **Step 3: Verificar**

Run: `deno check supabase/functions/chat-orchestrator/index.ts` (se disponível).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/chat-orchestrator/index.ts
git commit -m "feat(chat-acoes): proposeAction + status awaiting_confirmation + auditoria"
```

---

## Fase 4 — Confirmação e execução

### Task 8: Modo `confirm` no edge (executa com identidade do usuário)

**Files:**
- Modify: `supabase/functions/chat-orchestrator/index.ts` (handler HTTP de entrada, ~l.2100+; criar branch `mode === "confirm"`)

- [ ] **Step 1: Detectar o modo `confirm` no corpo**

No handler de entrada (onde hoje cria o run a partir de `{ sessionId, message }`), antes disso:
```typescript
if (body?.mode === "confirm") {
  return await handleConfirm(req, body, supabaseUrl, serviceKey, anonKey);
}
```

- [ ] **Step 2: Implementar `handleConfirm`**

```typescript
async function handleConfirm(req: Request, body: { runId: string; actionId: string; decision: "confirm" | "cancel" }, supabaseUrl: string, serviceKey: string, anonKey: string) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  // client com a IDENTIDADE DO USUÁRIO (RLS/RBAC valem)
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user } } = await userClient.auth.getUser(token);
  if (!user) return errResp(401, "unauthorized", "Sessão inválida");

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: action } = await admin.from("agent_actions").select("*").eq("id", body.actionId).maybeSingle();
  if (!action || action.user_id !== user.id) return errResp(403, "forbidden", "Ação não encontrada");
  if (action.status === "executed") return jsonResp({ ok: true, alreadyDone: true }); // idempotência

  if (body.decision === "cancel") {
    await admin.from("agent_actions").update({ status: "cancelled" }).eq("id", action.id);
    await admin.from("orchestration_runs").update({ status: "done", pending_actions: null }).eq("id", body.runId);
    return jsonResp({ ok: true, cancelled: true });
  }

  // CONFIRMAR
  const perms = await loadActionPerms(admin, user.id);
  const route = decideActionRoute(perms, action.tool);
  let exec;
  if (route === "pendencia") {
    const adminUserId = await firstAdminUserId(admin); // helper: pega um Admin/sócio
    exec = await routeAsPendencia(userClient, adminUserId, action.tool, action.args);
  } else {
    exec = await runWriteTool(userClient, user.id, action.tool, action.args);
  }

  await admin.from("agent_actions").update({
    status: exec.ok ? (route === "pendencia" ? "routed_pendencia" : "executed") : "failed",
    result: exec.ok ? exec.result : { error: exec.error }, executed_at: new Date().toISOString(),
  }).eq("id", action.id);

  // mensagem de resultado (template, sem LLM)
  const seq = await nextSeq(admin, action.session_id);
  await admin.from("chat_messages").insert({
    session_id: action.session_id, user_id: user.id, role: "assistant", sequence_number: seq,
    content: exec.ok
      ? (route === "pendencia" ? "Pendência encaminhada ao Admin para aprovação." : "Pronto — ação executada com sucesso.")
      : `Não consegui executar: ${exec.error}`,
    metadata: { kind: "action_done", action_id: action.id, ok: exec.ok },
  });
  await admin.from("orchestration_runs").update({ status: "done", pending_actions: null }).eq("id", body.runId);
  return jsonResp({ ok: exec.ok, result: exec.result, error: exec.error });
}
```
Adicionar helpers `jsonResp`, `firstAdminUserId(admin)` (busca um usuário com role admin/director ou role_template `socio`). Importar `runWriteTool`, `routeAsPendencia` de `./tools/handlers.ts`.

- [ ] **Step 3: Verificar**

Run: `deno check supabase/functions/chat-orchestrator/index.ts` (se disponível).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/chat-orchestrator/index.ts
git commit -m "feat(chat-acoes): modo confirm executa ação com identidade do usuário"
```

### Task 9: Deploy do edge + smoke

- [ ] **Step 1: Deploy**

Run: `supabase functions deploy chat-orchestrator --project-ref tsltxvswzdnlmvljpryh`
Expected: "Deployed Functions ... chat-orchestrator", exit 0.

- [ ] **Step 2: Smoke de leitura**

Pelo app (sessão logada), no chat: "consulte o cliente <nome existente>". Esperado: o agente responde com dados reais de `clients` sem cartão de confirmação. Conferir em `agent_actions` que NÃO houve linha de escrita.

- [ ] **Step 3: Verificar logs**

Via MCP `get_logs` (service edge) — sem erros de tool parsing.

---

## Fase 5 — Frontend (cartão de ação)

### Task 10: Hook de confirmação

**Files:**
- Create: `src/hooks/useActionConfirm.ts`

- [ ] **Step 1: Implementar**

```typescript
import { supabase } from "@/integrations/supabase/client";

export async function confirmAction(runId: string, actionId: string, decision: "confirm" | "cancel") {
  const { data, error } = await supabase.functions.invoke("chat-orchestrator", {
    body: { mode: "confirm", runId, actionId, decision },
  });
  if (error) throw error;
  return data;
}
```

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit -p tsconfig.app.json` → 0 erros.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useActionConfirm.ts
git commit -m "feat(chat-acoes): hook confirmAction (modo confirm)"
```

### Task 11: Componente ActionCard (TDD vitest)

**Files:**
- Create: `src/components/chat/ActionCard.tsx`
- Test: `src/components/chat/__tests__/ActionCard.test.tsx`

- [ ] **Step 1: Teste primeiro**

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ActionCard } from "../ActionCard";

describe("ActionCard", () => {
  const proposal = { action_id: "a1", tool: "cadastrar_cliente", args: { full_name: "José" }, resumo: "Cadastrar cliente \"José\".", route: "execute" as const };

  it("mostra o resumo e botão Confirmar quando route=execute", () => {
    render(<ActionCard runId="r1" proposal={proposal} onDone={() => {}} />);
    expect(screen.getByText(/Cadastrar cliente/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirmar/i })).toBeInTheDocument();
  });

  it("mostra 'Encaminhar ao Admin' quando route=pendencia", () => {
    render(<ActionCard runId="r1" proposal={{ ...proposal, route: "pendencia" }} onDone={() => {}} />);
    expect(screen.getByRole("button", { name: /encaminhar ao admin/i })).toBeInTheDocument();
  });

  it("chama confirmAction ao clicar Confirmar", async () => {
    const spy = vi.fn().mockResolvedValue({ ok: true });
    render(<ActionCard runId="r1" proposal={proposal} onDone={() => {}} confirmFn={spy} />);
    fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));
    expect(spy).toHaveBeenCalledWith("r1", "a1", "confirm");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -- ActionCard` → FAIL (componente não existe).

- [ ] **Step 3: Implementar**

```tsx
import { useState } from "react";
import { confirmAction as defaultConfirm } from "@/hooks/useActionConfirm";

export interface ActionProposal {
  action_id: string; tool: string; args: Record<string, unknown>; resumo: string; route: "execute" | "pendencia";
}

export function ActionCard({ runId, proposal, onDone, confirmFn = defaultConfirm }: {
  runId: string; proposal: ActionProposal; onDone: () => void;
  confirmFn?: (runId: string, actionId: string, d: "confirm" | "cancel") => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [resolved, setResolved] = useState<string | null>(null);
  const label = proposal.route === "pendencia" ? "Encaminhar ao Admin" : "Confirmar";

  const act = async (decision: "confirm" | "cancel") => {
    setBusy(true);
    try { await confirmFn(runId, proposal.action_id, decision); setResolved(decision); onDone(); }
    finally { setBusy(false); }
  };

  if (resolved) return <div className="action-card action-card--done">{resolved === "confirm" ? "Ação confirmada." : "Ação cancelada."}</div>;
  return (
    <div className="action-card">
      <p className="action-card__summary">{proposal.resumo}</p>
      <div className="action-card__buttons">
        <button disabled={busy} onClick={() => act("confirm")}>{label}</button>
        <button disabled={busy} onClick={() => act("cancel")}>Cancelar</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test -- ActionCard` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/ActionCard.tsx src/components/chat/__tests__/ActionCard.test.tsx
git commit -m "feat(chat-acoes): ActionCard com Confirmar/Encaminhar/Cancelar (TDD)"
```

### Task 12: Render do cartão na lista de mensagens

**Files:**
- Modify: o componente que renderiza `chat_messages` no chat principal (identificar com grep: `metadata?.kind` / `kind === "stage"` em `src/`; provável `src/components/...Chat...` ou dentro de `JurisCloudOS`/Index). Test: reuso do vitest existente do chat se houver.

- [ ] **Step 1: Localizar o renderizador**

Run: `grep -rn "metadata" src/components | grep -i "kind"` e `grep -rln "chat_messages" src`. Identificar onde cada mensagem vira JSX.

- [ ] **Step 2: Renderizar `action_proposal`**

No ponto onde se decide o JSX por mensagem, antes do texto comum:
```tsx
if (msg.metadata?.kind === "action_proposal" && msg.metadata.proposal) {
  return <ActionCard runId={msg.metadata.proposal.run_id ?? currentRunId} proposal={msg.metadata.proposal} onDone={refetchMessages} />;
}
```
Garantir que `currentRunId`/`run_id` esteja disponível (incluir `run_id` no `proposal` salvo na Task 7 se o componente não tiver o runId por contexto — ajustar `proposeAction` para incluir `run_id: run.id` no objeto `proposal`).

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit -p tsconfig.app.json` + `npm run build`.
Expected: 0 erros, build ok.

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "feat(chat-acoes): render do cartão de ação na timeline do chat"
```

---

## Fase 6 — Integração e verificação fim-a-fim

### Task 13: Smoke fim-a-fim (deploy front + edge)

- [ ] **Step 1: Push (deploy Vercel) e garantir edge já deployado (Task 9)**

```bash
git push origin main
```

- [ ] **Step 2: Cenários de aceite (manual, app logado)**

1. "Consulte a ficha do cliente <X>" → dados reais, sem cartão.
2. "Cadastre o cliente <Y>, CPF <...>" → cartão Confirmar → confirmar → `clients` tem o registro (created_by = você). Conferir.
3. (Como Admin) "Crie um card para <Laura>, prazo sexta, revisar peça" → cartão → confirmar → `user_tasks` criado.
4. (Como recepção) mesmo pedido → cartão "Encaminhar ao Admin" → confirmar → `inter_assistant_requests` com `aprovar_acao_chat`; nenhum card direto.
5. "Solicite RG e comprovante ao assistente de <Z>" → cartão → confirmar → `inter_assistant_request` `solicitar_documentacao`.
6. Conferir `agent_actions`: uma linha por ação, status coerente.
7. Pedir geração de petição a um redator → fluxo idêntico ao atual (sem ferramentas).

- [ ] **Step 3: Atualizar o relatório**

Acrescentar ao `docs/RELATORIO_Auditoria_JurisAI_2026-06-30.md` (ou novo relatório) a entrega do chat agêntico v1 e o status de FEAT-01/02/03.

- [ ] **Step 4: Commit**

```bash
git add docs/
git commit -m "docs(chat-acoes): registro de entrega da v1 do chat agêntico"
```

---

## Notas de verificação por ambiente
- **Front:** `npm run test` (vitest), `npx tsc --noEmit -p tsconfig.app.json`, `npm run build`.
- **Edge (Deno):** `deno test supabase/functions/chat-orchestrator/tools/*.test.ts` e `deno check ...` quando Deno estiver disponível; caso contrário, validar por deploy + smoke + `get_logs`.
- **Baseline a não regredir:** vitest verde (85/85 atuais + novos), `mechanicalValidator` intocado, redatores sem ferramentas.
