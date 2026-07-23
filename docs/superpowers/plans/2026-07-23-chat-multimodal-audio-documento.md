# Chat Multimodal (áudio + documento→ação) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que qualquer ação do sistema seja disparada por áudio (gravar→revisar→enviar via Whisper) e por documento enviado no chat (OCR classifica o doc e o agente propõe cadastro/pendência via ActionCard).

**Architecture:** Trilho A é client-side espelhando o OCR de imagem: grava áudio → sobe em `chat-attachments` → edge nova `transcribe-audio` transcreve (Whisper via `_shared/transcription`) e grava `extracted_text` → texto cai no campo pra revisão → envia normal. Trilho B lê `ocr_fields`/`doc_type` no orchestrator, injeta contexto no agente de cadastro, e um glue determinístico no `handleConfirm` encadeia `apply_ocr_client_fields`+`criar_pendencia` após o `cadastrar_cliente` confirmado.

**Tech Stack:** Deno Edge Functions (Supabase), React + TypeScript (Vite), Deno test + Vitest, OpenAI Whisper/Vision DIRETO (BYOK).

## Global Constraints

- Transcrição/OCR = OpenAI DIRETO (sem OpenRouter); `assertOpenAiDirect` recusa modelo com "/". PII sensível.
- `whisper-1` como `TRANSCRIPTION_MODEL`.
- Limiar de confiança OCR = **0.85, não alterar** (`DEFAULT_CONFIDENCE_THRESHOLD`).
- `apply_ocr_client_fields` = só-se-vazio, `needsReview=false`, CPF/RG cifrados. **Não relaxar.**
- Gates default OFF: `TRANSCRIPTION_ENABLED` (edge), `VITE_TRANSCRIPTION_ENABLED` (front).
- Nunca compor chave de Storage com nome de arquivo cru — usar `sanitizeName`.
- Commits diretos na `main` (padrão do projeto). Não `push` sem pedido.

---

# FASE A — Áudio (gravar → revisar → enviar)

### Task A1: Edge `transcribe-audio`

**Files:**
- Create: `supabase/functions/transcribe-audio/index.ts`

**Interfaces:**
- Consumes: `getTranscriber` de `../_shared/transcription/index.ts`; `getCorsHeaders` de `../_shared/cors.ts`.
- Produces: HTTP `POST { attachmentId }` → `{ ok:true, text, chars, engine }` ou `{ ok:false, reason }`. Grava `chat_attachments.extracted_text`. Loga `ai_generations` `source="transcribe-audio"`.

Molde exato: `supabase/functions/ocr-attachment/index.ts` (auth caller-JWT + RLS, download service-role, update) + `transcribe-attendance-audio/index.ts` (gate `TRANSCRIPTION_ENABLED`, `getSecret` híbrido env→BYOK, `getTranscriber`).

- [ ] **Step 1: Escrever `index.ts`**

Estrutura (sem secret interno — não há trigger; único caller é o front autenticado):
```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { getTranscriber } from "../_shared/transcription/index.ts";

function jsonResp(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}
function enabled(): boolean {
  return (Deno.env.get("TRANSCRIPTION_ENABLED") || "").trim().toLowerCase() === "true";
}
async function getEdgeSecret(admin: SupabaseClient, key: string): Promise<string | null> {
  const env = (Deno.env.get(key) || "").trim();
  if (env) return env;
  try {
    const { data } = await admin.rpc("get_edge_runtime_secret", { p_key: key });
    const v = (data as string | null) ?? null;
    if (v && v.toString().trim()) return v.toString().trim();
  } catch { /* fallback já feito */ }
  return null;
}
async function resolveByokKey(admin: SupabaseClient, provider = "openai"): Promise<string | null> {
  const { data: cfg } = await admin.from("llm_provider_configs")
    .select("user_id").eq("provider", provider).eq("is_active", true)
    .order("is_default", { ascending: false }).limit(1).maybeSingle();
  const ownerId = (cfg as { user_id?: string } | null)?.user_id;
  if (!ownerId) return null;
  const { data } = await admin.rpc("get_provider_key_decrypted", { p_user_id: ownerId, p_provider: provider });
  const rows = (data as unknown as { decrypted_key: string }[]) || [];
  return rows.length ? rows[0].decrypted_key : null;
}
```
- Gate: `enabled()` OFF → `{ ok:false, reason:"transcription_disabled" }` mas **respeitando** `edge_runtime_secrets` (usar `getEdgeSecret(admin,"TRANSCRIPTION_ENABLED")` já que a config vive lá; ler admin primeiro).
- Auth: exige `Authorization`; `callerClient` lê `chat_attachments` (`id, storage_path, mime_type`) por RLS → 404 se não achar.
- Download `chat-attachments` via `adminClient`.
- `getSecret` híbrido: `TRANSCRIPTION_ENGINE`/`TRANSCRIPTION_MODEL` via `getEdgeSecret`; `OPENAI_API_KEY` via env→`resolveByokKey`.
- `getTranscriber(getSecret)`; null → `{ ok:false, reason:"transcription_disabled" }`.
- `transcribe({ bytes, mimeType, language:"pt" })`; texto vazio → `{ ok:false, reason:"empty_transcription" }`.
- `UPDATE chat_attachments SET extracted_text=<texto> WHERE id=attachmentId` (admin).
- Log best-effort `ai_generations`: `{ user_id:<caller uid>, source:"transcribe-audio", provider:"openai", model:<TRANSCRIPTION_MODEL|whisper-1>, stage:"transcribe", status:"ok", input_tokens:0, output_tokens:0 }`.
- Retorna `{ ok:true, text, chars, engine }`.

- [ ] **Step 2: Type-check**

Run: `deno check supabase/functions/transcribe-audio/index.ts` (se `deno` disponível; senão validar no deploy).
Expected: sem erros.

- [ ] **Step 3: Commit**
```bash
git add supabase/functions/transcribe-audio/index.ts
git commit -m "feat(transcribe-audio): edge de transcricao de audio do chat (Whisper, gate TRANSCRIPTION_ENABLED)"
```

> Nota: a lógica reutilizável (`getTranscriber`/Whisper) já tem testes em `_shared/transcription/registry.test.ts`. O edge é glue fino — segue a convenção do repo (edges `index.ts` não têm unit test; verificação = `deno check` + E2E).

---

### Task A2: Filtro `audio/*` fora dos documentos de caso (orchestrator) — TDD

**Files:**
- Modify: `supabase/functions/chat-orchestrator/index.ts` (função `loadCaseDocuments`, ~904-913; select passa a incluir `mime_type`)
- Create: `supabase/functions/chat-orchestrator/caseDocFilter.ts`
- Create: `supabase/functions/chat-orchestrator/caseDocFilter.test.ts`

**Interfaces:**
- Produces: `isCaseDocumentAttachment(mimeType: string | null): boolean` — `false` para `audio/*` (voz = comando, não prova), `true` p/ o resto.

- [ ] **Step 1: Teste que falha** — `caseDocFilter.test.ts`
```ts
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { isCaseDocumentAttachment } from "./caseDocFilter.ts";

Deno.test("audio/* nao e documento de caso", () => {
  assertEquals(isCaseDocumentAttachment("audio/webm"), false);
  assertEquals(isCaseDocumentAttachment("audio/webm;codecs=opus"), false);
  assertEquals(isCaseDocumentAttachment("audio/ogg"), false);
});
Deno.test("imagem/pdf/texto sao documentos de caso", () => {
  assertEquals(isCaseDocumentAttachment("image/png"), true);
  assertEquals(isCaseDocumentAttachment("application/pdf"), true);
  assertEquals(isCaseDocumentAttachment(null), true);
});
```

- [ ] **Step 2: Rodar e falhar**
Run: `deno test supabase/functions/chat-orchestrator/caseDocFilter.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar** — `caseDocFilter.ts`
```ts
// Voz é canal de COMANDO, não prova de caso: anexo audio/* transcrito não deve
// entrar em loadCaseDocuments (senão "crie uma pendência" marcaria hasReadableDocs).
export function isCaseDocumentAttachment(mimeType: string | null): boolean {
  return !((mimeType || "").toLowerCase().startsWith("audio/"));
}
```

- [ ] **Step 4: Rodar e passar**
Run: `deno test supabase/functions/chat-orchestrator/caseDocFilter.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire no `loadCaseDocuments`** — incluir `mime_type` no `.select(...)` e filtrar `.filter(d => isCaseDocumentAttachment(d.mime_type) && d.extracted_text?.trim())`. Import no topo do `index.ts`.

- [ ] **Step 6: Commit**
```bash
git add supabase/functions/chat-orchestrator/caseDocFilter.ts supabase/functions/chat-orchestrator/caseDocFilter.test.ts supabase/functions/chat-orchestrator/index.ts
git commit -m "feat(chat-orchestrator): exclui anexo audio/* dos documentos de caso (voz=comando)"
```

---

### Task A3: Lib `transcribeVoiceMessage` (front) + flag

**Files:**
- Create: `src/lib/transcribeVoiceMessage.ts`
- Modify: `.env.example` (adicionar `VITE_TRANSCRIPTION_ENABLED=false` perto do `VITE_OCR_ENABLED`)

**Interfaces:**
- Produces:
  - `export const TRANSCRIPTION_ENABLED: boolean` (espelho de `import.meta.env.VITE_TRANSCRIPTION_ENABLED`).
  - `export async function transcribeVoiceMessage(sessionId: string, userId: string, blob: Blob): Promise<{ ok: boolean; text: string }>`

- [ ] **Step 1: Implementar** — reusa `sanitizeName` (copiar o helper de `ingestChatAttachments.ts`) e `withTimeout`:
```ts
import { supabase } from "@/integrations/supabase/client";

export const TRANSCRIPTION_ENABLED =
  String(import.meta.env.VITE_TRANSCRIPTION_ENABLED).toLowerCase() === "true";

const INVOKE_TIMEOUT_MS = 20_000;
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("transcribe_timeout")), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}
export async function transcribeVoiceMessage(sessionId, userId, blob) {
  const path = `${userId}/${sessionId}/${Date.now()}_voice.webm`;
  const { error: upErr } = await supabase.storage.from("chat-attachments")
    .upload(path, blob, { upsert: false, contentType: blob.type || "audio/webm" });
  if (upErr) return { ok: false, text: "" };
  const { data: inserted, error: insErr } = await supabase.from("chat_attachments")
    .insert({ session_id: sessionId, user_id: userId, storage_path: path,
      file_name: "mensagem_de_voz.webm", mime_type: blob.type || "audio/webm",
      file_size: blob.size, extracted_text: null })
    .select("id").single();
  if (insErr || !inserted) return { ok: false, text: "" };
  try {
    const { data } = await withTimeout(
      supabase.functions.invoke("transcribe-audio", { body: { attachmentId: inserted.id } }),
      INVOKE_TIMEOUT_MS);
    if (data?.ok && typeof data.text === "string" && data.text.trim())
      return { ok: true, text: data.text.trim() };
  } catch { /* timeout/rede → degrade */ }
  return { ok: false, text: "" };
}
```

- [ ] **Step 2: Commit**
```bash
git add src/lib/transcribeVoiceMessage.ts .env.example
git commit -m "feat(chat): lib transcribeVoiceMessage + flag VITE_TRANSCRIPTION_ENABLED"
```

---

### Task A4: Hook `useChatVoiceRecorder`

**Files:**
- Create: `src/hooks/useChatVoiceRecorder.ts`

**Interfaces:**
- Consumes: `pickAudioMime`, `isRecordingSupported` de `@/lib/attendanceAudio`.
- Produces: `useChatVoiceRecorder(onComplete: (blob: Blob) => void): { supported: boolean; recording: boolean; elapsedMs: number; error: string | null; start: () => Promise<void>; stop: () => void }`. Auto-stop em 120_000 ms. Blob único (sem rotação).

- [ ] **Step 1: Implementar** — padrão de `useAttendanceRecorder.ts` simplificado (um recorder, `chunks`, `onstop` → `new Blob(chunks, {type: mime})` → `onComplete`). `MAX_MS = 120_000` com `setTimeout` que chama `stop()`. Cleanup no unmount, para tracks no stop.

- [ ] **Step 2: Type-check**
Run: `npx tsc --noEmit` (ou `npm run build` parcial). Expected: sem erros no arquivo.

- [ ] **Step 3: Commit**
```bash
git add src/hooks/useChatVoiceRecorder.ts
git commit -m "feat(chat): hook useChatVoiceRecorder (MediaRecorder, blob unico, auto-stop 2min)"
```

---

### Task A5: Ligar o mic (JurisChatPanel + JurisCloudOS)

**Files:**
- Modify: `src/components/JurisCloudOS.tsx` (handler `handleVoiceRecorded` que garante sessão, chama `transcribeVoiceMessage`, e seta `inputVal` com o texto)
- Modify: `src/components/juris-cloud/JurisChatPanel.tsx` (~605-647: trocar o botão de ditado pelo mic de gravação; gate por `TRANSCRIPTION_ENABLED && supported`)
- Modify: props de `JurisChatPanel` (passar o novo handler; manter `speechSupported`/`toggleRecording` só se optarmos por coexistência — aqui SUBSTITUÍMOS)

**Interfaces:**
- `JurisChatPanel` recebe prop `onVoiceBlob?: (blob: Blob) => Promise<void> | void` (chamado pelo hook `onComplete`), e usa `useChatVoiceRecorder` internamente para o botão.
- `JurisCloudOS.handleVoiceRecorded(blob)`: garante sessão (mesma lógica de `handleSend`), chama `transcribeVoiceMessage(sid, user.id, blob)`; sucesso → `setInputVal(prev => (prev ? prev + " " : "") + text)`; falha → toast curto "Não consegui transcrever o áudio. Tente de novo."

- [ ] **Step 1:** Em `JurisChatPanel`, instanciar `const voice = useChatVoiceRecorder(onVoiceBlob)`. Substituir o `<button className="jc-mic-btn">` de ditado (605-647) por um botão que:
  - só renderiza se `TRANSCRIPTION_ENABLED && voice.supported`;
  - `onClick={() => voice.recording ? voice.stop() : voice.start()}`;
  - mostra cronômetro `mm:ss` quando `voice.recording`; ícone mic/stop (reusar os SVGs existentes).
- [ ] **Step 2:** Em `JurisCloudOS`, implementar `handleVoiceRecorded` e passar como `onVoiceBlob` ao `JurisChatPanel`. Remover a dependência de `useDictation` do input (ou manter o hook, mas o botão agora é de gravação). Ajustar props/tipos.
- [ ] **Step 3: Type-check** — `npx tsc --noEmit`. Expected: sem erros.
- [ ] **Step 4:** Verificação no preview (dev server): mic aparece só com flag on; gravar→parar preenche o campo (usar stub de transcrição no ambiente).
- [ ] **Step 5: Commit**
```bash
git add src/components/JurisCloudOS.tsx src/components/juris-cloud/JurisChatPanel.tsx
git commit -m "feat(chat): mic grava audio -> Whisper -> preenche campo p/ revisao (substitui ditado)"
```

---

### Task A6: Config `edge_runtime_secrets` + deploy

- [ ] **Step 1:** Garantir em `edge_runtime_secrets` (via Supabase MCP `execute_sql`/`apply_migration`): `TRANSCRIPTION_ENABLED=true`, `TRANSCRIPTION_ENGINE=openai`, `TRANSCRIPTION_MODEL=whisper-1`. Espelhar num arquivo de migração-documentação (padrão do repo: "ESPELHO de migração já aplicada").
- [ ] **Step 2:** Deploy da edge `transcribe-audio` (verify_jwt=false) e do `chat-orchestrator` (via MCP `deploy_edge_function`, quando Ryan autorizar).
- [ ] **Step 3:** Front: setar `VITE_TRANSCRIPTION_ENABLED=true` no Cloudflare Pages + rebuild.

> **Checkpoint Fase A:** áudio "crie uma pendência de teste pra amanhã" → revisar → enviar → pendência no Kanban + `chat_attachments.extracted_text` + `ai_generations` `source=transcribe-audio`. Flag OFF → mic some.

---

# FASE B — Documento→ação

### Task B1: `doc_type` no OCR vision — TDD

**Files:**
- Modify: `supabase/functions/_shared/ocr/openaiVisionExtractor.ts`
- Modify: `supabase/functions/_shared/ocr/openaiVisionExtractor.test.ts` (se existir; senão criar)

**Interfaces:**
- Produces: `ExtractionResult.fields` passa a poder conter `{ key:"doc_type", value:<enum>, confidence, method:"llm", needsReview:false, sourceDocument }`. Enum: `identidade|cnh|comprovante_residencia|extrato_inss|contracheque|procuracao|outro`.

- [ ] **Step 1: Teste que falha** — com `VisionCallFn` injetada devolvendo `doc_type`, assert que `result.fields` inclui um `OcrField` `key==="doc_type"` com o valor, e que `doc_type` **não** é mapeado a coluna de cadastro.
```ts
Deno.test("doc_type entra em fields, fora do cadastro", async () => {
  const call = async () => ({ text: "RG ...", fields: [], doc_type: "identidade" } as any);
  const ex = createOpenAiVisionExtractor({ apiKey: "x", model: "gpt-4o-mini", call });
  const r = await ex.extract({ bytes: new Uint8Array([1]), sourceDocument: "rg.png" });
  const dt = r.fields.find(f => f.key === "doc_type");
  assertEquals(dt?.value, "identidade");
});
```
- [ ] **Step 2: Rodar e falhar.**
- [ ] **Step 3: Implementar:** no `VISION_PROMPT`, pedir `"doc_type":"<um de: identidade|cnh|comprovante_residencia|extrato_inss|contracheque|procuracao|outro>"`; em `VisionRawResult` adicionar `doc_type?: string`; no `makeOpenAiVisionCall` ler `parsed.doc_type`; no `extract`, se `raw.doc_type` for do enum, `push` um `OcrField {key:"doc_type", value, confidence:0.9, method:"llm", needsReview:false, sourceDocument}`. Não adicionar `doc_type` a `VISION_FIELD_KEYS` (fica fora do auto-fill).
- [ ] **Step 4: Rodar e passar.**
- [ ] **Step 5: Commit** `feat(ocr): classifica doc_type na visao (fora do auto-fill de cadastro)`.

---

### Task B2: Orchestrator lê `ocr_fields`/`doc_type` → bloco de contexto — TDD

**Files:**
- Create: `supabase/functions/chat-orchestrator/ocrDocContext.ts` + `.test.ts`
- Modify: `chat-orchestrator/index.ts` (`loadCaseDocuments` select `ocr_fields, ocr_confidence`; `executing_n3` injeta o bloco)

**Interfaces:**
- Produces: `buildOcrDocContext(docs: Array<{ file_name:string; ocr_fields:unknown; ocr_confidence:number|null }>): string` — retorna "" se nenhum tiver `doc_type`; senão um bloco legível: tipo do doc, campos `key=value [REVISAR?]`, confiança geral.

- [ ] **Step 1: Teste** — doc com `ocr_fields=[{key:"doc_type",value:"identidade"},{key:"cpf",value:"...",needsReview:false},{key:"mother_name",value:"...",needsReview:true}]` → bloco contém "identidade", "cpf", e marca "[REVISAR]" no mother_name; doc sem doc_type → "".
- [ ] **Step 2: Falhar → Step 3: Implementar (função pura) → Step 4: Passar.**
- [ ] **Step 5: Wire** no `loadCaseDocuments` (select) e no `stableSystem` do `executing_n3` (concatenar `buildOcrDocContext` junto do `buildCanonicalFactsBlock`).
- [ ] **Step 6: Commit** `feat(chat-orchestrator): injeta doc_type+campos OCR no contexto do especialista`.

---

### Task B3: Prompt do agente de cadastro/recepção (DB)

**Files:**
- Create: `supabase/migrations/<ts>_agent_cadastro_ocr_prompt.sql` (ESPELHO da atualização aplicada via MCP)

- [ ] **Step 1:** Via Supabase MCP, identificar o(s) agente(s) de cadastro/recepção (`SELECT id,name,role FROM agents WHERE ...`) e ler o `system_prompt` atual.
- [ ] **Step 2:** Append de instruções (fluxo agentic): doc de identidade com CPF → `consultar_cliente`; não achou → propor `cadastrar_cliente` (ActionCard) com nome/CPF do doc; CPF já existe → propor **atualizar campos vazios/anexar**, **nunca duplicar**. Só propor, nunca executar sem ActionCard.
- [ ] **Step 3:** Aplicar via MCP + salvar espelho .sql. Commit `feat(agents): prompt de cadastro trata documento->cadastro via ActionCard`.

---

### Task B4: Glue pós-confirmação (`ocr_apply`) — TDD helpers puros

**Files:**
- Create: `supabase/functions/chat-orchestrator/ocrApplyGlue.ts` + `.test.ts`
- Modify: `chat-orchestrator/index.ts` (`proposeAction` anexa `ocr_apply`; `handleConfirm` executa o glue)

**Interfaces:**
- Produces:
  - `ocrApplyFromTurn(tool:string, turnDocs): { fields: Record<string,string>; attachmentId: string; missing: string[] } | null` — só p/ `tool==="cadastrar_cliente"` quando o turno tem doc de identidade com `ocr_fields`.
  - `computeMissingFields(applied: Record<string,string>, ocrFields: OcrFieldLite[]): string[]` — campos-alvo do cadastro que ficaram vazios + os que vieram `[REVISAR]` (rótulos pt-BR).

- [ ] **Step 1: Teste** de `computeMissingFields` (ex.: sem `birth_date` aplicado + `mother_name` needsReview → `["Data de nascimento","Nome da mãe"]`).
- [ ] **Step 2: Falhar → Step 3: Implementar → Step 4: Passar.**
- [ ] **Step 5: Wire:**
  - Em `proposeAction`: se `ocrApplyFromTurn(...)` != null p/ a proposta `cadastrar_cliente`, incluir `ocr_apply` no `proposal` (e no `metadata`).
  - Em `handleConfirm`: após `runWriteTool` de `cadastrar_cliente` com `result.id` e `proposal.ocr_apply` presente → `admin.rpc("apply_ocr_client_fields", { p_client_id:id, p_fields:fields })` → `admin.rpc("criar_pendencia", { p_titulo:"Completar cadastro de <nome>", p_descricao:<lista de missing>, p_cliente_id:id, ... })`. Best-effort, isolado em try/catch (não quebra a confirmação).
- [ ] **Step 6: Commit** `feat(chat-orchestrator): glue OCR pos-cadastro (apply_ocr_client_fields + pendencia de faltantes)`.

---

### Task B5: CPF já cadastrado → atualizar, não duplicar

**Files:**
- Modify: `chat-orchestrator/index.ts` / prompt (B3) — quando `consultar_cliente` acha o CPF, a proposta é de **atualização** do cliente existente (confirmável) chamando `apply_ocr_client_fields(existente, fields)`; nunca `cadastrar_cliente`.

- [ ] **Step 1:** Garantir no prompt (B3) e no glue (B4) que, com CPF existente, a rota é atualizar (reusa `apply_ocr_client_fields` no cliente existente) — proposta separada, sem criar cliente.
- [ ] **Step 2:** Verificação: RG de CPF já cadastrado → ActionCard de atualização, `clients` não ganha linha nova.
- [ ] **Step 3: Commit** `feat(chat-orchestrator): documento de CPF existente atualiza cadastro (nunca duplica)`.

---

### Task B6: Config/deploy Fase B

- [ ] Deploy `ocr-attachment` (via `_shared/ocr`) e `chat-orchestrator`. OCR já ligado em prod (`OCR_ENABLED=true`, `OCR_ENGINE=openai-vision`).
- [ ] Rebuild Cloudflare Pages.

> **Checkpoint Fase B:** foto de RG → ActionCard → confirmar → `clients` criado + campos aplicados + pendência com faltantes; RG de CPF existente → atualiza, não duplica.

## Self-review (cobertura do spec)

- Trilho A (edge, lib, hook, mic, filtro áudio, config) → A1–A6. ✓
- Critério A (extracted_text + ai_generations + flag off) → A1 + A6 checkpoint. ✓
- Trilho B (doc_type, contexto, prompt, glue, CPF-existe, deploy) → B1–B6. ✓
- Critérios B (cadastro+campos+pendência; não-duplica) → B4/B5 checkpoints. ✓
- Limitação custo Whisper (tokens 0) → registrada no A1. ✓
