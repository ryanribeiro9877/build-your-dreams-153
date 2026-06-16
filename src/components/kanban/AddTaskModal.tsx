// Modal para ADICIONAR uma tarefa existente a um quadro/coluna (placement manual,
// D4 do design). Sem isto, um quadro recém-criado ficaria sempre vazio.
// Lista as tarefas da equipe (get_team_tasks) que ainda não estão neste quadro;
// adicionar chama kanban_add_task_to_board(taskId, columnId).
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useTeamTasks } from "@/hooks/useUserTasks";
import { addTaskToBoard } from "@/hooks/useKanban";
import type { KanbanColumn } from "@/types/jurisai";
import {
  overlay, modal, input, select, btnGhost, btnMini, COLORS, FONT,
} from "@/components/kanban/kanbanStyles";

interface AddTaskModalProps {
  /** Quadro alvo (apenas informativo; o vínculo real é pela coluna). */
  boardId: string;
  /** Colunas do quadro (destino do card). */
  columns: KanbanColumn[];
  /** IDs de tarefas já presentes no quadro (excluídas da lista). */
  excludeTaskIds: string[];
  onClose: () => void;
  /** Chamado após cada adição bem-sucedida (para o board recarregar). */
  onAdded: () => void;
}

export function AddTaskModal({ columns, excludeTaskIds, onClose, onAdded }: AddTaskModalProps) {
  const { tasks, loading } = useTeamTasks();
  const [search, setSearch] = useState("");
  const [columnId, setColumnId] = useState(columns[0]?.id ?? "");
  const [adding, setAdding] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<string[]>([]);

  const exclude = useMemo(
    () => new Set([...excludeTaskIds, ...addedIds]),
    [excludeTaskIds, addedIds],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (exclude.has(t.id)) return false;
      if (q && !t.title.toLowerCase().includes(q) &&
          !(t.task_type_label ?? "").toLowerCase().includes(q) &&
          !(t.assignee_name ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tasks, exclude, search]);

  async function handleAdd(taskId: string) {
    if (!columnId) {
      toast.error("Selecione uma coluna de destino.");
      return;
    }
    setAdding(taskId);
    try {
      await addTaskToBoard(taskId, columnId);
      toast.success("Tarefa adicionada ao quadro.");
      setAddedIds((p) => [...p, taskId]);
      onAdded();
    } catch (e) {
      toast.error((e as Error)?.message ?? "Falha ao adicionar a tarefa.");
    } finally {
      setAdding(null);
    }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: COLORS.text1 }}>
            Adicionar tarefa ao quadro
          </h3>
          <button onClick={onClose} style={{ ...btnGhost, marginLeft: "auto", padding: "4px 10px" }}>
            Fechar
          </button>
        </div>

        <p style={{ fontSize: 12, color: COLORS.text3, margin: "0 0 12px" }}>
          Escolha a coluna de destino e clique em “Adicionar”. A tarefa entra no quadro
          (se já estiver em outro quadro, será movida para este).
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <input
            placeholder="Buscar por título, tipo ou responsável…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...input, flex: 1, minWidth: 200 }}
          />
          <select value={columnId} onChange={(e) => setColumnId(e.target.value)} style={select}>
            {columns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div style={{ padding: 24, textAlign: "center", color: COLORS.text3, fontFamily: FONT }}>
            Carregando tarefas…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: COLORS.text3, fontFamily: FONT }}>
            Nenhuma tarefa disponível para adicionar.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: "52vh", overflowY: "auto" }}>
            {filtered.map((t) => (
              <div
                key={t.id}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  background: COLORS.bg2, border: `1px solid ${COLORS.border}`,
                  borderRadius: 8, padding: "8px 10px",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 600, color: COLORS.text1,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {t.title}
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.text3 }}>
                    {t.task_type_label}{t.assignee_name ? ` · ${t.assignee_name}` : ""}
                  </div>
                </div>
                <button
                  onClick={() => handleAdd(t.id)}
                  disabled={adding === t.id}
                  style={{ ...btnMini, opacity: adding === t.id ? 0.6 : 1 }}
                >
                  {adding === t.id ? "…" : "Adicionar"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
