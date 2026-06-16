import { useState } from "react";
import type { KanbanBoardSummary } from "@/types/jurisai";
import { COLORS, FONT } from "./kanbanStyles";

interface BoardSelectorProps {
  boards: KanbanBoardSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  isAdmin: boolean;
  onNewBoard: () => void;
  onToggleFavorite: (id: string) => void;
  onDelete: (id: string) => void;
}

export function BoardSelector({
  boards, activeId, onSelect, isAdmin, onNewBoard, onToggleFavorite, onDelete,
}: BoardSelectorProps) {
  const [open, setOpen] = useState(false);
  const active = boards.find((b) => b.id === activeId) ?? null;

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "8px 14px", borderRadius: 8, border: `1px solid ${COLORS.border}`,
          background: COLORS.bg1, color: COLORS.text1, cursor: "pointer",
          fontSize: 14, fontWeight: 700, fontFamily: FONT, minWidth: 200,
        }}
      >
        {active?.is_favorite && <span style={{ color: COLORS.goldBright }}>⭐</span>}
        <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {active ? active.name : "Selecionar quadro"}
        </span>
        <span style={{ color: COLORS.text3, fontSize: 11 }}>▼</span>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div
            style={{
              position: "absolute", top: 44, left: 0, zIndex: 41,
              background: COLORS.bg1, border: `1px solid ${COLORS.border}`,
              borderRadius: 10, padding: 6, minWidth: 280, maxHeight: 420, overflowY: "auto",
              boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
            }}
          >
            {boards.length === 0 && (
              <div style={{ padding: "10px 12px", fontSize: 12, color: COLORS.text3, fontStyle: "italic" }}>
                Nenhum quadro disponível.
              </div>
            )}

            {boards.map((b) => {
              const isActive = b.id === activeId;
              return (
                <div
                  key={b.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 4,
                    borderRadius: 8, padding: "2px 4px",
                    background: isActive ? "rgba(234,179,8,0.10)" : "transparent",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => { onSelect(b.id); setOpen(false); }}
                    style={{
                      flex: 1, textAlign: "left", padding: "8px 8px", borderRadius: 6,
                      border: "none", background: "transparent", cursor: "pointer",
                      color: isActive ? COLORS.goldBright : COLORS.text1,
                      fontSize: 13, fontWeight: isActive ? 700 : 500, fontFamily: FONT,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}
                  >
                    {b.name}
                    {b.is_private && <span style={{ marginLeft: 6, fontSize: 10, color: COLORS.text3 }}>🔒</span>}
                  </button>

                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onToggleFavorite(b.id); }}
                    title={b.is_favorite ? "Remover dos favoritos" : "Marcar como favorito"}
                    style={iconBtn}
                  >
                    {b.is_favorite ? "⭐" : "☆"}
                  </button>

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onDelete(b.id); }}
                      title="Excluir quadro"
                      style={{ ...iconBtn, color: COLORS.danger }}
                    >
                      🗑
                    </button>
                  )}
                </div>
              );
            })}

            {isAdmin && (
              <>
                <div style={{ height: 1, background: COLORS.border, margin: "6px 4px" }} />
                <button
                  type="button"
                  onClick={() => { setOpen(false); onNewBoard(); }}
                  style={{
                    width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 6,
                    border: "none", background: "transparent", cursor: "pointer",
                    color: COLORS.gold, fontSize: 13, fontWeight: 600, fontFamily: FONT,
                  }}
                >
                  + Novo quadro
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  cursor: "pointer",
  color: COLORS.goldBright,
  fontSize: 13,
  padding: "4px 6px",
  borderRadius: 6,
  flexShrink: 0,
};
