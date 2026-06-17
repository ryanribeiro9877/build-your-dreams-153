// Seção Checklist do modal-hub (SP4).
import { useState } from "react";
import { toast } from "sonner";
import {
  useChecklist, addChecklistItem, toggleChecklistItem, deleteChecklistItem,
} from "@/hooks/useKanban";
import { COLORS, input, btnMini } from "./kanbanStyles";

export function ChecklistSection({ taskId }: { taskId: string }) {
  const { items, refresh } = useChecklist(taskId);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const done = items.filter((i) => i.done).length;

  async function add() {
    const v = text.trim();
    if (!v) return;
    setBusy(true);
    try { await addChecklistItem(taskId, v); setText(""); refresh(); }
    catch (e) { toast.error((e as Error)?.message ?? "Falha ao adicionar item."); }
    finally { setBusy(false); }
  }
  async function toggle(id: string, d: boolean) {
    try { await toggleChecklistItem(id, d); refresh(); }
    catch (e) { toast.error((e as Error)?.message ?? "Falha ao atualizar item."); }
  }
  async function del(id: string) {
    try { await deleteChecklistItem(id); refresh(); }
    catch (e) { toast.error((e as Error)?.message ?? "Falha ao excluir item."); }
  }

  return (
    <div>
      {items.length > 0 && (
        <div style={{ fontSize: 11, color: COLORS.text3, marginBottom: 6 }}>{done}/{items.length} concluídos</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
        {items.length === 0 && <span style={{ fontSize: 11, color: COLORS.text3 }}>Nenhum item.</span>}
        {items.map((i) => (
          <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={i.done} onChange={(e) => toggle(i.id, e.target.checked)} />
            <span style={{ flex: 1, fontSize: 13, color: i.done ? COLORS.text3 : COLORS.text1, textDecoration: i.done ? "line-through" : "none" }}>
              {i.body}
            </span>
            <button onClick={() => del(i.id)} title="Remover" style={{ background: "none", border: "none", color: COLORS.text3, cursor: "pointer", fontSize: 12 }}>🗑</button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="Novo item…"
          disabled={busy}
          style={{ ...input, flex: 1 }}
        />
        <button onClick={add} disabled={busy} style={btnMini}>Adicionar</button>
      </div>
    </div>
  );
}
