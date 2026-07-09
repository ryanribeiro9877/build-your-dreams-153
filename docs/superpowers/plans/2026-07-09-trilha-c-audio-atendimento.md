# Gravação de áudio do atendimento (6.1 + 2.6) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gravar o áudio real de um atendimento como prova, a partir da ficha do cliente, segmentado automaticamente em blocos de ~10 min sem interromper, com upload incremental de cada bloco para `client-documents` (`document_type='audio_atendimento'`), agrupado por sessão e recuperável/tocável.

**Architecture:** Um hook `useAttendanceRecorder` roda o motor (getUserMedia + MediaRecorder com rotação stop/restart num MediaStream único), delegando toda lógica pura e testável a `src/lib/attendanceAudio.ts` (naming, agrupamento, seleção de mime, fila de upload, insert). A persistência reusa 100% o padrão de `src/lib/clientDocuments.ts` (bucket `client-documents` + linha em `client_documents`). A UI vive na aba "Áudios/Transcrições" (`AudiosTab` em `chatTabs.tsx`).

**Tech Stack:** React 18 + TypeScript, Vite, Vitest (jsdom), Supabase (storage + Postgres), Web `MediaRecorder`/`getUserMedia`.

## Global Constraints

- **Sem `db push` (R-2).** A única mudança de schema é **aditiva** e aplicada via `apply_migration` (MCP Supabase). Não duplicar `schema_migrations`.
- **Desync repo↔banco:** o CHECK `client_documents_document_type_check` em produção é SUPERSET do repo (inclui `contrato_honorarios`, `declaracao_hipossuficiencia`). A migration DEVE introspectar o CHECK vivo e recriá-lo com o conjunto atual **+** `audio_atendimento` — nunca com a lista do repo.
- **Sem Node local:** testes/build validam no **CI Vercel**; não rodar `npm`/`vitest` localmente. Cada task "roda o teste" = deixar o comando pronto e verificar no CI/preview.
- **Reuso obrigatório:** `buildDocInsert` de `src/lib/clientDocuments.ts`; bucket `client-documents`; RLS `is_recepcao_or_socio` (não recriar policies).
- **Fonte de verdade do agrupamento:** `file_path = ${clientId}/atendimento/${sessionId}/${blockIndex}_${ts}.webm`. `notes` (JSON) é belt-and-suspenders.
- **`document_type='audio_atendimento'`, `status='recebido'`, `origem='recepcao'`, `mime_type='audio/webm'`.**
- **Fora de escopo:** transcrição, pausar/retomar, flag `CHAT_TOOLS`.

**Worktree:** todo o trabalho em `C:/Users/Infosol/OneDrive/Desktop/JurisAI/wt-trilha-c` (branch `claude/trilha-c-audio-atendimento`). Cada `git`/comando precisa começar com `cd` para esse path (o shell reseta o cwd entre chamadas).

---

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `supabase/migrations/<ts>_audio_atendimento_doc_type.sql` | Create | Recria o CHECK de `document_type` = conjunto vivo + `audio_atendimento` (idempotente). |
| `src/lib/clientDocuments.ts` | Modify | `DocInsertInput` ganha `notes?: string \| null`; `buildDocInsert` grava `d.notes ?? null`. |
| `src/lib/attendanceAudio.ts` | Create | Lógica pura: constantes, `newSessionId`, naming, `buildAudioDocInsert`, `pickAudioMime`, `isRecordingSupported`, `groupBySession`, `uploadAttendanceBlock`, `createUploadQueue`. |
| `src/lib/attendanceAudio.test.ts` | Create | Testes das funções puras + fila + `uploadAttendanceBlock` (supabase mockado). |
| `src/hooks/useAttendanceRecorder.ts` | Create | Motor de gravação (MediaRecorder + rotação), estado, fila. Verificado em preview. |
| `src/components/clients/tabs/chatTabs.tsx` | Modify | `AudiosTab`: seção gravador + listagem agrupada por sessão. Verificado em preview. |

---

## Task 1: Migration aditiva — `audio_atendimento` no CHECK

**Files:**
- Create: `supabase/migrations/<ts>_audio_atendimento_doc_type.sql`

**Interfaces:**
- Produces: valor `'audio_atendimento'` aceito por `client_documents.document_type` (consumido pela Task 3/`buildAudioDocInsert`).

- [ ] **Step 1: Introspectar o CHECK vivo (não confiar no repo)**

Via MCP Supabase `execute_sql` (projeto de produção), rodar:

```sql
SELECT pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conname = 'client_documents_document_type_check';
```

Anotar a lista exata de valores retornada. Esperado: contém pelo menos
`rg, cpf, comprovante, procuracao, contrato, termo_cooperado, outro,
comprovante_residencia, extrato_conta, extrato_ir, extrato_inss, cnis, certidao,
contrato_honorarios, declaracao_hipossuficiencia`. **Se aparecer algum valor a
mais, incluí-lo também** no Step 2 (a lista abaixo é o piso conhecido).

- [ ] **Step 2: Escrever a migration idempotente (repo mirror)**

Criar `supabase/migrations/<ts>_audio_atendimento_doc_type.sql` (usar timestamp real
`YYYYMMDDHHMMSS`), com o conjunto vivo do Step 1 + `audio_atendimento`:

```sql
-- ============================================================================
-- TRILHA C · 6.1 — Áudio de atendimento: adiciona 'audio_atendimento' ao
-- vocabulário de client_documents.document_type.
--
-- Aditivo/idempotente. NÃO usar db push (R-2). Recria o CHECK com o conjunto
-- VIVO de produção (SUPERSET do repo) + 'audio_atendimento'. Se o Step 1 de
-- introspecção retornar valores extras, acrescentá-los aqui antes de aplicar.
-- ============================================================================
BEGIN;

ALTER TABLE public.client_documents
  DROP CONSTRAINT IF EXISTS client_documents_document_type_check;

ALTER TABLE public.client_documents
  ADD CONSTRAINT client_documents_document_type_check
  CHECK (document_type IN (
    'rg', 'cpf', 'comprovante', 'procuracao', 'contrato', 'termo_cooperado', 'outro',
    'comprovante_residencia', 'extrato_conta', 'extrato_ir', 'extrato_inss', 'cnis',
    'certidao', 'contrato_honorarios', 'declaracao_hipossuficiencia',
    'audio_atendimento'
  ));

COMMIT;
```

- [ ] **Step 3: Aplicar via MCP `apply_migration`**

Chamar `apply_migration` com `name = "audio_atendimento_doc_type"` e o `query` idêntico
ao corpo do Step 2 (sem o `BEGIN/COMMIT` se o tool já envolver em transação; caso
contrário manter). Aplica no projeto de produção.

- [ ] **Step 4: Verificar o CHECK aplicado**

Via `execute_sql`:

```sql
SELECT pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conname = 'client_documents_document_type_check';
```

Esperado: a `def` agora contém `'audio_atendimento'` e **todos** os valores anteriores.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/Infosol/OneDrive/Desktop/JurisAI/wt-trilha-c"
git add supabase/migrations/*_audio_atendimento_doc_type.sql
git commit -m "feat(trilha-c): migration aditiva audio_atendimento no CHECK de document_type"
```

---

## Task 2: `attendanceAudio.ts` — funções puras + naming/agrupamento

**Files:**
- Modify: `src/lib/clientDocuments.ts`
- Create: `src/lib/attendanceAudio.ts`
- Test: `src/lib/attendanceAudio.test.ts`

**Interfaces:**
- Consumes: `buildDocInsert` de `./clientDocuments`.
- Produces (usado pelas Tasks 3/4/5):
  - `AUDIO_ATENDIMENTO_TYPE: "audio_atendimento"`, `ROTATE_MS: number`, `TIMESLICE_MS: number`
  - `interface AttendanceBlock { sessionId: string; blockIndex: number; startedAt: number; durationMs: number; blob: Blob; mimeType: string }`
  - `newSessionId(): string`
  - `buildAttendancePath(clientId: string, sessionId: string, blockIndex: number, ts: number, ext?: string): string`
  - `buildAttendanceName(startedAt: number, blockIndex: number): string`
  - `buildAttendanceNotes(b: { sessionId: string; blockIndex: number; durationMs: number; startedAt: number }): string`
  - `buildAudioDocInsert(clientId: string, clientName: string, uploadedBy: string, a: { filePath: string; fileSize: number; mimeType: string; notes: string; name: string }): ReturnType<typeof buildDocInsert>`
  - `pickAudioMime(): string`
  - `isRecordingSupported(): boolean`
  - `interface AudioDocRow { id: string; file_path: string; document_name: string; mime_type: string | null; notes: string | null; created_at: string }`
  - `interface AttendanceSession { sessionId: string; startedAt: number; totalDurationMs: number; blocks: AudioDocRow[] }`
  - `parseSessionIdFromPath(filePath: string): string | null`
  - `groupBySession(rows: AudioDocRow[]): AttendanceSession[]`

- [ ] **Step 1: Modificar `clientDocuments.ts` para aceitar `notes`**

Em `src/lib/clientDocuments.ts`, no `interface DocInsertInput` adicionar o campo (após `origem?`):

```ts
  /** default null — usado por áudio de atendimento p/ metadados de sessão/bloco. */
  notes?: string | null;
```

E em `buildDocInsert`, trocar a linha `notes: null,` por:

```ts
    notes: d.notes ?? null,
```

- [ ] **Step 2: Escrever os testes (falhando)**

Criar `src/lib/attendanceAudio.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

// attendanceAudio.ts importa o client do Supabase (via clientDocuments/uploadAttendanceBlock);
// stubamos como em clientDocuments.test.ts para não quebrar na carga do módulo.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  AUDIO_ATENDIMENTO_TYPE,
  buildAttendancePath,
  buildAttendanceName,
  buildAttendanceNotes,
  buildAudioDocInsert,
  parseSessionIdFromPath,
  groupBySession,
  type AudioDocRow,
} from "./attendanceAudio";

describe("attendanceAudio — naming", () => {
  it("path agrupa por cliente/sessão e preserva ordem no blockIndex", () => {
    const p = buildAttendancePath("c1", "s-abc", 2, 1720540800000);
    expect(p).toBe("c1/atendimento/s-abc/2_1720540800000.webm");
  });

  it("parseSessionIdFromPath extrai o sessionId do prefixo", () => {
    expect(parseSessionIdFromPath("c1/atendimento/s-abc/2_1720540800000.webm")).toBe("s-abc");
    expect(parseSessionIdFromPath("c1/rg.png")).toBeNull();
  });

  it("nome humano usa bloco 1-based", () => {
    // 2026-07-09 12:00 local — checamos só o sufixo do bloco p/ não depender de TZ.
    expect(buildAttendanceName(Date.parse("2026-07-09T12:00:00"), 0)).toMatch(/bloco 1$/);
    expect(buildAttendanceName(Date.parse("2026-07-09T12:00:00"), 4)).toMatch(/bloco 5$/);
  });
});

describe("attendanceAudio — buildAudioDocInsert", () => {
  it("grava document_type audio_atendimento, status recebido, origem recepcao e notes", () => {
    const notes = buildAttendanceNotes({ sessionId: "s1", blockIndex: 0, durationMs: 1000, startedAt: 10 });
    const row = buildAudioDocInsert("c1", "MARIA", "u1", {
      filePath: "c1/atendimento/s1/0_10.webm",
      fileSize: 123,
      mimeType: "audio/webm",
      notes,
      name: "Atendimento 09/07/2026 12:00 — bloco 1",
    });
    expect(row.document_type).toBe(AUDIO_ATENDIMENTO_TYPE);
    expect(row.status).toBe("recebido");
    expect(row.origem).toBe("recepcao");
    expect(row.mime_type).toBe("audio/webm");
    expect(JSON.parse(row.notes as string)).toMatchObject({ session_id: "s1", block_index: 0 });
  });
});

describe("attendanceAudio — groupBySession", () => {
  it("agrupa por sessão, ordena blocos por block_index e soma duração", () => {
    const rows: AudioDocRow[] = [
      { id: "b", file_path: "c1/atendimento/s1/1_20.webm", document_name: "b1", mime_type: "audio/webm",
        notes: JSON.stringify({ session_id: "s1", block_index: 1, duration_ms: 200, started_at: 20 }), created_at: "2026-07-09T12:10:00Z" },
      { id: "a", file_path: "c1/atendimento/s1/0_10.webm", document_name: "b0", mime_type: "audio/webm",
        notes: JSON.stringify({ session_id: "s1", block_index: 0, duration_ms: 100, started_at: 10 }), created_at: "2026-07-09T12:00:00Z" },
      { id: "c", file_path: "c1/atendimento/s2/0_99.webm", document_name: "x", mime_type: "audio/webm",
        notes: null, created_at: "2026-07-09T13:00:00Z" },
    ];
    const sessions = groupBySession(rows);
    expect(sessions).toHaveLength(2);
    const s1 = sessions.find((s) => s.sessionId === "s1")!;
    expect(s1.blocks.map((r) => r.id)).toEqual(["a", "b"]); // ordenado por block_index
    expect(s1.totalDurationMs).toBe(300);
    // s2 sem notes ainda agrupa pelo file_path
    expect(sessions.find((s) => s.sessionId === "s2")!.blocks).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Rodar os testes p/ verificar que falham**

Run (no CI/preview; localmente indisponível): `npx vitest run src/lib/attendanceAudio.test.ts`
Expected: FAIL — módulo `./attendanceAudio` não existe.

- [ ] **Step 4: Implementar `attendanceAudio.ts` (parte pura)**

Criar `src/lib/attendanceAudio.ts` com a parte pura (as funções de I/O e fila entram na Task 3, mas o arquivo já existe aqui):

```ts
// src/lib/attendanceAudio.ts
//
// TRILHA C · 6.1 — Gravação de áudio do atendimento. Lógica pura/testável
// separada do motor (useAttendanceRecorder). Persistência reusa o padrão de
// clientDocuments.ts (bucket client-documents + linha em client_documents).

import { supabase } from "@/integrations/supabase/client";
import { buildDocInsert } from "./clientDocuments";

export const AUDIO_ATENDIMENTO_TYPE = "audio_atendimento" as const;
export const ROTATE_MS = 10 * 60 * 1000; // bloco de ~10 min
export const TIMESLICE_MS = 1000;        // chunk de 1 s no MediaRecorder

export interface AttendanceBlock {
  sessionId: string;
  blockIndex: number;
  startedAt: number; // epoch ms do início do bloco
  durationMs: number;
  blob: Blob;
  mimeType: string;
}

export function newSessionId(): string {
  return crypto.randomUUID();
}

// file_path é a FONTE DE VERDADE do agrupamento: ${clientId}/atendimento/${sessionId}/${index}_${ts}.ext
export function buildAttendancePath(
  clientId: string, sessionId: string, blockIndex: number, ts: number, ext = "webm",
): string {
  return `${clientId}/atendimento/${sessionId}/${blockIndex}_${ts}.${ext}`;
}

// "Atendimento DD/MM/AAAA HH:MM — bloco N" (N é 1-based).
export function buildAttendanceName(startedAt: number, blockIndex: number): string {
  const d = new Date(startedAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  const data = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  const hora = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `Atendimento ${data} ${hora} — bloco ${blockIndex + 1}`;
}

export function buildAttendanceNotes(
  b: { sessionId: string; blockIndex: number; durationMs: number; startedAt: number },
): string {
  return JSON.stringify({
    session_id: b.sessionId,
    block_index: b.blockIndex,
    duration_ms: b.durationMs,
    started_at: b.startedAt,
  });
}

export function buildAudioDocInsert(
  clientId: string, clientName: string, uploadedBy: string,
  a: { filePath: string; fileSize: number; mimeType: string; notes: string; name: string },
) {
  return buildDocInsert(clientId, clientName, uploadedBy, {
    documentType: AUDIO_ATENDIMENTO_TYPE,
    documentName: a.name,
    filePath: a.filePath,
    fileSize: a.fileSize,
    mimeType: a.mimeType,
    status: "recebido",
    origem: "recepcao",
    notes: a.notes,
  });
}

// ---- listagem / agrupamento ----
export interface AudioDocRow {
  id: string;
  file_path: string;
  document_name: string;
  mime_type: string | null;
  notes: string | null;
  created_at: string;
}

export interface AttendanceSession {
  sessionId: string;
  startedAt: number;
  totalDurationMs: number;
  blocks: AudioDocRow[];
}

export function parseSessionIdFromPath(filePath: string): string | null {
  const m = /\/atendimento\/([^/]+)\//.exec(filePath);
  return m ? m[1] : null;
}

interface ParsedNotes { session_id?: string; block_index?: number; duration_ms?: number; started_at?: number }
function readNotes(row: AudioDocRow): ParsedNotes {
  if (!row.notes) return {};
  try { return JSON.parse(row.notes) as ParsedNotes; } catch { return {}; }
}

export function groupBySession(rows: AudioDocRow[]): AttendanceSession[] {
  const map = new Map<string, AttendanceSession>();
  for (const row of rows) {
    const n = readNotes(row);
    const sessionId = n.session_id ?? parseSessionIdFromPath(row.file_path) ?? row.id;
    let s = map.get(sessionId);
    if (!s) {
      s = { sessionId, startedAt: n.started_at ?? Date.parse(row.created_at), totalDurationMs: 0, blocks: [] };
      map.set(sessionId, s);
    }
    s.blocks.push(row);
    s.totalDurationMs += n.duration_ms ?? 0;
    if (n.started_at && n.started_at < s.startedAt) s.startedAt = n.started_at;
  }
  const idx = (r: AudioDocRow) => readNotes(r).block_index ?? Number.MAX_SAFE_INTEGER;
  for (const s of map.values()) s.blocks.sort((a, b) => idx(a) - idx(b));
  return [...map.values()].sort((a, b) => b.startedAt - a.startedAt);
}

// pickAudioMime / isRecordingSupported / uploadAttendanceBlock / createUploadQueue → Task 3
```

- [ ] **Step 5: Adicionar `pickAudioMime`/`isRecordingSupported` (puras, usadas na Task 4)**

Acrescentar ao final de `attendanceAudio.ts` (antes do comentário da Task 3):

```ts
const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];

export function pickAudioMime(): string {
  const MR = (globalThis as unknown as { MediaRecorder?: { isTypeSupported?: (t: string) => boolean } }).MediaRecorder;
  if (MR?.isTypeSupported) {
    for (const c of MIME_CANDIDATES) if (MR.isTypeSupported(c)) return c;
  }
  return "audio/webm";
}

export function isRecordingSupported(): boolean {
  const g = globalThis as unknown as {
    MediaRecorder?: unknown;
    navigator?: { mediaDevices?: { getUserMedia?: unknown } };
  };
  return typeof g.MediaRecorder !== "undefined" && !!g.navigator?.mediaDevices?.getUserMedia;
}
```

- [ ] **Step 6: Rodar os testes (verde) — CI/preview**

Run: `npx vitest run src/lib/attendanceAudio.test.ts`
Expected: PASS (naming, buildAudioDocInsert, groupBySession). `clientDocuments.test.ts` continua verde (mudança de `notes` é retrocompatível).

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/Infosol/OneDrive/Desktop/JurisAI/wt-trilha-c"
git add src/lib/clientDocuments.ts src/lib/attendanceAudio.ts src/lib/attendanceAudio.test.ts
git commit -m "feat(trilha-c): attendanceAudio helpers puros (naming, agrupamento, insert) + notes em buildDocInsert"
```

---

## Task 3: Upload de bloco + fila sequencial

**Files:**
- Modify: `src/lib/attendanceAudio.ts`
- Test: `src/lib/attendanceAudio.test.ts` (adicionar describes)

**Interfaces:**
- Consumes: `AttendanceBlock`, `buildAttendancePath`, `buildAttendanceName`, `buildAttendanceNotes`, `buildAudioDocInsert`, `supabase`.
- Produces (usado pela Task 4):
  - `type BlockStatus = "pending" | "uploading" | "done" | "error"`
  - `interface UploadResult { ok: boolean; error?: string }`
  - `uploadAttendanceBlock(clientId: string, clientName: string, uploadedBy: string, block: AttendanceBlock): Promise<UploadResult>`
  - `interface QueueItem { block: AttendanceBlock; status: BlockStatus; error?: string }`
  - `interface UploadQueue { enqueue(block: AttendanceBlock): void; retry(sessionId: string, blockIndex: number): void; getItems(): QueueItem[] }`
  - `createUploadQueue(uploadFn: (b: AttendanceBlock) => Promise<UploadResult>, onChange: (items: QueueItem[]) => void): UploadQueue`

- [ ] **Step 1: Escrever os testes (falhando)**

Adicionar ao final de `src/lib/attendanceAudio.test.ts`:

```ts
import {
  uploadAttendanceBlock,
  createUploadQueue,
  type AttendanceBlock,
  type UploadResult,
} from "./attendanceAudio";

function fakeBlock(blockIndex: number): AttendanceBlock {
  return {
    sessionId: "s1", blockIndex, startedAt: 1000 + blockIndex,
    durationMs: 100, blob: new Blob(["x"], { type: "audio/webm" }), mimeType: "audio/webm",
  };
}

describe("uploadAttendanceBlock", () => {
  it("sobe no bucket client-documents e insere linha; ok=true", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const insert = vi.fn().mockResolvedValue({ error: null });
    const mod = await import("@/integrations/supabase/client");
    (mod.supabase as unknown as Record<string, unknown>).storage = { from: () => ({ upload }) };
    (mod.supabase as unknown as Record<string, unknown>).from = () => ({ insert });

    const r = await uploadAttendanceBlock("c1", "MARIA", "u1", fakeBlock(0));
    expect(r.ok).toBe(true);
    expect(upload).toHaveBeenCalledOnce();
    expect(insert).toHaveBeenCalledOnce();
  });

  it("retorna ok=false quando o upload falha (não tenta inserir)", async () => {
    const upload = vi.fn().mockResolvedValue({ error: { message: "storage down" } });
    const insert = vi.fn();
    const mod = await import("@/integrations/supabase/client");
    (mod.supabase as unknown as Record<string, unknown>).storage = { from: () => ({ upload }) };
    (mod.supabase as unknown as Record<string, unknown>).from = () => ({ insert });

    const r = await uploadAttendanceBlock("c1", "MARIA", "u1", fakeBlock(0));
    expect(r.ok).toBe(false);
    expect(r.error).toContain("storage down");
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("createUploadQueue", () => {
  it("sobe blocos em ordem, sequencialmente", async () => {
    const order: number[] = [];
    const uploadFn = vi.fn(async (b: AttendanceBlock): Promise<UploadResult> => {
      order.push(b.blockIndex); return { ok: true };
    });
    const q = createUploadQueue(uploadFn, () => {});
    q.enqueue(fakeBlock(0)); q.enqueue(fakeBlock(1)); q.enqueue(fakeBlock(2));
    await vi.waitFor(() => expect(order).toEqual([0, 1, 2]));
    expect(q.getItems().every((i) => i.status === "done")).toBe(true);
  });

  it("marca error e permite retry", async () => {
    let fail = true;
    const uploadFn = vi.fn(async (): Promise<UploadResult> => {
      if (fail) { fail = false; return { ok: false, error: "net" }; }
      return { ok: true };
    });
    const q = createUploadQueue(uploadFn, () => {});
    q.enqueue(fakeBlock(0));
    await vi.waitFor(() => expect(q.getItems()[0].status).toBe("error"));
    q.retry("s1", 0);
    await vi.waitFor(() => expect(q.getItems()[0].status).toBe("done"));
  });
});
```

- [ ] **Step 2: Rodar (falha)**

Run: `npx vitest run src/lib/attendanceAudio.test.ts`
Expected: FAIL — `uploadAttendanceBlock`/`createUploadQueue` não exportados.

- [ ] **Step 3: Implementar upload + fila**

Substituir o comentário final `// pickAudioMime ... → Task 3` de `attendanceAudio.ts` por:

```ts
export interface UploadResult { ok: boolean; error?: string }

// Sobe um bloco no bucket client-documents e registra em client_documents.
// Mesmo bucket/tabela de clientDocuments.ts (RLS is_recepcao_or_socio reusada).
export async function uploadAttendanceBlock(
  clientId: string, clientName: string, uploadedBy: string, block: AttendanceBlock,
): Promise<UploadResult> {
  const ts = block.startedAt;
  const filePath = buildAttendancePath(clientId, block.sessionId, block.blockIndex, ts);
  const { error: upErr } = await supabase.storage
    .from("client-documents")
    .upload(filePath, block.blob, { contentType: block.mimeType, upsert: false });
  if (upErr) return { ok: false, error: upErr.message };

  const notes = buildAttendanceNotes(block);
  const name = buildAttendanceName(block.startedAt, block.blockIndex);
  const { error: insErr } = await supabase.from("client_documents").insert(
    buildAudioDocInsert(clientId, clientName, uploadedBy, {
      filePath, fileSize: block.blob.size, mimeType: block.mimeType, notes, name,
    }) as never,
  );
  if (insErr) return { ok: false, error: insErr.message };
  return { ok: true };
}

export type BlockStatus = "pending" | "uploading" | "done" | "error";
export interface QueueItem { block: AttendanceBlock; status: BlockStatus; error?: string }
export interface UploadQueue {
  enqueue(block: AttendanceBlock): void;
  retry(sessionId: string, blockIndex: number): void;
  getItems(): QueueItem[];
}

// Fila sequencial (um upload por vez → ordem + backpressure). onChange é
// chamado a cada transição de estado para a UI refletir progresso/erro.
export function createUploadQueue(
  uploadFn: (b: AttendanceBlock) => Promise<UploadResult>,
  onChange: (items: QueueItem[]) => void,
): UploadQueue {
  const items: QueueItem[] = [];
  let running = false;

  const emit = () => onChange([...items]);

  const run = async () => {
    if (running) return;
    running = true;
    try {
      for (;;) {
        const next = items.find((i) => i.status === "pending");
        if (!next) break;
        next.status = "uploading"; emit();
        const res = await uploadFn(next.block);
        if (res.ok) { next.status = "done"; next.error = undefined; }
        else { next.status = "error"; next.error = res.error; }
        emit();
      }
    } finally {
      running = false;
    }
  };

  return {
    enqueue(block) {
      items.push({ block, status: "pending" });
      emit();
      void run();
    },
    retry(sessionId, blockIndex) {
      const it = items.find((i) => i.block.sessionId === sessionId && i.block.blockIndex === blockIndex);
      if (it && it.status === "error") { it.status = "pending"; emit(); void run(); }
    },
    getItems() { return [...items]; },
  };
}
```

- [ ] **Step 4: Rodar (verde)**

Run: `npx vitest run src/lib/attendanceAudio.test.ts`
Expected: PASS em todos os describes.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/Infosol/OneDrive/Desktop/JurisAI/wt-trilha-c"
git add src/lib/attendanceAudio.ts src/lib/attendanceAudio.test.ts
git commit -m "feat(trilha-c): uploadAttendanceBlock + fila sequencial de upload com retry"
```

---

## Task 4: Hook `useAttendanceRecorder` (motor de gravação)

**Files:**
- Create: `src/hooks/useAttendanceRecorder.ts`

**Interfaces:**
- Consumes: `attendanceAudio.ts` (`ROTATE_MS`, `TIMESLICE_MS`, `AttendanceBlock`, `newSessionId`, `pickAudioMime`, `isRecordingSupported`, `uploadAttendanceBlock`, `createUploadQueue`, `QueueItem`).
- Produces (usado pela Task 5):
  - `interface UseAttendanceRecorder { supported: boolean; recording: boolean; elapsedMs: number; items: QueueItem[]; start(): Promise<void>; stop(): void; retry(sessionId: string, blockIndex: number): void; error: string | null }`
  - `function useAttendanceRecorder(clientId: string, clientName: string, uploadedBy: string, opts?: { rotateMs?: number }): UseAttendanceRecorder`

> **Verificação:** jsdom não tem `MediaRecorder`; este hook é validado em **preview (navegador real)** na Task 5, não por unit test. As partes puras que ele usa já têm cobertura (Tasks 2–3).

- [ ] **Step 1: Implementar o hook**

Criar `src/hooks/useAttendanceRecorder.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ROTATE_MS, TIMESLICE_MS, newSessionId, pickAudioMime, isRecordingSupported,
  uploadAttendanceBlock, createUploadQueue,
  type AttendanceBlock, type QueueItem,
} from "@/lib/attendanceAudio";

export interface UseAttendanceRecorder {
  supported: boolean;
  recording: boolean;
  elapsedMs: number;
  items: QueueItem[];
  start(): Promise<void>;
  stop(): void;
  retry(sessionId: string, blockIndex: number): void;
  error: string | null;
}

export function useAttendanceRecorder(
  clientId: string, clientName: string, uploadedBy: string,
  opts?: { rotateMs?: number },
): UseAttendanceRecorder {
  const rotateMs = opts?.rotateMs ?? ROTATE_MS;
  const [supported] = useState(isRecordingSupported);
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const sessionRef = useRef<string>("");
  const blockIndexRef = useRef(0);
  const blockStartRef = useRef(0);
  const rotateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const mimeRef = useRef("audio/webm");
  const queueRef = useRef<ReturnType<typeof createUploadQueue> | null>(null);

  // Monta o bloco a partir dos chunks acumulados e enfileira o upload.
  const flushBlock = useCallback(() => {
    if (chunksRef.current.length === 0) return;
    const blob = new Blob(chunksRef.current, { type: mimeRef.current });
    chunksRef.current = [];
    const block: AttendanceBlock = {
      sessionId: sessionRef.current,
      blockIndex: blockIndexRef.current,
      startedAt: blockStartRef.current,
      durationMs: Date.now() - blockStartRef.current,
      blob,
      mimeType: mimeRef.current,
    };
    blockIndexRef.current += 1;
    blockStartRef.current = Date.now();
    queueRef.current?.enqueue(block);
  }, []);

  const newRecorder = useCallback(() => {
    const stream = streamRef.current!;
    const rec = new MediaRecorder(stream, { mimeType: mimeRef.current });
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    rec.onstop = () => flushBlock();
    rec.start(TIMESLICE_MS);
    recorderRef.current = rec;
  }, [flushBlock]);

  // rotação: para o recorder (onstop faz o flush) e recomeça no MESMO stream.
  const rotate = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
      newRecorder();
    }
  }, [newRecorder]);

  const start = useCallback(async () => {
    if (!supported || recording) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      mimeRef.current = pickAudioMime();
      sessionRef.current = newSessionId();
      blockIndexRef.current = 0;
      const now = Date.now();
      blockStartRef.current = now;
      startedAtRef.current = now;
      queueRef.current = createUploadQueue(
        (b) => uploadAttendanceBlock(clientId, clientName, uploadedBy, b),
        setItems,
      );
      newRecorder();
      rotateTimerRef.current = setInterval(rotate, rotateMs);
      tickTimerRef.current = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 1000);
      setRecording(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao acessar o microfone");
    }
  }, [supported, recording, clientId, clientName, uploadedBy, newRecorder, rotate, rotateMs]);

  const stop = useCallback(() => {
    if (rotateTimerRef.current) { clearInterval(rotateTimerRef.current); rotateTimerRef.current = null; }
    if (tickTimerRef.current) { clearInterval(tickTimerRef.current); tickTimerRef.current = null; }
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setRecording(false);
  }, []);

  const retry = useCallback((sessionId: string, blockIndex: number) => {
    queueRef.current?.retry(sessionId, blockIndex);
  }, []);

  // beforeunload: avisa se há gravação ou upload pendente.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const pending = items.some((i) => i.status === "pending" || i.status === "uploading");
      if (recording || pending) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [recording, items]);

  // cleanup ao desmontar.
  useEffect(() => () => { stop(); }, [stop]);

  return { supported, recording, elapsedMs, items, start, stop, retry, error };
}
```

- [ ] **Step 2: Commit**

```bash
cd "C:/Users/Infosol/OneDrive/Desktop/JurisAI/wt-trilha-c"
git add src/hooks/useAttendanceRecorder.ts
git commit -m "feat(trilha-c): useAttendanceRecorder — motor de gravacao com rotacao e upload incremental"
```

---

## Task 5: UI — `AudiosTab` com gravador + listagem por sessão

**Files:**
- Modify: `src/components/clients/tabs/chatTabs.tsx`

**Interfaces:**
- Consumes: `useAttendanceRecorder`, `groupBySession`, `AudioDocRow`, `AUDIO_ATENDIMENTO_TYPE`, `useAuth` (uid), `supabase`.

- [ ] **Step 1: Imports e leitura dos áudios de atendimento**

No topo de `src/components/clients/tabs/chatTabs.tsx`, adicionar imports:

```ts
import { useAttendanceRecorder } from "@/hooks/useAttendanceRecorder";
import {
  groupBySession, AUDIO_ATENDIMENTO_TYPE, type AudioDocRow,
} from "@/lib/attendanceAudio";
import { useAuth } from "@/hooks/useAuth";
```

Adicionar um hook de leitura das linhas `audio_atendimento` do cliente (antes de `AudiosTab`):

```ts
function useAttendanceAudios(clientId: string, reloadKey: number) {
  const [rows, setRows] = useState<AudioDocRow[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from("client_documents")
        .select("id, file_path, document_name, mime_type, notes, created_at")
        .eq("client_id", clientId)
        .eq("document_type", AUDIO_ATENDIMENTO_TYPE)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      setRows(error ? [] : ((data as AudioDocRow[]) ?? []));
    })();
    return () => { cancelled = true; };
  }, [clientId, reloadKey]);
  return rows;
}
```

- [ ] **Step 2: Componente do gravador**

Adicionar acima de `AudiosTab`:

```tsx
function AttendanceRecorder({ client, onSaved }: { client: ClientFull; onSaved: () => void }) {
  const { user } = useAuth();
  const rec = useAttendanceRecorder(client.id, client.full_name, user?.id ?? "");
  const prevRecording = useRef(false);

  // quando a gravação termina e não há mais uploads pendentes, recarrega a lista.
  useEffect(() => {
    const pending = rec.items.some((i) => i.status === "pending" || i.status === "uploading");
    if (prevRecording.current && !rec.recording && !pending) onSaved();
    prevRecording.current = rec.recording;
  }, [rec.recording, rec.items, onSaved]);

  const mmss = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };

  if (!rec.supported) {
    return (
      <div className="cli-card lift" style={{ marginBottom: 14 }}>
        <div className="cli-sec-title">Gravar atendimento</div>
        <div style={{ fontSize: 13, color: "var(--cli-muted)", fontWeight: 500 }}>
          Gravação não suportada neste navegador.
        </div>
      </div>
    );
  }

  return (
    <div className="cli-card lift" style={{ marginBottom: 14 }}>
      <div className="cli-sec-title">Gravar atendimento</div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        {rec.recording
          ? <button className="cli-btn" onClick={rec.stop}>⏹ Parar</button>
          : <button className="cli-btn" onClick={() => void rec.start()}>⏺ Gravar</button>}
        {rec.recording && (
          <span style={{ fontWeight: 800, color: "var(--cli-ink)" }}>● {mmss(rec.elapsedMs)}</span>
        )}
      </div>
      {rec.error && (
        <div style={{ fontSize: 13, color: "var(--cli-danger, #c0392b)", fontWeight: 600 }}>{rec.error}</div>
      )}
      {rec.items.length > 0 && (
        <div style={{ marginTop: 6 }}>
          {rec.items.map((it) => (
            <div key={`${it.block.sessionId}-${it.block.blockIndex}`}
                 style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 4 }}>
              <span>Bloco {it.block.blockIndex + 1}</span>
              <span style={{ color: "var(--cli-muted)", fontWeight: 600 }}>
                {it.status === "uploading" ? "enviando…" : it.status === "done" ? "✓ salvo"
                  : it.status === "error" ? `erro: ${it.error ?? ""}` : "na fila"}
              </span>
              {it.status === "error" && (
                <button className="cli-chip n" onClick={() => rec.retry(it.block.sessionId, it.block.blockIndex)}>
                  tentar de novo
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Componente da listagem por sessão (com player)**

Adicionar acima de `AudiosTab`:

```tsx
function AttendanceBlockPlayer({ row }: { row: AudioDocRow }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.storage.from("client-documents").createSignedUrl(row.file_path, 3600);
      if (!cancelled) setUrl(data?.signedUrl ?? null);
    })();
    return () => { cancelled = true; };
  }, [row.file_path]);
  return url
    ? <audio controls src={url} style={{ width: "100%", height: 34 }} />
    : <div style={{ fontSize: 12, color: "var(--cli-muted)" }}>carregando áudio…</div>;
}

function AttendanceSessions({ clientId, reloadKey }: { clientId: string; reloadKey: number }) {
  const rows = useAttendanceAudios(clientId, reloadKey);
  if (rows === null) return <TabLoading />;
  if (rows.length === 0) {
    return <EmptyState icon="⏺" title="Nenhum atendimento gravado" hint="Grave um atendimento acima; os blocos aparecem aqui agrupados por sessão." />;
  }
  const sessions = groupBySession(rows);
  const mmss = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
  };
  return (
    <div className="cli-card lift" style={{ marginBottom: 14 }}>
      <div className="cli-sec-title">Atendimentos gravados · {sessions.length}</div>
      {sessions.map((s) => (
        <div key={s.sessionId} style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "var(--cli-ink)", marginBottom: 6 }}>
            {formatDateBR(new Date(s.startedAt).toISOString())} · {s.blocks.length} bloco(s)
            {s.totalDurationMs > 0 ? ` · ${mmss(s.totalDurationMs)}` : ""}
          </div>
          {s.blocks.map((b) => (
            <div key={b.id} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: "var(--cli-muted)", fontWeight: 600, marginBottom: 2 }}>{b.document_name}</div>
              <AttendanceBlockPlayer row={b} />
              <div style={{ fontSize: 12, color: "var(--cli-muted)", fontWeight: 500 }}>Transcrição ainda não disponível.</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Ligar na `AudiosTab`**

Modificar `AudiosTab` para renderizar o gravador + a listagem de atendimentos ACIMA da listagem `chat_attachments` já existente. Substituir o corpo do `return` final da `AudiosTab` por (mantendo o hook `useClientSessionIds`/`chat_attachments` como está):

```tsx
export function AudiosTab({ client }: { client: ClientFull }) {
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  const sessionIds = useClientSessionIds(client.id);
  const [rows, setRows] = useState<AudioRow[] | null>(null);

  useEffect(() => {
    if (sessionIds === null) return;
    if (sessionIds.length === 0) { setRows([]); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from("chat_attachments")
        .select("id, file_name, mime_type, extracted_text, summary, created_at")
        .in("session_id", sessionIds)
        .like("mime_type", "audio/%")
        .order("created_at", { ascending: false });
      if (cancelled) return;
      setRows(error ? [] : ((data as AudioRow[]) ?? []));
    })();
    return () => { cancelled = true; };
  }, [sessionIds]);

  return (
    <div>
      <AttendanceRecorder client={client} onSaved={reload} />
      <AttendanceSessions clientId={client.id} reloadKey={reloadKey} />
      {rows && rows.length > 0 && (
        <div className="cli-card lift">
          <div className="cli-sec-title">Áudios de chat / Transcrições · {rows.length}</div>
          {rows.map(a => (
            <div key={a.id} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{ fontWeight: 800, fontSize: 15, color: "var(--cli-ink)" }}>♪ {a.file_name}</span>
                <span style={{ fontSize: 12, color: "var(--cli-muted)", fontWeight: 600 }}>{formatDateBR(a.created_at)}</span>
              </div>
              {a.extracted_text
                ? <div className="cli-notes">{a.extracted_text}</div>
                : a.summary
                  ? <div className="cli-notes">{a.summary}</div>
                  : <div style={{ fontSize: 13, color: "var(--cli-muted)", fontWeight: 500 }}>Transcrição ainda não disponível.</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

Garantir que `useCallback` e `useState` estão no import de `react` no topo do arquivo
(`import { useEffect, useState, useCallback, useRef } from "react";`).

- [ ] **Step 5: Verificar no preview (navegador real)**

Iniciar o dev server (preview_start) e navegar até uma ficha de cliente → aba
"Áudios/Transcrições". Verificar:
1. Render sem erro no console (preview_console_logs).
2. Seção "Gravar atendimento" com botão ⏺ Gravar (ou mensagem de "não suportado" conforme o browser do preview).
3. Seção "Atendimentos gravados" mostrando empty-state (ou os blocos, se houver dado).
4. A listagem `chat_attachments` antiga continua aparecendo quando há dado.

> Gravação real de mic + segmentação + upload é validada pelo **usuário** num navegador
> com microfone (o preview headless não tem mic) — critério de aceite manual.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/Infosol/OneDrive/Desktop/JurisAI/wt-trilha-c"
git add src/components/clients/tabs/chatTabs.tsx
git commit -m "feat(trilha-c): AudiosTab com gravador de atendimento + listagem por sessao"
```

---

## Verificação final (aceite)

1. **Banco:** após gravar, `SELECT id, file_path, document_type, notes FROM client_documents WHERE document_type='audio_atendimento' AND client_id=...` mostra uma linha por bloco, com `file_path` agrupado por `/atendimento/<sessionId>/` e `notes` JSON com `block_index`.
2. **Tela:** ficha do cliente → "Áudios/Transcrições" → Gravar → blocos aparecem "✓ salvo" → aparecem em "Atendimentos gravados", tocáveis.
3. **Segmentação:** um atendimento > 10 min (ou com `rotateMs` reduzido em teste manual) gera múltiplos blocos sem o usuário reiniciar nada.
4. **Resiliência:** fechar a aba durante upload dispara o aviso `beforeunload`.

## Handoff para os próximos ciclos
Após merge, seguir para o **Ciclo 2 (6.2 — resumo via LLM)** e depois **Ciclo 3 (6.3 — checklist no chat)**, cada um com seu próprio spec+plano.
