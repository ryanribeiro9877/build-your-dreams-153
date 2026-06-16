import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { DragDropContext, DropResult } from "@hello-pangea/dnd";
import { supabase } from "@/integrations/supabase/client";
import { HexagonLoader } from "@/components/HexagonLoader";
import { useAuth } from "@/hooks/useAuth";
import { useMasterAdmin } from "@/hooks/useMasterAdmin";
import {
  useKanbanBoards,
  useKanbanBoard,
  moveCard,
  removeTaskFromBoard,
  createBoard,
  updateBoard,
  deleteBoard,
  setColumns as rpcSetColumns,
  setBoardGrants,
  toggleFavorite,
} from "@/hooks/useKanban";
import type { KanbanCardV2, TaskSituacao } from "@/types/jurisai";
import { BoardSelector } from "@/components/kanban/BoardSelector";
import { KanbanColumn } from "@/components/kanban/KanbanColumn";
import { AddTaskModal } from "@/components/kanban/AddTaskModal";
import {
  BoardConfigModal,
  type GrantOption,
  type RoleOption,
} from "@/components/kanban/BoardConfigModal";
import { COLORS, FONT, page, btnGhost, btnPrimary } from "@/components/kanban/kanbanStyles";

export default function KanbanBoard() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const { isMaster } = useMasterAdmin();

  const canAdmin = isMaster || hasRole("admin");

  const { boards, loading: boardsLoading, error: boardsError, refresh: refreshBoards } = useKanbanBoards();

  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);

  // Seleciona o quadro inicial: favorito > primeiro da lista.
  useEffect(() => {
    if (activeBoardId || boards.length === 0) return;
    const fav = boards.find((b) => b.is_favorite);
    setActiveBoardId(fav?.id ?? boards[0].id);
  }, [boards, activeBoardId]);

  const {
    board, columns, cards, loading: boardLoading, error: boardError, refresh: refreshBoard,
  } = useKanbanBoard(activeBoardId);

  // Estado local dos cards (para o update otimista do drag).
  const [localCards, setLocalCards] = useState<KanbanCardV2[]>([]);
  useEffect(() => { setLocalCards(cards); }, [cards]);

  const [showConfig, setShowConfig] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  // Opções e concessões para o modal de configuração.
  const [memberOptions, setMemberOptions] = useState<GrantOption[]>([]);
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);

  useEffect(() => {
    if (!canAdmin) return;
    let cancelled = false;
    (async () => {
      const { data: members } = await supabase
        .from("profiles")
        .select("user_id, full_name, display_name");
      const { data: roles } = await supabase
        .from("role_templates" as "agents")
        .select("code, display_name");
      if (cancelled) return;
      setMemberOptions(
        ((members as Array<{ user_id: string; full_name: string | null; display_name: string | null }> | null) ?? [])
          .filter((m) => !!m.user_id)
          .map((m) => ({ user_id: m.user_id, full_name: m.full_name || m.display_name || m.user_id }))
          .sort((a, b) => a.full_name.localeCompare(b.full_name, "pt-BR")),
      );
      setRoleOptions(
        ((roles as unknown as Array<{ code: string; display_name: string }> | null) ?? [])
          .map((r) => ({ code: r.code, display_name: r.display_name }))
          .sort((a, b) => a.display_name.localeCompare(b.display_name, "pt-BR")),
      );
    })();
    return () => { cancelled = true; };
  }, [canAdmin]);

  // Cards agrupados por coluna.
  const cardsByColumn = useMemo(() => {
    const m: Record<string, KanbanCardV2[]> = {};
    for (const col of columns) m[col.id] = [];
    for (const c of localCards) (m[c.column_id] ??= []).push(c);
    // Mantém a ordem por position dentro de cada coluna.
    for (const k of Object.keys(m)) m[k].sort((a, b) => a.position - b.position);
    return m;
  }, [columns, localCards]);

  const orderedColumns = useMemo(
    () => [...columns].sort((a, b) => a.position - b.position),
    [columns],
  );

  // ── Drag & drop ────────────────────────────────────────────────────────────
  async function onDragEnd(result: DropResult) {
    // Mover cards é permitido a qualquer usuário com acesso ao quadro (não só
    // admin) — o acesso já foi gateado por get_kanban_board/kanban_can_access_board.
    // 'canAdmin' controla apenas a configuração do quadro.
    if (!result.destination) return;
    const { draggableId, source, destination } = result;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const destColumnId = destination.droppableId;

    // Snapshot para rollback.
    const prev = localCards;

    // Update otimista: reposiciona o card movido.
    setLocalCards((curr) => {
      const moved = curr.find((c) => c.id === draggableId);
      if (!moved) return curr;
      const rest = curr.filter((c) => c.id === draggableId ? false : true);
      const destCards = rest
        .filter((c) => c.column_id === destColumnId)
        .sort((a, b) => a.position - b.position);
      destCards.splice(destination.index, 0, { ...moved, column_id: destColumnId });
      const others = rest.filter((c) => c.column_id !== destColumnId);
      const reindexedDest = destCards.map((c, i) => ({ ...c, position: i }));
      return [...others, ...reindexedDest];
    });

    try {
      await moveCard(draggableId, destColumnId, destination.index);
      refreshBoard();
    } catch (e) {
      setLocalCards(prev);
      toast.error((e as Error)?.message ?? "Falha ao mover o card.");
      refreshBoard();
    }
  }

  // ── Excluir card (remover do quadro) ────────────────────────────────────────
  async function handleDeleteCard(card: KanbanCardV2) {
    const prev = localCards;
    setLocalCards((curr) => curr.filter((c) => c.id !== card.id));
    try {
      await removeTaskFromBoard(card.id);
      toast.success("Card removido do quadro.");
      refreshBoard();
    } catch (e) {
      setLocalCards(prev);
      toast.error((e as Error)?.message ?? "Falha ao remover o card.");
    }
  }

  function handleEditCard(card: KanbanCardV2) {
    // Edição da tarefa em si vive na tela de tarefas; aqui levamos o usuário até ela.
    navigate(`/sistema/tarefas?task=${card.id}`);
  }

  function handleOpenClient(clientId: string) {
    navigate(`/clientes/${clientId}`);
  }

  // ── Novo quadro ──────────────────────────────────────────────────────────────
  async function handleNewBoard() {
    const name = window.prompt("Nome do novo quadro:");
    if (!name || !name.trim()) return;
    try {
      const id = await createBoard(name.trim(), true, null, false);
      toast.success("Quadro criado.");
      await refreshBoards();
      setActiveBoardId(id);
      setShowConfig(true);
    } catch (e) {
      toast.error((e as Error)?.message ?? "Falha ao criar o quadro.");
    }
  }

  // ── Excluir quadro ───────────────────────────────────────────────────────────
  async function handleDeleteBoard(id: string) {
    const target = boards.find((b) => b.id === id);
    if (!window.confirm(`Excluir o quadro "${target?.name ?? ""}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await deleteBoard(id);
      toast.success("Quadro excluído.");
      if (id === activeBoardId) setActiveBoardId(null);
      await refreshBoards();
    } catch (e) {
      toast.error((e as Error)?.message ?? "Falha ao excluir o quadro.");
    }
  }

  // ── Favoritar ────────────────────────────────────────────────────────────────
  async function handleToggleFavorite(id: string) {
    try {
      await toggleFavorite(id);
      await refreshBoards();
    } catch (e) {
      toast.error((e as Error)?.message ?? "Falha ao favoritar.");
    }
  }

  // ── Loading / erro ───────────────────────────────────────────────────────────
  if (boardsLoading) return <HexagonLoader variant="fullscreen" label="Carregando quadros" />;

  if (boardsError) {
    return (
      <div style={{ ...page, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: COLORS.gold }}>Erro ao carregar</h1>
          <p style={{ color: "#9898b0", marginTop: 8 }}>{boardsError}</p>
          <button onClick={() => navigate("/sistema")} style={{ ...btnGhost, marginTop: 12 }}>← Voltar</button>
        </div>
      </div>
    );
  }

  const initialUserIds = board?.grant_user_ids ?? [];
  const initialRoleCodes = board?.grant_role_codes ?? [];

  return (
    <div style={page}>
      {/* Cabeçalho */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <button className="btn-voltar" onClick={() => navigate("/sistema")} style={btnGhost}>← Voltar</button>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.gold, margin: 0 }}>Kanban</h1>

        <BoardSelector
          boards={boards}
          activeId={activeBoardId}
          onSelect={setActiveBoardId}
          isAdmin={canAdmin}
          onNewBoard={handleNewBoard}
          onToggleFavorite={handleToggleFavorite}
          onDelete={handleDeleteBoard}
        />

        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          {canAdmin && board && (
            <button onClick={() => setShowAddTask(true)} style={btnGhost} title="Adicionar tarefa ao quadro">
              + Adicionar tarefa
            </button>
          )}
          {canAdmin && board && (
            <button onClick={() => setShowConfig(true)} style={btnGhost} title="Configurar quadro">
              ⚙ Configurar
            </button>
          )}
          {canAdmin && (
            <button onClick={handleNewBoard} style={btnPrimary}>+ Novo quadro</button>
          )}
        </div>
      </div>

      {/* Conteúdo do quadro */}
      {!activeBoardId ? (
        <div style={{ padding: 48, textAlign: "center", color: COLORS.text3, fontFamily: FONT }}>
          {boards.length === 0
            ? (canAdmin ? "Nenhum quadro ainda. Crie o primeiro em “+ Novo quadro”." : "Nenhum quadro disponível para você.")
            : "Selecione um quadro."}
        </div>
      ) : boardLoading ? (
        <HexagonLoader variant="compact" label="Carregando quadro" />
      ) : boardError ? (
        <div style={{ padding: 48, textAlign: "center", color: COLORS.danger, fontFamily: FONT }}>{boardError}</div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 12 }}>
            {orderedColumns.map((col) => (
              <KanbanColumn
                key={col.id}
                column={col}
                cards={cardsByColumn[col.id] ?? []}
                canEdit={true}
                simplified={!!board?.simplified_cards}
                onEditCard={handleEditCard}
                onDeleteCard={handleDeleteCard}
                onOpenClient={handleOpenClient}
              />
            ))}
            {orderedColumns.length === 0 && (
              <div style={{ padding: 32, color: COLORS.text3, fontStyle: "italic", fontFamily: FONT }}>
                Este quadro ainda não tem colunas.{canAdmin ? " Configure em ⚙ Configurar." : ""}
              </div>
            )}
          </div>
        </DragDropContext>
      )}

      {/* Modal de configuração */}
      {showConfig && board && (
        <BoardConfigModal
          board={{ ...board, columns }}
          memberOptions={memberOptions}
          roleOptions={roleOptions}
          initialUserIds={initialUserIds}
          initialRoleCodes={initialRoleCodes}
          saving={savingConfig}
          onClose={() => setShowConfig(false)}
          onSaveBoard={async (patch) => {
            setSavingConfig(true);
            try {
              await updateBoard(
                board.id,
                patch.name,
                patch.is_private,
                patch.hide_completed_after_days,
                patch.simplified_cards,
              );
              await refreshBoards();
              await refreshBoard();
            } finally {
              setSavingConfig(false);
            }
          }}
          onSaveColumns={async (cols) => {
            await rpcSetColumns(board.id, cols as Array<{ id: string | null; name: string; situacao: TaskSituacao; position: number }>);
            await refreshBoard();
          }}
          onSaveGrants={async (userIds, roleCodes) => {
            await setBoardGrants(board.id, userIds, roleCodes);
            await refreshBoard();
          }}
        />
      )}

      {/* Modal de adicionar tarefa ao quadro */}
      {showAddTask && board && (
        <AddTaskModal
          boardId={board.id}
          columns={orderedColumns}
          excludeTaskIds={localCards.map((c) => c.id)}
          onClose={() => setShowAddTask(false)}
          onAdded={refreshBoard}
        />
      )}
    </div>
  );
}
