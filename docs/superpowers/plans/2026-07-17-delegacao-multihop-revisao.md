# Delegação multi-hop + loop de revisão + glue `salvar_peca` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o `chat-orchestrator` executar o modelo do sócio `Meu Assistente → Diretor → Executor → (revisão)`, com `delegate` real, loop de revisão via RPCs existentes e glue da `salvar_peca` (texto → Storage → RPC).

**Architecture:** Uma **pilha de delegação persistida** em `orchestration_runs.delegation_stack`; um novo status `delegating` roda **um turno de LLM por invocação** (`fireNextStep`), empilhando ao `delegate` e desempilhando ao concluir/`salvar_peca`. Lógica pura (resolução de alvo, guardas de profundidade/laço, transformações da pilha, bloco de contexto) fica em `delegation.ts` (testável em Deno); a orquestração (LLM/DB/Storage) fica no `index.ts`. Caminho **gated** (flag + `delegate` no `allowed_tools`); o roteamento legado fica intacto.

**Tech Stack:** Deno (Supabase Edge Functions), TypeScript, supabase-js v2, Postgres (RPCs `SECURITY DEFINER`), Storage bucket `client-documents`. Testes: `deno test`. Migrações via MCP Supabase + espelho `.sql` em `supabase/migrations`.

## Global Constraints

- Responder ao usuário sempre em **pt-BR**.
- **Nada muda em produção** até ligar `MULTIHOP_DELEGATION_ENABLED` (default off). Deploy do edge é inócuo sob flag off.
- Edge: **1 chamada de LLM = 1 invocação**; nunca aninhar redação longa síncrona (teto ~400s).
- Reusar helpers existentes do `index.ts`: `fireNextStep`, `upd`, `insertStage`, `nextSeq`, `loadAgent`, `loadSubAgents`, `loadGlobalSpecialists`, `callLLM`, `runReadTool`, `runWriteTool`, `safeJson`, `toolsFor`, `isWriteTool`, `classifyMateria`, `finishAcaoDone`.
- Bucket da peça: **`client-documents`** (NÃO criar bucket `pecas`). Caminho `pecas/<process_id|client_id>/<uuid>.md`.
- Reviewer da peça: `owner_user_id` do agente executor (o sócio).
- Migração = aplicar via MCP **e** commitar o espelho `.sql` em `supabase/migrations/` (repo↔banco).
- Executar `deno test` com o binário do scoop: `~/scoop/shims/deno` (Deno 2.9.3). Comando padrão dos testes de edge: `deno test --no-check <arquivo>`.
- Nunca alterar a máquina de estados legada (`routing_n1/n2`, `executing_n3`, `validating_*`) — só **adicionar** o ramo `delegating`.
- Assinaturas RPC já existentes (usar exatamente):
  - `salvar_peca(p_client_id uuid, p_document_name text, p_file_path text, p_process_id uuid, p_document_type text, p_mime_type text, p_reviewer_user_id uuid, p_confeccao_task_id uuid) → jsonb {client_document_id, revisar_peca_task_id, reviewer_user_id}`
  - `get_revisao_peca_context(p_task_id uuid)`
  - `decidir_revisao_peca(p_task_id uuid, p_decisao text, p_observacoes text, p_aceite boolean) → user_task_status`

---

### Task 1: Coluna `delegation_stack` + flags do multi-hop

**Files:**
- Create: `supabase/migrations/20260717130000_orchestration_delegation_stack.sql` (espelho)
- Modify (via MCP `apply_migration`): banco `tsltxvswzdnlmvljpryh`
- Modify: `supabase/functions/chat-orchestrator/index.ts` (constantes de flag, junto às demais em ~L116-160)

**Interfaces:**
- Produces: coluna `orchestration_runs.delegation_stack jsonb` (nullable, default null); constantes `MULTIHOP_DELEGATION_ENABLED`, `MAX_DELEGATION_DEPTH`, `MAX_DELEGATION_HOPS`.

- [ ] **Step 1: Aplicar a migração no banco (MCP)**

Usar `mcp__…__apply_migration` no projeto `tsltxvswzdnlmvljpryh`, name `orchestration_delegation_stack`:

```sql
ALTER TABLE public.orchestration_runs
  ADD COLUMN IF NOT EXISTS delegation_stack jsonb;
COMMENT ON COLUMN public.orchestration_runs.delegation_stack IS
  'Pilha de delegação multi-hop (frames: agent_id/depth/messages/delegation_context/pending_child_tool_call_id). NULL fora do caminho delegating.';
```

- [ ] **Step 2: Verificar no banco**

Rodar via `execute_sql`:
```sql
SELECT column_name, data_type, is_nullable FROM information_schema.columns
WHERE table_schema='public' AND table_name='orchestration_runs' AND column_name='delegation_stack';
```
Expected: 1 linha, `jsonb`, `YES`.

- [ ] **Step 3: Escrever o espelho `.sql`**

Criar `supabase/migrations/20260717130000_orchestration_delegation_stack.sql` com o MESMO SQL do Step 1.

- [ ] **Step 4: Adicionar as flags no `index.ts`**

Após a constante `TAREFA_CHAT_ENABLED` (~L160), inserir:

```ts
// Multi-hop (modelo do sócio): Assistente→Diretor→Executor via tool `delegate`.
// Default OFF: deployar não muda nada até ligar. Só entra quando o agente de entrada
// tem `delegate` em allowed_tools E esta flag está on.
const MULTIHOP_DELEGATION_ENABLED = (Deno.env.get("MULTIHOP_DELEGATION_ENABLED") ?? "false") === "true";
// Profundidade máxima da pilha (0 = raiz). Além disso, `delegate` devolve erro à tool.
const MAX_DELEGATION_DEPTH = Number(Deno.env.get("MAX_DELEGATION_DEPTH")) || 4;
// Teto global de saltos por run (backstop anti-laço/DoS).
const MAX_DELEGATION_HOPS = Number(Deno.env.get("MAX_DELEGATION_HOPS")) || 24;
```

- [ ] **Step 5: Type-check do edge**

Run: `~/scoop/shims/deno check supabase/functions/chat-orchestrator/index.ts`
Expected: sem novos erros de tipo (os avisos pré-existentes de `EdgeRuntime` continuam ignorados por `// @ts-ignore`).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260717130000_orchestration_delegation_stack.sql supabase/functions/chat-orchestrator/index.ts
git commit -m "feat(orchestrator): coluna delegation_stack + flags do multi-hop"
```

---

### Task 2: Módulo puro `delegation.ts` (+ testes Deno)

**Files:**
- Create: `supabase/functions/chat-orchestrator/delegation.ts`
- Test: `supabase/functions/chat-orchestrator/delegation.test.ts`

**Interfaces:**
- Produces (consumido pelo `index.ts` na Task 6/7):
  - Tipos `DelegMsg`, `DelegationContext`, `DelegationFrame`, `DelegationStack`, `DelegCandidate`.
  - `foldTokens(s: string): string[]`
  - `allowedChildRoles(role: string): string[]`
  - `resolveTarget(target: string, candidates: DelegCandidate[]): { match: DelegCandidate | null; ambiguous: DelegCandidate[] }`
  - `isAncestor(stack: DelegationStack, agentId: string): boolean`
  - `topFrame(stack: DelegationStack): DelegationFrame | null`
  - `makeFrame(agentId: string, depth: number, ctx: DelegationContext | null, seedUser: string | null): DelegationFrame`
  - `pushChild(stack: DelegationStack, parentToolCallId: string, parentAssistantMsg: DelegMsg, child: DelegationFrame): DelegationStack`
  - `popWithResult(stack: DelegationStack, resultContent: string): DelegationStack`
  - `buildDelegationContextBlock(ctx: DelegationContext | null): string`
  - `materiaToConfeccaoCode(materia: string | null): string`

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `supabase/functions/chat-orchestrator/delegation.test.ts`:

```ts
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  foldTokens, allowedChildRoles, resolveTarget, isAncestor, topFrame,
  makeFrame, pushChild, popWithResult, buildDelegationContextBlock, materiaToConfeccaoCode,
  type DelegationStack, type DelegCandidate,
} from "./delegation.ts";

const cands: DelegCandidate[] = [
  { id: "d1", name: "Diretor Jurídico — Revisão", role: "director", description: "revisa peças" },
  { id: "d2", name: "Diretor de Área", role: "director", description: "distribui trabalho jurídico" },
  { id: "s1", name: "Especialista Previdenciário", role: "specialist", description: "redige peças de INSS" },
];

Deno.test("foldTokens: minúsculas, sem acento, sem stopwords de artigo/preposição", () => {
  assertEquals(foldTokens("ao Diretor de Área"), ["diretor", "area"]);
});

Deno.test("resolveTarget: casa por token único e forte", () => {
  const r = resolveTarget("diretor de revisão", cands);
  assertEquals(r.match?.id, "d1");
  assertEquals(r.ambiguous.length, 0);
});

Deno.test("resolveTarget: sem match → null e sem ambíguos", () => {
  const r = resolveTarget("financeiro", cands);
  assertEquals(r.match, null);
  assertEquals(r.ambiguous.length, 0);
});

Deno.test("resolveTarget: empate → ambiguous preenchido, match null", () => {
  const r = resolveTarget("diretor", cands);
  assertEquals(r.match, null);
  assertEquals(r.ambiguous.map((c) => c.id).sort(), ["d1", "d2"]);
});

Deno.test("allowedChildRoles: hierarquia", () => {
  assertEquals(allowedChildRoles("assistant_root"), ["director"]);
  assertEquals(allowedChildRoles("director"), ["specialist"]);
  assertEquals(allowedChildRoles("specialist"), []);
});

Deno.test("isAncestor: detecta agente já na pilha", () => {
  const stack: DelegationStack = [
    makeFrame("a0", 0, null, "oi"),
    makeFrame("d2", 1, { objetivo: "x" }, null),
  ];
  assertEquals(isAncestor(stack, "a0"), true);
  assertEquals(isAncestor(stack, "s1"), false);
});

Deno.test("pushChild/topFrame: empilha filho no topo com o contexto", () => {
  let stack: DelegationStack = [makeFrame("a0", 0, null, "redija a inicial")];
  const child = makeFrame("d2", 1, { objetivo: "distribua ao previdenciário" }, "distribua ao previdenciário");
  stack = pushChild(stack, "call_1", { role: "assistant", content: "", tool_calls: [{ id: "call_1" }] }, child);
  assertEquals(topFrame(stack)?.agent_id, "d2");
  assertEquals(stack[0].pending_child_tool_call_id, "call_1");
  // a msg assistant com o tool_call foi anexada ao pai
  assertEquals((stack[0].messages.at(-1) as { tool_calls?: unknown[] }).tool_calls?.length, 1);
});

Deno.test("popWithResult: desempilha e injeta resultado como tool no pai", () => {
  let stack: DelegationStack = [makeFrame("a0", 0, null, "redija")];
  const child = makeFrame("d2", 1, { objetivo: "x" }, "x");
  stack = pushChild(stack, "call_1", { role: "assistant", content: "", tool_calls: [{ id: "call_1" }] }, child);
  stack = popWithResult(stack, "peça salva; revisão criada");
  assertEquals(stack.length, 1);
  assertEquals(topFrame(stack)?.agent_id, "a0");
  const last = stack[0].messages.at(-1) as { role: string; tool_call_id?: string; content?: string };
  assertEquals(last.role, "tool");
  assertEquals(last.tool_call_id, "call_1");
  assertEquals(last.content, "peça salva; revisão criada");
  assertEquals(stack[0].pending_child_tool_call_id, null);
});

Deno.test("popWithResult: pop do raiz esvazia a pilha (retorna [])", () => {
  const stack: DelegationStack = [makeFrame("a0", 0, null, "oi")];
  assertEquals(popWithResult(stack, "resultado final").length, 0);
});

Deno.test("buildDelegationContextBlock: injeta objetivo/resumo (vazio se null)", () => {
  assertEquals(buildDelegationContextBlock(null), "");
  const b = buildDelegationContextBlock({ objetivo: "Redigir contestação", resumo: "cliente X, réu Y" });
  assertEquals(b.includes("Redigir contestação"), true);
  assertEquals(b.includes("cliente X, réu Y"), true);
});

Deno.test("materiaToConfeccaoCode: mapeia matéria→código; fallback civil", () => {
  assertEquals(materiaToConfeccaoCode("Previdenciário"), "confeccionar_peca_previdenciario");
  assertEquals(materiaToConfeccaoCode("Plano de Saúde"), "confeccionar_peca_plano_saude");
  assertEquals(materiaToConfeccaoCode(null), "confeccionar_peca_civil");
});
```

- [ ] **Step 2: Rodar os testes para confirmar que falham**

Run: `~/scoop/shims/deno test --no-check supabase/functions/chat-orchestrator/delegation.test.ts`
Expected: FAIL — módulo `./delegation.ts` não existe.

- [ ] **Step 3: Implementar `delegation.ts`**

Criar `supabase/functions/chat-orchestrator/delegation.ts`:

```ts
// Lógica PURA da delegação multi-hop (sem supabase/deno-std, testável isolada).
// A orquestração (LLM/DB/Storage) fica no index.ts.

export type DelegMsg = {
  role: string; content?: string; tool_calls?: unknown[];
  tool_call_id?: string; name?: string;
};

export interface DelegationContext {
  objetivo: string;
  resumo?: string | null;
  client_id?: string | null;
  process_id?: string | null;
  recipient_id?: string | null;
}

export interface DelegationFrame {
  agent_id: string;
  depth: number;
  messages: DelegMsg[];
  delegation_context: DelegationContext | null;
  pending_child_tool_call_id: string | null;
}

export type DelegationStack = DelegationFrame[];

export interface DelegCandidate {
  id: string; name: string; role: string; description?: string | null;
}

// Artigos/preposições pt-BR que não ajudam a casar papel/nome.
const STOPWORDS = new Set([
  "o", "a", "os", "as", "um", "uma", "de", "do", "da", "dos", "das",
  "ao", "aos", "à", "às", "para", "pra", "pro", "com", "e", "em", "no", "na",
]);

export function foldTokens(s: string): string[] {
  return (s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // remove acentos
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !STOPWORDS.has(t));
}

export function allowedChildRoles(role: string): string[] {
  if (role === "assistant_root") return ["director"];
  if (role === "director") return ["specialist"];
  return [];
}

// Casa o `target` (livre) contra os candidatos por sobreposição de tokens.
// Estratégia: pontua cada candidato pela qtd de tokens do target presentes no
// seu nome+papel+descrição. Vencedor único com pontuação > 0 → match; empate no
// topo → ambiguous; ninguém > 0 → sem match.
export function resolveTarget(
  target: string, candidates: DelegCandidate[],
): { match: DelegCandidate | null; ambiguous: DelegCandidate[] } {
  const wanted = new Set(foldTokens(target));
  if (wanted.size === 0 || candidates.length === 0) return { match: null, ambiguous: [] };
  const scored = candidates.map((c) => {
    const hay = new Set(foldTokens(`${c.name} ${c.role} ${c.description ?? ""}`));
    let score = 0;
    for (const w of wanted) if (hay.has(w)) score++;
    return { c, score };
  }).filter((x) => x.score > 0);
  if (scored.length === 0) return { match: null, ambiguous: [] };
  const max = Math.max(...scored.map((x) => x.score));
  const top = scored.filter((x) => x.score === max).map((x) => x.c);
  if (top.length === 1) return { match: top[0], ambiguous: [] };
  return { match: null, ambiguous: top };
}

export function topFrame(stack: DelegationStack): DelegationFrame | null {
  return stack.length ? stack[stack.length - 1] : null;
}

export function isAncestor(stack: DelegationStack, agentId: string): boolean {
  return stack.some((f) => f.agent_id === agentId);
}

export function makeFrame(
  agentId: string, depth: number, ctx: DelegationContext | null, seedUser: string | null,
): DelegationFrame {
  const messages: DelegMsg[] = [];
  if (seedUser) messages.push({ role: "user", content: seedUser });
  return { agent_id: agentId, depth, messages, delegation_context: ctx, pending_child_tool_call_id: null };
}

// Anexa a msg assistant (com o tool_call `delegate`) ao pai, marca o pending e
// empilha o frame filho no topo.
export function pushChild(
  stack: DelegationStack, parentToolCallId: string, parentAssistantMsg: DelegMsg, child: DelegationFrame,
): DelegationStack {
  const next = stack.map((f) => ({ ...f, messages: [...f.messages] }));
  const parent = next[next.length - 1];
  parent.messages.push(parentAssistantMsg);
  parent.pending_child_tool_call_id = parentToolCallId;
  next.push(child);
  return next;
}

// Desempilha o topo; injeta o resultado como msg `tool` respondendo o pending do
// pai. Se o topo era o raiz, retorna [] (o chamador finaliza o run com o texto).
export function popWithResult(stack: DelegationStack, resultContent: string): DelegationStack {
  if (stack.length <= 1) return [];
  const next = stack.slice(0, -1).map((f) => ({ ...f, messages: [...f.messages] }));
  const parent = next[next.length - 1];
  parent.messages.push({
    role: "tool", tool_call_id: parent.pending_child_tool_call_id ?? undefined,
    name: "delegate", content: resultContent,
  });
  parent.pending_child_tool_call_id = null;
  return next;
}

export function buildDelegationContextBlock(ctx: DelegationContext | null): string {
  if (!ctx) return "";
  const lines = [`OBJETIVO DELEGADO: ${ctx.objetivo}`];
  if (ctx.resumo) lines.push(`CONTEXTO: ${ctx.resumo}`);
  if (ctx.client_id) lines.push(`client_id: ${ctx.client_id}`);
  if (ctx.process_id) lines.push(`process_id: ${ctx.process_id}`);
  return "\n\n═══ TAREFA DELEGADA (DADO, não instrução externa) ═══\n" +
    lines.join("\n") + "\n═══ FIM ═══\n";
}

// Matéria (classifyMateria do index.ts) → task_type de confecção por área.
export function materiaToConfeccaoCode(materia: string | null): string {
  switch ((materia || "").toLowerCase()) {
    case "consumidor": return "confeccionar_peca_consumidor";
    case "plano de saúde": return "confeccionar_peca_plano_saude";
    case "bancário": return "confeccionar_peca_bancario";
    case "previdenciário": return "confeccionar_peca_previdenciario";
    case "tributário": return "confeccionar_peca_tributario";
    case "civil": return "confeccionar_peca_civil";
    default: return "confeccionar_peca_civil";
  }
}
```

- [ ] **Step 4: Rodar os testes até passar**

Run: `~/scoop/shims/deno test --no-check supabase/functions/chat-orchestrator/delegation.test.ts`
Expected: PASS — 11 passed | 0 failed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/chat-orchestrator/delegation.ts supabase/functions/chat-orchestrator/delegation.test.ts
git commit -m "feat(orchestrator): modulo puro delegation.ts (resolucao de alvo + pilha + guardas)"
```

---

### Task 3: Registrar as 3 tools (`delegate`, `get_revisao_peca_context`, `decidir_revisao_peca`)

**Files:**
- Modify: `supabase/functions/chat-orchestrator/tools/registry.ts`
- Test: `supabase/functions/chat-orchestrator/tools/toolSchemas.test.ts`

**Interfaces:**
- Consumes: (nada novo)
- Produces: `TOOLS.delegate`, `TOOLS.get_revisao_peca_context`, `TOOLS.decidir_revisao_peca`; `get_revisao_peca_context` entra em `READ_TOOL_NAMES` (leitura); `delegate` e `decidir_revisao_peca` são não-leitura. `isDelegateTool(name)` exportado.

- [ ] **Step 1: Adicionar asserts (falhando) em `toolSchemas.test.ts`**

Ao final de `tools/toolSchemas.test.ts`, adicionar:

```ts
import { TOOLS, READ_TOOL_NAMES, isWriteTool } from "./registry.ts";

Deno.test("registry: delegate/revisão registradas e categorizadas", () => {
  assertEquals(typeof TOOLS.delegate, "object");
  assertEquals(TOOLS.delegate.function.name, "delegate");
  assertEquals(TOOLS.get_revisao_peca_context.function.name, "get_revisao_peca_context");
  assertEquals(TOOLS.decidir_revisao_peca.function.name, "decidir_revisao_peca");
  // get_revisao_peca_context é LEITURA; decidir_revisao_peca é ESCRITA.
  assertEquals(READ_TOOL_NAMES.includes("get_revisao_peca_context"), true);
  assertEquals(isWriteTool("get_revisao_peca_context"), false);
  assertEquals(isWriteTool("decidir_revisao_peca"), true);
});
```

(Se o arquivo ainda não importar `assertEquals`, use o import de topo `import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";`.)

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run: `~/scoop/shims/deno test --no-check supabase/functions/chat-orchestrator/tools/toolSchemas.test.ts`
Expected: FAIL — `TOOLS.delegate` undefined.

- [ ] **Step 3: Registrar as tools em `registry.ts`**

Em `READ_TOOL_NAMES` (L10-13), acrescentar `"get_revisao_peca_context"`:

```ts
export const READ_TOOL_NAMES: string[] = [
  "consultar_cliente", "consultar_usuario", "consultar_tarefas", "consultar_processo", "consultar_documentos",
  "consultar_cep", "get_revisao_peca_context",
];
```

Após `isWriteTool` (L18), adicionar:

```ts
// `delegate` é NATIVA (nem leitura nem escrita comum): o orquestrador a trata
// diretamente no ramo `delegating` (não vai a runReadTool/runWriteTool).
export function isDelegateTool(name: string): boolean {
  return name === "delegate";
}
```

Dentro do objeto `TOOLS`, adicionar as 3 entradas:

```ts
  delegate: { type: "function", function: {
    name: "delegate",
    description: "Delega esta demanda a um SUB-AGENTE seu (diretor ou executor) e recebe de volta o resultado dele. Use quando a ação exige um nível abaixo: o Assistente delega ao Diretor; o Diretor delega ao Executor que produz. Informe `target` (papel/área/nome do sub-agente, ex.: 'diretor jurídico', 'executor previdenciário') e um `objetivo` claro. Passe `resumo`/`client_id`/`process_id` já apurados para o sub-agente não recomeçar do zero.",
    parameters: { type: "object", properties: {
      target: str("papel/área/nome do sub-agente destino (ex.: 'diretor de área', 'executor previdenciário', 'Especialista Cadastro')"),
      objetivo: str("o que o sub-agente deve fazer (imperativo, 1 frase)"),
      resumo: str("contexto relevante já apurado (opcional)"),
      client_id: str("uuid do cliente já resolvido (opcional)"),
      process_id: str("uuid do processo já resolvido (opcional)"),
    }, required: ["target", "objetivo"] },
  }},
  get_revisao_peca_context: { type: "function", function: {
    name: "get_revisao_peca_context",
    description: "Lê o contexto de uma tarefa de revisão de peça (revisar_peca): a peça redigida e os metadados, para você avaliar antes de decidir. Passe o task_id da revisão.",
    parameters: { type: "object", properties: { task_id: str("id da tarefa revisar_peca") }, required: ["task_id"] },
  }},
  decidir_revisao_peca: { type: "function", function: {
    name: "decidir_revisao_peca",
    description: "Decide uma revisão de peça: 'aprovar' ou 'devolver'. APROVAR exige aceite=true (o revisor assume a RESPONSABILIDADE pela peça) — só aprove após o revisor humano confirmar o aceite; nunca aprove por conta própria. DEVOLVER reabre a confecção para o redator refazer; use observacoes para dizer o que corrigir.",
    parameters: { type: "object", properties: {
      task_id: str("id da tarefa revisar_peca"),
      decisao: { type: "string", enum: ["aprovar", "devolver"], description: "decisão da revisão" },
      observacoes: str("o que corrigir (obrigatório ao devolver; opcional ao aprovar)"),
      aceite: { type: "boolean", description: "true confirma o aceite de responsabilidade (obrigatório para aprovar)" },
    }, required: ["task_id", "decisao"] },
  }},
```

- [ ] **Step 4: Rodar o teste até passar**

Run: `~/scoop/shims/deno test --no-check supabase/functions/chat-orchestrator/tools/toolSchemas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/chat-orchestrator/tools/registry.ts supabase/functions/chat-orchestrator/tools/toolSchemas.test.ts
git commit -m "feat(orchestrator): registra tools delegate + revisao no registry"
```

---

### Task 4: Handlers das tools de revisão

**Files:**
- Modify: `supabase/functions/chat-orchestrator/tools/handlers.ts`

**Interfaces:**
- Consumes: `runReadTool(client, userId, name, args)`, `runWriteTool(userClient, userId, name, args)` (assinaturas existentes).
- Produces: `get_revisao_peca_context` em `runReadTool` (retorna o jsonb da RPC); `decidir_revisao_peca` em `runWriteTool` (retorna `{ ok, result:{ status } }` ou `{ ok:false, error }`).

- [ ] **Step 1: Adicionar o case de leitura**

Em `runReadTool`, antes do `default:` (após `consultar_cep`), inserir:

```ts
    case "get_revisao_peca_context": {
      // Contexto da revisão (peça + metadados). RPC SECURITY DEFINER; roda sob a
      // identidade do usuário (o `client` carrega o JWT).
      const { data } = await client.rpc("get_revisao_peca_context", { p_task_id: String(args.task_id) });
      return data ?? {};
    }
```

- [ ] **Step 2: Adicionar o case de escrita**

Em `runWriteTool`, antes do `default:` (após `solicitar_checklist_documental`), inserir:

```ts
      case "decidir_revisao_peca": {
        // A RPC exige assignee_user_id = auth.uid() (ou master) e, para aprovar,
        // p_aceite=true. userClient carrega o JWT do revisor humano.
        const { data, error } = await userClient.rpc("decidir_revisao_peca", {
          p_task_id: args.task_id,
          p_decisao: args.decisao,
          p_observacoes: args.observacoes ?? null,
          p_aceite: args.aceite === true,
        });
        if (error) return { ok: false, error: error.message };
        return { ok: true, result: { status: data } };
      }
```

- [ ] **Step 3: Type-check**

Run: `~/scoop/shims/deno check supabase/functions/chat-orchestrator/tools/handlers.ts`
Expected: sem novos erros.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/chat-orchestrator/tools/handlers.ts
git commit -m "feat(orchestrator): handlers de get_revisao_peca_context + decidir_revisao_peca"
```

---

### Task 5: Catálogo + grants (revisão ao Diretor de Revisão; `salvar_peca` aos executores)

**Files:**
- Create: `supabase/migrations/20260717131000_tool_catalog_revisao_grants.sql` (espelho)
- Modify (via MCP `apply_migration`): banco

**Interfaces:**
- Produces: `tool_catalog` com `get_revisao_peca_context` (consulta) e `decidir_revisao_peca` (acao); `agent_tools` concedendo as 2 tools ao `Diretor Jurídico — Revisão` e `salvar_peca` a todos os `specialist` ativos; `allowed_tools` sincronizado pelo trigger `sync_agent_allowed_tools`.

- [ ] **Step 1: Aplicar a migração (MCP)**

`apply_migration` name `tool_catalog_revisao_grants`:

```sql
-- 1) Catálogo: as 2 tools de revisão (delegate e salvar_peca já existem no catálogo)
INSERT INTO public.tool_catalog (code, category, is_active)
VALUES ('get_revisao_peca_context', 'consulta', true),
       ('decidir_revisao_peca', 'acao', true)
ON CONFLICT (code) DO UPDATE SET is_active = true, category = EXCLUDED.category;

-- 2) Grant das 2 tools de revisão ao(s) "Diretor Jurídico — Revisão" (todos os donos)
INSERT INTO public.agent_tools (agent_id, tool_id)
SELECT a.id, tc.id
FROM public.agents a
JOIN public.tool_catalog tc ON tc.code IN ('get_revisao_peca_context','decidir_revisao_peca')
WHERE a.role = 'director' AND a.name = 'Diretor Jurídico — Revisão' AND a.is_active
ON CONFLICT (agent_id, tool_id) DO NOTHING;

-- 3) Grant salvar_peca a todos os executores (specialist ativos)
INSERT INTO public.agent_tools (agent_id, tool_id)
SELECT a.id, tc.id
FROM public.agents a
JOIN public.tool_catalog tc ON tc.code = 'salvar_peca'
WHERE a.role = 'specialist' AND a.is_active
ON CONFLICT (agent_id, tool_id) DO NOTHING;
```

> Nota: confirmar a constraint de unicidade real de `agent_tools` antes de aplicar; se não for `(agent_id, tool_id)`, ajustar o `ON CONFLICT` (verificar com `\d public.agent_tools` via `execute_sql` em `information_schema`).

- [ ] **Step 2: Verificar grants + sincronização de `allowed_tools`**

`execute_sql`:
```sql
SELECT a.name, a.role,
       (SELECT array_agg(tc.code ORDER BY tc.code) FROM public.agent_tools at
          JOIN public.tool_catalog tc ON tc.id=at.tool_id WHERE at.agent_id=a.id) AS granted,
       a.allowed_tools
FROM public.agents a
WHERE a.is_active AND (a.name='Diretor Jurídico — Revisão' OR a.role='specialist')
ORDER BY a.role, a.name LIMIT 10;
```
Expected: o Diretor de Revisão inclui `decidir_revisao_peca` + `get_revisao_peca_context` (em `granted` e `allowed_tools`); specialists incluem `salvar_peca`.

- [ ] **Step 3: Escrever o espelho `.sql`**

Criar `supabase/migrations/20260717131000_tool_catalog_revisao_grants.sql` com o SQL do Step 1.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260717131000_tool_catalog_revisao_grants.sql
git commit -m "feat(db): catalogo das tools de revisao + grants (revisor e executores)"
```

---

### Task 6: Ramo `delegating` no `index.ts` (a pilha + `delegate`)

**Files:**
- Modify: `supabase/functions/chat-orchestrator/index.ts` (imports; gating no ramo `routing_n1`; novo bloco `else if (run.status === "delegating")`; contador de hops)

**Interfaces:**
- Consumes: `delegation.ts` (Task 2); `loadAgent`, `loadSubAgents`, `loadGlobalSpecialists`, `callLLM`, `runReadTool`, `toolsFor`, `isWriteTool`, `isDelegateTool`, `safeJson`, `insertStage`, `upd`, `fireNextStep`, `finishAcaoDone`; flags da Task 1.
- Produces: comportamento multi-hop; grava `delegation_stack` e `chain`; finaliza o run em `done` ao esvaziar a pilha.

- [ ] **Step 1: Importar o módulo puro + a tool nativa**

No topo, junto aos imports de `./tools/registry.ts`:

```ts
import { toolsFor, isWriteTool, isDelegateTool, READ_TOOL_NAMES } from "./tools/registry.ts";
import {
  type DelegationStack, type DelegationContext, type DelegMsg,
  allowedChildRoles, resolveTarget, isAncestor, topFrame, makeFrame,
  pushChild, popWithResult, buildDelegationContextBlock,
} from "./delegation.ts";
```

- [ ] **Step 2: Gating no ramo `routing_n1`**

No início do bloco `if (run.status === "routing_n1") {` (após carregar `directors` NÃO — antes), inserir o desvio para `delegating`. Substituir a primeira linha do bloco por:

```ts
    if (run.status === "routing_n1") {
      // Multi-hop (gated): agente de entrada com `delegate` + flag → inicia a pilha.
      if (MULTIHOP_DELEGATION_ENABLED && (n1.allowed_tools ?? []).includes("delegate")) {
        const rootFrame = makeFrame(n1.id, 0, null, run.original_message);
        const stack: DelegationStack = [rootFrame];
        await insertStage(admin, run.session_id, run.user_id, `${n1.name} avaliando a solicitação...`, "delegating", n1);
        await upd({
          status: "delegating", delegation_stack: stack as unknown as Record<string, unknown>,
          chain: [...(run.chain || []), { level: 0, agent: n1.name, action: "delegating" }],
        });
        return fireNextStep(runId, supabaseUrl, serviceKey, userToken);
      }
      const directors = await loadSubAgents(admin, n1.owner_user_id, ["director"]);
      // ... (resto do bloco legado INALTERADO)
```

- [ ] **Step 3: Adicionar o bloco `delegating`**

Imediatamente após o fechamento do bloco `else if (run.status === "routing_n2") { ... }` e ANTES de `else if (run.status === "executing_n3") {`, inserir:

```ts
    } else if (run.status === "delegating") {
      // ── Multi-hop: processa o frame do TOPO com um loop curto de tools ──
      const stack = ((run.delegation_stack as unknown as DelegationStack) || []);
      const frame = topFrame(stack);
      if (!frame) return await fail("Pilha de delegação vazia");
      // Backstop anti-laço/DoS: nº de saltos acumulados na chain deste run.
      const hops = (run.chain || []).filter((c: Record<string, unknown>) => c.action === "delegate" || c.action === "delegating").length;
      if (hops > MAX_DELEGATION_HOPS) return await fail("Limite de saltos de delegação atingido");

      const agent = await loadAgent(admin, frame.agent_id);
      if (!agent) return await fail("Sub-agente inválido na pilha");
      ctxModel = agent?.model ?? undefined;

      // Ferramentas do agente, gated (delegate sempre disponível se concedido; leitura
      // no gate de leitura; escrita/salvar/decidir no gate de escrita).
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
      const gated = (agent.allowed_tools ?? []).filter((n) =>
        isDelegateTool(n) ? true
        : n === "salvar_peca" ? CHAT_TOOLS_ENABLED
        : isWriteTool(n) ? CHAT_TOOLS_ENABLED
        : CHAT_READ_TOOLS_ENABLED);
      const toolDefs = toolsFor(gated);
      const readClient = (userToken && anonKey)
        ? createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${userToken}` } } })
        : admin;
      const userClient = readClient; // escrita (salvar_peca/decidir) sob o JWT do usuário

      const ctxBlock = buildDelegationContextBlock(frame.delegation_context);
      const stableSystem = (agent.system_prompt || "") + buildUniversalGuardrails() + CONSULTA_TOOL_GUIDANCE + ctxBlock;
      const msgs: DelegMsg[] = [...frame.messages];

      const MAX_FRAME_ITERS = 6;
      for (let i = 0; i < MAX_FRAME_ITERS; i++) {
        const r = await callLLM(admin, {
          model: agent.model || "gpt-4o", cacheableSystem: stableSystem, systemPrompt: buildNowAnchor(),
          history: msgs as LlmMessage[], userMessage: "",
          temperature: agent.temperature, top_p: agent.top_p, maxTokens: agent.max_tokens ?? 4000,
          timeoutMs: LLM_N3_TIMEOUT_MS, tools: toolDefs, toolChoice: "auto", cancelPoll,
          ctx: { ...baseCtx, agentId: agent.id, stage: "delegating" },
        });

        // Sem tool-calls → texto final DESTE frame: desempilha (ou finaliza o run).
        if (!r.toolCalls || r.toolCalls.length === 0) {
          const popped = popWithResult(stack, r.content || "(sem conteúdo)");
          if (popped.length === 0) {
            // Frame raiz concluiu → resposta final ao usuário.
            await finishAcaoDone(r.content, agent, { model: r.rawModel, input_tokens: r.inputTokens, output_tokens: r.outputTokens, duration_ms: 0 }, null);
            return;
          }
          await insertStage(admin, run.session_id, run.user_id, `${agent.name} concluiu e devolveu ao nível acima.`, "delegating", agent);
          await upd({ status: "delegating", delegation_stack: popped as unknown as Record<string, unknown>, chain: [...(run.chain || []), { level: frame.depth, agent: agent.name, action: "return" }] });
          return fireNextStep(runId, supabaseUrl, serviceKey, userToken);
        }

        const call = r.toolCalls[0];
        const name = call.function.name;
        const args = safeJson(call.function.arguments);

        // ── delegate: resolve alvo, aplica guardas, empilha filho, salta ──
        if (isDelegateTool(name)) {
          if (frame.depth + 1 > MAX_DELEGATION_DEPTH) {
            msgs.push({ role: "assistant", content: "", tool_calls: [call] });
            msgs.push({ role: "tool", tool_call_id: call.id, name, content: "ERRO: profundidade máxima de delegação atingida — resolva você mesmo ou responda ao nível acima." });
            continue;
          }
          const childRoles = allowedChildRoles(agent.role);
          let candidates = await loadSubAgents(admin, agent.owner_user_id!, childRoles);
          if (childRoles.includes("specialist")) {
            const globals = await loadGlobalSpecialists(admin);
            for (const g of globals) if (!candidates.some((c) => c.id === g.id)) candidates.push(g);
          }
          const { match, ambiguous } = resolveTarget(String(args.target ?? ""), candidates.map((c) => ({ id: c.id, name: c.name, role: c.role, description: c.description })));
          if (!match) {
            const listMsg = ambiguous.length
              ? `AMBÍGUO: mais de um alvo casa "${args.target}" (${ambiguous.map((a) => a.name).join(", ")}). Refine o target.`
              : `SEM ALVO: nenhum sub-agente casa "${args.target}". Alvos possíveis: ${candidates.map((c) => c.name).join(", ") || "(nenhum)"}.`;
            msgs.push({ role: "assistant", content: "", tool_calls: [call] });
            msgs.push({ role: "tool", tool_call_id: call.id, name, content: listMsg });
            continue;
          }
          if (isAncestor(stack, match.id)) {
            msgs.push({ role: "assistant", content: "", tool_calls: [call] });
            msgs.push({ role: "tool", tool_call_id: call.id, name, content: `ERRO: laço de delegação — "${match.name}" já está na cadeia. Escolha outro alvo.` });
            continue;
          }
          const dctx: DelegationContext = {
            objetivo: String(args.objetivo ?? "Executar a demanda delegada"),
            resumo: (args.resumo as string) ?? null,
            client_id: (args.client_id as string) ?? frame.delegation_context?.client_id ?? null,
            process_id: (args.process_id as string) ?? frame.delegation_context?.process_id ?? null,
          };
          const seed = `${dctx.objetivo}${dctx.resumo ? `\n\nContexto: ${dctx.resumo}` : ""}`;
          const child = makeFrame(match.id, frame.depth + 1, dctx, seed);
          // Persistir: primeiro grava os msgs acumulados DESTE frame (com o assistant do delegate)
          const parentAssistant: DelegMsg = { role: "assistant", content: r.content || "", tool_calls: [call] };
          const stackWithParentMsgs = stack.map((f, idx) => idx === stack.length - 1 ? { ...f, messages: [...msgs] } : f);
          const pushed = pushChild(stackWithParentMsgs, call.id, parentAssistant, child);
          await insertStage(admin, run.session_id, run.user_id, `${agent.name} acionou ${match.name}: ${dctx.objetivo}`, "delegating", agent);
          await upd({ status: "delegating", delegation_stack: pushed as unknown as Record<string, unknown>, chain: [...(run.chain || []), { level: frame.depth + 1, agent: match.name, action: "delegate", objetivo: dctx.objetivo }] });
          return fireNextStep(runId, supabaseUrl, serviceKey, userToken);
        }

        // ── salvar_peca: glue (Task 7) — grava, cria revisão, desempilha ──
        if (name === "salvar_peca") {
          const result = await handleSalvarPeca(admin, userClient, run, agent, args, frame);
          msgs.push({ role: "assistant", content: r.content || "", tool_calls: [call] });
          msgs.push({ role: "tool", tool_call_id: call.id, name, content: JSON.stringify(result).slice(0, 2000) });
          const summary = result.ok
            ? `Peça salva; revisão criada (task ${result.result?.revisar_peca_task_id}) para o revisor.`
            : `Falha ao salvar a peça: ${result.error}`;
          const stackWithMsgs = stack.map((f, idx) => idx === stack.length - 1 ? { ...f, messages: [...msgs] } : f);
          const popped = popWithResult(stackWithMsgs, summary);
          if (result.ok) await insertStage(admin, run.session_id, run.user_id, summary, "delegating", agent);
          if (popped.length === 0) { await finishAcaoDone(summary, agent, null, null); return; }
          await upd({ status: "delegating", delegation_stack: popped as unknown as Record<string, unknown>, chain: [...(run.chain || []), { level: frame.depth, agent: agent.name, action: "salvar_peca" }] });
          return fireNextStep(runId, supabaseUrl, serviceKey, userToken);
        }

        // ── leitura / revisão / escrita comum: executa inline e realimenta ──
        let toolResult: unknown;
        if (READ_TOOL_NAMES.includes(name)) {
          toolResult = await runReadTool(readClient, run.user_id, name, args);
          await persistEntityCarryover(admin, run.session_id, name, toolResult);
        } else {
          toolResult = await runWriteTool(userClient, run.user_id, name, args);
        }
        msgs.push({ role: "assistant", content: r.content || "", tool_calls: [call] });
        msgs.push({ role: "tool", tool_call_id: call.id, name, content: JSON.stringify(toolResult).slice(0, 8000) });
      }
      // Estourou o teto de iterações do frame → devolve o que tem (fail-safe).
      const popped = popWithResult(stack, "(sub-agente não concluiu dentro do limite de iterações)");
      if (popped.length === 0) return await fail("Frame de delegação sem conclusão");
      await upd({ status: "delegating", delegation_stack: popped as unknown as Record<string, unknown> });
      return fireNextStep(runId, supabaseUrl, serviceKey, userToken);
```

- [ ] **Step 4: Type-check do edge**

Run: `~/scoop/shims/deno check supabase/functions/chat-orchestrator/index.ts`
Expected: sem novos erros (a função `handleSalvarPeca` só existirá após a Task 7 — se rodar antes, o check acusará `handleSalvarPeca` indefinida; nesse caso, seguir para a Task 7 e só então rodar o check final).

- [ ] **Step 5: Commit (após a Task 7 passar no type-check conjunto)**

```bash
git add supabase/functions/chat-orchestrator/index.ts
git commit -m "feat(orchestrator): ramo delegating (pilha multi-hop + delegate real)"
```

---

### Task 7: Glue da `salvar_peca` (texto → Storage → RPC)

**Files:**
- Modify: `supabase/functions/chat-orchestrator/index.ts` (nova função `handleSalvarPeca` + helper de task de confecção)

**Interfaces:**
- Consumes: `materiaToConfeccaoCode` (delegation.ts); `classifyMateria`; `salvar_peca` RPC; Storage `client-documents`.
- Produces: `handleSalvarPeca(admin, userClient, run, agent, args, frame) → { ok: boolean; result?: { client_document_id; revisar_peca_task_id; reviewer_user_id }; error?: string }`.

- [ ] **Step 1: Implementar `handleSalvarPeca` + helper de confecção**

Adicionar (perto das funções auxiliares do step, ex.: antes de `chooseSpecialistAndAcaoTipo`):

```ts
// Resolve/crea a task de confecção para que a DEVOLUÇÃO reabra algo (critério 3).
// Cria uma user_tasks de confecção por área, atribuída ao redator (auth via userClient).
async function ensureConfeccaoTask(
  userClient: SupabaseClient, run: any, clientId: string, processId: string | null,
): Promise<string | null> {
  try {
    const code = materiaToConfeccaoCode(classifyMateria(run.original_message));
    const { data: tt } = await userClient.from("task_types").select("id").eq("code", code).maybeSingle();
    const taskTypeId = (tt as { id?: string } | null)?.id;
    if (!taskTypeId) return null;
    const { data, error } = await userClient.rpc("create_user_task", {
      p_task_type_id: taskTypeId, p_assignee_user_id: run.user_id,
      p_title: "Confecção de peça (chat)", p_description: null, p_client_id: clientId,
      p_priority: "high", p_deadline_at: null, p_area: null, p_payload: {}, p_external_kanban_ref: null,
    });
    if (error) { console.warn(`[salvar_peca] confecção não criada: ${error.message}`); return null; }
    return (data as string) ?? null;
  } catch (e) { console.warn(`[salvar_peca] confecção erro: ${(e as Error)?.message}`); return null; }
}

// Glue: conteudo (texto) → arquivo no bucket client-documents → RPC salvar_peca.
async function handleSalvarPeca(
  admin: SupabaseClient, userClient: SupabaseClient, run: any, agent: AgentRow,
  args: Record<string, unknown>, frame: { delegation_context: DelegationContext | null },
): Promise<{ ok: boolean; result?: { client_document_id: string; revisar_peca_task_id: string; reviewer_user_id: string }; error?: string }> {
  try {
    const clientId = String(args.client_id ?? frame.delegation_context?.client_id ?? "");
    const processId = (args.process_id as string) ?? frame.delegation_context?.process_id ?? null;
    const conteudo = String(args.conteudo ?? "");
    const documentName = String(args.document_name ?? "Peça").slice(0, 200);
    const documentType = String(args.document_type ?? "peca");
    if (!clientId) return { ok: false, error: "salvar_peca: client_id ausente (resolva o cliente antes)." };
    if (!conteudo.trim()) return { ok: false, error: "salvar_peca: conteúdo vazio." };

    // Reviewer = dono da árvore (o sócio). Nunca cai no autor por omissão.
    const reviewerUserId = agent.owner_user_id ?? null;

    // 1) grava a peça no Storage (bucket client-documents; leitura segue RLS de client_documents)
    const path = `pecas/${processId ?? clientId}/${crypto.randomUUID()}.md`;
    const { error: upErr } = await admin.storage.from("client-documents")
      .upload(path, new Blob([conteudo], { type: "text/markdown" }), { upsert: false, contentType: "text/markdown" });
    if (upErr) return { ok: false, error: `falha no upload da peça: ${upErr.message}` };

    // 2) task de confecção (para a devolução reabrir algo)
    const confeccaoTaskId = await ensureConfeccaoTask(userClient, run, clientId, processId);

    // 3) RPC salvar_peca sob o JWT do usuário (created_by/assigner corretos)
    const { data, error } = await userClient.rpc("salvar_peca", {
      p_client_id: clientId,
      p_document_name: documentName,
      p_file_path: path,
      p_process_id: processId,
      p_document_type: documentType,
      p_mime_type: "text/markdown",
      p_reviewer_user_id: reviewerUserId,
      p_confeccao_task_id: confeccaoTaskId,
    });
    if (error) return { ok: false, error: error.message };
    const d = data as { client_document_id: string; revisar_peca_task_id: string; reviewer_user_id: string };
    return { ok: true, result: d };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? "erro ao salvar peça" };
  }
}
```

- [ ] **Step 2: Registrar a tool `salvar_peca` no `registry.ts`**

(É pré-requisito do glue: sem o schema, o modelo não a emite.) Em `tools/registry.ts`, dentro de `TOOLS`, adicionar:

```ts
  salvar_peca: { type: "function", function: {
    name: "salvar_peca",
    description: "Salva a peça que VOCÊ redigiu (texto integral em `conteudo`) e a envia para revisão humana. Resolva o cliente (e o processo, se houver) ANTES. NÃO é para respostas curtas — é a peça final. Após salvar, a peça fica pendente e uma tarefa de revisão é criada para o revisor.",
    parameters: { type: "object", properties: {
      client_id: str("id do cliente (resolvido via consultar_cliente)"),
      process_id: str("id do processo (opcional)"),
      document_name: str("nome da peça (ex.: 'Contestação — Fulano x Banco')"),
      document_type: str("tipo do documento (default 'peca')"),
      conteudo: str("TEXTO INTEGRAL da peça em markdown"),
    }, required: ["client_id", "document_name", "conteudo"] },
  }},
```

- [ ] **Step 3: Type-check conjunto do edge**

Run: `~/scoop/shims/deno check supabase/functions/chat-orchestrator/index.ts`
Expected: PASS (Task 6 + 7 juntas resolvem `handleSalvarPeca`).

- [ ] **Step 4: Rodar toda a suíte de testes de edge do orquestrador**

Run: `~/scoop/shims/deno test --no-check supabase/functions/chat-orchestrator/`
Expected: todos os testes passam (novos de `delegation.test.ts` + `toolSchemas.test.ts` + os pré-existentes).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/chat-orchestrator/index.ts supabase/functions/chat-orchestrator/tools/registry.ts
git commit -m "feat(orchestrator): glue salvar_peca (Storage client-documents + RPC) + schema da tool"
```

---

### Task 8: Deploy, flags e validação E2E (banco/tela)

**Files:**
- Deploy: edge `chat-orchestrator`
- Config: secrets/env do projeto

**Interfaces:**
- Consumes: tudo acima.
- Produces: fluxo multi-hop validável em `chat_messages`/`orchestration_runs`/`client_documents`/`user_tasks`.

- [ ] **Step 1: Build/type-check final + testes**

Run:
```
~/scoop/shims/deno check supabase/functions/chat-orchestrator/index.ts
~/scoop/shims/deno test --no-check supabase/functions/chat-orchestrator/
npm run build
```
Expected: tudo verde.

- [ ] **Step 2: Deploy do edge (`--no-verify-jwt`)**

Via MCP `deploy_edge_function` (ou `supabase functions deploy chat-orchestrator --no-verify-jwt`). Confirmar sucesso na resposta.

- [ ] **Step 3: Ligar as flags no ambiente do edge**

Definir os secrets do projeto (via `supabase secrets set` / painel):
`MULTIHOP_DELEGATION_ENABLED=true`, `CHAT_TOOLS_ENABLED=true` (necessário para `salvar_peca`/`decidir_revisao_peca`), `CHAT_READ_TOOLS_ENABLED=true` (default já on). Confirmar que `MAX_DELEGATION_DEPTH`/`MAX_DELEGATION_HOPS` usam default se ausentes.

> **Sinalizar ao Ryan:** ligar `CHAT_TOOLS_ENABLED=true` habilita TODA escrita agêntica (não só a peça). Confirmar antes.

- [ ] **Step 4: E2E — descida multi-hop (critério 1 e 4)**

No chat do sócio, enviar uma ordem de ação (ex.: "Redija a contestação do processo X do cliente Y").
Validar em `orchestration_runs` e `chat_messages`:
```sql
SELECT status, chain FROM public.orchestration_runs ORDER BY created_at DESC LIMIT 1;
SELECT role, metadata->>'stage' AS stage, left(content,80) FROM public.chat_messages
WHERE session_id = '<session>' ORDER BY sequence_number;
```
Expected: `chain` mostra `delegate` do Assistente→Diretor→Executor; stages "acionou" na ordem; run termina `done`.

- [ ] **Step 5: E2E — peça salva + revisão (critério 2)**

```sql
SELECT id, document_type, status, file_path FROM public.client_documents ORDER BY created_at DESC LIMIT 1;
SELECT id, task_type_id, status, assignee_user_id, payload->>'confeccao_task_id' AS conf
FROM public.user_tasks WHERE title ILIKE 'Revisar peça%' ORDER BY created_at DESC LIMIT 1;
```
Expected: `client_documents` com `status='pendente'`, `file_path` em `pecas/...`; `user_tasks revisar_peca` criada, `assignee` = sócio, `conf` preenchido. Abrir a peça na aba de documentos do cliente (tela) e confirmar que o arquivo abre.

- [ ] **Step 6: E2E — devolver reabre e refaz; aprovar conclui (critério 3)**

Como revisor (sócio), no chat: "Revise a peça da tarefa <id> e devolva pedindo <correção>".
```sql
-- após devolver:
SELECT status FROM public.user_tasks WHERE id = '<revisar_task>';           -- cancelled
SELECT status FROM public.user_tasks WHERE id = '<confeccao_task>';          -- in_progress
```
Refazer (novo turno do redator) → nova `revisar_peca`. Depois: "Aprove a peça da tarefa <id2>, aceito a responsabilidade" →
```sql
SELECT status, situacao FROM public.user_tasks WHERE id = '<revisar_task2>'; -- completed / concluida_sucesso
SELECT decisao, aceite FROM public.task_approval_log WHERE user_task_id='<revisar_task2>' ORDER BY created_at DESC LIMIT 1;
```
Expected: devolver reabre a confecção; aprovar com aceite conclui e loga `aceite=true`.

- [ ] **Step 7: Commit final (mirrors + doc de estado)**

```bash
git add -A
git commit -m "chore(orchestrator): deploy multi-hop + espelhos das migracoes da sessao"
git push
```

## Self-Review (executada)

- **Cobertura do spec:** Tarefa 1 (delegate real) → Tasks 2/3/6. Tarefa 2 (loop de revisão) → Tasks 3/4/5 + E2E Task 8.6. Tarefa 3 (glue salvar_peca) → Task 7 + grant Task 5. Deploys/bucket/espelhos → Tasks 1/5/7/8. Critérios 1-4 → Task 8.4-8.6.
- **Bucket:** `client-documents` (não criar `pecas`), coerente em todas as tasks.
- **Tipos:** `handleSalvarPeca` (Task 7) casa com a chamada na Task 6.3; `resolveTarget`/`pushChild`/`popWithResult`/`makeFrame`/`buildDelegationContextBlock`/`materiaToConfeccaoCode` definidos na Task 2 e consumidos nas Tasks 6/7 com as mesmas assinaturas.
- **Placeholders:** nenhum "TBD"/"handle errors" — código real em cada step. Único ponto verificável em runtime: constraint de unicidade de `agent_tools` (Task 5, Step 1 nota) — checar antes de aplicar.

## Riscos / notas de execução

- **`buildUniversalGuardrails`/`CONSULTA_TOOL_GUIDANCE`/`buildNowAnchor`/`persistEntityCarryover`/`baseCtx`/`cancelPoll`/`ctxModel`/`LlmMessage`** são símbolos JÁ existentes no escopo de `stepRun`/módulo do `index.ts` — confirmar os nomes exatos ao integrar (grep antes de colar).
- **Aceite legal por agente:** manter a aprovação humana como padrão (a tool fica concedida ao revisor, mas o `RevisaoPecaPanel` humano permanece o caminho recomendado).
- **`create_user_task`** já é usado em `handlers.ts` (mesma assinatura) — reuso seguro para a task de confecção.
