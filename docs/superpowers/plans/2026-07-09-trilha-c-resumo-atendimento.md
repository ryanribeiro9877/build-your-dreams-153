# Resumo do atendimento (6.2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Gerar um resumo estruturado do atendimento via LLM (edge function isolada) e salvá-lo no cliente (`client_documents` `resumo_atendimento`), visível na ficha e no Histórico, com anti-alucinação.

**Architecture:** Nova edge function `attendance-summary` (isolada do `chat-orchestrator`) reúne o conteúdo textual do atendimento (chat da sessão do cliente), chama o LLM (gpt-4o-mini, jsonMode, temp 0), normaliza (campos ausentes → "não informado") e grava em `client_documents`. UI na `ResumoTab` dispara e exibe.

**Tech Stack:** Deno (edge), Supabase (Postgres+storage), React/TS, Vitest, Deno test.

## Global Constraints
- **Sem `db push`.** Migration aditiva via `apply_migration` (introspectar CHECK vivo + adicionar `resumo_atendimento`).
- **LLM só server-side** (edge). Chave via `llm_provider_configs` + RPC `get_provider_key_decrypted` (padrão `resolveKey`). Nunca ao client.
- **Não tocar no `chat-orchestrator`** (isolamento de risco). Feature nova em `supabase/functions/attendance-summary/`.
- **Anti-alucinação:** dado ausente → `"não informado"`, nunca inventado.
- **Reuso:** `_shared/cors.ts` (`getCorsHeaders`), padrão de auth/clients de `ocr-attachment/index.ts`, `buildDocInsert` de `src/lib/clientDocuments.ts` p/ o insert (client-side não; o insert é no edge — usar shape equivalente).
- **`document_type='resumo_atendimento'`, `origem='sistema'`, `status='recebido'`.**
- **Sem Node/Deno local:** valida no CI (jobs `ci` + `edge`).
- **Worktree:** `C:/Users/Infosol/OneDrive/Desktop/JurisAI/wt-trilha-c`; `cd` para lá em todo git; nunca `git checkout` no dir primário; stage só os arquivos da task.

---

## Task 1: Migration aditiva `resumo_atendimento` (executada pelo controlador)
**Files:** Create `supabase/migrations/<ts>_resumo_atendimento_doc_type.sql`
- [ ] Introspectar CHECK vivo (`SELECT pg_get_constraintdef(oid) ... conname='client_documents_document_type_check'`).
- [ ] `apply_migration` recriando o CHECK = conjunto vivo (16 valores, incl. `audio_atendimento`) **+ `resumo_atendimento`**.
- [ ] Verificar (`pg_get_constraintdef` contém `resumo_atendimento` e nada perdido).
- [ ] Escrever o `.sql` espelho (idempotente) e commit.

> Sensível a produção → executada pelo controlador (MCP), como no Ciclo 1.

---

## Task 2: Edge — módulo puro `attendanceSummary.ts` + Deno test
**Files:** Create `supabase/functions/attendance-summary/attendanceSummary.ts`, `.../attendanceSummary.test.ts`

**Produces:**
- `SUMMARY_FIELDS: readonly string[]` = `["problemas","bancos","contratos","emprestimos","tarifas","acoes_possiveis","documentos_solicitados","pendencias","orientacoes","proximos_passos"]`
- `interface AttendanceSummary` = cada campo de `SUMMARY_FIELDS` `: string` + `gerado_em: string` + `fonte: string`
- `assembleInput(messages: {role:string;content:string}[], attachmentSummaries: string[], maxChars?: number): string`
- `buildSummaryPrompt(): string` (system prompt, jsonMode, anti-alucinação, lista os campos exatos)
- `normalizeSummary(raw: unknown, fonte: string, geradoEm: string): AttendanceSummary`

- [ ] **Step 1: Deno test (falha primeiro)** — `attendanceSummary.test.ts`:
```ts
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assembleInput, buildSummaryPrompt, normalizeSummary, SUMMARY_FIELDS } from "./attendanceSummary.ts";

Deno.test("normalizeSummary preenche campos ausentes com 'não informado'", () => {
  const s = normalizeSummary({ problemas: "Cobrança indevida" }, "chat", "2026-07-09T12:00:00Z");
  assertEquals(s.problemas, "Cobrança indevida");
  assertEquals(s.bancos, "não informado");
  for (const f of SUMMARY_FIELDS) assertEquals(typeof (s as Record<string,string>)[f], "string");
  assertEquals(s.fonte, "chat");
  assertEquals(s.gerado_em, "2026-07-09T12:00:00Z");
});

Deno.test("normalizeSummary ignora chaves extras e coage não-string", () => {
  const s = normalizeSummary({ bancos: ["Crefisa","Agibank"], lixo: 1 }, "chat", "t");
  assertStringIncludes(s.bancos, "Crefisa");
  // deno-lint-ignore no-explicit-any
  assertEquals((s as any).lixo, undefined);
});

Deno.test("assembleInput respeita limite e rotula papéis", () => {
  const txt = assembleInput([{role:"user",content:"olá"},{role:"assistant",content:"oi"}], ["resumo doc"], 1000);
  assertStringIncludes(txt, "olá");
  assertStringIncludes(txt, "resumo doc");
});

Deno.test("buildSummaryPrompt exige anti-alucinação e lista os campos", () => {
  const p = buildSummaryPrompt();
  assertStringIncludes(p, "não informado");
  for (const f of SUMMARY_FIELDS) assertStringIncludes(p, f);
});
```
- [ ] **Step 2: Run (falha)** — CI job `edge` (`deno test supabase/functions/attendance-summary/`). Localmente indisponível.
- [ ] **Step 3: Implementar** `attendanceSummary.ts`:
```ts
// Puro/testável — sem I/O. Usado por index.ts (edge attendance-summary).
export const SUMMARY_FIELDS = [
  "problemas","bancos","contratos","emprestimos","tarifas",
  "acoes_possiveis","documentos_solicitados","pendencias","orientacoes","proximos_passos",
] as const;

export type SummaryField = typeof SUMMARY_FIELDS[number];
export type AttendanceSummary = Record<SummaryField, string> & { gerado_em: string; fonte: string };

const FIELD_LABELS: Record<SummaryField, string> = {
  problemas: "Problemas relatados", bancos: "Bancos/credores envolvidos",
  contratos: "Contratos", emprestimos: "Empréstimos", tarifas: "Tarifas/cobranças",
  acoes_possiveis: "Ações possíveis", documentos_solicitados: "Documentos solicitados",
  pendencias: "Pendências", orientacoes: "Orientações dadas", proximos_passos: "Próximos passos",
};

// Monta o texto-insumo (papéis rotulados + resumos de anexos), com teto de chars
// (mantém o INÍCIO — onde costuma estar o contexto do atendimento).
export function assembleInput(
  messages: { role: string; content: string }[],
  attachmentSummaries: string[],
  maxChars = 12000,
): string {
  const conv = messages
    .filter((m) => (m.content ?? "").trim().length > 0)
    .map((m) => `${m.role === "user" ? "Cliente/recepção" : m.role === "assistant" ? "Assistente" : m.role}: ${m.content.trim()}`)
    .join("\n");
  const anexos = attachmentSummaries.filter((s) => (s ?? "").trim()).map((s) => `- ${s.trim()}`).join("\n");
  let out = "";
  if (conv) out += `CONVERSA DO ATENDIMENTO:\n${conv}\n`;
  if (anexos) out += `\nRESUMOS DE DOCUMENTOS DO ATENDIMENTO:\n${anexos}\n`;
  return out.slice(0, maxChars);
}

export function buildSummaryPrompt(): string {
  const campos = SUMMARY_FIELDS.map((f) => `- "${f}" (${FIELD_LABELS[f]})`).join("\n");
  return [
    "Você resume atendimentos jurídicos (contexto: revisão de contratos bancários/consignados).",
    "Recebe o CONTEÚDO textual de um atendimento e produz um resumo ESTRUTURADO em JSON.",
    "Responda APENAS com um objeto JSON com EXATAMENTE estas chaves (todas string):",
    campos,
    "",
    "REGRAS (anti-alucinação): seja fiel e objetivo; NÃO invente. Se um dado não estiver",
    "explícito no conteúdo, escreva exatamente \"não informado\" naquele campo. É melhor",
    "\"não informado\" do que chutar. Este resumo é insumo para revisão humana.",
    "Escreva em português do Brasil, conciso.",
  ].join("\n");
}

function coerce(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean).join("; ");
  return String(v);
}

export function normalizeSummary(raw: unknown, fonte: string, geradoEm: string): AttendanceSummary {
  const obj = (raw && typeof raw === "object") ? raw as Record<string, unknown> : {};
  const out = { gerado_em: geradoEm, fonte } as AttendanceSummary;
  for (const f of SUMMARY_FIELDS) {
    const val = coerce(obj[f]).trim();
    (out as Record<string, string>)[f] = val.length ? val : "não informado";
  }
  return out;
}
```
- [ ] **Step 4: Run (verde)** — CI job `edge`.
- [ ] **Step 5: Commit** (`feat(trilha-c): módulo puro attendanceSummary (edge) + testes deno`).

---

## Task 3: Edge function `attendance-summary/index.ts`
**Files:** Create `supabase/functions/attendance-summary/index.ts`

**Consumes:** `attendanceSummary.ts`, `../_shared/cors.ts`.

- [ ] **Step 1: Implementar** (segue o padrão de `ocr-attachment/index.ts`):
```ts
// supabase/functions/attendance-summary/index.ts
//
// TRILHA C · 6.2 — Resumo do atendimento via LLM. Função ISOLADA (não toca no
// chat-orchestrator). Reúne o conteúdo textual do atendimento (chat da sessão do
// cliente), chama o LLM (gpt-4o-mini, jsonMode, temp 0), normaliza (anti-
// alucinação) e grava em client_documents (document_type='resumo_atendimento').
// FLAG: ATTENDANCE_SUMMARY_ENABLED (default ON; "false" desliga).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { assembleInput, buildSummaryPrompt, normalizeSummary, type AttendanceSummary } from "./attendanceSummary.ts";

function jsonResp(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
}
function enabled(): boolean {
  return (Deno.env.get("ATTENDANCE_SUMMARY_ENABLED") ?? "true").trim().toLowerCase() !== "false";
}
function providerFromModel(model: string): "openai" | "openrouter" { return model.includes("/") ? "openrouter" : "openai"; }
const ENDPOINT = { openai: "https://api.openai.com/v1/chat/completions", openrouter: "https://openrouter.ai/api/v1/chat/completions" };

async function resolveKey(admin: ReturnType<typeof createClient>, provider: string): Promise<string | null> {
  const { data: cfg } = await admin.from("llm_provider_configs")
    .select("user_id").eq("provider", provider).eq("is_active", true)
    .order("is_default", { ascending: false }).limit(1).maybeSingle();
  const ownerId = (cfg as { user_id?: string } | null)?.user_id;
  if (!ownerId) return null;
  const { data } = await admin.rpc("get_provider_key_decrypted", { p_user_id: ownerId, p_provider: provider });
  const rows = (data as unknown as { decrypted_key: string }[]) || [];
  return rows.length ? rows[0].decrypted_key : null;
}

async function callLLM(apiKey: string, model: string, system: string, user: string): Promise<string> {
  const provider = providerFromModel(model);
  const body: Record<string, unknown> = {
    model,
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    response_format: { type: "json_object" },
  };
  const restricted = /^(gpt-5|o\d)/i.test(model);
  if (!restricted) body.temperature = 0;
  if (provider === "openrouter") body.max_tokens = 1200; else body.max_completion_tokens = 1200;
  const resp = await fetch(ENDPOINT[provider], {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`LLM ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const j = await resp.json();
  return j?.choices?.[0]?.message?.content ?? "{}";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  try {
    if (!enabled()) return jsonResp(req, 200, { ok: false, reason: "disabled" });
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResp(req, 401, { ok: false, reason: "not_authenticated" });

    let body: { clientId?: string };
    try { body = await req.json(); } catch { return jsonResp(req, 400, { ok: false, reason: "invalid_body" }); }
    const clientId = body?.clientId;
    if (!clientId) return jsonResp(req, 400, { ok: false, reason: "missing_clientId" });

    const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(supabaseUrl, serviceKey);

    // Confirma acesso do caller ao cliente (RLS clients_decrypted). 404 se não puder ver.
    const { data: cli } = await caller.from("clients_decrypted").select("id, full_name").eq("id", clientId).maybeSingle();
    if (!cli) return jsonResp(req, 404, { ok: false, reason: "client_not_found_or_forbidden" });
    const clientName = (cli as { full_name?: string }).full_name ?? "";

    // Reúne o insumo (service-role): sessões do cliente → mensagens; + resumos de anexos.
    const { data: sessions } = await admin.from("chat_sessions").select("id").eq("client_id", clientId);
    const sessionIds = ((sessions as { id: string }[] | null) ?? []).map((s) => s.id);
    let messages: { role: string; content: string }[] = [];
    let attachmentSummaries: string[] = [];
    if (sessionIds.length) {
      const { data: msgs } = await admin.from("chat_messages")
        .select("role, content, created_at").in("session_id", sessionIds)
        .order("created_at", { ascending: true }).limit(400);
      messages = ((msgs as { role: string; content: string }[] | null) ?? [])
        .filter((m) => m.role === "user" || m.role === "assistant");
      const { data: atts } = await admin.from("chat_attachments")
        .select("summary").in("session_id", sessionIds).not("summary", "is", null);
      attachmentSummaries = ((atts as { summary: string }[] | null) ?? []).map((a) => a.summary);
    }
    const input = assembleInput(messages, attachmentSummaries);
    const geradoEm = new Date().toISOString();

    let summary: AttendanceSummary;
    if (!input.trim()) {
      // Sem conteúdo textual (ex.: atendimento só-áudio sem transcrição) → tudo "não informado".
      summary = normalizeSummary({}, "sem_conteudo", geradoEm);
    } else {
      const model = "gpt-4o-mini";
      const apiKey = await resolveKey(admin, providerFromModel(model));
      if (!apiKey) return jsonResp(req, 200, { ok: false, reason: "no_llm_key" });
      let raw: unknown = {};
      try { raw = JSON.parse(await callLLM(apiKey, model, buildSummaryPrompt(), input)); }
      catch { raw = {}; }
      summary = normalizeSummary(raw, "chat", geradoEm);
    }

    // Grava: arquivo JSON no bucket + linha em client_documents (caller → RLS).
    const ts = Date.parse(geradoEm);
    const filePath = `${clientId}/resumo_atendimento/${ts}.json`;
    const blob = new Blob([JSON.stringify(summary, null, 2)], { type: "application/json" });
    const { error: upErr } = await caller.storage.from("client-documents").upload(filePath, blob, { contentType: "application/json", upsert: false });
    if (upErr) return jsonResp(req, 500, { ok: false, reason: "upload_failed", message: upErr.message });
    const d = new Date(geradoEm);
    const pad = (n: number) => String(n).padStart(2, "0");
    const nome = `Resumo do atendimento ${pad(d.getUTCDate())}/${pad(d.getUTCMonth()+1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
    const { error: insErr } = await caller.from("client_documents").insert({
      client_id: clientId, client_name: clientName, document_type: "resumo_atendimento",
      document_name: nome, file_path: filePath, file_size: blob.size, mime_type: "application/json",
      notes: JSON.stringify(summary), status: "recebido", origem: "sistema",
    });
    if (insErr) return jsonResp(req, 500, { ok: false, reason: "insert_failed", message: insErr.message });

    return jsonResp(req, 200, { ok: true, summary });
  } catch (e) {
    return jsonResp(req, 500, { ok: false, reason: "server_error", message: e instanceof Error ? e.message : "erro" });
  }
});
```
- [ ] **Step 2: Commit** (`feat(trilha-c): edge attendance-summary — resumo via LLM salvo no cliente`).

---

## Task 4: Client — wrapper + UI na ResumoTab
**Files:** Create `src/lib/attendanceSummaryClient.ts`; Modify `src/components/clients/tabs/infoTabs.tsx`

- [ ] **Step 1: `attendanceSummaryClient.ts`**:
```ts
import { supabase } from "@/integrations/supabase/client";

export const SUMMARY_FIELDS = [
  "problemas","bancos","contratos","emprestimos","tarifas",
  "acoes_possiveis","documentos_solicitados","pendencias","orientacoes","proximos_passos",
] as const;
export type SummaryField = typeof SUMMARY_FIELDS[number];
export type AttendanceSummary = Record<SummaryField, string> & { gerado_em: string; fonte: string };

export const FIELD_LABELS: Record<SummaryField, string> = {
  problemas: "Problemas relatados", bancos: "Bancos/credores", contratos: "Contratos",
  emprestimos: "Empréstimos", tarifas: "Tarifas/cobranças", acoes_possiveis: "Ações possíveis",
  documentos_solicitados: "Documentos solicitados", pendencias: "Pendências",
  orientacoes: "Orientações", proximos_passos: "Próximos passos",
};

export async function generateAttendanceSummary(clientId: string): Promise<{ ok: boolean; summary?: AttendanceSummary; reason?: string }> {
  const { data, error } = await supabase.functions.invoke("attendance-summary", { body: { clientId } });
  if (error) return { ok: false, reason: error.message };
  return data as { ok: boolean; summary?: AttendanceSummary; reason?: string };
}

interface DocRow { id: string; document_name: string; notes: string | null; created_at: string; }
export interface StoredSummary { id: string; name: string; createdAt: string; summary: AttendanceSummary | null; }

export async function fetchAttendanceSummaries(clientId: string): Promise<StoredSummary[]> {
  const { data, error } = await supabase.from("client_documents")
    .select("id, document_name, notes, created_at")
    .eq("client_id", clientId).eq("document_type", "resumo_atendimento")
    .order("created_at", { ascending: false });
  if (error) return [];
  return ((data as DocRow[]) ?? []).map((r) => {
    let summary: AttendanceSummary | null = null;
    if (r.notes) { try { summary = JSON.parse(r.notes) as AttendanceSummary; } catch { summary = null; } }
    return { id: r.id, name: r.document_name, createdAt: r.created_at, summary };
  });
}
```
- [ ] **Step 2: ResumoTab** — adicionar seção "Resumo do atendimento" em `infoTabs.tsx` (dentro do `ResumoTab`), abaixo dos KPIs: botão "Gerar resumo do atendimento" (estado loading/erro via `toast`), exibir o resumo mais recente com `FIELD_LABELS` (cada campo; se `"não informado"`, cinza), e uma lista colapsada dos anteriores. Ao gerar com sucesso, recarregar via `fetchAttendanceSummaries`. Seguir os estilos `cli-*` do arquivo. Usar `useState`/`useEffect`; importar de `@/lib/attendanceSummaryClient`.
- [ ] **Step 3: Commit** (`feat(trilha-c): ResumoTab gera e exibe o resumo do atendimento`).

---

## Verificação final (aceite)
1. **Banco:** após gerar, `SELECT ... FROM client_documents WHERE document_type='resumo_atendimento' AND client_id=...` → linha com `notes` JSON dos 10 campos.
2. **Tela:** ResumoTab → "Gerar resumo" → resumo estruturado aparece; Histórico mostra o evento `documento`.
3. **Anti-alucinação:** cliente sem conteúdo textual → todos os campos `"não informado"` (fonte `sem_conteudo`).
