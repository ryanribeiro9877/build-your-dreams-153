// Barra de filtros do Kanban (SP2): abas de envolvimento + busca + ordenação +
// período + botão "Filtros" (badge) + menu de filtros salvos.
import type { KanbanFilterState, KanbanInvolvement, KanbanSort, SavedFilter } from "@/types/jurisai";
import { SavedFiltersMenu } from "./SavedFiltersMenu";
import { COLORS, FONT, input, select } from "./kanbanStyles";

const INVOLVEMENT_TABS: { key: KanbanInvolvement; label: string }[] = [
  { key: "todas", label: "Todas" },
  { key: "responsavel", label: "Sou responsável" },
  { key: "envolvido", label: "Estou envolvido" },
  { key: "delegadas", label: "Delegadas por mim" },
];

const SORT_OPTS: { key: KanbanSort; label: string }[] = [
  { key: "recentes", label: "Mais recentes" },
  { key: "prazo", label: "Prazo" },
  { key: "prioridade", label: "Prioridade" },
  { key: "titulo", label: "Título (A–Z)" },
];

interface Props {
  filters: KanbanFilterState;
  onChange: (f: KanbanFilterState) => void;
  total: number;
  advancedCount: number;
  onOpenAdvanced: () => void;
  savedFilters: SavedFilter[];
  onApplySaved: (f: KanbanFilterState) => void;
  onSaveCurrent: () => void;
  onDeleteSaved: (id: string) => void;
}

export function KanbanFilterBar({
  filters, onChange, total, advancedCount, onOpenAdvanced,
  savedFilters, onApplySaved, onSaveCurrent, onDeleteSaved,
}: Props) {
  const set = (patch: Partial<KanbanFilterState>) => onChange({ ...filters, ...patch });

  return (
    <div style={{ marginBottom: 14 }}>
      {/* Abas de envolvimento */}
      <div style={{ display: "flex", gap: 18, borderBottom: `1px solid ${COLORS.border}`, marginBottom: 12, flexWrap: "wrap" }}>
        {INVOLVEMENT_TABS.map((t) => {
          const active = filters.involvement === t.key;
          return (
            <button
              key={t.key}
              onClick={() => set({ involvement: t.key })}
              style={{
                padding: "6px 0", border: "none", background: "none", cursor: "pointer",
                borderBottom: `2px solid ${active ? COLORS.goldBright : "transparent"}`,
                color: active ? COLORS.goldBright : "#9898b0",
                fontWeight: active ? 700 : 500, fontFamily: FONT, fontSize: 12,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Controles */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input
          placeholder="Buscar por título, responsável, tipo, cliente, nº processo…"
          value={filters.search}
          onChange={(e) => set({ search: e.target.value })}
          style={{ ...input, minWidth: 240, flex: "0 1 320px" }}
        />
        <select value={filters.sort} onChange={(e) => set({ sort: e.target.value as KanbanSort })} style={select}>
          {SORT_OPTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <label style={{ fontSize: 11, color: COLORS.text3, fontFamily: FONT, display: "inline-flex", alignItems: "center", gap: 4 }}>
          De
          <input type="date" value={filters.periodStart ?? ""} onChange={(e) => set({ periodStart: e.target.value || null })} style={input} />
        </label>
        <label style={{ fontSize: 11, color: COLORS.text3, fontFamily: FONT, display: "inline-flex", alignItems: "center", gap: 4 }}>
          Até
          <input type="date" value={filters.periodEnd ?? ""} onChange={(e) => set({ periodEnd: e.target.value || null })} style={input} />
        </label>
        <button onClick={onOpenAdvanced} style={select}>
          Filtros{advancedCount > 0 ? (
            <span style={{ marginLeft: 6, background: COLORS.gold, color: "#0a0a12", borderRadius: 8, padding: "0 6px", fontSize: 10, fontWeight: 700 }}>
              {advancedCount}
            </span>
          ) : ""}
        </button>
        <SavedFiltersMenu
          savedFilters={savedFilters}
          onApply={onApplySaved}
          onSaveCurrent={onSaveCurrent}
          onDelete={onDeleteSaved}
        />
        <span style={{ marginLeft: "auto", fontSize: 12, color: COLORS.text3, fontFamily: FONT }}>{total} cards</span>
      </div>
    </div>
  );
}
