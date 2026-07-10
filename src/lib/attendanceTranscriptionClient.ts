// src/lib/attendanceTranscriptionClient.ts
//
// TRILHA C — Cliente do front para a transcrição do atendimento (6.1 → Whisper),
// insumo real do resumo (6.2). Espelha attendanceSummaryClient.ts: invoca a edge
// `transcribe-attendance-audio` e lê as linhas `transcricao_atendimento` do cliente.

import { supabase } from "@/integrations/supabase/client";

/** Recupera o `reason` real do corpo da resposta de um erro de invoke. */
async function extractInvokeErrorReason(error: unknown): Promise<string | undefined> {
  const context = (error as { context?: Response }).context;
  if (!context || typeof context.text !== "function") return undefined;
  try {
    const cloned = typeof context.clone === "function" ? context.clone() : context;
    const bodyText = await cloned.text();
    if (!bodyText) return undefined;
    const parsed = JSON.parse(bodyText) as { reason?: unknown };
    return typeof parsed.reason === "string" ? parsed.reason : undefined;
  } catch {
    return undefined;
  }
}

export interface TranscribeResult {
  ok: boolean;
  cached?: boolean;
  engine?: string;
  chars?: number;
  reason?: string;
}

/** Dispara a transcrição de uma sessão de atendimento (trigger manual → custo controlado). */
export async function transcribeAttendance(clientId: string, sessionId: string, force = false): Promise<TranscribeResult> {
  const { data, error } = await supabase.functions.invoke("transcribe-attendance-audio", {
    body: { clientId, sessionId, force },
  });
  if (error) {
    const reason = await extractInvokeErrorReason(error);
    return { ok: false, reason: reason ?? error.message };
  }
  return data as TranscribeResult;
}

export interface StoredTranscription {
  id: string;
  sessionId: string | null;
  name: string;
  text: string | null;
  createdAt: string;
  filePath: string;
}

/** sessionId a partir do file_path: .../transcricao_atendimento/{sessionId}.txt */
function sessionIdFromPath(filePath: string): string | null {
  const m = /\/transcricao_atendimento\/([^/]+)\.txt$/.exec(filePath);
  return m ? m[1] : null;
}

interface TransRow { id: string; document_name: string; notes: string | null; file_path: string; created_at: string; }

/** Lê as transcrições persistidas do cliente (document_type='transcricao_atendimento'). */
export async function fetchAttendanceTranscriptions(clientId: string): Promise<StoredTranscription[]> {
  const { data, error } = await supabase.from("client_documents")
    .select("id, document_name, notes, file_path, created_at")
    .eq("client_id", clientId).eq("document_type", "transcricao_atendimento")
    .order("created_at", { ascending: false });
  if (error) return [];
  return ((data as TransRow[]) ?? []).map((r) => ({
    id: r.id,
    sessionId: sessionIdFromPath(r.file_path),
    name: r.document_name,
    text: r.notes,
    createdAt: r.created_at,
    filePath: r.file_path,
  }));
}
