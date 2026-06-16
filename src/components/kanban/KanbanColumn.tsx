import { Droppable, Draggable } from "@hello-pangea/dnd";
import type { KanbanColumn as KanbanColumnType, KanbanCardV2 } from "@/types/jurisai";
import { COLORS, column as columnStyle } from "./kanbanStyles";
import { KanbanCard } from "./KanbanCard";

interface KanbanColumnProps {
  column: KanbanColumnType;
  cards: KanbanCardV2[];
  canEdit: boolean;
  simplified: boolean;
  onEditCard: (card: KanbanCardV2) => void;
  onDeleteCard: (card: KanbanCardV2) => void;
  onOpenClient?: (clientId: string) => void;
}

export function KanbanColumn({
  column, cards, canEdit, simplified, onEditCard, onDeleteCard, onOpenClient,
}: KanbanColumnProps) {
  return (
    <div style={columnStyle}>
      {/* Header: nome + contagem */}
      <div
        style={{
          display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
          paddingBottom: 8, borderBottom: `2px solid ${COLORS.gold}`,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.goldBright }}>{column.name}</span>
        <span
          style={{
            marginLeft: "auto", fontSize: 11, color: COLORS.text3,
            background: COLORS.bg2, padding: "2px 8px", borderRadius: 10,
          }}
        >
          {cards.length}
        </span>
      </div>

      <Droppable droppableId={column.id} isDropDisabled={!canEdit}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              minHeight: 48,
              borderRadius: 8,
              padding: snapshot.isDraggingOver ? 4 : 0,
              background: snapshot.isDraggingOver ? "rgba(234,179,8,0.06)" : "transparent",
              border: snapshot.isDraggingOver ? "1px dashed rgba(234,179,8,0.35)" : "1px dashed transparent",
              transition: "all 0.2s",
            }}
          >
            {cards.map((c, index) => (
              <Draggable key={c.id} draggableId={c.id} index={index} isDragDisabled={!canEdit}>
                {(dragProvided, dragSnapshot) => (
                  <div
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                    {...dragProvided.dragHandleProps}
                    style={{
                      ...dragProvided.draggableProps.style,
                      cursor: canEdit ? "grab" : "default",
                      opacity: dragSnapshot.isDragging ? 0.92 : 1,
                      boxShadow: dragSnapshot.isDragging ? "0 8px 24px rgba(0,0,0,0.35)" : "none",
                    }}
                  >
                    <KanbanCard
                      card={c}
                      simplified={simplified}
                      canEdit={canEdit}
                      onEdit={onEditCard}
                      onDelete={onDeleteCard}
                      onOpenClient={onOpenClient}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
            {cards.length === 0 && (
              <div style={{ padding: 16, textAlign: "center", color: COLORS.text3, fontSize: 12, fontStyle: "italic" }}>
                Vazia
              </div>
            )}
          </div>
        )}
      </Droppable>
    </div>
  );
}
