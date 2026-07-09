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
