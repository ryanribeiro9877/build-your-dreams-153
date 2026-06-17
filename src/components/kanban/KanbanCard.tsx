import { useState } from "react";
import type { KanbanCardV2 } from "@/types/jurisai";
import { COLORS, FONT, PRIORITY_COLORS, ORIGIN_COLORS, card as cardStyle, chip } from "./kanbanStyles";

interface KanbanCardProps {
  card: KanbanCardV2;
  simplified: boolean;
  canEdit: boolean;
  onOpen?: (card: KanbanCardV2) => void;
  onEdit: (card: KanbanCardV2) => void;
  onDelete: (card: KanbanCardV2) => void;
  onOpenClient?: (clientId: string) => void;
}

function TagChips({ tags }: { tags: KanbanCardV2["tags"] }) {
  if (!tags || tags.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
      {tags.map((t) => (
        <span
          key={t.id}
          style={{
            fontSize: 9, padding: "1px 7px", borderRadius: 10, fontWeight: 600,
            background: `${t.color}22`, color: t.color, border: `1px solid ${t.color}55`,
          }}
        >
          {t.name}
        </span>
      ))}
    </div>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function initials(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (!n) return "?";
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function KanbanCard({ card, simplified, canEdit, onOpen, onEdit, onDelete, onOpenClient }: KanbanCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const open = () => onOpen?.(card);

  const borderLeft = `3px solid ${PRIORITY_COLORS[card.priority]}`;
  const overdueBorder = card.is_overdue ? "rgba(239,68,68,0.4)" : COLORS.border;

  // ── Etiqueta de origem ──────────────────────────────────────────────────
  // processo > cliente > interna (ordem de prioridade da fonte).
  let originColor = ORIGIN_COLORS.interna;
  let originLabel = "INTERNA";
  let originDetail: string | null = null;
  let originClickable = false;
  if (card.process_id && card.process_number) {
    originColor = ORIGIN_COLORS.processo;
    originLabel = "PROCESSO";
    originDetail = `PRO.${card.process_number}`;
  } else if (card.client_id && card.client_name) {
    originColor = ORIGIN_COLORS.cliente;
    originLabel = "CLIENTE";
    originDetail = card.client_name;
    originClickable = !!onOpenClient;
  }

  // ── Modo simplificado: só título + responsável + prazo ──────────────────
  if (simplified) {
    return (
      <div onClick={open} style={{ ...cardStyle, borderLeft, border: `1px solid ${overdueBorder}`, position: "relative", cursor: "pointer" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text1, lineHeight: 1.3, marginBottom: 6, paddingRight: canEdit ? 18 : 0 }}>
          {card.title}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: COLORS.text2 }}>
            <span style={avatarStyle}>{initials(card.assignee_name)}</span>
            {card.assignee_name || "—"}
          </span>
          <span style={{ fontSize: 10, color: card.is_overdue ? COLORS.danger : COLORS.text3 }}>
            📅 {formatDate(card.deadline_at)}
          </span>
        </div>
        <TagChips tags={card.tags} />
        {canEdit && <CardMenu open={menuOpen} setOpen={setMenuOpen} onEdit={() => onEdit(card)} onDelete={() => onDelete(card)} />}
      </div>
    );
  }

  // ── Modo completo ────────────────────────────────────────────────────────
  return (
    <div onClick={open} style={{ ...cardStyle, borderLeft, border: `1px solid ${overdueBorder}`, position: "relative", cursor: "pointer" }}>
      {/* Etiqueta de origem + badge "em validação" */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4, paddingRight: canEdit ? 18 : 0, flexWrap: "wrap" }}>
        <span style={{ ...chip, background: `${originColor}22`, color: originColor, border: `1px solid ${originColor}55` }}>
          {originLabel}
        </span>
        {originDetail && (
          originClickable ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onOpenClient?.(card.client_id as string); }}
              title="Abrir cliente"
              style={{
                background: "transparent", border: "none", padding: 0, cursor: "pointer",
                fontSize: 11, color: originColor, fontFamily: FONT, textDecoration: "underline",
                textUnderlineOffset: 2, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
            >
              {originDetail}
            </button>
          ) : (
            <span style={{ fontSize: 11, color: originColor, fontFamily: "ui-monospace, monospace", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {originDetail}
            </span>
          )
        )}
        {card.status === "awaiting_validation" && (
          <span style={{ ...chip, marginLeft: "auto", background: "rgba(168,85,247,0.15)", color: "#c084fc", border: "1px solid rgba(168,85,247,0.4)" }}>
            em validação
          </span>
        )}
      </div>

      {/* Título */}
      <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text1, marginBottom: 6, lineHeight: 1.3 }}>
        {card.title}
      </div>

      {/* Código da tarefa */}
      <div style={{ fontSize: 10, color: COLORS.text3, fontFamily: "ui-monospace, monospace", letterSpacing: "0.04em", marginBottom: 6 }}>
        TAR.{card.id.slice(0, 8)}
      </div>

      {/* Responsável + prazos */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: COLORS.text2 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={avatarStyle}>{initials(card.assignee_name)}</span>
          {card.assignee_name || "—"}
        </span>
        <span style={{ color: COLORS.text3 }}>📅 {formatDate(card.deadline_at)}</span>
        {card.is_overdue && (
          <span style={{ color: COLORS.danger, fontWeight: 600 }}>❗ Data fatal: {formatDate(card.deadline_at)}</span>
        )}
      </div>

      <TagChips tags={card.tags} />

      {canEdit && <CardMenu open={menuOpen} setOpen={setMenuOpen} onEdit={() => onEdit(card)} onDelete={() => onDelete(card)} />}
    </div>
  );
}

const avatarStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 20,
  height: 20,
  borderRadius: "50%",
  background: COLORS.border,
  color: COLORS.goldBright,
  fontSize: 9,
  fontWeight: 700,
  flexShrink: 0,
};

// ── Menu de contexto (⋮) ─────────────────────────────────────────────────────
function CardMenu({
  open, setOpen, onEdit, onDelete,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div style={{ position: "absolute", top: 6, right: 6 }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        title="Ações"
        style={{
          background: "transparent", border: "none", cursor: "pointer",
          color: COLORS.text3, fontSize: 16, lineHeight: 1, padding: "0 4px",
        }}
      >
        ⋮
      </button>
      {open && (
        <>
          {/* clique-fora fecha o menu */}
          <div
            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
            style={{ position: "fixed", inset: 0, zIndex: 60 }}
          />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute", top: 22, right: 0, zIndex: 61,
              background: COLORS.bg1, border: `1px solid ${COLORS.border}`,
              borderRadius: 8, padding: 4, minWidth: 120,
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            }}
          >
            <button type="button" onClick={() => { setOpen(false); onEdit(); }} style={menuItem}>Editar</button>
            <button type="button" onClick={() => { setOpen(false); onDelete(); }} style={{ ...menuItem, color: COLORS.danger }}>Excluir</button>
          </div>
        </>
      )}
    </div>
  );
}

const menuItem: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "6px 10px",
  borderRadius: 6,
  border: "none",
  background: "transparent",
  color: COLORS.text2,
  cursor: "pointer",
  fontSize: 12,
  fontFamily: FONT,
};
