import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  getRevisaoPecaContext,
  decidirRevisaoPeca,
  type RevisaoPecaContext,
} from "@/hooks/useUserTasks";

interface Props {
  taskId: string;
  onDecided: () => void;
}

/**
 * Card 8.2 — Revisão humana + log de aprovação.
 *
 * Único lugar que deve decidir uma tarefa `revisar_peca`. Substitui os botões
 * genéricos "Concluir/Avançar" da inbox para este tipo de tarefa — completar
 * por fora não libera o protocolo (o banco tem defesa em profundidade), mas
 * também não passa pelo aceite de responsabilidade, então a UI não oferece
 * esse caminho aqui.
 *
 * Limite honesto: a "peça" hoje é um arquivo (client_documents/storage), não
 * texto estruturado — não existe modelo de fundamentos/pedidos/valores em
 * separado. Por isso a revisão mostra o arquivo para download/preview + o
 * contexto do processo, e não um formulário de campos jurídicos.
 */
export default function RevisaoPecaPanel({ taskId, onDecided }: Props) {
  const [ctx, setCtx] = useState<RevisaoPecaContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [observacoes, setObservacoes] = useState("");
  const [aceite, setAceite] = useState(false);
  const [mode, setMode] = useState<"idle" | "devolvendo">("idle");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getRevisaoPecaContext(taskId)
      .then((c) => { if (alive) setCtx(c); })
      .catch((e) => toast.error("Erro ao carregar revisão: " + (e as Error).message))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [taskId]);

  const handleDownload = async () => {
    if (!ctx?.client_document) return;
    const { data, error } = await supabase.storage
      .from("client-documents")
      .createSignedUrl(ctx.client_document.file_path, 3600);
    if (error || !data) { toast.error("Erro ao gerar link da peça"); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const handleAprovar = async () => {
    if (!aceite) { toast.error("Confirme o aceite de responsabilidade para aprovar."); return; }
    setBusy(true);
    try {
      await decidirRevisaoPeca(taskId, "aprovar", observacoes.trim() || undefined, true);
      toast.success("Revisão aprovada — protocolo liberado.");
      onDecided();
    } catch (e) {
      toast.error("Erro ao aprovar: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleDevolver = async () => {
    if (!observacoes.trim()) { toast.error("Descreva o que precisa ser ajustado."); return; }
    setBusy(true);
    try {
      await decidirRevisaoPeca(taskId, "devolver", observacoes.trim(), false);
      toast.success("Devolvida para ajuste — voltou para quem confeccionou.");
      onDecided();
    } catch (e) {
      toast.error("Erro ao devolver: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 12, fontSize: 12, color: "#7a7a92" }}>Carregando peça e contexto…</div>;
  }
  if (!ctx) return null;

  return (
    <div style={{
      marginTop: 10, padding: 14, borderRadius: 8,
      background: "#16161f", border: "1px solid rgba(201,168,76,0.3)",
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ fontSize: 11, color: "#c9a84c", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>
        Revisão da peça
      </div>

      <div style={{ fontSize: 12, color: "#c4c4d4", display: "flex", flexDirection: "column", gap: 3 }}>
        {ctx.process && (
          <span>📁 Processo: {ctx.process.process_number || "(sem número)"} — {ctx.process.client_name}</span>
        )}
        {ctx.redator_name && <span>✍️ Confeccionada por: {ctx.redator_name}</span>}
        {ctx.fallback && (
          <span style={{ color: "#f59e0b" }}>
            ⚠ Sem responsável elegível ({ctx.fallback_reason}) — você está revisando no fallback.
          </span>
        )}
      </div>

      {ctx.client_document ? (
        <button
          onClick={handleDownload}
          style={{
            alignSelf: "flex-start", padding: "8px 14px", borderRadius: 6,
            border: "1px solid #c9a84c", background: "rgba(201,168,76,0.12)",
            color: "#e8c96a", fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}
        >
          📄 Abrir peça — {ctx.client_document.document_name || "documento"}
        </button>
      ) : (
        <div style={{ fontSize: 12, color: "#f59e0b" }}>
          ⚠ Nenhum documento de peça vinculado a esta revisão. Confira com quem confeccionou antes de decidir.
        </div>
      )}

      {ctx.approval_history.length > 0 && (
        <details style={{ fontSize: 11, color: "#7a7a92" }}>
          <summary style={{ cursor: "pointer" }}>Histórico de decisões ({ctx.approval_history.length})</summary>
          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
            {ctx.approval_history.map((h, i) => (
              <div key={i}>
                {h.decisao === "aprovar" ? "✅" : "↩️"} {h.decisao} por {h.decided_by_name} —{" "}
                {new Date(h.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                {h.observacoes && ` — "${h.observacoes}"`}
              </div>
            ))}
          </div>
        </details>
      )}

      <textarea
        value={observacoes}
        onChange={(e) => setObservacoes(e.target.value)}
        rows={2}
        placeholder={mode === "devolvendo" ? "O que precisa ser ajustado? (obrigatório)" : "Observações (opcional para aprovar)"}
        style={{
          padding: "6px 8px", borderRadius: 6, border: "1px solid #25253a",
          background: "#0d0d14", color: "#eeeef5", fontSize: 12, fontFamily: "inherit", resize: "vertical",
        }}
      />

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#c4c4d4", cursor: "pointer" }}>
        <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} />
        Revisei o conteúdo e aceito a responsabilidade por esta aprovação.
      </label>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={handleAprovar}
          disabled={busy || !aceite}
          style={{
            padding: "7px 14px", borderRadius: 6, border: "1px solid #22c55e",
            background: "rgba(34,197,94,0.15)", color: "#4ade80", fontSize: 12, fontWeight: 700,
            cursor: busy || !aceite ? "not-allowed" : "pointer", opacity: busy || !aceite ? 0.5 : 1,
          }}
        >
          {busy ? "…" : "✔ Aprovar e liberar protocolo"}
        </button>
        <button
          onClick={handleDevolver}
          disabled={busy}
          onFocus={() => setMode("devolvendo")}
          style={{
            padding: "7px 14px", borderRadius: 6, border: "1px solid rgba(239,68,68,0.4)",
            background: "rgba(239,68,68,0.08)", color: "#f87171", fontSize: 12, fontWeight: 700,
            cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.5 : 1,
          }}
        >
          ↩ Devolver para ajuste
        </button>
      </div>
    </div>
  );
}
