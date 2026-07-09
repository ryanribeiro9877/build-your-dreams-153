import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { type ClientFull, EmptyState, TabLoading, formatDateBR } from "../shared";
import { useAttendanceRecorder } from "@/hooks/useAttendanceRecorder";
import {
  groupBySession, AUDIO_ATENDIMENTO_TYPE, type AudioDocRow,
} from "@/lib/attendanceAudio";
import { useAuth } from "@/hooks/useAuth";

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

// Lê as linhas `audio_atendimento` (blocos de gravação) do cliente.
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
