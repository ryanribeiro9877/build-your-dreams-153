// Seção Auditoria do modal-hub (SP5): histórico de mudanças da tarefa.
import { useTaskAudit } from "@/hooks/useKanban";
import { SITUACAO_LABELS } from "@/lib/kanbanSituacao";
import type { TaskSituacao } from "@/types/jurisai";
import { COLORS } from "./kanbanStyles";

const FIELD_LABELS: Record<string, string> = {
  status: "Status",
  situacao: "Situação",
  assignee_user_id: "Responsável",
  deadline_at: "Data fatal",
  priority: "Prioridade",
  title: "Título",
};

const PRIORITY_LABELS: Record<string, string> = {
  critical: "Crítica", high: "Alta", medium: "Média", low: "Baixa",
};

export function AuditSection({ taskId, people }: { taskId: string; people: { id: string; name: string }[] }) {
  const { entries } = useTaskAudit(taskId);
  const nameOf = (id: string | null) => (id ? people.find((p) => p.id === id)?.name ?? id.slice(0, 8) : "—");

  function fmtVal(field: string, v: string | null): string {
    if (v == null || v === "") return "—";
    if (field === "assignee_user_id") return nameOf(v);
    if (field === "situacao") return SITUACAO_LABELS[v as TaskSituacao] ?? v;
    if (field === "priority") return PRIORITY_LABELS[v] ?? v;
    if (field === "deadline_at") return new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    return v;
  }

  if (entries.length === 0) {
    return <span style={{ fontSize: 11, color: COLORS.text3 }}>Sem alterações registradas.</span>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 220, overflowY: "auto" }}>
      {entries.map((e) => (
        <div key={e.id} style={{ fontSize: 12, color: COLORS.text2, lineHeight: 1.4 }}>
          <span style={{ fontSize: 10, color: COLORS.text3 }}>
            {new Date(e.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
          </span>
          {" · "}<strong style={{ color: COLORS.text1 }}>{e.actor_name}</strong>
          {" alterou "}<strong>{FIELD_LABELS[e.field] ?? e.field}</strong>
          {": "}{fmtVal(e.field, e.old_value)} → {fmtVal(e.field, e.new_value)}
        </div>
      ))}
    </div>
  );
}
