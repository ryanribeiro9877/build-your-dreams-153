// Dropdown de filtros salvos (SP2): aplicar um salvo, salvar o atual, excluir.
import { useState } from "react";
import type { KanbanFilterState, SavedFilter } from "@/types/jurisai";
import { normalizeFilters } from "@/lib/kanbanFilters";
import { COLORS, FONT, select, btnMini } from "./kanbanStyles";

interface Props {
  savedFilters: SavedFilter[];
  onApply: (f: KanbanFilterState) => void;
  onSaveCurrent: () => void;
  onDelete: (id: string) => void;
}

export function SavedFiltersMenu({ savedFilters, onApply, onSaveCurrent, onDelete }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((o) => !o)} style={select}>★ Filtros salvos ▾</button>
      {open && (
        <div
          onMouseLeave={() => setOpen(false)}
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 40, minWidth: 240,
            background: COLORS.bg1, border: `1px solid ${COLORS.border}`, borderRadius: 8,
            padding: 6, fontFamily: FONT, boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}
        >
          <button onClick={() => { onSaveCurrent(); setOpen(false); }} style={{ ...btnMini, width: "100%", marginBottom: 6 }}>
            + Salvar filtro atual
          </button>
          {savedFilters.length === 0 ? (
            <div style={{ fontSize: 11, color: COLORS.text3, padding: "6px 8px" }}>Nenhum filtro salvo.</div>
          ) : (
            savedFilters.map((sf) => (
              <div key={sf.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 2px" }}>
                <button
                  onClick={() => { onApply(normalizeFilters(sf.filter)); setOpen(false); }}
                  style={{
                    flex: 1, textAlign: "left", background: "none", border: "none",
                    color: COLORS.text1, cursor: "pointer", fontSize: 12, fontFamily: FONT,
                    padding: "4px 6px", borderRadius: 6,
                  }}
                >
                  {sf.name}
                </button>
                <button
                  onClick={() => onDelete(sf.id)}
                  title="Excluir filtro salvo"
                  style={{ background: "none", border: "none", color: COLORS.text3, cursor: "pointer", fontSize: 13 }}
                >
                  🗑
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
