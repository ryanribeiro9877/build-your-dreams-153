import { useState } from "react";
import { Check, Pencil, X, UserPlus, ClipboardList, Send } from "lucide-react";
import { confirmAction as defaultConfirm } from "@/hooks/useActionConfirm";
import { CooperadoChecklistCard } from "./CooperadoChecklistCard";

export interface ActionProposal {
  action_id: string; run_id: string; tool: string; args: Record<string, unknown>; resumo: string; route: "execute" | "pendencia";
}

// O resumo (vindo de summarizeCadastro no edge) já chega como dados ESTRUTURADOS,
// um "Rótulo: valor" por linha e com CPF/CNPJ MASCARADOS. Aqui só o transformamos
// em campos rotulados para o quadro (Modelo B) — não remascaramos nem reprocessamos.
type Field = { label: string; value: string };

function parseResumo(resumo: string, isCadastro: boolean): { fields: Field[]; desc: string | null } {
  const lines = (resumo || "").split("\n").map((l) => l.trim()).filter(Boolean);
  // Ações não-cadastro têm resumo de uma frase só (ex.: 'Criar card "X".') —
  // exibida como descrição, sem tabela de campos.
  if (!isCadastro) return { fields: [], desc: resumo?.trim() || null };
  const fields: Field[] = [];
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx === -1) { fields.push({ label: "", value: line }); continue; }
    let label = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    // A 1ª linha vem como "Cadastrar cliente: <nome>" — rotula como "Nome".
    if (label.toLowerCase() === "cadastrar cliente") label = "Nome";
    if (value) fields.push({ label, value });
  }
  return { fields, desc: fields.length ? null : (resumo?.trim() || null) };
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
  const isPendencia = proposal.route === "pendencia";
  const primaryLabel = isPendencia ? "Encaminhar ao Admin" : "Confirmar";
  // COOP-DOCS-3B: no cadastro de cliente, o botão secundário é "Corrigir" (não
  // "Cancelar") — ao clicar, cancela esta proposta e o especialista, no próximo
  // turno, pergunta qual dado ajustar (regra no prompt do agente).
  const isCadastro = proposal.tool === "cadastrar_cliente";
  const secondaryLabel = isCadastro ? "Corrigir" : "Cancelar";
  const title = isCadastro ? "Cadastrar cliente" : "Confirmar ação";
  const { fields, desc } = parseResumo(proposal.resumo, isCadastro);

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
  if (resolved) return (
    <div className="action-card--done">
      {resolved === "confirm"
        ? (<><Check size={15} style={{ color: "#FACC15", flexShrink: 0 }} /> Ação confirmada.</>)
        : isCadastro
          ? (<><Pencil size={15} style={{ color: "#FACC15", flexShrink: 0 }} /> Certo — me diga qual dado deseja ajustar (ex.: "o CPF é 111.222.333-44") que eu corrijo.</>)
          : (<><X size={15} style={{ color: "#94A3B8", flexShrink: 0 }} /> Ação cancelada.</>)}
    </div>
  );

  return (
    <div className="action-card">
      <div className="action-card__head">
        {isCadastro ? <UserPlus size={15} aria-hidden="true" /> : <ClipboardList size={15} aria-hidden="true" />}
        {title}
      </div>
      {isPendencia && (
        <div className="action-card__note">Você não tem permissão para executar — será encaminhado ao Admin para aprovação.</div>
      )}
      {fields.length > 0 ? (
        <div className="action-card__fields">
          {fields.map((f, i) => (
            <div className="action-card__row" key={i}>
              {f.label && <span className="action-card__label">{f.label}</span>}
              <span className="action-card__value">{f.value}</span>
            </div>
          ))}
        </div>
      ) : (
        desc && <div className="action-card__desc">{desc}</div>
      )}
      <div className="action-card__actions">
        <button type="button" className="action-card__btn action-card__btn--primary" disabled={busy} onClick={() => act("confirm")}>
          {isPendencia ? <Send size={14} aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}
          {primaryLabel}
        </button>
        <button type="button" className="action-card__btn action-card__btn--ghost" disabled={busy} onClick={() => act("cancel")}>
          {isCadastro ? <Pencil size={14} aria-hidden="true" /> : <X size={15} aria-hidden="true" />}
          {secondaryLabel}
        </button>
      </div>
    </div>
  );
}
