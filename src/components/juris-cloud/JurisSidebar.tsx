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
  Search, Sparkles, Settings, Network, Circle,
} from "lucide-react";
import type { Agent, SidebarItem, MenuItem } from "./types";
import { DEPT_ICONS, getHierarchyColor, getInitials } from "./constants";

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
}: JurisSidebarProps) {
  const navigate = useNavigate();

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

          <div className="jc-section-label" style={{ marginTop: 8 }}>Sistema</div>
          {menuItems.filter(m => m.show).map(item => {
            const activate = (source: "click" | "keyboard") => {
              trackUiEvent("nav_click", {
                surface: "left_sidebar",
                target_id: item.id,
                target_label: item.label,
                source,
                collapsed: sidebarCollapsed,
              });
              item.action();
            };
            return withTooltip(item.label,
              <div
                key={item.id}
                className="jc-nav-item"
                onClick={() => activate("click")}
                role="button"
                tabIndex={0}
                onFocus={(e) => {
                  if (e.target.matches(":focus-visible")) {
                    trackUiEvent("tab_navigate", {
                      surface: "left_sidebar",
                      target_id: item.id,
                      target_label: item.label,
                      collapsed: sidebarCollapsed,
                    });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    trackUiEvent("key_activate", {
                      surface: "left_sidebar",
                      target_id: item.id,
                      target_label: item.label,
                      source: "keyboard",
                    });
                    activate("keyboard");
                  }
                }}
              >
                <item.icon size={16} style={{ color: item.color, flexShrink: 0 }} />
                <span className="jc-nav-label">{item.label}</span>
              </div>,
              item.id
            );
          })}
        </nav>

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
                      if (!hasRole("admin")) {
                        toast.error("Apenas administradores podem configurar agentes.");
                        return;
                      }
                      if (!agent.uuid) {
                        toast.error("Aguarde a sincronização dos agentes com o servidor.");
                        return;
                      }
                      navigate(`/admin/agentes/${agent.uuid}`);
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
      </div>
    </aside>
  );
}