import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Kit visual compartilhado pelos dashboards operacional e de prazos (9.2).
 * Mesma linguagem do Dashboard de Tarefas / Dashboard IA (var(--gold),
 * HexagonLoader, cards escuros). Centraliza o "estado vazio elegante" que faz
 * os scaffolds auto-populantes não mostrarem gráfico feio quando ainda não há
 * dado — cada card acende sozinho quando a série deixa de estar vazia.
 */

export const DASH_BG = "var(--bg1, #09090f)";
export const cardStyle: React.CSSProperties = {
  background: "var(--bg3, #13131f)", border: "1px solid var(--border, #1e1e2e)", borderRadius: 12, padding: 20,
};
export const titleStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, color: "var(--gold, #c9a84c)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.08em",
};
export const tooltipStyle = { background: "var(--bg2, #0f0f1a)", border: "1px solid var(--border, #1e1e2e)", borderRadius: 8, fontSize: 11, color: "#e5e7eb" };
export const PALETTE = ["#c9a84c", "#8b5cf6", "#06b6d4", "#f59e0b", "#14b8a6", "#ef4444", "#6366f1", "#22c55e"];

export const fmtInt = (n: number) => (n ?? 0).toLocaleString("pt-BR");

/** Rótulo amigável a partir de uma tabela de tradução, com fallback à própria key. */
export const labelOf = (map: Record<string, string>, key: string) => map[key] ?? key;

export function DashboardHeader({ title, subtitle, onBack }: { title: string; subtitle: string; onBack?: () => void }) {
  const navigate = useNavigate();
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--gold, #c9a84c)", margin: 0 }}>{title}</h1>
        <p style={{ fontSize: 12, color: "var(--text3, #888)", marginTop: 4 }}>{subtitle}</p>
      </div>
      <button onClick={onBack ?? (() => navigate("/sistema"))} style={{
        padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border, #1e1e2e)",
        background: "transparent", color: "var(--gold, #c9a84c)", cursor: "pointer",
        fontSize: 12, fontFamily: "'DM Sans', sans-serif",
      }}>← Voltar</button>
    </div>
  );
}

export function KpiGrid({ items }: { items: { label: string; value: string; color: string }[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
      {items.map((kpi) => (
        <div key={kpi.label} style={{ ...cardStyle, padding: "16px 20px", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: kpi.color, fontFamily: "var(--font-mono, monospace)" }}>{kpi.value}</div>
          <div style={{ fontSize: 10, color: "var(--text3, #888)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 4, textAlign: "center" }}>{kpi.label}</div>
        </div>
      ))}
    </div>
  );
}

/** Placeholder de "ainda sem dados" — o scaffold acende sozinho quando entrar dado real. */
export function EmptyState({ hint, height = 220 }: { hint: string; height?: number }) {
  return (
    <div style={{ height, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, textAlign: "center" }}>
      <div style={{ fontSize: 22, opacity: 0.4 }}>◔</div>
      <div style={{ fontSize: 11, color: "var(--text3, #888)", maxWidth: 280, lineHeight: 1.5, opacity: 0.8 }}>{hint}</div>
    </div>
  );
}

/**
 * Card de gráfico com estado vazio embutido: quando `empty` é true, mostra o
 * `EmptyState` com a dica em vez do gráfico. `full` ocupa a linha inteira.
 */
export function ChartCard({
  title, empty, hint, height = 250, full, children,
}: { title: string; empty: boolean; hint: string; height?: number; full?: boolean; children: ReactNode }) {
  return (
    <div style={{ ...cardStyle, ...(full ? { gridColumn: "1 / -1" } : {}) }}>
      <div style={titleStyle}>{title}</div>
      {empty ? <EmptyState hint={hint} height={height} /> : children}
    </div>
  );
}

/** Banner de topo quando o domínio inteiro ainda não tem dado real. */
export function ScaffoldBanner({ text }: { text: string }) {
  return (
    <div style={{
      ...cardStyle, marginBottom: 16, padding: "12px 18px",
      background: "var(--bg2, #0f0f1a)", borderColor: "rgba(201,168,76,0.35)",
      display: "flex", alignItems: "center", gap: 10,
    }}>
      <span style={{ fontSize: 16 }}>✨</span>
      <span style={{ fontSize: 12, color: "var(--text3, #aaa)", lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}
