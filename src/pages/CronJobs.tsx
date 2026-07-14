import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { HexagonLoader } from "@/components/HexagonLoader";
import {
  DASH_BG, cardStyle, titleStyle, fmtInt, DashboardHeader, KpiGrid,
} from "@/components/dashboard/dashboardKit";

/**
 * [Crons · Técnico] Lê o agendador REAL do Postgres (schema `cron`), não a
 * tabela de aplicação `cron_jobs` (que fica vazia — era a causa do "0 job(s)").
 *
 * O front não alcança o schema `cron` direto (fora do PostgREST/RLS), então
 * tudo passa por 4 RPCs SECURITY DEFINER (search_path='', gate `has_role
 * tech`): admin_cron_list / _toggle / _delete / _create. Elas estão FORA dos
 * tipos gerados do Supabase → cast destipado pontual, mesmo padrão de
 * [[useAudiencias]]/[[useDashboardRpc]]/[[useMeetingLawyers]].
 *
 * Visual na linguagem dos dashboards 9.2 (cardStyle/titleStyle/KpiGrid, fundo
 * --bg1, ouro --gold). `admin_cron_create` aceita SQL livre — é a natureza do
 * pg_cron; superfície privilegiada, porém tech-only e gateada no servidor.
 */

// Acesso destipado às RPCs (fora do types.ts gerado).
type UntypedRpc = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
};
const db = supabase as unknown as UntypedRpc;

interface CronRow {
  jobid: number;
  jobname: string;
  schedule: string;
  command: string;
  active: boolean;
  last_run: string | null;
  last_status: string | null;
  last_message: string | null;
}

const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** Traduz uma expressão cron (5 campos) para pt-BR; devolve a própria expressão em casos exóticos. */
function humanizeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;
  const [min, hour, dom, mon, dow] = parts;
  const pad = (s: string) => s.padStart(2, "0");
  const allDate = dom === "*" && mon === "*";

  if (min === "*" && hour === "*" && allDate && dow === "*") return "a cada minuto";
  const stepMin = min.match(/^\*\/(\d+)$/);
  if (stepMin && hour === "*" && allDate && dow === "*") return `a cada ${stepMin[1]} min`;
  if (min === "0" && hour === "*" && allDate && dow === "*") return "a cada hora";
  const stepHour = hour.match(/^\*\/(\d+)$/);
  if (/^\d+$/.test(min) && stepHour && allDate && dow === "*") return `a cada ${stepHour[1]} h`;
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && allDate) {
    const time = `${pad(hour)}:${pad(min)}`;
    if (dow === "*") return `todo dia às ${time}`;
    if (/^\d+$/.test(dow)) return `toda ${WEEKDAYS[Number(dow) % 7]} às ${time}`;
  }
  return expr;
}

/** "há X" a partir de um ISO; degrada para "nunca executou" quando nulo. */
function humanizeSince(iso: string | null): string {
  if (!iso) return "nunca executou";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "agora";
  const min = Math.floor(diff / 60000);
  if (min < 1) return "há segundos";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} d`;
}

const STATUS_LABELS: Record<string, string> = {
  succeeded: "sucesso", failed: "falha", running: "executando",
  starting: "iniciando", sending: "enviando", connecting: "conectando",
};
function statusColor(status: string | null): string {
  const s = (status ?? "").toLowerCase();
  if (s === "succeeded") return "#22c55e";
  if (s === "failed") return "#ef4444";
  if (!s) return "var(--text3, #888)";
  return "#f59e0b";
}
function statusLabel(status: string | null): string {
  if (!status) return "sem execução";
  return STATUS_LABELS[status.toLowerCase()] ?? status;
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 8,
  background: "var(--bg2, #0f0f1a)", border: "1px solid var(--border, #1e1e2e)", color: "var(--text1, #eee)",
  fontSize: 13, outline: "none", boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 10, color: "var(--text3, #888)", marginBottom: 4,
  textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600,
};
const mono = "var(--font-mono, monospace)";

const EMPTY = { name: "", schedule: "*/5 * * * *", command: "" };

export default function CronJobs() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const isTech = hasRole("tech");

  const [jobs, setJobs] = useState<CronRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const fetchJobs = useCallback(async () => {
    const { data, error } = await db.rpc("admin_cron_list");
    if (error) {
      setJobs([]);
      setError(error.code === "42501" ? "acesso_negado" : error.message ?? "Erro ao carregar crons");
      return;
    }
    setJobs((data as CronRow[]) ?? []);
    setError(null);
  }, []);

  useEffect(() => {
    if (!isTech) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    void fetchJobs().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isTech, fetchJobs]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.schedule.trim() || !form.command.trim()) {
      toast.error("Nome, agenda e comando são obrigatórios");
      return;
    }
    setCreating(true);
    const { error } = await db.rpc("admin_cron_create", {
      p_name: form.name.trim(),
      p_schedule: form.schedule.trim(),
      p_command: form.command.trim(),
    });
    setCreating(false);
    if (error) { toast.error("Erro ao criar: " + (error.message ?? "")); return; }
    toast.success("Cron criada!");
    setForm(EMPTY); setShowForm(false);
    await fetchJobs();
  }

  async function toggleActive(job: CronRow) {
    setBusyId(job.jobid);
    const { error } = await db.rpc("admin_cron_toggle", { p_jobid: job.jobid, p_active: !job.active });
    if (error) { toast.error("Erro ao atualizar: " + (error.message ?? "")); setBusyId(null); return; }
    await fetchJobs();
    setBusyId(null);
  }

  async function handleDelete(job: CronRow) {
    if (!confirm(`Remover a cron "${job.jobname}" (#${job.jobid})? Esta ação não pode ser desfeita.`)) return;
    setBusyId(job.jobid);
    const { error } = await db.rpc("admin_cron_delete", { p_jobid: job.jobid });
    if (error) { toast.error("Erro ao remover: " + (error.message ?? "")); setBusyId(null); return; }
    toast.success("Cron removida");
    await fetchJobs();
    setBusyId(null);
  }

  const kpis = useMemo(() => {
    const ativas = jobs.filter((j) => j.active).length;
    const falhas = jobs.filter((j) => (j.last_status ?? "").toLowerCase() === "failed").length;
    return [
      { label: "Jobs", value: fmtInt(jobs.length), color: "var(--gold, #c9a84c)" },
      { label: "Ativas", value: fmtInt(ativas), color: "#22c55e" },
      { label: "Inativas", value: fmtInt(jobs.length - ativas), color: "var(--text3, #888)" },
      { label: "Falhas recentes", value: fmtInt(falhas), color: falhas > 0 ? "#ef4444" : "var(--text3, #888)" },
    ];
  }, [jobs]);

  const schedulePreview = humanizeCron(form.schedule);

  // Gate de página (idêntico ao gate das RPCs no servidor e ao TechRoute da rota).
  if (!isTech) {
    return (
      <div style={{ minHeight: "100vh", background: DASH_BG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center" }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--gold, #c9a84c)" }}>Crons · Técnico</h1>
        <p style={{ opacity: 0.7, maxWidth: 420, color: "var(--text3, #888)" }}>
          Esta aba é exclusiva do acesso técnico (papel <code>tech</code>).
        </p>
        <button className="cron-btn" onClick={() => navigate("/sistema")} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border, #1e1e2e)", background: "transparent", color: "var(--gold, #c9a84c)", cursor: "pointer", fontSize: 12 }}>← Voltar</button>
      </div>
    );
  }

  if (loading) return <HexagonLoader variant="fullscreen" label="Lendo o agendador do Postgres..." />;

  return (
    <div style={{ minHeight: "100vh", background: DASH_BG, padding: "24px 32px" }}>
      <style>{`
        .cron-btn { transition: filter .15s ease, background .15s ease, border-color .15s ease, transform .05s ease; }
        .cron-btn:hover:not(:disabled) { filter: brightness(1.12); }
        .cron-btn:active:not(:disabled) { transform: translateY(1px); }
        .cron-btn:disabled { opacity: .5; cursor: not-allowed; }
        .cron-btn:focus-visible, .cron-input:focus-visible {
          outline: 2px solid var(--gold, #c9a84c); outline-offset: 2px;
        }
        .cron-input:focus-visible { border-color: var(--gold, #c9a84c); }
        .cron-card { transition: border-color .15s ease, background .15s ease; }
        .cron-card:hover { border-color: rgba(201,168,76,0.4); }
      `}</style>

      <DashboardHeader
        title="Crons · Técnico"
        subtitle={`Agendador real do Postgres (pg_cron) · ${fmtInt(jobs.length)} job(s) · ${fmtInt(jobs.filter((j) => j.active).length)} ativa(s)`}
      />

      {error && error !== "acesso_negado" && (
        <div style={{ ...cardStyle, marginBottom: 16, borderColor: "rgba(239,68,68,0.4)", color: "#fca5a5", fontSize: 12 }}>
          {error}
        </div>
      )}

      <KpiGrid items={kpis} />

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <button
          className="cron-btn"
          onClick={() => setShowForm((v) => !v)}
          style={{ padding: "9px 18px", borderRadius: 8, border: "none", cursor: "pointer", background: "linear-gradient(135deg, #c9a84c, #e8c96a)", color: "#0a0a12", fontSize: 13, fontWeight: 600 }}
        >
          {showForm ? "Fechar" : "+ Nova Cron"}
        </button>
        <button
          className="cron-btn"
          onClick={() => { setLoading(true); void fetchJobs().finally(() => setLoading(false)); }}
          style={{ padding: "9px 16px", borderRadius: 8, border: "1px solid var(--border, #1e1e2e)", background: "transparent", color: "var(--text2, #bbb)", cursor: "pointer", fontSize: 13 }}
        >
          ↻ Atualizar
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} style={{ ...cardStyle, marginBottom: 20 }}>
          <div style={titleStyle}>Nova cron</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={labelStyle}>Nome *</label>
              <input className="cron-input" required style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="notificar_prazos_diario" />
            </div>
            <div>
              <label style={labelStyle}>Agenda (cron) *</label>
              <input className="cron-input" required style={{ ...inputStyle, fontFamily: mono }} value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} placeholder="*/5 * * * *" />
              <div style={{ fontSize: 11, color: "var(--gold, #c9a84c)", marginTop: 6 }}>
                {schedulePreview === form.schedule.trim() ? "expressão livre" : schedulePreview}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <label style={labelStyle}>Comando SQL *</label>
            <textarea
              className="cron-input"
              required
              style={{ ...inputStyle, minHeight: 72, resize: "vertical", fontFamily: mono, fontSize: 12 }}
              value={form.command}
              onChange={(e) => setForm({ ...form, command: e.target.value })}
              placeholder="select public.notificar_algo();"
            />
            <div style={{ fontSize: 10, color: "var(--text3, #888)", marginTop: 6, lineHeight: 1.5 }}>
              Executado pelo pg_cron como SQL. Prefira chamar funções já existentes (<code style={{ fontFamily: mono }}>notificar_*</code> / <code style={{ fontFamily: mono }}>trigger_*</code>). Formato da agenda: <code style={{ fontFamily: mono }}>min hora dia mês dia-semana</code>.
            </div>
          </div>
          <button type="submit" disabled={creating} className="cron-btn" style={{ marginTop: 16, padding: "10px 24px", borderRadius: 8, border: "none", cursor: "pointer", background: "linear-gradient(135deg, #c9a84c, #e8c96a)", color: "#0a0a12", fontSize: 13, fontWeight: 600 }}>
            {creating ? "Criando…" : "Criar cron"}
          </button>
        </form>
      )}

      {jobs.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: "center", color: "var(--text3, #888)", fontSize: 13, padding: 40 }}>
          Nenhuma cron agendada no Postgres.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {jobs.map((job) => {
            const busy = busyId === job.jobid;
            return (
              <div key={job.jobid} className="cron-card" style={{ ...cardStyle }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text1, #eee)" }}>{job.jobname}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6, textTransform: "uppercase", letterSpacing: "0.06em", background: job.active ? "rgba(34,197,94,0.15)" : "var(--bg2, #0f0f1a)", color: job.active ? "#22c55e" : "var(--text3, #888)", border: job.active ? "1px solid rgba(34,197,94,0.3)" : "1px solid var(--border, #1e1e2e)" }}>
                    {job.active ? "ativa" : "inativa"}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text3, #888)", fontFamily: mono }}>#{job.jobid}</span>
                  <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                    <button className="cron-btn" disabled={busy} onClick={() => toggleActive(job)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid var(--border, #1e1e2e)", background: "var(--bg2, #0f0f1a)", color: "var(--text2, #bbb)", cursor: "pointer", fontSize: 12 }}>
                      {busy ? "…" : job.active ? "Desativar" : "Ativar"}
                    </button>
                    <button className="cron-btn" disabled={busy} onClick={() => handleDelete(job)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.35)", background: "transparent", color: "#ef4444", cursor: "pointer", fontSize: 12 }}>
                      Remover
                    </button>
                  </div>
                </div>

                <div style={{ marginTop: 12, display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <code style={{ fontFamily: mono, fontSize: 13, color: "var(--gold, #c9a84c)" }}>{job.schedule}</code>
                  <span style={{ fontSize: 12, color: "var(--text3, #888)" }}>{humanizeCron(job.schedule)}</span>
                </div>

                <pre style={{ marginTop: 10, marginBottom: 0, padding: "10px 12px", background: "var(--bg2, #0f0f1a)", border: "1px solid var(--border, #1e1e2e)", borderRadius: 8, fontFamily: mono, fontSize: 11, color: "var(--text2, #bbb)", whiteSpace: "pre-wrap", wordBreak: "break-word", overflowX: "auto" }}>
                  {job.command}
                </pre>

                <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--text3, #888)" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor(job.last_status), flexShrink: 0 }} />
                  <span>último run {humanizeSince(job.last_run)} · {statusLabel(job.last_status)}</span>
                  {job.last_message && (job.last_status ?? "").toLowerCase() === "failed" && (
                    <span style={{ color: "#fca5a5", fontFamily: mono }}>— {job.last_message}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
