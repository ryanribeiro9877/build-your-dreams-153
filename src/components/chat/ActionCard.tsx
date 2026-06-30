import { useState } from "react";
import { confirmAction as defaultConfirm } from "@/hooks/useActionConfirm";

export interface ActionProposal {
  action_id: string; run_id: string; tool: string; args: Record<string, unknown>; resumo: string; route: "execute" | "pendencia";
}

export function ActionCard({ proposal, onDone, confirmFn = defaultConfirm }: {
  proposal: ActionProposal; onDone: () => void;
  confirmFn?: (runId: string, actionId: string, d: "confirm" | "cancel") => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [resolved, setResolved] = useState<string | null>(null);
  const label = proposal.route === "pendencia" ? "Encaminhar ao Admin" : "Confirmar";

  const act = async (decision: "confirm" | "cancel") => {
    setBusy(true);
    try { await confirmFn(proposal.run_id, proposal.action_id, decision); setResolved(decision); onDone(); }
    finally { setBusy(false); }
  };

  if (resolved) return <div className="action-card action-card--done">{resolved === "confirm" ? "Ação confirmada." : "Ação cancelada."}</div>;
  return (
    <div className="action-card" style={{ border: "1px solid var(--border, #ccc)", borderRadius: 10, padding: 12, margin: "8px 0", display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={{ margin: 0 }}>{proposal.resumo}</p>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" disabled={busy} onClick={() => act("confirm")}>{label}</button>
        <button type="button" disabled={busy} onClick={() => act("cancel")}>Cancelar</button>
      </div>
    </div>
  );
}
