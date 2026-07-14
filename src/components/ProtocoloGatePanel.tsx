import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { getGateProtocoloContext, type GateProtocoloContext } from "@/hooks/useUserTasks";
import { uploadSignedDocument } from "@/lib/clientDocuments";

interface Props {
  taskId: string;
  /** Notifica a inbox para revalidar (o gate pode ter acabado de fechar). */
  onChanged: () => void;
}

// Os dois document_type que o gate exige. Ambos válidos no CHECK de produção
// (client_documents_document_type_check) — foram adicionados pelo backend do 8.5.
const GATE_DOCS: { type: string; label: string; key: "reclame_aqui" | "sentenca_procedente" }[] = [
  { type: "reclame_aqui", label: "Reclame Aqui", key: "reclame_aqui" },
  { type: "sentenca_procedente", label: "Sentença Procedente", key: "sentenca_procedente" },
];

/**
 * Card 8.5 — Gate de Protocolo.
 *
 * Regra do Rodrigo: sem os dois documentos (Reclame Aqui + Sentença Procedente),
 * não protocola. O bloqueio é DURO no banco (trigger BEFORE UPDATE OF status em
 * user_tasks) — este painel NÃO decide nem substitui o botão "Concluir" genérico
 * da inbox; ele só (a) mostra o que falta e (b) deixa anexar os dois documentos
 * direto daqui, reusando uploadSignedDocument (nenhuma função de upload nova).
 *
 * Diferente do 8.2 (revisar_peca), não escondemos "Concluir": uma tentativa
 * prematura só devolve a mensagem clara do banco ("Protocolo bloqueado: faltam …")
 * em vez de quebrar algo. NÃO há protocolo automático no tribunal aqui — o
 * advogado busca e junta os dois documentos; isso é a parte manual da regra.
 */
export default function ProtocoloGatePanel({ taskId, onChanged }: Props) {
  const { user } = useAuth();
  const [ctx, setCtx] = useState<GateProtocoloContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = async () => {
    try {
      const c = await getGateProtocoloContext(taskId);
      setCtx(c);
    } catch (e) {
      toast.error("Erro ao verificar gate de protocolo: " + (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getGateProtocoloContext(taskId)
      .then((c) => { if (alive) setCtx(c); })
      .catch((e) => toast.error("Erro ao verificar gate de protocolo: " + (e as Error).message))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [taskId]);

  const handleUpload = async (docType: string, label: string, file: File) => {
    if (!ctx?.client_id) { toast.error("Tarefa sem cliente vinculado — não é possível anexar."); return; }
    if (!user?.id) { toast.error("Sessão inválida."); return; }
    setUploadingKey(docType);
    try {
      const res = await uploadSignedDocument(
        ctx.client_id,
        ctx.client_name ?? "",
        user.id,
        docType,
        label,
        file,
      );
      if (!res.ok) throw new Error(res.error ?? "falha no upload");
      toast.success(`${label} anexado.`);
      await load();
      onChanged();
    } catch (e) {
      toast.error(`Erro ao anexar ${label}: ${(e as Error).message}`);
    } finally {
      setUploadingKey(null);
      const el = inputs.current[docType];
      if (el) el.value = "";
    }
  };

  if (loading) {
    return <div style={{ padding: 12, fontSize: 12, color: "#7a7a92" }}>Verificando gate de protocolo…</div>;
  }
  if (!ctx) return null;

  // Tarefa inconsistente (sem cliente etc.): o banco não trava por gate nesse
  // caso — apenas informamos, sem oferecer upload.
  if (ctx.erro) {
    return (
      <div style={{
        marginTop: 10, padding: 12, borderRadius: 8,
        background: "#16161f", border: "1px solid rgba(245,158,11,0.3)",
        fontSize: 12, color: "#f59e0b",
      }}>
        ⚠ Gate de protocolo não aplicável a esta tarefa ({ctx.erro}).
      </div>
    );
  }

  const completo = !!ctx.completo;

  return (
    <div style={{
      marginTop: 10, padding: 14, borderRadius: 8,
      background: "#16161f", border: `1px solid ${completo ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)"}`,
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ fontSize: 11, color: "#c9a84c", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>
        Gate de protocolo {ctx.client_name ? `— ${ctx.client_name}` : ""}
      </div>

      <div style={{ fontSize: 12, color: completo ? "#4ade80" : "#f87171" }}>
        {completo
          ? "✔ Documentos completos — protocolo liberado. Pode concluir a tarefa."
          : "🔒 Bloqueado: os dois documentos são obrigatórios para protocolar."}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {GATE_DOCS.map((doc) => {
          const present = !!ctx[doc.key];
          const busy = uploadingKey === doc.type;
          return (
            <div
              key={doc.type}
              style={{
                display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                padding: "8px 10px", borderRadius: 6,
                background: "#0d0d14", border: "1px solid #25253a",
              }}
            >
              <span style={{ fontSize: 13 }}>{present ? "✅" : "⬜"}</span>
              <span style={{ fontSize: 13, color: "#eeeef5", fontWeight: 600, flex: 1, minWidth: 120 }}>
                {doc.label}
              </span>
              {present ? (
                <span style={{ fontSize: 11, color: "#4ade80" }}>anexado</span>
              ) : (
                <>
                  <input
                    ref={(el) => { inputs.current[doc.type] = el; }}
                    type="file"
                    disabled={busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleUpload(doc.type, doc.label, f);
                    }}
                    style={{ display: "none" }}
                    id={`gate-upload-${doc.type}-${taskId}`}
                  />
                  <label
                    htmlFor={`gate-upload-${doc.type}-${taskId}`}
                    style={{
                      padding: "6px 12px", borderRadius: 6,
                      border: "1px solid #c9a84c", background: "rgba(201,168,76,0.12)",
                      color: "#e8c96a", fontSize: 12, fontWeight: 700,
                      cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.5 : 1,
                    }}
                  >
                    {busy ? "Enviando…" : "📎 Anexar"}
                  </label>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
