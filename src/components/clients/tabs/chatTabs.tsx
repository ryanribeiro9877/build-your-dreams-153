import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { type ClientFull, EmptyState, TabLoading, formatDateBR } from "../shared";
import { useAttendanceRecorder } from "@/hooks/useAttendanceRecorder";
import {
  groupBySession, AUDIO_ATENDIMENTO_TYPE, type AudioDocRow,
} from "@/lib/attendanceAudio";
import {
  transcribeAttendance, fetchAttendanceTranscriptions, type StoredTranscription,
} from "@/lib/attendanceTranscriptionClient";
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

/* ---------- Áudios / Transcrições do atendimento (client_documents) ---------- */

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

// Lê as transcrições do cliente (document_type='transcricao_atendimento') e
// indexa por sessionId (derivado do file_path). `null` enquanto carrega.
function useAttendanceTranscriptions(clientId: string, reloadKey: number) {
  const [map, setMap] = useState<Map<string, StoredTranscription> | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await fetchAttendanceTranscriptions(clientId);
      if (cancelled) return;
      const m = new Map<string, StoredTranscription>();
      for (const t of list) if (t.sessionId) m.set(t.sessionId, t);
      setMap(m);
    })();
    return () => { cancelled = true; };
  }, [clientId, reloadKey]);
  return map;
}

function AttendanceRecorder({ client, onSaved }: { client: ClientFull; onSaved: () => void }) {
  const { user } = useAuth();
  const rec = useAttendanceRecorder(client.id, client.full_name, user?.id ?? "");
  // Recarrega a lista quando, fora de gravação, todos os blocos enfileirados
  // terminaram o upload. Sem guarda de "estava gravando": rec.items só muda
  // quando a fila emite, e onSaved (bump de reloadKey) não altera rec.items,
  // logo não há loop. Um reload prematuro (blocos anteriores já "done" no
  // instante do stop, antes do último ser enfileirado) é inofensivo — o reload
  // final, após o último bloco, mostra tudo.
  useEffect(() => {
    if (rec.recording || rec.items.length === 0) return;
    if (rec.items.every((i) => i.status === "done")) onSaved();
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
          : <button className="cli-btn" onClick={() => void rec.start()} disabled={!user?.id}
              title={!user?.id ? "Faça login para gravar" : undefined}>⏺ Gravar</button>}
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
  const { user } = useAuth();
  const rows = useAttendanceAudios(clientId, reloadKey);
  const [transKey, setTransKey] = useState(0);
  const transcriptions = useAttendanceTranscriptions(clientId, transKey);
  const [busy, setBusy] = useState<string | null>(null); // sessionId em transcrição

  const handleTranscribe = useCallback(async (sessionId: string, force: boolean) => {
    setBusy(sessionId);
    try {
      const res = await transcribeAttendance(clientId, sessionId, force);
      if (!res.ok) {
        const reasons: Record<string, string> = {
          transcription_disabled: "Transcrição desligada no servidor.",
          no_audio_blocks: "Nenhum bloco de áudio encontrado para esta sessão.",
          empty_transcription: "A transcrição saiu vazia.",
          client_not_found_or_forbidden: "Você não tem acesso a este cliente.",
        };
        toast.error(reasons[res.reason ?? ""] ?? `Não foi possível transcrever${res.reason ? `: ${res.reason}` : "."}`);
        return;
      }
      toast.success(res.cached ? "Transcrição já existente carregada." : "Atendimento transcrito.");
      setTransKey((k) => k + 1);
    } finally {
      setBusy(null);
    }
  }, [clientId]);

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
      {sessions.map((s) => {
        const trans = transcriptions?.get(s.sessionId) ?? null;
        return (
          <div key={s.sessionId} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 800, fontSize: 14, color: "var(--cli-ink)" }}>
                {formatDateBR(new Date(s.startedAt).toISOString())} · {s.blocks.length} bloco(s)
                {s.totalDurationMs > 0 ? ` · ${mmss(s.totalDurationMs)}` : ""}
              </span>
              <span style={{ flex: 1 }} />
              <button className="cli-btn sm" type="button"
                disabled={busy === s.sessionId || !user?.id}
                title={!user?.id ? "Faça login para transcrever" : undefined}
                onClick={() => void handleTranscribe(s.sessionId, !!trans)}>
                {busy === s.sessionId ? "Transcrevendo…" : trans ? "Retranscrever" : "Transcrever atendimento"}
              </button>
            </div>
            {s.blocks.map((b) => (
              <div key={b.id} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: "var(--cli-muted)", fontWeight: 600, marginBottom: 2 }}>{b.document_name}</div>
                <AttendanceBlockPlayer row={b} />
              </div>
            ))}
            {transcriptions === null ? (
              <div style={{ fontSize: 12, color: "var(--cli-muted)" }}>carregando transcrição…</div>
            ) : trans && trans.text ? (
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 12, color: "var(--cli-muted)", fontWeight: 600, marginBottom: 4 }}>
                  Transcrição · {formatDateBR(trans.createdAt)}
                </div>
                <div className="cli-notes" style={{ whiteSpace: "pre-wrap" }}>{trans.text}</div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--cli-muted)", fontWeight: 500, marginTop: 4 }}>
                Transcrição ainda não disponível.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function AudiosTab({ client }: { client: ClientFull }) {
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  return (
    <div>
      <AttendanceRecorder client={client} onSaved={reload} />
      <AttendanceSessions clientId={client.id} reloadKey={reloadKey} />
    </div>
  );
}
