# Checklist de documentos pelo chat (6.3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Um comando de chat cria pendências documentais por ação/réu, via o cartão de confirmação do 4.1, atrás de uma flag dedicada — reusando o motor de pendências existente. Backend-only (sem mudança de FE).

**Architecture:** Nova write-tool `solicitar_checklist_documental` no `chat-orchestrator`; o handler mapeia documentos (texto livre) → tipo de pendência (dicionário determinístico testável) e chama `criar_pendencia` uma vez por documento. Gate por flag dedicada `CHAT_DOC_CHECKLIST_ENABLED` (default OFF). O `ActionCard`/`proposeAction` do 4.1 é reusado sem mudança.

**Tech Stack:** Deno (edge), Supabase RPC, TypeScript.

## Global Constraints
- **Flag dedicada `CHAT_DOC_CHECKLIST_ENABLED` (default OFF), independente do `CHAT_TOOLS_ENABLED`** (que segue OFF). Deploy inerte até ligar.
- **Não criar schema novo** — reusa `criar_pendencia` (a pendência É a cobrança vinculada ao cliente). `client_required_set` não cobre réu/ação (não usar para isso).
- **Reuso do fluxo 4.1** (`proposeAction`/`ActionCard`) — só um case novo em `humanSummary`. Sem mudança de front-end.
- **Bloqueio:** nenhum código novo; `auto_liberar_gate_documental` existente governa o protocolo. Pendências são não-bloqueantes.
- **CI `edge` verde antes de deploy;** deploy do `chat-orchestrator` é manual (MCP `deploy_edge_function`) — feito pelo controlador após CI verde.
- **Sem Deno/Node local:** valida no CI (`edge`).
- **Worktree** `C:/Users/Infosol/OneDrive/Desktop/JurisAI/wt-trilha-c`; `cd` para lá em todo git; nunca `git checkout` no dir primário; stage só os arquivos da task.

---

## Task 1: Módulo puro `docChecklist.ts` + Deno test
**Files:** Create `supabase/functions/chat-orchestrator/tools/docChecklist.ts`, `.../docChecklist.test.ts`

**Produces:** `mapDocumentoToTipo(doc: string): string`, `buildPendenciaTitulo(doc: string, reu?: string | null): string`, `PENDENCIA_TIPOS: readonly string[]`.

- [ ] **Step 1: Deno test (falha)** — `docChecklist.test.ts`:
```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mapDocumentoToTipo, buildPendenciaTitulo, PENDENCIA_TIPOS } from "./docChecklist.ts";

Deno.test("mapeia documentos conhecidos para o tipo de pendência", () => {
  assertEquals(mapDocumentoToTipo("extrato"), "extratos");
  assertEquals(mapDocumentoToTipo("Extratos"), "extratos");
  assertEquals(mapDocumentoToTipo("contrato"), "documentacao");
  assertEquals(mapDocumentoToTipo("comprovante de endereço"), "comprovante_endereco");
  assertEquals(mapDocumentoToTipo("senha INSS"), "senha_inss");
});

Deno.test("documento desconhecido cai em 'documentacao' e é um tipo válido", () => {
  assertEquals(mapDocumentoToTipo("algo aleatório"), "documentacao");
  // todo tipo retornado tem de pertencer ao enum aceito pelo criar_pendencia
  const t = mapDocumentoToTipo("xyz");
  assertEquals(PENDENCIA_TIPOS.includes(t), true);
});

Deno.test("título inclui o réu quando informado", () => {
  assertEquals(buildPendenciaTitulo("extrato", "Crefisa"), "Documento pendente: extrato — Crefisa");
  assertEquals(buildPendenciaTitulo("  contrato  ", null), "Documento pendente: contrato");
  assertEquals(buildPendenciaTitulo("contrato", "  "), "Documento pendente: contrato");
});
```
- [ ] **Step 2: Run (falha)** — CI `edge` (`deno test supabase/functions/chat-orchestrator/`). Local indisponível.
- [ ] **Step 3: Implementar** `docChecklist.ts`:
```ts
// TRILHA C · 6.3 — mapeamento determinístico (texto livre → tipo de pendência do
// criar_pendencia) + título padronizado. Puro/testável (sem I/O).

// Enum aceito por criar_pendencia (registry.ts / RPC criar_pendencia).
export const PENDENCIA_TIPOS = [
  "documentacao","comprovante_endereco","senha_inss","reset_inss","extratos",
  "falta_documentacao","audiencia","reuniao","andamento","whatsapp","outro",
] as const;

// Menções livres → tipo. Chaves normalizadas (lower/trim). Default: 'documentacao'
// (o tipo genérico do enum) — nunca inventa um tipo fora do CHECK.
const DOC_TIPO_MAP: Record<string, string> = {
  "extrato": "extratos",
  "extratos": "extratos",
  "extrato bancario": "extratos",
  "extrato bancário": "extratos",
  "contrato": "documentacao",
  "comprovante": "comprovante_endereco",
  "comprovante de endereco": "comprovante_endereco",
  "comprovante de endereço": "comprovante_endereco",
  "comprovante de residencia": "comprovante_endereco",
  "comprovante de residência": "comprovante_endereco",
  "senha inss": "senha_inss",
  "senha do inss": "senha_inss",
  "senha": "senha_inss",
  "rg": "documentacao",
  "cpf": "documentacao",
  "procuracao": "documentacao",
  "procuração": "documentacao",
};

export function mapDocumentoToTipo(doc: string): string {
  const key = (doc ?? "").trim().toLowerCase();
  return DOC_TIPO_MAP[key] ?? "documentacao";
}

export function buildPendenciaTitulo(doc: string, reu?: string | null): string {
  const base = `Documento pendente: ${(doc ?? "").trim()}`;
  const r = (reu ?? "").trim();
  return r ? `${base} — ${r}` : base;
}
```
- [ ] **Step 4: Run (verde)** — CI `edge`.
- [ ] **Step 5: Commit** (`feat(trilha-c): docChecklist — mapa determinístico documento→tipo de pendência + testes deno`).

---

## Task 2: Ligar a write-tool `solicitar_checklist_documental` (gated)
**Files:** Modify `supabase/functions/chat-orchestrator/tools/registry.ts`, `.../handlers.ts`, `../chat-orchestrator/index.ts`

**Consumes:** `docChecklist.ts` (Task 1); `criar_pendencia` RPC; fluxo `proposeAction`/`ActionCard` (existente).

- [ ] **Step 1: `registry.ts` — adicionar a ToolDef** (dentro de `TOOLS`, após `agendar_reuniao`, antes do fechamento `};`):
```ts
  solicitar_checklist_documental: { type: "function", function: {
    name: "solicitar_checklist_documental",
    description: "Registra como PENDENTES os documentos que faltam de um cliente para uma ação/réu (ex.: 'Para Crefisa, solicite extrato e contrato'). Resolva o cliente com consultar_cliente ANTES e passe cliente_id. Cria UMA pendência documental por documento.",
    parameters: { type: "object", properties: {
      cliente_id: str("id do cliente (resolvido via consultar_cliente)"),
      documentos: { type: "array", items: { type: "string" }, description: "documentos a solicitar (ex.: extrato, contrato)" },
      reu: str("réu/banco/credor da ação (ex.: Crefisa, Agibank) — opcional"),
      responsavel_user_id: str("id do responsável pela cobrança (opcional; default = quem cria)"),
      prazo: str("prazo em ISO 8601 (opcional)"),
    }, required: ["cliente_id", "documentos"] },
  }},
```
(É write-tool automaticamente: não está em `READ_TOOL_NAMES`.)

- [ ] **Step 2: `handlers.ts` — import + case no `runWriteTool`.** No topo, após o import de `resolveCep`:
```ts
import { mapDocumentoToTipo, buildPendenciaTitulo } from "./docChecklist.ts";
```
E adicionar o case dentro do `switch (name)` do `runWriteTool` (junto aos demais writes, ex.: após `agendar_reuniao`):
```ts
      case "solicitar_checklist_documental": {
        const docs = Array.isArray(args.documentos)
          ? (args.documentos as unknown[]).map((d) => String(d)).filter((d) => d.trim())
          : [];
        if (docs.length === 0) return { ok: false, error: "nenhum documento informado" };
        const reu = (args.reu as string | undefined) ?? null;
        const created: string[] = [];
        for (const doc of docs) {
          const { data, error } = await userClient.rpc("criar_pendencia", {
            p_tipo: mapDocumentoToTipo(doc),
            p_titulo: buildPendenciaTitulo(doc, reu),
            p_cliente_id: args.cliente_id ?? null,
            p_descricao: reu ? `Documento solicitado referente ao réu ${reu}.` : "Documento solicitado (checklist do atendimento).",
            p_responsavel_user_id: args.responsavel_user_id ?? null,
            p_prazo: args.prazo ?? null, p_data_fatal: null,
          });
          if (error) return { ok: false, error: `falha ao criar pendência para "${doc}": ${error.message}`, result: { pendencias: created } };
          created.push(String(data));
        }
        return { ok: true, result: { pendencias: created, total: created.length } };
      }
```

- [ ] **Step 3: `index.ts` — flag + gating + humanSummary.**
  (a) Após a linha de `CHAT_READ_TOOLS_ENABLED` (≈134), adicionar:
```ts
// TRILHA C · 6.3: gate DEDICADO do checklist documental por chat. Independente do
// CHAT_TOOLS_ENABLED (que segue OFF): deployar não muda nada até esta flag ligar.
const CHAT_DOC_CHECKLIST_ENABLED = (Deno.env.get("CHAT_DOC_CHECKLIST_ENABLED") ?? "false") === "true";
const DOC_CHECKLIST_TOOL = "solicitar_checklist_documental";
```
  (b) No cálculo de `gatedToolNames` (≈2343), trocar o filtro por (a nova tool tem gate próprio, independente):
```ts
        const gatedToolNames = run.feedback ? [] : (n3.allowed_tools ?? []).filter(
          (n) => n === DOC_CHECKLIST_TOOL ? CHAT_DOC_CHECKLIST_ENABLED
               : isWriteTool(n) ? CHAT_TOOLS_ENABLED
               : CHAT_READ_TOOLS_ENABLED);
```
  (c) No `humanSummary` (≈1611), adicionar o case antes do `default`:
```ts
    case "solicitar_checklist_documental": {
      const docs = (args.documentos as string[] ?? []).join(", ");
      const reu = args.reu ? ` (réu: ${args.reu})` : "";
      return `Registrar como pendentes os documentos${reu}: ${docs}.`;
    }
```

- [ ] **Step 4: Commit** (`feat(trilha-c): tool de chat solicitar_checklist_documental (gated) → pendências por documento`).

---

## Task 3 (controlador): CI verde + deploy manual do edge
- [ ] Push → aguardar o job `edge` do CI verde (`deno check` + `deno test`).
- [ ] Deploy manual: MCP `deploy_edge_function` (`chat-orchestrator`, project `tsltxvswzdnlmvljpryh`). **Inerte** (flag OFF).
- [ ] Confirmar (get_logs sem erro). Documentar os passos de habilitação (env `CHAT_DOC_CHECKLIST_ENABLED=true` + `allowed_tools`).

---

## Verificação final (aceite — após habilitar flag + allowed_tools)
1. Chat: "Para Crefisa, solicite extrato e contrato; registre como pendentes" → cartão de confirmação (ActionCard) com o resumo dos documentos.
2. Confirmar → `SELECT ... FROM user_tasks WHERE is_pendencia AND client_id=...` mostra uma pendência por documento, título com o réu.
3. Pendências visíveis na aba Pendências do cliente / recepção; servem de cobrança.
4. Entrada não trava; o gate/protocolo existente (`auto_liberar_gate_documental`) segue governando.
