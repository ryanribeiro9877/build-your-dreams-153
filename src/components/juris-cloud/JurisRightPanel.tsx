import React from "react";
import TaskQueuesPanel from "@/components/TaskQueuesPanel";
import {
  AlertTriangle, AlertCircle, CheckCircle, Info,
  Zap, BarChart3, Circle, ListTodo, FileText,
} from "lucide-react";
import type { Agent } from "./types";
import {
  PROCESSES, ALERTS, ROLE_ICONS,
  getCaseAreaChip, getAgentLoad, getTotalCapacity, getInitials, roleLabelsMap,
} from "./constants";

/* ── Alert Icon helper ── */
function AlertIcon({ type }: { type: string }) {
  const size = 14;
  if (type === "fatal") return <AlertTriangle size={size} style={{ color: "#FACC15" }} />;
  if (type === "warning") return <AlertCircle size={size} style={{ color: "#EAB308" }} />;
  if (type === "success") return <CheckCircle size={size} style={{ color: "#FEF9C3" }} />;
  return <Info size={size} style={{ color: "#FDE047" }} />;
}

export interface JurisRightPanelProps {
  rightPanelOpen: boolean;
  setRightPanelOpen: (open: boolean) => void;
  rightCollapsed: boolean;
  setRightCollapsed: (v: boolean) => void;
  rightTab: string;
  setRightTab: (tab: string) => void;
  allAgents: Agent[];
  visibleAgents: Agent[];
  visibility: { showCapacityPanel: boolean };
  hasRole: (role: string) => boolean;
}

export default function JurisRightPanel({
  rightPanelOpen,
  setRightPanelOpen,
  rightCollapsed,
  setRightCollapsed,
  rightTab,
  setRightTab,
  allAgents,
  visibleAgents,
  visibility,
  hasRole,
}: JurisRightPanelProps) {
  return (
    <>
      <aside
        id="jc-right-panel"
        className={`jc-right-panel ${rightPanelOpen ? "mobile-visible" : ""} ${rightCollapsed ? "collapsed" : ""}`}
        aria-label="Central de operações"
      >
        <div className="jc-right-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Central de Operações</span>
        </div>
        <div className="jc-right-tabs">
          {[
            { id: "filas", label: "Filas", icon: ListTodo },
            { id: "processos", label: "Processos", icon: FileText },
            { id: "alertas", label: "Alertas", icon: AlertTriangle },
            ...(hasRole("tech") ? [{ id: "agentes", label: "Agentes", icon: Zap }] : []),
          ].map(tab => (
            <div key={tab.id} className={`jc-right-tab ${rightTab === tab.id ? "active" : ""}`} onClick={() => setRightTab(tab.id)}>
              <tab.icon size={12} /> {tab.label}
            </div>
          ))}
        </div>
        <div className="jc-right-body">
          {rightTab === "filas" && <TaskQueuesPanel />}

          {rightTab === "processos" && (
            <>
              <div style={{ fontSize: 10, color: "var(--text3)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
                {PROCESSES.length} processos ativos
              </div>
              {PROCESSES.map(p => (
                <div className="jc-case-card" key={p.id}>
                  <div className="jc-case-num">Proc. #{p.id} · {p.tribunal}</div>
                  <div className="jc-case-name">{p.client}</div>
                  <div className="jc-case-row">
                    <span style={{
                      fontSize: 10, padding: "2px 7px", borderRadius: 4,
                      ...getCaseAreaChip(p.area),
                    }}>{p.area}</span>
                    <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "#FACC15", fontWeight: 600 }}>{p.value}</span>
                  </div>
                  <div className="jc-case-prazo-row">
                    <span style={{ color: p.prazo === "HOJE" ? "#FACC15" : "var(--text3)", display: "flex", alignItems: "center", gap: 3 }}>
                      {p.prazo === "HOJE" ? <><AlertTriangle size={10} /> Prazo HOJE</> : <>Prazo em {p.prazo}</>}
                    </span>
                    <div style={{ flex: 1 }} />
                    <span className={`jc-process-badge ${p.status}`}>{p.status}</span>
                  </div>
                </div>
              ))}
            </>
          )}

          {rightTab === "alertas" && (
            <>
              <div style={{ fontSize: 10, color: "var(--text3)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
                {ALERTS.length} alertas
              </div>
              {ALERTS.map((a, i) => (
                <div key={i} className={`jc-alert-item ${a.type}`}>
                  <AlertIcon type={a.type} />
                  <div className="jc-alert-text">{a.text}</div>
                  <div className="jc-alert-time">{a.time}</div>
                </div>
              ))}
            </>
          )}

          {rightTab === "agentes" && (() => {
            const capacity = getTotalCapacity(allAgents);
            return (
              <>
                {visibility.showCapacityPanel && (
                  <div style={{ fontSize: 10, color: "var(--text2)", marginBottom: 8, padding: 8, background: "var(--bg4)", borderRadius: 6, border: "1px solid var(--border)" }}>
                    <div style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                      <BarChart3 size={12} /> Capacidade: {capacity.used}/{capacity.total} ({capacity.percentage}%)
                    </div>
                    <div style={{ background: "var(--bg)", borderRadius: 4, height: 6, overflow: "hidden" }}>
                      <div style={{ width: `${capacity.percentage}%`, height: "100%", borderRadius: 4, background: capacity.percentage > 80 ? "#CA8A04" : capacity.percentage > 50 ? "#EAB308" : "#FACC15", transition: "width 0.55s var(--panel-ease)" }} />
                    </div>
                  </div>
                )}
                <div style={{ fontSize: 10, color: "var(--gold)", marginBottom: 8 }}>
                  {visibleAgents.length} agentes visíveis
                </div>
                {visibleAgents.map(agent => {
                  const load = getAgentLoad(agent);
                  const RoleIcon = ROLE_ICONS[agent.role] || Zap;
                  return (
                    <div key={agent.id} className="jc-agent-card-rp">
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 9,
                          background: `${agent.color}18`, color: agent.color,
                          border: `1px solid ${agent.color}25`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11, fontWeight: 700, fontFamily: "var(--font-body)", flexShrink: 0
                        }}>{getInitials(agent.name)}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text1)", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{agent.name}</div>
                          <div style={{ fontSize: 9, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 4 }}>
                            <RoleIcon size={10} /> {roleLabelsMap[agent.role] || agent.role}
                          </div>
                        </div>
                        <Circle size={8}
                          fill={agent.status === "active" ? "#EAB308" : agent.status === "alert" ? "#FACC15" : "rgba(255,255,255,0.28)"}
                          style={{ color: agent.status === "active" ? "#EAB308" : agent.status === "alert" ? "#FACC15" : "rgba(255,255,255,0.28)" }} />
                      </div>
                      <div style={{ background: "var(--bg)", borderRadius: 4, height: 4, marginBottom: 6, overflow: "hidden" }}>
                        <div style={{ width: `${load}%`, height: "100%", borderRadius: 4, background: load > 80 ? "#CA8A04" : load > 50 ? "#EAB308" : "#FACC15", transition: "width 0.55s var(--panel-ease)" }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 9, color: "var(--text3)" }}>Carga: {load}% · {agent.currentTasks}/{agent.maxConcurrentTasks}</span>
                      </div>
                    </div>
                  );
                })}
              </>
            );
          })()}
        </div>
      </aside>

      {/* Mobile overlay for right panel */}
      {rightPanelOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 45, background: "rgba(0,0,0,0.4)" }}
          onClick={() => {
            setRightPanelOpen(false);
            setRightCollapsed(true);
          }}
          aria-hidden="true"
        />
      )}
    </>
  );
}
