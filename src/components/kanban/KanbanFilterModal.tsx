// Modal de filtros avançados (SP2): responsáveis, tipo, área, situação, cliente,
// processo e período. Mantém um rascunho local; "Buscar" aplica, "Limpar" zera os
// campos avançados.
import { useState, type ReactNode, type CSSProperties } from "react";
import type { KanbanFilterState, LegalArea, TaskSituacao } from "@/types/jurisai";
import { SITUACAO_LABELS, SITUACAO_ORDER } from "@/lib/kanbanSituacao";
import { overlay, modal, input, btnGhost, btnPrimary, COLORS, FONT, checkLabel } from "./kanbanStyles";

const AREA_LABELS: Record<LegalArea, string> = {
  bancario: "Bancário", familia: "Família", plano_saude: "Plano de Saúde",
  consumidor: "Consumidor", civil: "Cível", previdenciario: "Previdenciário", tributario: "Tributário",
};

interface Props {
  filters: KanbanFilterState;
  options: { assignees: { id: string; name: string }[]; taskTypes: string[] };
  onApply: (f: KanbanFilterState) => void;
  onClose: () => void;
}

export function KanbanFilterModal({ filters, options, onApply, onClose }: Props) {
  const [draft, setDraft] = useState<KanbanFilterState>(filters);
  const set = (patch: Partial<KanbanFilterState>) => setDraft((d) => ({ ...d, ...patch }));
  const toggle = <T,>(arr: T[], v: T): T[] => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 700, color: COLORS.text1 }}>Filtros avançados</h3>

        <Field label="Responsáveis">
          {options.assignees.length === 0 && <span style={muted}>Nenhum responsável nos cards.</span>}
          {options.assignees.map((a) => (
            <Toggle key={a.id} on={draft.assignees.includes(a.id)} onClick={() => set({ assignees: toggle(draft.assignees, a.id) })}>{a.name}</Toggle>
          ))}
        </Field>

        <Field label="Tipo de atividade">
          {options.taskTypes.length === 0 && <span style={muted}>—</span>}
          {options.taskTypes.map((t) => (
            <Toggle key={t} on={draft.taskTypes.includes(t)} onClick={() => set({ taskTypes: toggle(draft.taskTypes, t) })}>{t}</Toggle>
          ))}
        </Field>

        <Field label="Área">
          {(Object.keys(AREA_LABELS) as LegalArea[]).map((a) => (
            <Toggle key={a} on={draft.areas.includes(a)} onClick={() => set({ areas: toggle(draft.areas, a) })}>{AREA_LABELS[a]}</Toggle>
          ))}
        </Field>

        <Field label="Situação">
          {SITUACAO_ORDER.map((s: TaskSituacao) => (
            <Toggle key={s} on={draft.situacoes.includes(s)} onClick={() => set({ situacoes: toggle(draft.situacoes, s) })}>{SITUACAO_LABELS[s]}</Toggle>
          ))}
        </Field>

        <div style={{ display: "flex", gap: 8, margin: "12px 0 10px", flexWrap: "wrap" }}>
          <input placeholder="Nome do cliente" value={draft.clientName} onChange={(e) => set({ clientName: e.target.value })} style={{ ...input, flex: 1, minWidth: 160 }} />
          <input placeholder="Número do processo" value={draft.processNumber} onChange={(e) => set({ processNumber: e.target.value })} style={{ ...input, flex: 1, minWidth: 160 }} />
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
          <label style={checkLabel}>De <input type="date" value={draft.periodStart ?? ""} onChange={(e) => set({ periodStart: e.target.value || null })} style={{ ...input, marginLeft: 4 }} /></label>
          <label style={checkLabel}>Até <input type="date" value={draft.periodEnd ?? ""} onChange={(e) => set({ periodEnd: e.target.value || null })} style={{ ...input, marginLeft: 4 }} /></label>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", borderTop: `1px solid ${COLORS.border}`, paddingTop: 14 }}>
          <button
            onClick={() => set({ assignees: [], taskTypes: [], areas: [], situacoes: [], clientName: "", processNumber: "", periodStart: null, periodEnd: null })}
            style={btnGhost}
          >
            Limpar
          </button>
          <button onClick={onClose} style={btnGhost}>Cancelar</button>
          <button onClick={() => { onApply(draft); onClose(); }} style={btnPrimary}>Buscar</button>
        </div>
      </div>
    </div>
  );
}

const muted: CSSProperties = { fontSize: 11, color: COLORS.text3 };

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: COLORS.text3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "3px 9px", borderRadius: 14, fontSize: 11, cursor: "pointer", fontFamily: FONT,
        border: `1px solid ${on ? COLORS.gold : COLORS.border}`,
        background: on ? "rgba(234,179,8,0.15)" : COLORS.bg2,
        color: on ? COLORS.goldBright : COLORS.text2,
      }}
    >
      {children}
    </button>
  );
}
