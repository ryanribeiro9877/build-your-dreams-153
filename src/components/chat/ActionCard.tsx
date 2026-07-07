import { useState } from "react";
import { confirmAction as defaultConfirm } from "@/hooks/useActionConfirm";
import { CooperadoChecklistCard } from "./CooperadoChecklistCard";

export interface ActionProposal {
  action_id: string; run_id: string; tool: string; args: Record<string, unknown>; resumo: string; route: "execute" | "pendencia";
}

export function ActionCard({ proposal, onDone, confirmFn = defaultConfirm }: {
  proposal: ActionProposal; onDone: () => void;
  confirmFn?: (runId: string, actionId: string, d: "confirm" | "cancel") => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [resolved, setResolved] = useState<string | null>(null);
  // COOP-DOCS-3: quando o cadastro é confirmado e executado (não roteado como
  // pendência), guardamos o cliente criado para disparar a geração dos
  // documentos + checklist do cooperado no lugar do "Ação confirmada.".
  const [created, setCreated] = useState<{ id: string; name?: string } | null>(null);
  const label = proposal.route === "pendencia" ? "Encaminhar ao Admin" : "Confirmar";

  const act = async (decision: "confirm" | "cancel") => {
    setBusy(true);
    try {
      const data = await confirmFn(proposal.run_id, proposal.action_id, decision);
      setResolved(decision);
      onDone();
      if (decision === "confirm" && proposal.tool === "cadastrar_cliente") {
        // handleConfirm devolve { ok, result }. Só dispara o pós-cadastro quando
        // executou de fato (result.id presente) — rota 'pendencia' não cria cliente.
        const r = (data as { result?: { id?: unknown; full_name?: unknown } } | undefined)?.result;
        if (r && typeof r.id === "string") setCreated({ id: r.id, name: typeof r.full_name === "string" ? r.full_name : undefined });
      }
    } finally { setBusy(false); }
  };

  if (created) return <CooperadoChecklistCard clientId={created.id} clientName={created.name} />;
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
