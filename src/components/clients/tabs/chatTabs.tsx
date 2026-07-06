import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { type ClientFull, EmptyState, TabLoading, formatDateBR } from "../shared";

const rowStyle: React.CSSProperties = {
  padding: 14, borderRadius: 10, marginBottom: 8,
  background: "var(--bg)", border: "1px solid var(--border)",
};
const badge = (bg: string, color: string): React.CSSProperties => ({
  padding: "2px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600,
  background: bg, color, textTransform: "uppercase", letterSpacing: "0.04em",
});

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
    return <EmptyState title="Nenhuma peça gerada" hint="Peças produzidas pela orquestração da IA nas sessões do cliente aparecem aqui." />;
  }
  return (
    <div>
      {pecas.map(run => (
        <div key={run.id} style={rowStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text1)", marginBottom: 4 }}>
                {run.acao_tipo || "Peça gerada"}
              </div>
              <div style={{ fontSize: 11, color: "var(--text3)", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                {run.original_message}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
              <span style={badge("rgba(107,114,128,0.15)", "#9ca3af")}>{run.status}</span>
              <span style={{ fontSize: 10, color: "var(--text3)" }}>{formatDateBR(run.created_at)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Histórico (chat_sessions do cliente) ---------- */

interface SessionRow {
  id: string; title: string | null; status: string; summary: string | null;
  message_count: number | null; created_at: string | null; last_message_at: string | null;
}

export function HistoricoTab({ client }: { client: ClientFull }) {
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from("chat_sessions")
        .select("id, title, status, summary, message_count, created_at, last_message_at")
        .eq("client_id", client.id)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      setSessions(error ? [] : ((data as SessionRow[]) ?? []));
    })();
    return () => { cancelled = true; };
  }, [client.id]);

  if (sessions === null) return <TabLoading />;
  if (sessions.length === 0) {
    return <EmptyState title="Nenhuma sessão de IA" hint="O histórico de conversas e orquestrações da IA vinculadas ao cliente aparece aqui." />;
  }
  return (
    <div>
      {sessions.map(s => (
        <div key={s.id} style={rowStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text1)", marginBottom: 4 }}>
                {s.title || "Sessão sem título"}
              </div>
              {s.summary && <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 4 }}>{s.summary}</div>}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 10, color: "var(--text3)" }}>
                <span>{s.message_count ?? 0} mensagens</span>
                <span>Início: {formatDateBR(s.created_at)}</span>
                {s.last_message_at && <span>Última: {formatDateBR(s.last_message_at)}</span>}
              </div>
            </div>
            <span style={badge("rgba(107,114,128,0.15)", "#9ca3af")}>{s.status}</span>
          </div>
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
    return <EmptyState title="Nenhum áudio ou transcrição" hint="Áudios enviados nas sessões do cliente e suas transcrições aparecem aqui." />;
  }
  return (
    <div>
      {rows.map(a => (
        <div key={a.id} style={rowStyle}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text1)", marginBottom: 4 }}>{a.file_name}</div>
          <div style={{ fontSize: 10, color: "var(--text3)", marginBottom: 6 }}>{formatDateBR(a.created_at)}</div>
          {a.extracted_text
            ? <div style={{ fontSize: 12, color: "var(--text2)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{a.extracted_text}</div>
            : a.summary
              ? <div style={{ fontSize: 12, color: "var(--text2)" }}>{a.summary}</div>
              : <div style={{ fontSize: 11, color: "var(--text3)" }}>Transcrição ainda não disponível.</div>}
        </div>
      ))}
    </div>
  );
}
