import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { type ClientFull, EmptyState, TabLoading, formatDateBR } from "../shared";

// Busca os ids das sessões de chat do cliente. `null` enquanto carrega.
function useClientSessionIds(clientId: string) {
  const [ids, setIds] = useState<string[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from("chat_sessions")
        .select("id").eq("client_id", clientId);
      if (cancelled) return;
      setIds(error ? [] : ((data as { id: string }[] | null) ?? []).map(r => r.id));
    })();
    return () => { cancelled = true; };
  }, [clientId]);
  return ids;
}

/* ---------- Peças (orchestration_runs das sessões do cliente) ---------- */

interface RunRow {
  id: string; acao_tipo: string | null; status: string; created_at: string;
  original_message: string; draft: string | null; blocks: Json;
}

export function PecasTab({ client }: { client: ClientFull }) {
  const sessionIds = useClientSessionIds(client.id);
  const [runs, setRuns] = useState<RunRow[] | null>(null);

  useEffect(() => {
    if (sessionIds === null) return;
    if (sessionIds.length === 0) { setRuns([]); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from("orchestration_runs")
        .select("id, acao_tipo, status, created_at, original_message, draft, blocks")
        .in("session_id", sessionIds)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      setRuns(error ? [] : ((data as RunRow[]) ?? []));
    })();
    return () => { cancelled = true; };
  }, [sessionIds]);

  if (sessionIds === null || runs === null) return <TabLoading />;
  // Peça "gerada" = orquestração que produziu conteúdo (draft ou blocks).
  const pecas = runs.filter(r => !!r.draft || (Array.isArray(r.blocks) && r.blocks.length > 0));
  if (pecas.length === 0) {
    return <EmptyState icon="✦" title="Nenhuma peça gerada" hint="Peças produzidas pela orquestração da IA nas sessões do cliente aparecem aqui." />;
  }
  return (
    <div className="cli-card lift">
      <div className="cli-sec-title">Peças · {pecas.length}</div>
      {pecas.map(run => (
        <div key={run.id} className="cli-row">
          <div className="dot">✦</div>
          <div className="body">
            <div className="t">{run.acao_tipo || "Peça gerada"}</div>
            <div className="s" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {run.original_message} · {formatDateBR(run.created_at)}
            </div>
          </div>
          <span className="cli-chip n" style={{ marginLeft: "auto" }}>{run.status}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- Áudios / Transcrições (chat_attachments de áudio) ---------- */

interface AudioRow {
  id: string; file_name: string; mime_type: string | null;
  extracted_text: string | null; summary: string | null; created_at: string;
}

export function AudiosTab({ client }: { client: ClientFull }) {
  const sessionIds = useClientSessionIds(client.id);
  const [rows, setRows] = useState<AudioRow[] | null>(null);

  useEffect(() => {
    if (sessionIds === null) return;
    if (sessionIds.length === 0) { setRows([]); return; }
    let cancelled = false;
    (async () => {
      // Só há transcrição persistida como anexo de áudio (mime audio/*).
      // Sem fonte específica de ditado → sem dado fabricado.
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

  if (sessionIds === null || rows === null) return <TabLoading />;
  if (rows.length === 0) {
    return <EmptyState icon="♪" title="Nenhum áudio ou transcrição" hint="Áudios enviados nas sessões do cliente e suas transcrições aparecem aqui." />;
  }
  return (
    <div className="cli-card lift">
      <div className="cli-sec-title">Áudios / Transcrições · {rows.length}</div>
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
  );
}
