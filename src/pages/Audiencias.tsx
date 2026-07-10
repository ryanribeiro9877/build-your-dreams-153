import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAudiencias, type AudienciaRow } from "@/hooks/useAudiencias";
import { useMeetingLawyers } from "@/hooks/useMeetingLawyers";
import { useMyWorkspace } from "@/hooks/useMyWorkspace";
import {
  AUDIENCIA_STATUS_OPTIONS, AUDIENCIA_STATUS_COLOR, audienciaStatusLabel, type AudienciaStatus,
} from "@/lib/audiencias";
import { AudienciaFormModal } from "@/components/audiencias/AudienciaFormModal";

// Ícones SVG inline (o app esconde os ícones do lucide-react globalmente).
type IconProps = { size?: number; className?: string };
function Svg({ size = 18, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>{children}</svg>
  );
}
const IcScale = (p: IconProps) => <Svg {...p}><path d="M12 3v18M7 21h10M12 6l7 3-2.5 5a3 3 0 0 1-4.5 0L9.5 9zM12 6 5 9l2.5 5a3 3 0 0 0 4.5 0L14.5 9z" /></Svg>;
const IcPlus = (p: IconProps) => <Svg {...p}><path d="M5 12h14M12 5v14" /></Svg>;
const IcArrowLeft = (p: IconProps) => <Svg {...p}><path d="M19 12H5M12 19l-7-7 7-7" /></Svg>;
const IcChevronDown = (p: IconProps) => <Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>;
const IcMapPin = (p: IconProps) => <Svg {...p}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></Svg>;

// Papéis (role_templates.code) que enxergam TODAS as agendas e agendam por todos.
// Mesmo critério da Agenda de Reuniões. O RLS de audiencias já libera leitura a
// recepção+sócio+advogado; este seletor é só conveniência.
const ROLE_CODES_VE_TODAS = ["socio", "lider_recepcao", "recepcionista"];

type Timeframe = "proximas" | "passadas" | "todas";

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
function isoAtDayStart(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.toISOString(); }
function isoAtDayEnd(d: Date) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x.toISOString(); }
function localDateKey(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function dayHeading(iso: string): string {
  const d = new Date(iso);
  const s = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function timeLabel(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

const CSS = `
.aud-root{--aud-g1:#c9a84c;--aud-g2:#e8c96a;--aud-grad:linear-gradient(135deg,#c9a84c,#e8c96a);--aud-gsoft:rgba(232,201,106,.12);
  max-width:1080px;margin:0 auto;padding:28px 24px 60px;color:hsl(var(--foreground));font-family:'DM Sans',system-ui,sans-serif}
.aud-topbar{display:flex;align-items:center;gap:16px;margin-bottom:22px;flex-wrap:wrap}
.aud-back{display:inline-flex;align-items:center;gap:8px;flex-shrink:0;padding:9px 14px;border-radius:10px;
  border:1px solid hsl(var(--border));background:hsl(var(--card));color:hsl(var(--muted-foreground));
  font:inherit;font-size:13px;font-weight:500;cursor:pointer;transition:.16s;white-space:nowrap}
.aud-back:hover{color:hsl(var(--foreground));background:hsl(var(--secondary))}
.aud-title{display:flex;align-items:center;gap:11px;flex:1;min-width:0}
.aud-title-ico{width:34px;height:34px;border-radius:10px;background:var(--aud-gsoft);display:grid;place-items:center;color:var(--aud-g2);flex-shrink:0}
.aud-title h1{font-size:20px;font-weight:700;margin:0;letter-spacing:-.01em}
.aud-primary{display:inline-flex;align-items:center;gap:8px;flex-shrink:0;padding:11px 18px;border-radius:11px;border:none;
  background:var(--aud-grad);color:#0a0a12;font:inherit;font-weight:700;font-size:14px;cursor:pointer;
  box-shadow:0 6px 18px -6px rgba(232,201,106,.5);transition:.16s}
.aud-primary:hover{transform:translateY(-1px);box-shadow:0 10px 24px -6px rgba(232,201,106,.6)}
.aud-controls{display:flex;align-items:flex-end;gap:14px 20px;flex-wrap:wrap;background:hsl(var(--card));
  border:1px solid hsl(var(--border));border-radius:14px;padding:14px 18px;margin-bottom:18px}
.aud-tabs{display:inline-flex;gap:2px;background:hsl(var(--muted));border:1px solid hsl(var(--border));border-radius:11px;padding:4px}
.aud-tabs button{padding:8px 16px;border-radius:8px;border:none;background:transparent;color:hsl(var(--muted-foreground));
  font:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:.14s}
.aud-tabs button.on{background:hsl(var(--card));color:var(--aud-g2)}
.aud-spacer{flex:1;min-width:16px}
.aud-field{display:flex;flex-direction:column;gap:6px}
.aud-field label{font-size:10px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:hsl(var(--muted-foreground))}
.aud-select{position:relative;display:flex;align-items:center}
.aud-select select{appearance:none;-webkit-appearance:none;font:inherit;font-size:13px;font-weight:500;height:40px;
  padding:0 34px 0 14px;border-radius:10px;border:1px solid hsl(var(--border));background:hsl(var(--secondary));
  color:hsl(var(--foreground));cursor:pointer;min-width:176px;outline:none;transition:.14s}
.aud-select select:hover{border-color:var(--aud-g1)}
.aud-select .aud-chev{position:absolute;right:11px;pointer-events:none;color:hsl(var(--muted-foreground))}
.aud-daygroup{margin-bottom:22px}
.aud-dayhead{display:flex;align-items:center;gap:10px;margin:0 2px 10px;font-size:13px;font-weight:700;color:hsl(var(--foreground))}
.aud-dayhead::after{content:"";flex:1;height:1px;background:hsl(var(--border))}
.aud-daycount{font-size:11px;font-weight:700;min-width:20px;height:20px;padding:0 6px;border-radius:10px;display:grid;place-items:center;
  background:var(--aud-gsoft);color:var(--aud-g2)}
.aud-list{display:grid;gap:10px}
.aud-card{text-align:left;width:100%;display:flex;gap:14px;align-items:flex-start;border:1px solid hsl(var(--border));
  background:hsl(var(--card));border-radius:12px;padding:14px 16px;cursor:pointer;transition:.15s;position:relative;overflow:hidden;font:inherit;color:inherit}
.aud-card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--aud-sc);opacity:.9}
.aud-card:hover{transform:translateY(-2px);border-color:var(--aud-g1)}
.aud-time{font-size:18px;font-weight:700;font-variant-numeric:tabular-nums;min-width:56px;line-height:1.1}
.aud-body{flex:1;min-width:0}
.aud-client{font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.aud-sub{font-size:13px;color:hsl(var(--muted-foreground));margin-top:3px}
.aud-meta{display:flex;align-items:center;gap:8px;margin-top:9px;flex-wrap:wrap}
.aud-chip{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px;
  background:hsl(var(--secondary));border:1px solid hsl(var(--border))}
.aud-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}
.aud-local{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:hsl(var(--muted-foreground));max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aud-empty{text-align:center;padding:60px 20px;color:hsl(var(--muted-foreground))}
.aud-empty svg{opacity:.4;margin-bottom:12px}
.aud-err{color:hsl(var(--destructive));margin-bottom:12px;font-size:13px}
@media(max-width:560px){.aud-controls{align-items:stretch}.aud-spacer{display:none}.aud-select select{min-width:0;width:100%}.aud-field{flex:1 1 100%}}
@media(prefers-reduced-motion:reduce){.aud-root *{transition:none!important}}
`;

export default function Audiencias() {
  const navigate = useNavigate();
  const { workspace } = useMyWorkspace();
  const roleCode = workspace?.role_template?.code ?? null;
  const canFilterByLawyer =
    (roleCode !== null && ROLE_CODES_VE_TODAS.includes(roleCode)) ||
    workspace?.is_master === true ||
    workspace?.role_template?.is_admin === true;

  const [timeframe, setTimeframe] = useState<Timeframe>("proximas");
  const [lawyerId, setLawyerId] = useState<string>("");
  const [status, setStatus] = useState<AudienciaStatus | "">("");
  const [selected, setSelected] = useState<AudienciaRow | null>(null);
  const [creating, setCreating] = useState(false);

  const now = new Date();
  const { from, to } = useMemo(() => {
    if (timeframe === "proximas") return { from: isoAtDayStart(now), to: new Date(now.getTime() + 2 * YEAR_MS).toISOString() };
    if (timeframe === "passadas") return { from: new Date(now.getTime() - 2 * YEAR_MS).toISOString(), to: isoAtDayEnd(now) };
    return { from: new Date(now.getTime() - 2 * YEAR_MS).toISOString(), to: new Date(now.getTime() + 2 * YEAR_MS).toISOString() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeframe]);

  const { lawyers } = useMeetingLawyers();
  const lawyerName = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of lawyers) m.set(l.user_id, l.name);
    return m;
  }, [lawyers]);

  const { audiencias, loading, error, refresh } = useAudiencias({
    from, to, status: status || undefined,
  });

  // Filtro por advogado (client-side) + agrupamento por dia local.
  const groups = useMemo(() => {
    let rows = audiencias;
    if (lawyerId) rows = rows.filter((a) => a.advogado_user_id === lawyerId);
    // "passadas" mostra mais recentes primeiro; demais, cronológico crescente.
    const sorted = [...rows].sort((a, b) =>
      timeframe === "passadas"
        ? b.data_hora.localeCompare(a.data_hora)
        : a.data_hora.localeCompare(b.data_hora));
    const map = new Map<string, AudienciaRow[]>();
    for (const a of sorted) {
      const k = localDateKey(a.data_hora);
      const bucket = map.get(k);
      if (bucket) bucket.push(a);
      else map.set(k, [a]);
    }
    return Array.from(map.entries());
  }, [audiencias, lawyerId, timeframe]);

  const advLabel = (a: AudienciaRow) =>
    (a.advogado_user_id ? lawyerName.get(a.advogado_user_id) : null) ?? a.advogado_nome ?? null;

  return (
    <div className="aud-root">
      <style>{CSS}</style>

      <div className="aud-topbar">
        <button type="button" className="aud-back" onClick={() => navigate("/sistema")}>
          <IcArrowLeft size={16} /> Voltar ao painel
        </button>
        <div className="aud-title">
          <span className="aud-title-ico"><IcScale size={19} /></span>
          <h1>Agenda de Audiências</h1>
        </div>
        <button type="button" className="aud-primary" onClick={() => { setSelected(null); setCreating(true); }}>
          <IcPlus size={16} /> Nova audiência
        </button>
      </div>

      <div className="aud-controls">
        <div className="aud-tabs" role="tablist" aria-label="Período">
          <button type="button" role="tab" aria-selected={timeframe === "proximas"} className={timeframe === "proximas" ? "on" : ""} onClick={() => setTimeframe("proximas")}>Próximas</button>
          <button type="button" role="tab" aria-selected={timeframe === "passadas"} className={timeframe === "passadas" ? "on" : ""} onClick={() => setTimeframe("passadas")}>Passadas</button>
          <button type="button" role="tab" aria-selected={timeframe === "todas"} className={timeframe === "todas" ? "on" : ""} onClick={() => setTimeframe("todas")}>Todas</button>
        </div>
        <div className="aud-spacer" />
        {canFilterByLawyer && (
          <div className="aud-field">
            <label htmlFor="aud-adv">Advogado</label>
            <div className="aud-select">
              <select id="aud-adv" value={lawyerId} onChange={(e) => setLawyerId(e.target.value)}>
                <option value="">Todos os advogados</option>
                {lawyers.map((u) => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}
              </select>
              <IcChevronDown className="aud-chev" size={14} />
            </div>
          </div>
        )}
        <div className="aud-field">
          <label htmlFor="aud-status">Status</label>
          <div className="aud-select">
            <select id="aud-status" value={status} onChange={(e) => setStatus(e.target.value as AudienciaStatus | "")}>
              <option value="">Todos os status</option>
              {AUDIENCIA_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <IcChevronDown className="aud-chev" size={14} />
          </div>
        </div>
      </div>

      {error && <div className="aud-err">Erro ao carregar: {error}</div>}

      {loading ? (
        <div className="aud-empty"><span>Carregando…</span></div>
      ) : groups.length === 0 ? (
        <div className="aud-empty">
          <IcScale size={40} />
          <div style={{ fontSize: 15, fontWeight: 600, color: "hsl(var(--foreground))" }}>Nenhuma audiência</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>
            {timeframe === "proximas" ? "Não há audiências futuras registradas." : timeframe === "passadas" ? "Não há audiências passadas registradas." : "Nenhuma audiência registrada."}
          </div>
        </div>
      ) : (
        groups.map(([dayKey, items]) => (
          <div className="aud-daygroup" key={dayKey}>
            <div className="aud-dayhead">
              {dayHeading(items[0].data_hora)}
              <span className="aud-daycount">{items.length}</span>
            </div>
            <div className="aud-list">
              {items.map((a) => {
                const adv = advLabel(a);
                return (
                  <button key={a.id} type="button" className="aud-card"
                    style={{ ["--aud-sc" as string]: AUDIENCIA_STATUS_COLOR[a.status] }}
                    onClick={() => { setCreating(false); setSelected(a); }}>
                    <div className="aud-time">{timeLabel(a.data_hora)}</div>
                    <div className="aud-body">
                      <div className="aud-client">{a.client_name ?? "Cliente não informado"}</div>
                      <div className="aud-sub">
                        {a.tipo_acao ? a.tipo_acao : "Audiência"}
                        {a.parte_contraria ? ` · contra ${a.parte_contraria}` : ""}
                        {a.process_number ? ` · Proc. ${a.process_number}` : ""}
                      </div>
                      <div className="aud-meta">
                        <span className="aud-chip"><span className="aud-dot" style={{ background: AUDIENCIA_STATUS_COLOR[a.status] }} />{audienciaStatusLabel(a.status)}</span>
                        {adv ? <span className="aud-chip">{adv}</span> : null}
                        {a.link_local ? <span className="aud-local"><IcMapPin size={13} /> {a.link_local}</span> : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))
      )}

      {(selected || creating) && (
        <AudienciaFormModal
          audiencia={selected}
          onClose={() => { setSelected(null); setCreating(false); }}
          onSaved={() => { setSelected(null); setCreating(false); refresh(); }}
        />
      )}
    </div>
  );
}
