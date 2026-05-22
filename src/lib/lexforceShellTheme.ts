import type { CSSProperties } from "react";

/**
 * Estilos para páginas full-screen (perfil, admin de agentes, etc.)
 * que devem respeitar o mesmo tema que o restante do app (atributo
 * `data-theme` em document.documentElement, ex.: jc-theme).
 */
export const LfPage: CSSProperties = {
  minHeight: "100vh",
  background: "hsl(var(--background))",
  color: "hsl(var(--foreground))",
  fontFamily: "'DM Sans', system-ui, sans-serif",
};

export const LfCard: CSSProperties = {
  background: "hsl(var(--card))",
  color: "hsl(var(--card-foreground))",
  border: "1px solid hsl(var(--border))",
};

export const LfInput: CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 8,
  background: "hsl(var(--secondary))",
  border: "1px solid hsl(var(--border))",
  color: "hsl(var(--foreground))",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

export const LfLabel: CSSProperties = {
  display: "block",
  fontSize: 11,
  color: "hsl(var(--muted-foreground))",
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

export const LfGhostBtn: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid hsl(var(--border))",
  background: "transparent",
  color: "hsl(var(--muted-foreground))",
  cursor: "pointer",
  fontSize: 13,
};

/** Botão «Voltar» no topo das telas full-page: não encolhe a zero e mantém o rótulo numa linha. */
export const LfHeaderBackBtn: CSSProperties = {
  ...LfGhostBtn,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  flexShrink: 0,
  whiteSpace: "nowrap",
  minHeight: 40,
  padding: "8px 14px",
  boxSizing: "border-box",
  maxWidth: "100%",
};

export const LfPrimaryBtn: CSSProperties = {
  padding: "10px 18px",
  borderRadius: 8,
  border: "none",
  background: "linear-gradient(135deg, #c9a84c, #e8c96a)",
  color: "#0a0a12",
  fontWeight: 600,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
};
