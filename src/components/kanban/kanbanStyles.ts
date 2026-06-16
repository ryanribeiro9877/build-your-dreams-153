// Estilos inline compartilhados do Kanban (SP1). Paleta dark hardcoded, idêntica
// ao KanbanBoard.tsx original — não usa CSS variables porque a página é standalone
// (fora do shell juris-cloud) e precisa ser autossuficiente.
import type React from "react";
import type { TaskPriority, UserTaskStatus, TaskSituacao } from "@/types/jurisai";

// ─── Paleta ────────────────────────────────────────────────────────────────
export const COLORS = {
  bg0: "#09090f",
  bg1: "#11111a",
  bg2: "#16161f",
  border: "#25253a",
  gold: "#eab308",
  goldBright: "#facc15",
  text1: "#eeeef5",
  text2: "#c4c4d4",
  text3: "#7a7a92",
  danger: "#ef4444",
};

export const FONT = "'Plus Jakarta Sans', system-ui, sans-serif";

// Borda esquerda do card por prioridade.
export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  critical: "#ef4444",
  high: "#f59e0b",
  medium: "#3b82f6",
  low: "#6b7280",
};

// Cores de destaque por situação (usadas em chips/headers quando útil).
export const SITUACAO_COLORS: Record<TaskSituacao, string> = {
  pendente: "#7a7a92",
  em_execucao: "#3b82f6",
  concluida_sucesso: "#2dd4a0",
  concluida_sem_sucesso: "#f59e0b",
  cancelado: "#ef4444",
};

// Cores das etiquetas de origem do card.
export const ORIGIN_COLORS = {
  processo: "#2dd4a0",
  cliente: "#f59e0b",
  interna: "#7a7a92",
};

// ─── Estilos base ────────────────────────────────────────────────────────────
export const page: React.CSSProperties = {
  minHeight: "100vh",
  background: COLORS.bg0,
  color: COLORS.text1,
  fontFamily: FONT,
  padding: 24,
};

export const btnGhost: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 8,
  border: `1px solid ${COLORS.border}`,
  background: COLORS.bg1,
  color: COLORS.text2,
  cursor: "pointer",
  fontSize: 13,
  fontFamily: FONT,
};

export const btnPrimary: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: `1px solid ${COLORS.gold}`,
  background: "linear-gradient(145deg, #eab308 0%, #facc15 100%)",
  color: "#0a0a12",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  fontFamily: FONT,
};

export const btnMini: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 6,
  border: `1px solid ${COLORS.border}`,
  background: COLORS.bg1,
  color: COLORS.text2,
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 600,
  fontFamily: FONT,
};

export const input: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: `1px solid ${COLORS.border}`,
  background: COLORS.bg1,
  color: COLORS.text1,
  fontSize: 13,
  fontFamily: FONT,
};

export const select: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: `1px solid ${COLORS.border}`,
  background: COLORS.bg1,
  color: COLORS.text1,
  fontSize: 13,
  fontFamily: FONT,
  cursor: "pointer",
};

export const checkLabel: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12,
  color: COLORS.text2,
  cursor: "pointer",
  fontFamily: FONT,
};

export const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 50,
};

export const modal: React.CSSProperties = {
  background: COLORS.bg1,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 12,
  padding: 20,
  width: "min(560px, 94vw)",
  maxHeight: "88vh",
  overflowY: "auto",
  fontFamily: FONT,
};

export const column: React.CSSProperties = {
  flex: "0 0 272px",
  background: COLORS.bg1,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 12,
  padding: 12,
  minHeight: 360,
  display: "flex",
  flexDirection: "column",
};

export const card: React.CSSProperties = {
  background: COLORS.bg2,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 8,
  padding: 10,
};

export const chip: React.CSSProperties = {
  fontSize: 9,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  padding: "1px 6px",
  borderRadius: 8,
  fontWeight: 700,
  fontFamily: FONT,
};
