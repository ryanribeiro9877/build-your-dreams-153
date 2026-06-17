// Gestão de templates de workflow (SP4) — só admin. Aberto pelo cabeçalho do Kanban.
import { useState } from "react";
import { toast } from "sonner";
import { useWorkflowTemplates, createWorkflowTemplate, deleteWorkflowTemplate } from "@/hooks/useKanban";
import { overlay, modal, input, btnGhost, btnPrimary, COLORS } from "./kanbanStyles";

export function WorkflowTemplatesModal({ onClose }: { onClose: () => void }) {
  const { templates, refresh } = useWorkflowTemplates();
  const [name, setName] = useState("");
  const [stepsText, setStepsText] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    const n = name.trim();
    if (!n) { toast.error("Nome obrigatório."); return; }
    const steps = stepsText.split("\n").map((s) => s.trim()).filter(Boolean);
    setBusy(true);
    try {
      await createWorkflowTemplate(n, steps);
      toast.success("Fluxo criado.");
      setName(""); setStepsText("");
      refresh();
    } catch (e) {
      toast.error((e as Error)?.message ?? "Falha ao criar fluxo.");
    } finally {
      setBusy(false);
    }
  }
  async function del(id: string) {
    if (!window.confirm("Excluir este fluxo? Instâncias já iniciadas não são afetadas.")) return;
    try { await deleteWorkflowTemplate(id); refresh(); }
    catch (e) { toast.error((e as Error)?.message ?? "Falha ao excluir."); }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: COLORS.text1 }}>Fluxos de trabalho</h3>
          <button onClick={onClose} style={{ ...btnGhost, marginLeft: "auto", padding: "4px 10px" }}>Fechar</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
          {templates.length === 0 && <span style={{ fontSize: 12, color: COLORS.text3 }}>Nenhum fluxo cadastrado.</span>}
          {templates.map((t) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, background: COLORS.bg2, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "6px 10px" }}>
              <span style={{ flex: 1, fontSize: 13, color: COLORS.text1 }}>{t.name}</span>
              <span style={{ fontSize: 11, color: COLORS.text3 }}>{t.step_count} etapas</span>
              <button onClick={() => del(t.id)} title="Excluir fluxo" style={{ background: "none", border: "none", color: COLORS.danger, cursor: "pointer", fontSize: 13 }}>🗑</button>
            </div>
          ))}
        </div>

        <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 12 }}>
          <div style={{ fontSize: 11, color: COLORS.gold, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, marginBottom: 6 }}>Novo fluxo</div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do fluxo (ex.: Ação contra Banco)" style={{ ...input, width: "100%", marginBottom: 6 }} />
          <textarea value={stepsText} onChange={(e) => setStepsText(e.target.value)} rows={5} placeholder="Uma etapa por linha (ex.:&#10;Confecção&#10;Revisão&#10;Protocolo)" style={{ ...input, width: "100%", resize: "vertical", marginBottom: 6 }} />
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button onClick={create} disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}>{busy ? "Criando…" : "Criar fluxo"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
