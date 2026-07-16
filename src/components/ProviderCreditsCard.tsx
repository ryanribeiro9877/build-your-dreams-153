import { useState } from "react";
import { useProviderCredits } from "@/hooks/useProviderCredits";

// Créditos por provedor (Pacote B). Nunca exibe número sem origem/fetched_at:
// OpenRouter mostra saldo reportado (snapshot) + frescor + badge de indisponível/
// stale; OpenAI é declarado "estimado pelo uso" e ganha runway só se houver budget.

const cardStyle: React.CSSProperties = {
  background: "var(--bg3, #13131f)", border: "1px solid var(--border, #1e1e2e)", borderRadius: 12, padding: 20,
};
const titleStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, color: "var(--gold, #c9a84c)", marginBottom: 16,
  textTransform: "uppercase", letterSpacing: "0.08em",
};
const subStyle: React.CSSProperties = {
  fontSize: 10, color: "var(--text3, #888)", textTransform: "uppercase", letterSpacing: "0.06em",
};
const bigNum: React.CSSProperties = { fontSize: 26, fontWeight: 700, fontFamily: "var(--font-mono, monospace)" };

const fmtUsd = (n: number | null | undefined) => {
  const v = n ?? 0;
  const dec = v !== 0 && Math.abs(v) < 1 ? 4 : 2;
  return "US$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
};
const fmtWhen = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const days = Math.round(h / 24);
  return `há ${days} d`;
};
const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

export function ProviderCreditsCard() {
  const { data, loading, error, setBudget } = useProviderCredits();
  const [budgetInput, setBudgetInput] = useState("");
  const [startInput, setStartInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  // Silencioso quando não há acesso/dado (o painel já trata o gate no topo).
  if (loading || error || !data) return null;

  const or = data.openrouter;
  const oa = data.openai;
  const hasBudget = oa.estimated.budget_usd != null;

  const saveBudget = async () => {
    const val = Number(budgetInput.replace(",", "."));
    if (!Number.isFinite(val) || val <= 0) { setSaveErr("Informe um valor válido em US$."); return; }
    setSaving(true); setSaveErr(null);
    try {
      await setBudget("openai", val, startInput || undefined, "informado no Dashboard IA");
      setBudgetInput(""); setStartInput("");
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
      {/* ── OpenRouter (saldo reportado) ─────────────────────────────────── */}
      <div style={cardStyle}>
        <div style={titleStyle}>Créditos OpenRouter · reportado</div>
        {or.reported.available ? (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ ...bigNum, color: "#22c55e" }}>{fmtUsd(or.reported.credits_remaining)}</span>
              <span style={subStyle}>restante de {fmtUsd(or.reported.credits_total)}</span>
            </div>
            <div style={{ fontSize: 11, color: or.reported.stale ? "#f59e0b" : "var(--text3, #888)", marginTop: 6 }}>
              {or.reported.stale ? "⚠ desatualizado · " : ""}atualizado {fmtWhen(or.reported.fetched_at)} ({fmtDate(or.reported.fetched_at)})
            </div>
          </>
        ) : (
          <div style={{ fontSize: 12.5, color: "#f59e0b", lineHeight: 1.5 }}>
            ⚠ Coleta indisponível{or.reported.last_error_at ? ` desde ${fmtDate(or.reported.last_error_at)}` : ""}.
            <div style={{ color: "var(--text3, #888)", fontSize: 11, marginTop: 4 }}>{or.reported.reason}</div>
          </div>
        )}
        <div style={{ borderTop: "1px solid var(--border, #1e1e2e)", marginTop: 14, paddingTop: 12 }}>
          <div style={subStyle}>Nosso gasto (piso) — anthropic+sakana+openrouter</div>
          <div style={{ display: "flex", gap: 18, marginTop: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "var(--text2, #cbd5e1)" }}>Total <strong>{fmtUsd(or.our_spend_usd.total)}</strong></span>
            <span style={{ fontSize: 13, color: "var(--text2, #cbd5e1)" }}>30d <strong>{fmtUsd(or.our_spend_usd.d30)}</strong></span>
            <span style={{ fontSize: 13, color: "var(--text2, #cbd5e1)" }}>7d <strong>{fmtUsd(or.our_spend_usd.d7)}</strong></span>
            <span style={{ fontSize: 13, color: "var(--text3, #888)" }}>{fmtUsd(or.our_spend_usd.burn_daily_7d)}/dia</span>
          </div>
        </div>
      </div>

      {/* ── OpenAI (estimado pelo uso) ───────────────────────────────────── */}
      <div style={cardStyle}>
        <div style={titleStyle}>Créditos OpenAI · estimado pelo uso</div>
        <div style={{ fontSize: 11, color: "var(--text3, #888)", marginBottom: 10 }}>
          OpenAI não expõe saldo via API — valores estimados a partir do consumo.
        </div>

        {hasBudget ? (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ ...bigNum, color: "#22c55e" }}>{fmtUsd(oa.estimated.remaining_estimated)}</span>
              <span style={subStyle}>restante est. de {fmtUsd(oa.estimated.budget_usd)}</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--text3, #888)", marginTop: 6 }}>
              gasto desde {fmtDate(oa.estimated.budget_start)}: {fmtUsd(oa.estimated.spent_since_budget)} ·{" "}
              autonomia est. <strong style={{ color: "var(--text2, #cbd5e1)" }}>
                {oa.estimated.runway_days_estimated != null ? `${oa.estimated.runway_days_estimated} dias` : "—"}
              </strong>
            </div>
          </>
        ) : (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12.5, color: "var(--text2, #cbd5e1)", marginBottom: 8 }}>
              Informe o crédito comprado para calcular restante e autonomia:
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)} placeholder="US$ (ex.: 20)"
                inputMode="decimal" style={{
                  width: 110, padding: "7px 10px", borderRadius: 8, fontSize: 12,
                  border: "1px solid var(--border, #1e1e2e)", background: "var(--bg2, #0f0f1a)", color: "#e5e7eb",
                }} />
              <input value={startInput} onChange={(e) => setStartInput(e.target.value)} type="date"
                title="Data da compra (padrão: hoje)" style={{
                  padding: "7px 10px", borderRadius: 8, fontSize: 12,
                  border: "1px solid var(--border, #1e1e2e)", background: "var(--bg2, #0f0f1a)", color: "#e5e7eb",
                }} />
              <button onClick={saveBudget} disabled={saving} style={{
                padding: "7px 14px", borderRadius: 8, fontSize: 12, cursor: saving ? "default" : "pointer",
                border: "1px solid var(--gold, #c9a84c)", background: "transparent", color: "var(--gold, #c9a84c)",
                opacity: saving ? 0.6 : 1,
              }}>{saving ? "Salvando…" : "Salvar crédito"}</button>
            </div>
            {saveErr && <div style={{ fontSize: 11, color: "#ef4444", marginTop: 6 }}>{saveErr}</div>}
          </div>
        )}

        <div style={{ borderTop: "1px solid var(--border, #1e1e2e)", marginTop: 14, paddingTop: 12 }}>
          <div style={subStyle}>Gasto estimado (piso)</div>
          <div style={{ display: "flex", gap: 18, marginTop: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "var(--text2, #cbd5e1)" }}>Total <strong>{fmtUsd(oa.estimated.total_usd)}</strong></span>
            <span style={{ fontSize: 13, color: "var(--text2, #cbd5e1)" }}>30d <strong>{fmtUsd(oa.estimated.d30)}</strong></span>
            <span style={{ fontSize: 13, color: "var(--text2, #cbd5e1)" }}>7d <strong>{fmtUsd(oa.estimated.d7)}</strong></span>
            <span style={{ fontSize: 13, color: "var(--text3, #888)" }}>proj. 30d {fmtUsd(oa.estimated.projection_30d)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
