import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, Plus, ChevronLeft, ChevronRight, ArrowLeft, CalendarPlus, ChevronDown } from "lucide-react";
import { useMeetings, type MeetingRow } from "@/hooks/useMeetings";
import { MEETING_STATUS_OPTIONS, statusLabel, type MeetingStatus } from "@/lib/meetings";
import { useAssignableUsers } from "@/hooks/useAssignableUsers";
import { useAuth } from "@/hooks/useAuth";
import { MeetingDetailModal } from "@/components/agenda/MeetingDetailModal";

// Papéis que enxergam a agenda de todos (o gate real é o RLS de `meetings`):
// recepção, sócio e admin. Para os demais (advogado, gerente, tech etc.) o
// seletor "Todos os advogados" seria enganoso — só veriam a si mesmos —,
// então escondemos o filtro por advogado.
const ROLES_VE_TODAS_AGENDAS = ["admin", "director", "socio", "receptionist"];

// Cor de acento por status (semântica; independe do tema claro/escuro).
const STATUS_COLOR: Record<MeetingStatus, string> = {
  scheduled: "#e8c96a",
  confirmed: "#5aa9ff",
  rescheduled: "#f0a35e",
  canceled: "#ef5350",
  no_show: "#c77b7b",
  done: "#4fc78e",
};

// ---- Helpers de data (semana seg–sex) ----
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
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function weekdayShort(d: Date): string {
  return cap(new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(d).replace(".", ""));
}
function monthShort(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(d).replace(".", "");
}
// "6 – 10 de jul · 2026" (ou cruzando mês: "30 de jun – 4 de jul · 2026")
function weekRangeLabel(first: Date, last: Date): string {
  const y = last.getFullYear();
  if (first.getMonth() === last.getMonth()) {
    return `${first.getDate()} – ${last.getDate()} de ${monthShort(last)} · ${y}`;
  }
  return `${first.getDate()} de ${monthShort(first)} – ${last.getDate()} de ${monthShort(last)} · ${y}`;
}

const CSS = `
.agx-root{--agx-g1:#c9a84c;--agx-g2:#e8c96a;--agx-grad:linear-gradient(135deg,#c9a84c,#e8c96a);--agx-gsoft:rgba(232,201,106,.12);
  max-width:1240px;margin:0 auto;padding:28px 24px 60px;color:hsl(var(--foreground));font-family:'DM Sans',system-ui,sans-serif}
.agx-topbar{display:flex;align-items:center;gap:16px;margin-bottom:22px}
.agx-back{display:inline-flex;align-items:center;gap:8px;flex-shrink:0;padding:9px 14px;border-radius:10px;
  border:1px solid hsl(var(--border));background:hsl(var(--card));color:hsl(var(--muted-foreground));
  font:inherit;font-size:13px;font-weight:500;cursor:pointer;transition:.16s;white-space:nowrap}
.agx-back:hover{color:hsl(var(--foreground));background:hsl(var(--secondary))}
.agx-title{display:flex;align-items:center;gap:11px;flex:1;min-width:0}
.agx-title-ico{width:34px;height:34px;border-radius:10px;background:var(--agx-gsoft);display:grid;place-items:center;color:var(--agx-g2);flex-shrink:0}
.agx-title h1{font-size:20px;font-weight:700;margin:0;letter-spacing:-.01em}
.agx-primary{display:inline-flex;align-items:center;gap:8px;flex-shrink:0;padding:11px 18px;border-radius:11px;border:none;
  background:var(--agx-grad);color:#0a0a12;font:inherit;font-weight:700;font-size:14px;cursor:pointer;
  box-shadow:0 6px 18px -6px rgba(232,201,106,.5);transition:.16s}
.agx-primary:hover{transform:translateY(-1px);box-shadow:0 10px 24px -6px rgba(232,201,106,.6)}
.agx-controls{display:flex;align-items:flex-end;gap:16px 20px;flex-wrap:wrap;background:hsl(var(--card));
  border:1px solid hsl(var(--border));border-radius:14px;padding:14px 18px;margin-bottom:18px}
.agx-navgroup{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.agx-weeknav{display:flex;align-items:center;gap:4px;background:hsl(var(--muted));border:1px solid hsl(var(--border));border-radius:12px;padding:4px}
.agx-weeknav button{width:38px;height:38px;border-radius:9px;border:none;background:transparent;color:hsl(var(--muted-foreground));
  cursor:pointer;display:grid;place-items:center;line-height:0;transition:.14s;font:inherit;flex-shrink:0}
.agx-weeknav button:hover{background:hsl(var(--card));color:var(--agx-g2)}
.agx-range{padding:0 14px;min-width:160px;text-align:center;font-size:14px;font-weight:600;color:hsl(var(--foreground));white-space:nowrap;font-variant-numeric:tabular-nums}
.agx-today{height:40px;padding:0 20px;border-radius:10px;border:1px solid var(--agx-g1);background:var(--agx-gsoft);
  color:var(--agx-g2);font:inherit;font-weight:600;font-size:13px;cursor:pointer;transition:.14s;flex-shrink:0}
.agx-today:hover{background:rgba(232,201,106,.18)}
.agx-spacer{flex:1;min-width:16px}
.agx-field{display:flex;flex-direction:column;gap:6px}
.agx-field label{font-size:10px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:hsl(var(--muted-foreground))}
.agx-select{position:relative;display:flex;align-items:center;width:100%}
.agx-select select{appearance:none;-webkit-appearance:none;font:inherit;font-size:13px;font-weight:500;
  height:40px;padding:0 34px 0 14px;border-radius:10px;border:1px solid hsl(var(--border));background:hsl(var(--secondary));
  color:hsl(var(--foreground));cursor:pointer;min-width:176px;width:100%;outline:none;transition:.14s}
.agx-select select:hover{border-color:var(--agx-g1)}
.agx-select select:focus{border-color:var(--agx-g1);box-shadow:0 0 0 3px rgba(232,201,106,.15)}
.agx-select .agx-chev{position:absolute;right:11px;pointer-events:none;color:hsl(var(--muted-foreground))}
.agx-legend{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin:0 2px 18px;padding-left:2px}
.agx-legend .i{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:hsl(var(--muted-foreground))}
.agx-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}
.agx-week{display:grid;grid-template-columns:repeat(5,1fr);gap:14px}
.agx-day{background:hsl(var(--card));border:1px solid hsl(var(--border));border-radius:14px;min-height:340px;
  display:flex;flex-direction:column;overflow:hidden;transition:.16s}
.agx-day.today{border-color:var(--agx-g1);box-shadow:0 0 0 1px var(--agx-g1),0 14px 40px -20px rgba(232,201,106,.5)}
.agx-dhead{display:flex;align-items:center;justify-content:space-between;padding:13px 14px;border-bottom:1px solid hsl(var(--border));position:relative}
.agx-day.today .agx-dhead{background:linear-gradient(180deg,var(--agx-gsoft),transparent)}
.agx-day.today .agx-dhead::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--agx-grad)}
.agx-dweekday{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:hsl(var(--muted-foreground))}
.agx-day.today .agx-dweekday{color:var(--agx-g2)}
.agx-ddate{font-size:20px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums}
.agx-dmonth{font-size:11px;color:hsl(var(--muted-foreground));font-weight:500}
.agx-count{font-size:11px;font-weight:700;min-width:22px;height:22px;padding:0 7px;border-radius:11px;display:grid;place-items:center;
  background:hsl(var(--secondary));color:hsl(var(--muted-foreground));font-variant-numeric:tabular-nums}
.agx-day.today .agx-count{background:var(--agx-gsoft);color:var(--agx-g2)}
.agx-dbody{padding:10px;display:flex;flex-direction:column;gap:9px;flex:1}
.agx-card{text-align:left;width:100%;border:1px solid hsl(var(--border));background:hsl(var(--secondary));border-radius:11px;
  padding:11px 12px;cursor:pointer;transition:.15s;position:relative;overflow:hidden;font:inherit;color:inherit}
.agx-card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--agx-sc);opacity:.9}
.agx-card:hover{transform:translateY(-2px);border-color:var(--agx-g1)}
.agx-ctime{font-size:15px;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:.01em}
.agx-cclient{font-size:13px;font-weight:500;color:hsl(var(--foreground));margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.agx-cmeta{display:flex;align-items:center;gap:7px;margin-top:8px;flex-wrap:wrap}
.agx-chip{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px;
  background:hsl(var(--card));border:1px solid hsl(var(--border))}
.agx-ctype{font-size:11px;color:hsl(var(--muted-foreground))}
.agx-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:hsl(var(--muted-foreground));padding:20px 10px}
.agx-empty svg{opacity:.4}
.agx-empty span{font-size:12px}
.agx-add{margin-top:2px;font-size:12px;color:hsl(var(--muted-foreground));border:1px dashed hsl(var(--border));background:transparent;
  border-radius:9px;padding:7px 12px;cursor:pointer;font:inherit;transition:.14s;display:inline-flex;align-items:center;gap:6px}
.agx-add:hover{border-color:var(--agx-g1);color:var(--agx-g2)}
.agx-err{color:hsl(var(--destructive));margin-bottom:12px;font-size:13px}
@media(max-width:960px){.agx-week{grid-template-columns:1fr;gap:10px}.agx-day{min-height:auto}
  .agx-controls{align-items:stretch}.agx-spacer{display:none}
  .agx-navgroup{width:100%;justify-content:space-between}.agx-field{flex:1 1 220px}.agx-select select{min-width:0}}
@media(max-width:560px){.agx-navgroup{gap:10px}.agx-range{flex:1;min-width:0;padding:0 8px}.agx-field{flex:1 1 100%}}
@media(prefers-reduced-motion:reduce){.agx-root *{transition:none!important}}
`;

export default function Agenda() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  // Advogado (e afins) vê só a própria agenda → sem seletor por advogado.
  const canFilterByLawyer = ROLES_VE_TODAS_AGENDAS.some((r) => hasRole(r));
  const [anchor, setAnchor] = useState(() => new Date());
  const [lawyerId, setLawyerId] = useState<string>("");
  const [status, setStatus] = useState<MeetingStatus | "">("");
  const [selected, setSelected] = useState<MeetingRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [createDate, setCreateDate] = useState<string | null>(null);

  const todayISO = toISO(new Date());
  const weekStart = useMemo(() => startOfWeek(anchor), [anchor]);
  const days = useMemo(
    () => Array.from({ length: 5 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d; }),
    [weekStart],
  );
  const from = toISO(days[0]);
  const to = toISO(days[days.length - 1]);

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

  const openCreate = (dateISO?: string) => { setSelected(null); setCreateDate(dateISO ?? null); setCreating(true); };

  return (
    <div className="agx-root">
      <style>{CSS}</style>

      {/* TOP BAR */}
      <div className="agx-topbar">
        <button type="button" className="agx-back" onClick={() => navigate("/sistema")}>
          <ArrowLeft size={16} /> Voltar ao painel
        </button>
        <div className="agx-title">
          <span className="agx-title-ico"><CalendarDays size={19} /></span>
          <h1>{canFilterByLawyer ? "Agenda de Reuniões" : "Minha agenda"}</h1>
        </div>
        <button type="button" className="agx-primary" onClick={() => openCreate()}>
          <Plus size={16} /> Nova reunião
        </button>
      </div>

      {/* CONTROLS */}
      <div className="agx-controls">
        <div className="agx-navgroup">
          <div className="agx-weeknav">
            <button type="button" aria-label="Semana anterior" onClick={() => { const d = new Date(anchor); d.setDate(d.getDate() - 7); setAnchor(d); }}><ChevronLeft size={18} /></button>
            <span className="agx-range">{weekRangeLabel(days[0], days[days.length - 1])}</span>
            <button type="button" aria-label="Próxima semana" onClick={() => { const d = new Date(anchor); d.setDate(d.getDate() + 7); setAnchor(d); }}><ChevronRight size={18} /></button>
          </div>
          <button type="button" className="agx-today" onClick={() => setAnchor(new Date())}>Hoje</button>
        </div>
        <div className="agx-spacer" />
        {canFilterByLawyer && (
          <div className="agx-field">
            <label htmlFor="agx-adv">Advogado</label>
            <div className="agx-select">
              <select id="agx-adv" value={lawyerId} onChange={(e) => setLawyerId(e.target.value)}>
                <option value="">Todos os advogados</option>
                {assignableUsers.map((u) => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}
              </select>
              <ChevronDown className="agx-chev" size={14} />
            </div>
          </div>
        )}
        <div className="agx-field">
          <label htmlFor="agx-status">Status</label>
          <div className="agx-select">
            <select id="agx-status" value={status} onChange={(e) => setStatus(e.target.value as MeetingStatus | "")}>
              <option value="">Todos os status</option>
              {MEETING_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <ChevronDown className="agx-chev" size={14} />
          </div>
        </div>
      </div>

      {/* LEGEND */}
      <div className="agx-legend">
        {MEETING_STATUS_OPTIONS.map((o) => (
          <span className="i" key={o.value}>
            <span className="agx-dot" style={{ background: STATUS_COLOR[o.value] }} />{o.label}
          </span>
        ))}
      </div>

      {error && <div className="agx-err">Erro ao carregar: {error}</div>}

      {/* WEEK GRID */}
      <div className="agx-week">
        {days.map((d) => {
          const iso = toISO(d);
          const items = byDay[iso] ?? [];
          const isToday = iso === todayISO;
          return (
            <div key={iso} className={`agx-day${isToday ? " today" : ""}`}>
              <div className="agx-dhead">
                <div>
                  <div className="agx-dweekday">{weekdayShort(d)}{isToday ? " · Hoje" : ""}</div>
                  <div className="agx-ddate">{String(d.getDate()).padStart(2, "0")}<span className="agx-dmonth"> /{String(d.getMonth() + 1).padStart(2, "0")}</span></div>
                </div>
                <span className="agx-count">{items.length}</span>
              </div>
              <div className="agx-dbody">
                {loading ? (
                  <div className="agx-empty"><span>Carregando…</span></div>
                ) : items.length === 0 ? (
                  <div className="agx-empty">
                    <CalendarDays size={26} />
                    <span>Sem reuniões</span>
                    <button type="button" className="agx-add" onClick={() => openCreate(iso)}><CalendarPlus size={13} /> Agendar</button>
                  </div>
                ) : (
                  items.map((m) => (
                    <button key={m.id} type="button" className="agx-card" style={{ ["--agx-sc" as string]: STATUS_COLOR[m.status] }}
                      onClick={() => { setCreating(false); setSelected(m); }}>
                      <div className="agx-ctime">{m.start_time.slice(0, 5)}</div>
                      <div className="agx-cclient">{m.client_name ?? "Cliente não informado"}</div>
                      <div className="agx-cmeta">
                        <span className="agx-chip"><span className="agx-dot" style={{ background: STATUS_COLOR[m.status] }} />{statusLabel(m.status)}</span>
                        {m.type ? <span className="agx-ctype">{m.type}</span> : null}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {(selected || creating) && (
        <MeetingDetailModal
          meeting={selected}
          defaultDate={createDate ?? toISO(days[0])}
          onClose={() => { setSelected(null); setCreating(false); setCreateDate(null); }}
          onSaved={() => { setSelected(null); setCreating(false); setCreateDate(null); refresh(); }}
          onOpenClient={(clientId) => navigate(`/clientes/${clientId}`)}
        />
      )}
    </div>
  );
}
