import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { HexagonLoader } from "@/components/HexagonLoader";
import { useMasterAdmin } from "@/hooks/useMasterAdmin";
import { useTaskTypes, useEligibleAssignees, createUserTask } from "@/hooks/useUserTasks";
import { toast } from "sonner";
import type { OrgStage, TaskPriority, LegalArea } from "@/types/jurisai";

// Labels em PT-BR (V17 não depende da V16 — inline aqui pra independência)
const STAGE_LABELS: Record<OrgStage, string> = {
  atendimento: "Atendimento",
  confeccao: "Confecção",
  revisao: "Revisão",
  protocolo: "Protocolo",
  audiencia: "Audiência",
  execucao: "Execução",
  execucao_sindicato: "Execução Sindicato",
  recursos: "Recursos",
  recursos_criticos: "Recursos Críticos",
  alvara: "Alvará",
  diligencia: "Diligência",
  acompanhamento: "Acompanhamento",
  financeiro: "Financeiro",
  recepcao: "Recepção",
  recepcao_supervisionada: "Recepção (Supervisionado)",
  admin_equipe: "Gestão de Equipe",
  captacao_cooperativa: "Captação Cooperativa",
  kanban_pendencias: "Kanban Pendências",
  gestao: "Gestão",
  todas: "Todas as Etapas",
};

const AREA_LABELS: Record<LegalArea, string> = {
  bancario: "Bancário",
  familia: "Família",
  plano_saude: "Plano de Saúde",
  consumidor: "Consumidor",
  civil: "Civil",
  previdenciario: "Previdenciário",
  tributario: "Tributário",
};

const inputClass = "w-full px-3 py-2.5 rounded-lg bg-[#16161f] border border-[#25253a] text-[#eeeef5] text-sm outline-none focus:border-[#eab308] box-border";

const PRIORITY_OPTIONS: TaskPriority[] = ["low", "medium", "high", "critical"];
const PRIORITY_LABELS: Record<TaskPriority, string> = {
  critical: "Crítica",
  high: "Alta",
  medium: "Média",
  low: "Baixa",
};

export default function AssignTaskPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const presetAssignee = searchParams.get("to");

  const { isMaster, checking } = useMasterAdmin();
  const { types, loading: typesLoading } = useTaskTypes();

  const [taskTypeId, setTaskTypeId] = useState<string>("");
  const [stageFilter, setStageFilter] = useState<OrgStage | "">("");
  const [assigneeId, setAssigneeId] = useState<string>(presetAssignee || "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [deadlineLocal, setDeadlineLocal] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const { assignees, loading: assigneesLoading } = useEligibleAssignees(taskTypeId || null);

  // Quando taskType muda, reseta o assignee se ele não estiver na lista (ou aplica preset)
  useEffect(() => {
    if (!assignees.length) return;
    if (presetAssignee && assignees.some(a => a.user_id === presetAssignee)) {
      setAssigneeId(presetAssignee);
      return;
    }
    if (!assignees.some(a => a.user_id === assigneeId)) {
      setAssigneeId(assignees[0]?.user_id || "");
    }
  }, [assignees, presetAssignee, assigneeId]);

  // Agrupa task_types por stage pra dropdown organizado
  const stages = useMemo(() => {
    const set = new Set<OrgStage>();
    types.forEach(t => set.add(t.stage));
    return Array.from(set).sort();
  }, [types]);

  const filteredTypes = useMemo(() => {
    if (!stageFilter) return types;
    return types.filter(t => t.stage === stageFilter);
  }, [types, stageFilter]);

  const selectedType = useMemo(
    () => types.find(t => t.id === taskTypeId),
    [types, taskTypeId],
  );

  // Pré-popula title com nome do tipo
  useEffect(() => {
    if (selectedType && !title) {
      setTitle(selectedType.display_name);
    }
  }, [selectedType, title]);

  // Pré-popula deadline pela SLA do tipo
  useEffect(() => {
    if (selectedType?.default_sla_hours && !deadlineLocal) {
      const d = new Date();
      d.setHours(d.getHours() + selectedType.default_sla_hours);
      // formato local datetime
      const pad = (n: number) => String(n).padStart(2, "0");
      const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      setDeadlineLocal(local);
    }
  }, [selectedType, deadlineLocal]);

  if (checking) return <HexagonLoader variant="fullscreen" label="Carregando" />;
  if (!isMaster) {
    navigate("/sistema", { replace: true });
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTypeId || !assigneeId || !title.trim()) {
      toast.error("Preencha tipo, destinatário e título");
      return;
    }
    setSubmitting(true);
    try {
      const taskId = await createUserTask({
        task_type_id: taskTypeId,
        assignee_user_id: assigneeId,
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        deadline_at: deadlineLocal ? new Date(deadlineLocal).toISOString() : undefined,
        area: selectedType?.area ?? undefined,
      });
      toast.success(`Tarefa criada! ID: ${taskId.slice(0, 8)}…`);
      navigate("/sistema/kanban");
    } catch (e) {
      toast.error(`Erro: ${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#09090f",
      color: "#eeeef5",
      fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      padding: 24,
    }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <button
            className="btn-voltar"
            onClick={() => navigate("/sistema/kanban")}
            style={{
              padding: "8px 16px", borderRadius: 8,
              border: "1px solid #25253a", background: "#11111a",
              color: "#c4c4d4", cursor: "pointer", fontSize: 13,
            }}
          >
            ← Voltar
          </button>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#eab308", margin: 0 }}>
            Atribuir tarefa
          </h1>
        </div>

        {typesLoading ? (
          <HexagonLoader variant="inline" label="Carregando catálogo" />
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Etapa (filtro) */}
            <div>
              <label style={labelStyle}>Etapa (filtro)</label>
              <select
                className={inputClass}
                value={stageFilter}
                onChange={(e) => {
                  setStageFilter(e.target.value as OrgStage | "");
                  setTaskTypeId("");
                }}
              >
                <option value="">— Todas as etapas —</option>
                {stages.map(s => (
                  <option key={s} value={s}>{STAGE_LABELS[s] || s}</option>
                ))}
              </select>
            </div>

            {/* Tipo de tarefa */}
            <div>
              <label style={labelStyle}>Tipo de tarefa *</label>
              <select
                className={inputClass}
                value={taskTypeId}
                onChange={(e) => setTaskTypeId(e.target.value)}
                required
              >
                <option value="">— Selecione —</option>
                {filteredTypes.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.display_name} {t.area ? `(${AREA_LABELS[t.area]})` : ""}
                  </option>
                ))}
              </select>
              {selectedType?.description && (
                <p style={{ fontSize: 12, color: "#7a7a92", marginTop: 4 }}>{selectedType.description}</p>
              )}
            </div>

            {/* Destinatário */}
            <div>
              <label style={labelStyle}>Destinatário *</label>
              {!taskTypeId ? (
                <select className={inputClass} disabled>
                  <option>Selecione o tipo primeiro</option>
                </select>
              ) : assigneesLoading ? (
                <div style={{ fontSize: 13, color: "#7a7a92", padding: 8 }}>Buscando destinatários elegíveis...</div>
              ) : assignees.length === 0 ? (
                <div style={{
                  fontSize: 13, color: "#fca5a5",
                  padding: 12, borderRadius: 8,
                  background: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                }}>
                  Nenhum funcionário com cargo elegível para esse tipo de tarefa.
                </div>
              ) : (
                <select
                  className={inputClass}
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  required
                >
                  <option value="">— Selecione —</option>
                  {assignees.map(a => (
                    <option key={a.user_id} value={a.user_id}>
                      {a.full_name} · {a.role_label}{a.is_estagiario ? " (estagiária)" : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Título */}
            <div>
              <label style={labelStyle}>Título *</label>
              <input
                className={inputClass}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex.: Confeccionar inicial de Marcos Vinícius"
                required
              />
            </div>

            {/* Descrição */}
            <div>
              <label style={labelStyle}>Detalhes</label>
              <textarea
                className={inputClass}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Informações específicas, links, contexto..."
                rows={4}
                style={{ resize: "vertical", minHeight: 80 }}
              />
            </div>

            {/* Prioridade + Prazo */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Prioridade</label>
                <select
                  className={inputClass}
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                >
                  {PRIORITY_OPTIONS.map(p => (
                    <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Prazo</label>
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={deadlineLocal}
                  onChange={(e) => setDeadlineLocal(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, paddingTop: 8 }}>
              <button
                type="submit"
                disabled={submitting || !taskTypeId || !assigneeId || !title.trim()}
                style={{
                  flex: 1, padding: "12px 16px", borderRadius: 8,
                  border: "none", cursor: "pointer",
                  background: "linear-gradient(145deg, #eab308 0%, #facc15 100%)",
                  color: "#0a0a12", fontSize: 14, fontWeight: 700,
                  opacity: submitting ? 0.6 : 1,
                }}
              >
                {submitting ? "Criando..." : "Atribuir tarefa"}
              </button>
              <button
                type="button"
                onClick={() => navigate("/sistema/equipe")}
                disabled={submitting}
                style={{
                  flex: 1, padding: "12px 16px", borderRadius: 8,
                  border: "1px solid #25253a", background: "#11111a",
                  color: "#eeeef5", fontSize: 14, fontWeight: 600, cursor: "pointer",
                }}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  color: "#9898b0",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 6,
  fontWeight: 600,
};
