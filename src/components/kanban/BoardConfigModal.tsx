import { useState } from "react";
import { toast } from "sonner";
import type { KanbanBoardDetailBoard, KanbanColumn, TaskSituacao } from "@/types/jurisai";
import { SITUACAO_LABELS, SITUACAO_ORDER } from "@/lib/kanbanSituacao";
import { COLORS, FONT, overlay, modal, input, select, btnGhost, btnPrimary, btnMini, checkLabel } from "./kanbanStyles";

// Linha de coluna editável (estado local controlado).
interface DraftColumn {
  id: string | null; // null = nova (ainda sem id no banco)
  name: string;
  situacao: TaskSituacao;
}

// Membro/papel disponível para conceder acesso (aba 2).
export interface GrantOption {
  user_id: string;
  full_name: string;
}
export interface RoleOption {
  code: string;
  display_name: string;
}

interface BoardConfigModalProps {
  board: KanbanBoardDetailBoard & { columns: KanbanColumn[] };
  // Opções para o multiselect de concessões (aba 2).
  memberOptions: GrantOption[];
  roleOptions: RoleOption[];
  // Concessões atuais (pré-carregadas pelo board detail).
  initialUserIds: string[];
  initialRoleCodes: string[];
  saving: boolean;
  onClose: () => void;
  // Callbacks que disparam as RPCs (no hook useKanban).
  onSaveBoard: (patch: {
    name: string;
    is_private: boolean;
    hide_completed_after_days: number | null;
    simplified_cards: boolean;
  }) => Promise<void>;
  onSaveColumns: (columns: { id: string | null; name: string; situacao: TaskSituacao; position: number }[]) => Promise<void>;
  onSaveGrants: (userIds: string[], roleCodes: string[]) => Promise<void>;
}

type TabId = "estrutura" | "opcoes" | "exibicao";

const newColumnId = () => `tmp-${Math.random().toString(36).slice(2, 10)}`;

export function BoardConfigModal({
  board, memberOptions, roleOptions, initialUserIds, initialRoleCodes, saving,
  onClose, onSaveBoard, onSaveColumns, onSaveGrants,
}: BoardConfigModalProps) {
  const [tab, setTab] = useState<TabId>("estrutura");

  // Aba 1 — título e colunas
  const [name, setName] = useState(board.name);
  const [columns, setColumns] = useState<DraftColumn[]>(
    [...board.columns]
      .sort((a, b) => a.position - b.position)
      .map((c) => ({ id: c.id, name: c.name, situacao: c.situacao })),
  );

  // Aba 2 — opções
  const [isPrivate, setIsPrivate] = useState(board.is_private);
  const [hideAfterDays, setHideAfterDays] = useState<string>(
    board.hide_completed_after_days != null ? String(board.hide_completed_after_days) : "",
  );
  const [userIds, setUserIds] = useState<string[]>(initialUserIds);
  const [roleCodes, setRoleCodes] = useState<string[]>(initialRoleCodes);

  // Aba 3 — exibição
  const [simplifiedCards, setSimplifiedCards] = useState(board.simplified_cards);

  function updateColumn(idx: number, patch: Partial<DraftColumn>) {
    setColumns((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }
  function addColumn() {
    setColumns((prev) => [...prev, { id: newColumnId(), name: "Nova coluna", situacao: "pendente" }]);
  }
  function removeColumn(idx: number) {
    setColumns((prev) => prev.filter((_, i) => i !== idx));
  }
  function moveColumn(idx: number, dir: -1 | 1) {
    setColumns((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  function toggleInList(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Informe o título do quadro.");
      setTab("estrutura");
      return;
    }
    if (columns.length === 0) {
      toast.error("Adicione ao menos uma coluna.");
      setTab("estrutura");
      return;
    }
    if (columns.some((c) => !c.name.trim())) {
      toast.error("Todas as colunas precisam de um nome.");
      setTab("estrutura");
      return;
    }

    const parsedDays = hideAfterDays.trim() === "" ? null : Math.max(0, Math.trunc(Number(hideAfterDays)));
    if (parsedDays !== null && Number.isNaN(parsedDays)) {
      toast.error("Dias para ocultar concluídas: informe um número válido.");
      setTab("opcoes");
      return;
    }

    try {
      // Ordem importa: board (flags) -> colunas -> concessões.
      await onSaveBoard({
        name: name.trim(),
        is_private: isPrivate,
        hide_completed_after_days: parsedDays,
        simplified_cards: simplifiedCards,
      });
      await onSaveColumns(columns.map((c, i) => ({
        id: c.id && c.id.startsWith("tmp-") ? null : c.id,
        name: c.name.trim(),
        situacao: c.situacao,
        position: i,
      })));
      await onSaveGrants(userIds, roleCodes);
      toast.success("Quadro atualizado.");
      onClose();
    } catch (e) {
      toast.error((e as Error)?.message ?? "Falha ao salvar o quadro.");
    }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: COLORS.text1 }}>Configurar quadro</h3>
          <button type="button" onClick={onClose} style={{ ...btnMini, marginLeft: "auto" }}>Fechar</button>
        </div>

        {/* Abas */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16, borderBottom: `1px solid ${COLORS.border}`, paddingBottom: 0 }}>
          <TabButton active={tab === "estrutura"} onClick={() => setTab("estrutura")}>Título e colunas</TabButton>
          <TabButton active={tab === "opcoes"} onClick={() => setTab("opcoes")}>Opções</TabButton>
          <TabButton active={tab === "exibicao"} onClick={() => setTab("exibicao")}>Exibição</TabButton>
        </div>

        {/* ── Aba 1: Título e colunas ──────────────────────────────────────── */}
        {tab === "estrutura" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <label style={fieldLabel}>
              Título do quadro
              <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...input, width: "100%", marginTop: 6 }} />
            </label>

            <div>
              <div style={{ ...fieldLabel, marginBottom: 8 }}>Colunas</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {columns.map((c, idx) => (
                  <div key={c.id ?? idx} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      value={c.name}
                      onChange={(e) => updateColumn(idx, { name: e.target.value })}
                      placeholder="Nome da coluna"
                      style={{ ...input, flex: 1 }}
                    />
                    <select
                      value={c.situacao}
                      onChange={(e) => updateColumn(idx, { situacao: e.target.value as TaskSituacao })}
                      style={{ ...select, flex: "0 0 190px" }}
                    >
                      {SITUACAO_ORDER.map((s) => (
                        <option key={s} value={s}>{SITUACAO_LABELS[s]}</option>
                      ))}
                    </select>
                    <button type="button" onClick={() => moveColumn(idx, -1)} disabled={idx === 0} title="Subir" style={{ ...btnMini, opacity: idx === 0 ? 0.4 : 1 }}>↑</button>
                    <button type="button" onClick={() => moveColumn(idx, 1)} disabled={idx === columns.length - 1} title="Descer" style={{ ...btnMini, opacity: idx === columns.length - 1 ? 0.4 : 1 }}>↓</button>
                    <button type="button" onClick={() => removeColumn(idx)} title="Remover coluna" style={{ ...btnMini, color: COLORS.danger }}>✕</button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={addColumn} style={{ ...btnGhost, marginTop: 10 }}>+ Adicionar coluna</button>
            </div>
          </div>
        )}

        {/* ── Aba 2: Opções ────────────────────────────────────────────────── */}
        {tab === "opcoes" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <label style={checkLabel}>
              <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
              Quadro privado (visível só para quem tem acesso)
            </label>

            <label style={fieldLabel}>
              Ocultar concluídas após (dias)
              <input
                type="number"
                min={0}
                value={hideAfterDays}
                onChange={(e) => setHideAfterDays(e.target.value)}
                placeholder="Nunca"
                style={{ ...input, width: 140, marginTop: 6 }}
              />
            </label>

            <div>
              <div style={{ ...fieldLabel, marginBottom: 8 }}>Responsáveis com acesso</div>
              <div style={multiselectBox}>
                {memberOptions.length === 0 && <span style={emptyHint}>Nenhum membro disponível.</span>}
                {memberOptions.map((m) => (
                  <label key={m.user_id} style={multiselectItem}>
                    <input
                      type="checkbox"
                      checked={userIds.includes(m.user_id)}
                      onChange={() => setUserIds((prev) => toggleInList(prev, m.user_id))}
                    />
                    {m.full_name}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <div style={{ ...fieldLabel, marginBottom: 8 }}>Papéis com acesso</div>
              <div style={multiselectBox}>
                {roleOptions.length === 0 && <span style={emptyHint}>Nenhum papel disponível.</span>}
                {roleOptions.map((r) => (
                  <label key={r.code} style={multiselectItem}>
                    <input
                      type="checkbox"
                      checked={roleCodes.includes(r.code)}
                      onChange={() => setRoleCodes((prev) => toggleInList(prev, r.code))}
                    />
                    {r.display_name}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Aba 3: Exibição ──────────────────────────────────────────────── */}
        {tab === "exibicao" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <label style={checkLabel}>
              <input type="checkbox" checked={simplifiedCards} onChange={(e) => setSimplifiedCards(e.target.checked)} />
              Cartões simplificados (mostra só título, responsável e prazo)
            </label>
          </div>
        )}

        {/* Rodapé */}
        <div style={{ display: "flex", gap: 8, marginTop: 22, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={btnGhost} disabled={saving}>Cancelar</button>
          <button type="button" onClick={handleSave} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }} disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "8px 14px", border: "none", background: "transparent", cursor: "pointer",
        fontSize: 13, fontWeight: active ? 700 : 500, fontFamily: FONT,
        color: active ? COLORS.goldBright : COLORS.text3,
        borderBottom: `2px solid ${active ? COLORS.gold : "transparent"}`,
        marginBottom: -1,
      }}
    >
      {children}
    </button>
  );
}

const fieldLabel: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: COLORS.text2,
  fontFamily: FONT,
};

const multiselectBox: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  maxHeight: 160,
  overflowY: "auto",
  border: `1px solid ${COLORS.border}`,
  borderRadius: 8,
  padding: 8,
  background: COLORS.bg2,
};

const multiselectItem: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  fontSize: 12,
  color: COLORS.text2,
  cursor: "pointer",
  fontFamily: FONT,
};

const emptyHint: React.CSSProperties = {
  fontSize: 12,
  color: COLORS.text3,
  fontStyle: "italic",
};
