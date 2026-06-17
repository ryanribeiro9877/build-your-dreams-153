// Seção Timesheet do modal-hub (SP5): apontamento de horas + cronômetro.
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useTimeEntries, addTimeEntry, deleteTimeEntry } from "@/hooks/useKanban";
import { COLORS, FONT, input, btnMini, btnPrimary } from "./kanbanStyles";

function fmtMin(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h > 0) return `${h}h${min > 0 ? ` ${min}min` : ""}`;
  return `${min}min`;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { dateStyle: "short" });
}

export function TimesheetSection({ taskId }: { taskId: string }) {
  const { entries, totalMinutes, refresh } = useTimeEntries(taskId);
  const [minutes, setMinutes] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  // Cronômetro (client-side).
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0); // segundos
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      if (startRef.current != null) setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [running]);

  async function persist(min: number, n: string) {
    setBusy(true);
    try {
      await addTimeEntry(taskId, min, n);
      toast.success("Horas registradas.");
      refresh();
    } catch (e) {
      toast.error((e as Error)?.message ?? "Falha ao registrar horas.");
    } finally {
      setBusy(false);
    }
  }

  async function addManual() {
    const m = parseInt(minutes, 10);
    if (!m || m <= 0) { toast.error("Informe os minutos."); return; }
    await persist(m, note.trim());
    setMinutes(""); setNote("");
  }

  function startTimer() { startRef.current = Date.now(); setElapsed(0); setRunning(true); }
  async function stopTimer() {
    setRunning(false);
    const min = Math.max(1, Math.round(elapsed / 60));
    startRef.current = null; setElapsed(0);
    await persist(min, note.trim());
    setNote("");
  }

  async function del(id: string) {
    try { await deleteTimeEntry(id); refresh(); }
    catch (e) { toast.error((e as Error)?.message ?? "Falha ao excluir."); }
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: COLORS.text2, marginBottom: 8 }}>
        Total: <strong style={{ color: COLORS.goldBright }}>{fmtMin(totalMinutes)}</strong>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
        {entries.length === 0 && <span style={{ fontSize: 11, color: COLORS.text3 }}>Nenhum apontamento.</span>}
        {entries.map((e) => (
          <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: COLORS.text2 }}>
            <span style={{ color: COLORS.goldBright, minWidth: 64 }}>{fmtMin(e.minutes)}</span>
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {e.user_name}{e.note ? ` · ${e.note}` : ""}
            </span>
            <span style={{ fontSize: 10, color: COLORS.text3 }}>{fmtDate(e.created_at)}</span>
            <button onClick={() => del(e.id)} title="Excluir" style={{ background: "none", border: "none", color: COLORS.text3, cursor: "pointer", fontSize: 12 }}>🗑</button>
          </div>
        ))}
      </div>

      {/* Apontamento manual */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
        <input type="number" min={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="min" style={{ ...input, width: 80 }} />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (opcional)" style={{ ...input, flex: 1, minWidth: 140 }} />
        <button onClick={addManual} disabled={busy} style={btnMini}>Adicionar</button>
      </div>

      {/* Cronômetro */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 14, color: running ? COLORS.goldBright : COLORS.text3 }}>
          {String(Math.floor(elapsed / 60)).padStart(2, "0")}:{String(elapsed % 60).padStart(2, "0")}
        </span>
        {running ? (
          <button onClick={stopTimer} disabled={busy} style={{ ...btnPrimary, fontFamily: FONT }}>Parar e registrar</button>
        ) : (
          <button onClick={startTimer} style={btnMini}>▶ Iniciar cronômetro</button>
        )}
      </div>
    </div>
  );
}
