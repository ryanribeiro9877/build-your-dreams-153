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
    const sessionId = parseSessionIdFromPath(row.file_path) ?? n.session_id ?? row.id;
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
