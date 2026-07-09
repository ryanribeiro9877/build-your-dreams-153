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

/**
 * Recupera o `reason` real do corpo da resposta de um erro de invoke.
 * `supabase.functions.invoke` só expõe uma mensagem genérica em `error.message`;
 * o corpo real (`{ ok:false, reason }`) fica em `error.context`, que é o próprio
 * `Response` da edge function — por isso precisa ser lido de forma assíncrona
 * (mesma ideia do `parseInvokeError` de useChatOrchestrator.tsx, adaptada para
 * ler o body via `Response.text()` em vez de uma propriedade `body` síncrona).
 */
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

export async function generateAttendanceSummary(clientId: string): Promise<{ ok: boolean; summary?: AttendanceSummary; reason?: string }> {
  const { data, error } = await supabase.functions.invoke("attendance-summary", { body: { clientId } });
  if (error) {
    const reason = await extractInvokeErrorReason(error);
    return { ok: false, reason: reason ?? error.message };
  }
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
