import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface CronJob {
  id: string;
  name: string;
  description: string | null;
  schedule: string;
  target: string;
  params: unknown;
  enabled: boolean;
  last_run_at: string | null;
  last_status: string | null;
  created_at: string;
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 8,
  background: "var(--bg3)", border: "1px solid var(--border)", color: "var(--text1)",
  fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 10, color: "var(--text3)", marginBottom: 4,
  textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600,
};

const EMPTY = { name: "", description: "", schedule: "*/5 * * * *", target: "", params: "{}", enabled: true };

export default function CronJobs() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const isTech = hasRole("tech");

  useEffect(() => { if (isTech) fetchJobs(); else setLoading(false); }, [isTech]);

  async function fetchJobs() {
    setLoading(true);
    const { data, error } = await supabase.from("cron_jobs").select("*").order("created_at", { ascending: false });
    if (error) toast.error("Erro ao carregar crons: " + error.message);
    else setJobs(data || []);
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    let params: unknown = {};
    try { params = form.params.trim() ? JSON.parse(form.params) : {}; }
    catch { toast.error("Parâmetros: JSON inválido"); return; }
    const { error } = await supabase.from("cron_jobs").insert({
      name: form.name.trim(),
      description: form.description.trim() || null,
      schedule: form.schedule.trim(),
      target: form.target.trim(),
      params,
      enabled: form.enabled,
    });
    if (error) { toast.error("Erro ao criar: " + error.message); return; }
    toast.success("Cron criada!");
    setForm(EMPTY); setShowForm(false); fetchJobs();
  }

  async function toggleEnabled(job: CronJob) {
    const { error } = await supabase.from("cron_jobs").update({ enabled: !job.enabled }).eq("id", job.id);
    if (error) { toast.error("Erro ao atualizar"); return; }
    fetchJobs();
  }

  async function handleDelete(job: CronJob) {
    if (!confirm(`Remover a cron "${job.name}"?`)) return;
    const { error } = await supabase.from("cron_jobs").delete().eq("id", job.id);
    if (error) { toast.error("Erro ao remover"); return; }
    toast.success("Cron removida"); fetchJobs();
  }

  if (!isTech) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text1)", fontFamily: "'DM Sans', sans-serif", padding: 40 }}>
        <button className="btn-voltar" onClick={() => navigate("/sistema")} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg2)", color: "var(--text2)", cursor: "pointer", fontSize: 13 }}>← Voltar</button>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: "var(--gold, #c9a84c)", marginTop: 24 }}>Acesso restrito</h1>
        <p style={{ color: "var(--text3)", fontSize: 13 }}>A aba de Crons é exclusiva do acesso técnico (papel <code>tech</code>).</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text1)", fontFamily: "'DM Sans', sans-serif", padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <button className="btn-voltar" onClick={() => navigate("/sistema")} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg2)", color: "var(--text2)", cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>← Voltar</button>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 600, color: "var(--gold, #c9a84c)", margin: 0 }}>Crons · Técnico</h1>
        <span style={{ fontSize: 12, color: "var(--text3)", background: "var(--bg2)", padding: "4px 10px", borderRadius: 6 }}>{jobs.length} job(s)</span>
        <button onClick={() => setShowForm(!showForm)} style={{ marginLeft: "auto", padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", background: "linear-gradient(135deg, #c9a84c, #e8c96a)", color: "#0a0a12", fontSize: 13, fontWeight: 600 }}>{showForm ? "Fechar" : "+ Nova Cron"}</button>
      </div>

      <div style={{ fontSize: 12, color: "var(--text3)", background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
        Estas crons são a <strong>configuração</strong> dos jobs. O agendamento real no Postgres (pg_cron) é sincronizado a partir daqui ou criado no Supabase Dashboard → Database → Cron Jobs. Expressão no formato cron: <code>min hora dia mês dia-semana</code>.
      </div>

      {showForm && (
        <form onSubmit={handleCreate} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, padding: 24, marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Nova Cron</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            <div><label style={labelStyle}>Nome *</label><input required style={inputStyle} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="oab-process-sync" /></div>
            <div><label style={labelStyle}>Agenda (cron) *</label><input required style={inputStyle} value={form.schedule} onChange={e => setForm({ ...form, schedule: e.target.value })} placeholder="*/5 * * * *" /></div>
            <div><label style={labelStyle}>Alvo (function/RPC) *</label><input required style={inputStyle} value={form.target} onChange={e => setForm({ ...form, target: e.target.value })} placeholder="oab-process-sync" /></div>
            <div>
              <label style={labelStyle}>Habilitada</label>
              <select style={inputStyle} value={form.enabled ? "sim" : "nao"} onChange={e => setForm({ ...form, enabled: e.target.value === "sim" })}>
                <option value="sim">Sim</option>
                <option value="nao">Não</option>
              </select>
            </div>
          </div>
          <div style={{ marginTop: 12 }}><label style={labelStyle}>Descrição</label><input style={inputStyle} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
          <div style={{ marginTop: 12 }}><label style={labelStyle}>Parâmetros (JSON)</label><textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical", fontFamily: "monospace" }} value={form.params} onChange={e => setForm({ ...form, params: e.target.value })} /></div>
          <button type="submit" style={{ marginTop: 16, padding: "10px 24px", borderRadius: 8, border: "none", cursor: "pointer", background: "linear-gradient(135deg, #c9a84c, #e8c96a)", color: "#0a0a12", fontSize: 13, fontWeight: 600 }}>Criar Cron</button>
        </form>
      )}

      {loading ? (
        <div style={{ color: "var(--text3)", fontSize: 13 }}>Carregando…</div>
      ) : jobs.length === 0 ? (
        <div style={{ color: "var(--text3)", fontSize: 13 }}>Nenhuma cron cadastrada.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {jobs.map(job => (
            <div key={job.id} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text1)" }}>
                  {job.name}
                  <span style={{ marginLeft: 8, fontSize: 10, padding: "2px 8px", borderRadius: 6, background: job.enabled ? "rgba(46,204,113,0.15)" : "var(--bg3)", color: job.enabled ? "#2ecc71" : "var(--text3)" }}>{job.enabled ? "ativa" : "inativa"}</span>
                </div>
                {job.description && <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 4 }}>{job.description}</div>}
                <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 6, fontFamily: "monospace" }}>
                  <span style={{ color: "var(--gold, #c9a84c)" }}>{job.schedule}</span> → {job.target}
                  {job.last_run_at && <span style={{ color: "var(--text3)" }}>  · última: {new Date(job.last_run_at).toLocaleString("pt-BR")} ({job.last_status || "—"})</span>}
                </div>
              </div>
              <button onClick={() => toggleEnabled(job)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg3)", color: "var(--text2)", cursor: "pointer", fontSize: 12 }}>{job.enabled ? "Desativar" : "Ativar"}</button>
              <button onClick={() => handleDelete(job)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "#e74c3c", cursor: "pointer", fontSize: 12 }}>Remover</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
