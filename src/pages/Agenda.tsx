import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { useMeetings, type MeetingRow } from "@/hooks/useMeetings";
import { MEETING_STATUS_OPTIONS, statusLabel, type MeetingStatus } from "@/lib/meetings";
import { useAssignableUsers } from "@/hooks/useAssignableUsers";
import { MeetingDetailModal } from "@/components/agenda/MeetingDetailModal";

// Helpers de semana (segunda a sexta).
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // 0 = segunda
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default function Agenda() {
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState(() => new Date());
  const [lawyerId, setLawyerId] = useState<string>("");
  const [status, setStatus] = useState<MeetingStatus | "">("");
  const [selected, setSelected] = useState<MeetingRow | null>(null);
  const [creating, setCreating] = useState(false);

  const weekStart = useMemo(() => startOfWeek(anchor), [anchor]);
  const days = useMemo(
    () => Array.from({ length: 5 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d; }),
    [weekStart],
  );
  const from = toISO(days[0]);
  const to = toISO(days[days.length - 1]);

  // useAssignableUsers retorna { users, loading, error, refetch } com itens
  // { user_id, name, role_label } (ver src/hooks/useAssignableUsers.ts) —
  // não { assignableUsers } com full_name/display_name como no brief original.
  const { users: assignableUsers } = useAssignableUsers();
  const { meetings, loading, error, refresh } = useMeetings({
    from, to,
    lawyerId: lawyerId || undefined,
    status: status || undefined,
  });

  const byDay = useMemo(() => {
    const map: Record<string, MeetingRow[]> = {};
    for (const d of days) map[toISO(d)] = [];
    for (const m of meetings) (map[m.scheduled_date] ??= []).push(m);
    return map;
  }, [meetings, days]);

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <CalendarDays size={22} />
        <h1 style={{ fontSize: 20, fontWeight: 700, flex: 1 }}>Agenda de Reuniões</h1>
        <button type="button" onClick={() => { setSelected(null); setCreating(true); }}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "none", background: "#EAB308", color: "#111", fontWeight: 600, cursor: "pointer" }}>
          <Plus size={16} /> Nova reunião
        </button>
      </header>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button type="button" onClick={() => { const d = new Date(anchor); d.setDate(d.getDate() - 7); setAnchor(d); }} aria-label="Semana anterior"><ChevronLeft size={18} /></button>
        <span style={{ fontWeight: 600 }}>{toISO(days[0])} — {toISO(days[days.length - 1])}</span>
        <button type="button" onClick={() => { const d = new Date(anchor); d.setDate(d.getDate() + 7); setAnchor(d); }} aria-label="Próxima semana"><ChevronRight size={18} /></button>
        <button type="button" onClick={() => setAnchor(new Date())}>Hoje</button>

        <select value={lawyerId} onChange={(e) => setLawyerId(e.target.value)} aria-label="Filtrar por advogado">
          <option value="">Todos os advogados</option>
          {assignableUsers.map((u) => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as MeetingStatus | "")} aria-label="Filtrar por status">
          <option value="">Todos os status</option>
          {MEETING_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {error && <div style={{ color: "#DC2626", marginBottom: 12 }}>Erro ao carregar: {error}</div>}
      {loading ? (
        <div>Carregando…</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
          {days.map((d) => {
            const iso = toISO(d);
            const items = byDay[iso] ?? [];
            return (
              <div key={iso} style={{ border: "1px solid var(--border, #ddd)", borderRadius: 8, padding: 8, minHeight: 160 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                  {d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}
                </div>
                {items.length === 0 && <div style={{ fontSize: 11, color: "var(--text3, #999)" }}>—</div>}
                {items.map((m) => (
                  <button key={m.id} type="button" onClick={() => { setCreating(false); setSelected(m); }}
                    style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 6, padding: 8, borderRadius: 6, border: "1px solid var(--border, #eee)", background: "transparent", cursor: "pointer" }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{m.start_time.slice(0, 5)} · {m.client_name ?? "—"}</div>
                    <div style={{ fontSize: 11, color: "var(--text2, #666)" }}>{statusLabel(m.status)}{m.type ? ` · ${m.type}` : ""}</div>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {(selected || creating) && (
        <MeetingDetailModal
          meeting={selected}
          defaultDate={toISO(days[0])}
          onClose={() => { setSelected(null); setCreating(false); }}
          onSaved={() => { setSelected(null); setCreating(false); refresh(); }}
          onOpenClient={(clientId) => navigate(`/clientes/${clientId}`)}
        />
      )}
    </div>
  );
}
