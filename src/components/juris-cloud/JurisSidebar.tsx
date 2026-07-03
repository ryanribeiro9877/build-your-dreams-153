import React from "react";
import { useNavigate } from "react-router-dom";
import { trackUiEvent } from "@/lib/uiTracking";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Search, Sparkles, Settings, Network, Circle, Plus, MessageSquare, Trash2, ChevronDown, UserRound,
} from "lucide-react";
import type { Agent, SidebarItem, MenuItem } from "./types";
import { DEPT_ICONS, getHierarchyColor, getInitials } from "./constants";
import { STATUS_META, type ConversationStatus } from "./sessionStatus";

// Selo de status da conversa (2.4). Um ponto colorido + rótulo curto. Só é
// renderizado quando há um status derivável (o componente pai passa null quando
// o estado não é confiável — nunca inventamos um status).
function StatusBadge({ status }: { status: ConversationStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      title={meta.label}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "1px 7px", borderRadius: 10, fontSize: 9.5, fontWeight: 600,
        lineHeight: 1.5, whiteSpace: "nowrap",
        color: meta.fg, background: meta.bg, border: `1px solid ${meta.border}`,
      }}
    >
      <span
        style={{
          width: 5, height: 5, borderRadius: "50%", background: meta.dot, flexShrink: 0,
          animation: status === "em_andamento" ? "pulse 1.4s infinite" : undefined,
        }}
      />
      {meta.label}
    </span>
  );
}

type SessionSummary = {
  id: string; title: string; preview?: string;
  lastMessageAt: string; messageCount: number;
  clientName?: string | null;
  status?: ConversationStatus | null;
};

export interface JurisSidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  sidebarCollapsed: boolean;
  sidebarSearch: string;
  setSidebarSearch: (val: string) => void;
  activeDept: string;
  setActiveDept: (dept: string) => void;
  visibleDepts: SidebarItem[];
  visibleAgents: Agent[];
  menuItems: MenuItem[];
  systemOnline: boolean;
  openTooltipCount: number;
  setOpenTooltipCount: React.Dispatch<React.SetStateAction<number>>;
  hasRole: (role: string) => boolean;
  chatSessions?: SessionSummary[];
  activeSessionId?: string | null;
  onSwitchSession?: (sessionId: string) => void;
  onNewChat?: () => void;
  onDeleteSession?: (sessionId: string) => void;
}

export default function JurisSidebar({
  sidebarOpen,
  setSidebarOpen,
  sidebarCollapsed,
  sidebarSearch,
  setSidebarSearch,
  activeDept,
  setActiveDept,
  visibleDepts,
  visibleAgents,
  menuItems,
  systemOnline,
  openTooltipCount,
  setOpenTooltipCount,
  hasRole,
  chatSessions = [],
  activeSessionId,
  onSwitchSession,
  onNewChat,
  onDeleteSession,
}: JurisSidebarProps) {
  const navigate = useNavigate();
  const [expandedGroups, setExpandedGroups] = React.useState<Record<string, boolean>>({});

  const withTooltip = (
    label: string,
    node: React.ReactElement,
    targetId?: string,
    opts?: { side?: "right" | "left" | "top" | "bottom"; surface?: string; alwaysOn?: boolean }
  ) => {
    const enabled = opts?.alwaysOn || sidebarCollapsed;
    if (!enabled) return node;
    const side = opts?.side ?? "right";
    const surface = opts?.surface ?? "left_sidebar";
    return (
      <Tooltip
        key={targetId}
        delayDuration={150}
        onOpenChange={(open) => {
          setOpenTooltipCount((n) => Math.max(0, n + (open ? 1 : -1)));
          if (open) {
            trackUiEvent("tooltip_open", {
              surface,
              target_id: targetId,
              target_label: label,
            });
          }
        }}
      >
        <TooltipTrigger asChild>{node}</TooltipTrigger>
        <TooltipContent
          side={side}
          sideOffset={8}
          onEscapeKeyDown={(e) => { e.preventDefault(); }}
        >
          {label}
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <aside
      id="jc-sidebar"
      className={`jc-sidebar ${sidebarOpen ? "mobile-open" : ""} ${sidebarCollapsed ? "collapsed" : ""}`}
      aria-label="Menu lateral de navegação"
    >
      <div className="jc-sidebar-body">
        <div className="jc-logo" title={systemOnline ? "JurisAI — sistema ativo" : "JurisAI — sistema inativo"}>
          <div className="jc-logo-mark">J</div>
          <div className="jc-logo-info">
            <div className={`jc-logo-text ${systemOnline ? "online" : "offline"}`}>JurisAI</div>
          </div>
        </div>

        <div className="jc-search">
          <Search size={14} style={{ color: "var(--text3)", flexShrink: 0 }} />
          <input
            placeholder="Buscar processo, cliente..."
            value={sidebarSearch}
            onChange={e => setSidebarSearch(e.target.value)}
            aria-label="Buscar processo ou cliente"
          />
        </div>

        <nav className="jc-nav" aria-label="Departamentos e sistema">
          <div className="jc-section-label">Departamentos</div>
          {visibleDepts.map(dept => {
            const Icon = DEPT_ICONS[dept.id] || Sparkles;
            const activate = (source: "click" | "keyboard") => {
              setActiveDept(dept.id);
              setSidebarOpen(false);
              trackUiEvent("nav_click", {
                surface: "left_sidebar",
                target_id: dept.id,
                target_label: dept.label,
                source,
                collapsed: sidebarCollapsed,
              });
            };
            return withTooltip(dept.label,
              <div
                key={dept.id}
                className={`jc-nav-item ${activeDept === dept.id ? "active" : ""}`}
                onClick={() => activate("click")}
                role="button"
                tabIndex={0}
                aria-current={activeDept === dept.id ? "page" : undefined}
                onFocus={(e) => {
                  if ((e.nativeEvent as FocusEvent & { sourceCapabilities?: unknown }).sourceCapabilities === null
                    || e.target.matches(":focus-visible")) {
                    trackUiEvent("tab_navigate", {
                      surface: "left_sidebar",
                      target_id: dept.id,
                      target_label: dept.label,
                      collapsed: sidebarCollapsed,
                    });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    trackUiEvent("key_activate", {
                      surface: "left_sidebar",
                      target_id: dept.id,
                      target_label: dept.label,
                      source: "keyboard",
                    });
                    activate("keyboard");
                  }
                }}
              >
                <Icon size={16} style={{ color: dept.color, flexShrink: 0 }} />
                <span className={`jc-nav-label ${dept.id === "assistente" ? "jc-nav-label--brand" : ""}`}>{dept.label}</span>
                {dept.badge > 0 && <span className={`jc-nav-badge ${dept.badge >= 8 ? "alert" : ""}`}>{dept.badge}</span>}
              </div>,
              dept.id
            );
          })}

          {/* ── Histórico de conversas ── */}
          <div className="jc-section-label" style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>Conversas</span>
            {!sidebarCollapsed && onNewChat && (
              <button
                type="button"
                onClick={() => { onNewChat(); setSidebarOpen(false); }}
                title="Nova conversa"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600,
                  background: "rgba(234,179,8,0.15)", border: "1px solid rgba(234,179,8,0.3)",
                  color: "#EAB308", cursor: "pointer", lineHeight: 1.4,
                }}
              >
                <Plus size={10} /> Nova
              </button>
            )}
          </div>
          {sidebarCollapsed ? (
            withTooltip("Nova conversa",
              <div className="jc-nav-item" onClick={() => { onNewChat?.(); setSidebarOpen(false); }} role="button" tabIndex={0}>
                <Plus size={16} style={{ color: "#EAB308", flexShrink: 0 }} />
              </div>,
              "new_chat"
            )
          ) : (
            <div style={{ maxHeight: 200, overflowY: "auto", overflowX: "hidden", marginBottom: 4 }}>
              {chatSessions.length === 0 ? (
                <div style={{ padding: "8px 12px", fontSize: 11, color: "var(--text3)", fontStyle: "italic" }}>
                  Nenhuma conversa ainda
                </div>
              ) : chatSessions.map(s => {
                const isActive = s.id === activeSessionId;
                // Data + HORÁRIO (2.4): antes só a data; agora dd/mm HH:MM.
                const when = s.lastMessageAt ? new Date(s.lastMessageAt) : null;
                const dateStr = when ? when.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "";
                const timeStr = when ? when.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
                const dateTimeStr = when ? `${dateStr} ${timeStr}` : "";
                const handleDelete = (e: React.MouseEvent | React.KeyboardEvent) => {
                  e.stopPropagation();
                  if (!onDeleteSession) return;
                  if (window.confirm(`Excluir a conversa "${s.title}"? Esta ação não pode ser desfeita.`)) {
                    onDeleteSession(s.id);
                  }
                };
                const tooltipParts = [s.title];
                if (s.clientName) tooltipParts.push(`Cliente: ${s.clientName}`);
                if (s.preview) tooltipParts.push(`\n${s.preview}`);
                const tooltipText = tooltipParts.join("\n");
                return (
                  <div
                    key={s.id}
                    className={`jc-nav-item jc-session-item ${isActive ? "active" : ""}`}
                    onClick={() => { onSwitchSession?.(s.id); setSidebarOpen(false); }}
                    role="button"
                    tabIndex={0}
                    title={tooltipText}
                    style={{ gap: 8, alignItems: "flex-start", padding: "8px 10px" }}
                    onKeyDown={(e) => { if (e.key === "Enter") { onSwitchSession?.(s.id); setSidebarOpen(false); } }}
                  >
                    <MessageSquare size={13} style={{ color: isActive ? "#EAB308" : "var(--text3)", flexShrink: 0, marginTop: 2 }} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span className="jc-nav-label" style={{
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          fontSize: 12, fontWeight: 500, flex: 1, minWidth: 0,
                          color: isActive ? "#EAB308" : "var(--text1)",
                        }}>{s.title}</span>
                        <button
                          type="button"
                          className="jc-session-del"
                          onClick={handleDelete}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleDelete(e); }}
                          title="Excluir"
                          aria-label="Excluir"
                          style={{
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            background: "none", border: "none", cursor: "pointer", padding: 2,
                            color: "var(--text3)", flexShrink: 0, borderRadius: 4,
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      {/* Meta: status (2.4) + data/HORÁRIO. Status só aparece
                          quando derivável; senão fica só data + horário. */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {s.status && <StatusBadge status={s.status} />}
                        {dateTimeStr && (
                          <span style={{ fontSize: 9.5, color: "var(--text3)", flexShrink: 0 }}>{dateTimeStr}</span>
                        )}
                      </div>
                      {/* Cliente vinculado (2.4 — só exibição). Vazio quando não
                          há vínculo; não quebra o layout nesse caso. */}
                      {s.clientName && (
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          fontSize: 10, color: "var(--text2)", minWidth: 0,
                        }}>
                          <UserRound size={10} style={{ flexShrink: 0, color: "var(--text3)" }} />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {s.clientName}
                          </span>
                        </span>
                      )}
                      {s.preview && (
                        <span style={{
                          fontSize: 11, color: "var(--text2)", lineHeight: 1.4,
                          overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box",
                          WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                        }}>{s.preview}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="jc-section-label" style={{ marginTop: 8 }}>Sistema</div>
          {menuItems.filter(m => m.show).map(item => {
            // Renderiza um item folha (navegável). Reutilizado para itens de
            // topo e para os filhos de um grupo (ex.: "Configurações").
            const renderLeaf = (leaf: MenuItem, isChild: boolean) => {
              const activate = (source: "click" | "keyboard") => {
                trackUiEvent("nav_click", {
                  surface: "left_sidebar",
                  target_id: leaf.id,
                  target_label: leaf.label,
                  source,
                  collapsed: sidebarCollapsed,
                });
                leaf.action();
              };
              return withTooltip(leaf.label,
                <div
                  key={leaf.id}
                  className={cn("jc-nav-item", isChild && "jc-nav-subitem")}
                  onClick={() => activate("click")}
                  role="button"
                  tabIndex={0}
                  onFocus={(e) => {
                    if (e.target.matches(":focus-visible")) {
                      trackUiEvent("tab_navigate", {
                        surface: "left_sidebar",
                        target_id: leaf.id,
                        target_label: leaf.label,
                        collapsed: sidebarCollapsed,
                      });
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      trackUiEvent("key_activate", {
                        surface: "left_sidebar",
                        target_id: leaf.id,
                        target_label: leaf.label,
                        source: "keyboard",
                      });
                      activate("keyboard");
                    }
                  }}
                >
                  <leaf.icon size={16} style={{ color: leaf.color, flexShrink: 0 }} />
                  <span className="jc-nav-label">{leaf.label}</span>
                </div>,
                leaf.id
              );
            };

            // Grupo expansível (item com filhos), ex.: "Configurações".
            if (item.children && item.children.length > 0) {
              const visibleChildren = item.children.filter(c => c.show);
              if (visibleChildren.length === 0) return null;
              const expanded = !!expandedGroups[item.id];
              const submenuId = `jc-submenu-${item.id}`;
              const toggle = () => {
                trackUiEvent("nav_click", {
                  surface: "left_sidebar",
                  target_id: item.id,
                  target_label: item.label,
                  source: "click",
                  collapsed: sidebarCollapsed,
                });
                setExpandedGroups(prev => ({ ...prev, [item.id]: !prev[item.id] }));
              };
              return (
                <div key={item.id} className="jc-nav-group">
                  {withTooltip(item.label,
                    <button
                      type="button"
                      className={cn("jc-nav-item", "jc-nav-group-header", expanded && "expanded")}
                      onClick={toggle}
                      aria-expanded={expanded}
                      aria-controls={submenuId}
                    >
                      <item.icon size={16} style={{ color: item.color, flexShrink: 0 }} />
                      <span className="jc-nav-label">{item.label}</span>
                      <ChevronDown size={14} className="jc-nav-chevron" aria-hidden />
                    </button>,
                    item.id
                  )}
                  <div id={submenuId} className={cn("jc-nav-subwrap", expanded && "open")}>
                    <div className="jc-nav-subitems">
                      {visibleChildren.map(child => renderLeaf(child, true))}
                    </div>
                  </div>
                </div>
              );
            }

            return renderLeaf(item, false);
          })}
        </nav>

        {hasRole("tech") && (
        <div className="jc-agents-section" aria-label="Agentes ativos">
          <div className="jc-section-label">Agentes ({visibleAgents.length})</div>
          {visibleAgents.map(agent => {
            const statusLabel = agent.status === "active" ? "ativo" : agent.status === "alert" ? "em alerta" : "inativo";
            const dotActive = "#EAB308";
            const dotAlert = "#FACC15";
            const dotIdle = "rgba(255,255,255,0.28)";
            const fill = agent.status === "active" ? dotActive : agent.status === "alert" ? dotAlert : dotIdle;
            return (
              <DropdownMenu
                key={agent.uuid ?? `ext-${agent.id}`}
                onOpenChange={(open) => {
                  if (open) {
                    trackUiEvent("nav_click", {
                      surface: "left_sidebar",
                      target_id: `agent_menu_${agent.id}`,
                      target_label: agent.name,
                      collapsed: sidebarCollapsed,
                    });
                  }
                }}
              >
                {withTooltip(
                  `${agent.name} — ${statusLabel}`,
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="jc-agent-item"
                      aria-label={`${agent.name} (${statusLabel}). Abrir opções.`}
                    >
                      {(() => {
                        const hColor = getHierarchyColor(agent.role);
                        return (
                          <div className="jc-agent-avatar" style={{ background: `${hColor}1F`, color: hColor, border: `1px solid ${hColor}33` }}>
                            {getInitials(agent.name)}
                          </div>
                        );
                      })()}
                      <div className="jc-agent-name">{agent.name}</div>
                      <Circle size={6} className="jc-agent-status-dot" fill={fill} style={{ color: fill }} />
                    </button>
                  </DropdownMenuTrigger>,
                  `agent_${agent.id}`
                )}
                <DropdownMenuContent
                  side="right"
                  align="start"
                  sideOffset={10}
                  className={cn(
                    "min-w-[220px] border border-neutral-800 bg-neutral-950 text-neutral-100 shadow-2xl",
                    "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
                    "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=right]:slide-in-from-left-2"
                  )}
                >
                  <DropdownMenuItem
                    className="cursor-pointer gap-2 focus:bg-yellow-500/15 focus:text-yellow-50"
                    onSelect={() => {
                      if (!hasRole("tech")) {
                        toast.error("Apenas o usuário técnico pode configurar agentes.");
                        return;
                      }
                      if (!agent.uuid) {
                        toast.error("Aguarde a sincronização dos agentes com o servidor.");
                        return;
                      }
                      navigate(`/tech/agentes/${agent.uuid}`);
                    }}
                  >
                    <Settings size={14} className="opacity-80 shrink-0" />
                    Configurar agente
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-neutral-800" />
                  <DropdownMenuItem
                    className="cursor-pointer gap-2 focus:bg-yellow-500/15 focus:text-yellow-50"
                    onSelect={() => navigate("/organograma")}
                  >
                    <Network size={14} className="opacity-80 shrink-0" />
                    Ver no organograma
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })}
        </div>
        )}
      </div>
    </aside>
  );
}