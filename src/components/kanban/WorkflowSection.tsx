// Seção Workflow do modal-hub (SP4): inicia um fluxo e acompanha as etapas.
import { useState } from "react";
import { toast } from "sonner";
import {
  useTaskWorkflow, useWorkflowTemplates, startWorkflow, setWorkflowStep,
} from "@/hooks/useKanban";
import { COLORS, FONT, select, btnPrimary } from "./kanbanStyles";

export function WorkflowSection({ taskId }: { taskId: string }) {
  const { workflow, refresh } = useTaskWorkflow(taskId);
  const { templates } = useWorkflowTemplates();
  const [tpl, setTpl] = useState("");
  const [busy, setBusy] = useState(false);

  async function start() {
    if (!tpl) { toast.error("Selecione um fluxo."); return; }
    setBusy(true);
    try { await startWorkflow(taskId, tpl); refresh(); }
    catch (e) { toast.error((e as Error)?.message ?? "Falha ao iniciar fluxo."); }
    finally { setBusy(false); }
  }
  async function toggleStep(id: string, done: boolean) {
    try { await setWorkflowStep(id, done); refresh(); }
    catch (e) { toast.error((e as Error)?.message ?? "Falha ao atualizar etapa."); }
  }

  if (!workflow) {
    return (
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <select value={tpl} onChange={(e) => setTpl(e.target.value)} style={select}>
          <option value="">Escolher fluxo…</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.step_count})</option>)}
        </select>
        <button onClick={start} disabled={busy || !tpl} style={{ ...btnPrimary, opacity: busy || !tpl ? 0.6 : 1 }}>Iniciar fluxo</button>
        {templates.length === 0 && (
          <span style={{ fontSize: 11, color: COLORS.text3 }}>Nenhum fluxo cadastrado (admin: ⚙ Fluxos).</span>
        )}
      </div>
    );
  }

  const done = workflow.steps.filter((s) => s.done).length;
  const pct = workflow.steps.length ? Math.round((done / workflow.steps.length) * 100) : 0;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: COLORS.text3, marginBottom: 6 }}>
        <span>{workflow.template_name}</span>
        <span>{done}/{workflow.steps.length} · {pct}%</span>
      </div>
      <div style={{ height: 6, background: COLORS.bg2, borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: COLORS.gold, transition: "width 0.2s" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {workflow.steps.map((s) => (
          <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: s.done ? COLORS.text3 : COLORS.text1, fontFamily: FONT, cursor: "pointer" }}>
            <input type="checkbox" checked={s.done} onChange={(e) => toggleStep(s.id, e.target.checked)} />
            <span style={{ textDecoration: s.done ? "line-through" : "none" }}>{s.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
