import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  type ClientFull, EmptyState, TabLoading, formatDateBR, DOCUMENT_TYPE_LABELS,
} from "../shared";

interface TimelineEvent {
  event_type: string;
  event_at: string | null;
  title: string;
  ref_id: string | null;
  extra: Record<string, unknown> | null;
}

// Metadados por tipo de evento. `tab` = aba do ClientDetails que "dona" o item
// (navegação por ref_id via ?tab=). `null` = evento informativo (sem link).
const EVENT_META: Record<string, { icon: string; label: string; cls: string; tab: string | null }> = {
  conversa:      { icon: "✦", label: "Conversa",              cls: "n",  tab: null },
  tarefa:        { icon: "◷", label: "Tarefa",                cls: "n",  tab: "tarefas" },
  pendencia:     { icon: "⚑", label: "Pendência",             cls: "p",  tab: "pendencias" },
  aprovacao:     { icon: "✓", label: "Aprovação",             cls: "ok", tab: "tarefas" },
  documento:     { icon: "▤", label: "Documento",             cls: "n",  tab: "documentos" },
  alteracao_doc: { icon: "•", label: "Alteração de documento", cls: "n", tab: "documentos" },
  processo:      { icon: "⚖", label: "Processo",              cls: "n",  tab: "processos" },
  audiencia:     { icon: "⚖", label: "Audiência",             cls: "p",  tab: "processos" },
};

function metaFor(type: string) {
  return EVENT_META[type] ?? { icon: "•", label: type, cls: "n", tab: null };
}

// Linha secundária derivada do `extra` (metadados por tipo).
function secondaryLine(ev: TimelineEvent): string {
  const x = ev.extra ?? {};
  const parts: string[] = [];
  const push = (v: unknown) => { if (v !== null && v !== undefined && v !== "") parts.push(String(v)); };
  switch (ev.event_type) {
    case "processo":
      push(x.status);
      if (x.advogado) parts.push(`Resp. ${x.advogado}`);
      if (x.proxima_audiencia) parts.push(`Próx. audiência ${formatDateBR(String(x.proxima_audiencia))}`);
      break;
    case "audiencia":
      push(x.status);
      break;
    case "tarefa":
    case "pendencia":
      push(x.status);
      push(x.prioridade);
      push(x.pendencia_tipo);
      if (x.data_fatal) parts.push(`Vence ${formatDateBR(String(x.data_fatal))}`);
      break;
    case "documento": {
      const tipo = x.tipo ? (DOCUMENT_TYPE_LABELS[String(x.tipo)] ?? String(x.tipo)) : null;
      push(tipo);
      push(x.status);
      push(x.origem);
      break;
    }
    case "conversa":
      if (x.mensagens != null) parts.push(`${x.mensagens} mensagens`);
      push(x.status);
      break;
    case "aprovacao":
      parts.push("Validada");
      break;
  }
  return parts.join(" · ");
}

export function HistoricoTab({ client }: { client: ClientFull }) {
  const [, setSearchParams] = useSearchParams();
  const [events, setEvents] = useState<TimelineEvent[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [active, setActive] = useState<string>("todos");

  useEffect(() => {
    let cancelled = false;
    setEvents(null); setDenied(false);
    (async () => {
      const { data, error } = await (supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: TimelineEvent[] | null; error: { code?: string } | null }>;
      }).rpc("client_timeline", { p_client_id: client.id });
      if (cancelled) return;
      if (error) { setDenied(error.code === "42501"); setEvents([]); return; }
      setEvents((data as TimelineEvent[]) ?? []);
    })();
    return () => { cancelled = true; };
  }, [client.id]);

  const goToTab = (tab: string) => setSearchParams(prev => {
    const next = new URLSearchParams(prev);
    next.set("tab", tab);
    return next;
  });

  if (events === null) return <TabLoading />;
  if (denied) {
    return <EmptyState icon="🔒" title="Acesso restrito" hint="Apenas recepção ou sócio podem ver o histórico do cliente." />;
  }
  if (events.length === 0) {
    return <EmptyState icon="✦" title="Nenhum evento no histórico" hint="Conversas, tarefas, pendências, documentos, processos e audiências do cliente aparecem aqui." />;
  }

  // Contagem por tipo (para os chips) preservando a ordem de aparição.
  const counts: Record<string, number> = {};
  events.forEach(e => { counts[e.event_type] = (counts[e.event_type] || 0) + 1; });
  const typesPresent = Object.keys(counts);

  const shown = active === "todos" ? events : events.filter(e => e.event_type === active);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* chips de filtro por tipo */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button className={`cli-chip ${active === "todos" ? "ok" : "n"}`} style={{ cursor: "pointer" }}
          onClick={() => setActive("todos")}>Todos · {events.length}</button>
        {typesPresent.map(t => {
          const m = metaFor(t);
          return (
            <button key={t} className={`cli-chip ${active === t ? "ok" : "n"}`} style={{ cursor: "pointer" }}
              onClick={() => setActive(t)}>{m.icon} {m.label} · {counts[t]}</button>
          );
        })}
      </div>

      {/* lista cronológica */}
      <div className="cli-card lift">
        <div className="cli-sec-title">Histórico · {shown.length}</div>
        {shown.map((ev, i) => {
          const m = metaFor(ev.event_type);
          const sub = secondaryLine(ev);
          const linkable = m.tab !== null;
          return (
            <div key={`${ev.event_type}-${ev.ref_id ?? "x"}-${i}`} className="cli-row"
              style={linkable ? { cursor: "pointer" } : undefined}
              onClick={linkable ? () => goToTab(m.tab!) : undefined}
              role={linkable ? "button" : undefined}
              title={linkable ? `Abrir aba ${m.label}` : undefined}>
              <div className="dot">{m.icon}</div>
              <div className="body">
                <div className="t">{ev.title}</div>
                <div className="s">
                  {m.label}
                  {sub ? ` · ${sub}` : ""}
                  {` · ${formatDateBR(ev.event_at)}`}
                </div>
              </div>
              {linkable && <span className="go" style={{ marginLeft: "auto" }}>→</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
