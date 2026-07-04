import React from "react";
import { useNavigate } from "react-router-dom";
import { NotificationCenter } from "@/components/NotificationCenter";
import {
  Menu, AlertCircle,
  ClipboardList, ShieldCheck, KanbanSquare,
} from "lucide-react";
import { DEPT_ICONS } from "./constants";

export interface JurisTopBarProps {
  activeDeptData: { id: string; label: string; color: string; badge: number } | undefined;
  setSidebarOpen: (open: boolean) => void;
  user: { email?: string | null; user_metadata?: { display_name?: string } } | null;
  inboxCount: { total: number; overdue: number };
  validationCount: number;
  isReadOnly: boolean;
  roleLabel: string;
  entryAgentId: string | null;
  agentsLoading: boolean;
  showWelcome: boolean;
}

export default function JurisTopBar({
  activeDeptData,
  setSidebarOpen,
  user,
  inboxCount,
  validationCount,
  isReadOnly,
  roleLabel,
  entryAgentId,
  agentsLoading,
  showWelcome,
}: JurisTopBarProps) {
  const navigate = useNavigate();
  const DeptIcon = DEPT_ICONS[activeDeptData?.id || ""] || DEPT_ICONS.assistente;

  return (
    <>
      <header className="jc-topbar">
        <button type="button" className="jc-hamburger" onClick={() => setSidebarOpen(true)} aria-label="Abrir menu">
          <Menu size={20} />
        </button>
        <div className="jc-topbar-brand">
          <div className="jc-dept-title" style={{ color: activeDeptData?.color }}>
            <DeptIcon size={20} className="jc-dept-icon" aria-hidden />
            <span className="jc-dept-title-text">{activeDeptData?.label}</span>
          </div>
        </div>
        <div className="jc-topbar-trailing">
          {validationCount > 0 && (
            <button
              type="button"
              className="jc-btn-team-list"
              onClick={() => navigate("/sistema/validar")}
              title="Fila de validação de cadastros"
              style={{ position: "relative" }}
            >
              <ShieldCheck size={15} strokeWidth={2.5} />
              Validar
              <span style={{
                position: "absolute", top: -4, right: -4,
                minWidth: 18, height: 18, padding: "0 5px",
                borderRadius: 9, background: "#a855f7", color: "#ffffff",
                fontSize: 10, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {validationCount}
              </span>
            </button>
          )}

          <button
            type="button"
            className="jc-btn-team-list"
            onClick={() => navigate("/sistema/tarefas")}
            title="Minhas tarefas"
            style={{ position: "relative" }}
          >
            <ClipboardList size={15} strokeWidth={2.5} />
            Tarefas
            {inboxCount.total > 0 && (
              <span style={{
                position: "absolute", top: -4, right: -4,
                minWidth: 18, height: 18,
                padding: "0 5px",
                borderRadius: 9,
                background: inboxCount.overdue > 0 ? "#ef4444" : "#eab308",
                color: "#0a0a12",
                fontSize: 10, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {inboxCount.total}
              </span>
            )}
          </button>

          {/* Kanban: disponível a todos os autenticados (o board filtra acesso por
              quadro via kanban_can_access_board; só admin configura/cria quadros). */}
          <button
            type="button"
            className="jc-btn-team-list"
            onClick={() => navigate("/sistema/kanban")}
            title="Kanban"
          >
            <KanbanSquare size={15} strokeWidth={2.5} />
            Kanban
          </button>

          <NotificationCenter />

          <div className="jc-user-chip" onClick={() => navigate("/perfil")} title="Meu Perfil" role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("/perfil"); } }}>
            <div className="jc-user-avatar">{(user?.email || "U")[0].toUpperCase()}</div>
            <div className="jc-user-name">{user?.user_metadata?.display_name || user?.email?.split("@")[0] || "Usuário"}</div>
          </div>
        </div>
      </header>

      {!entryAgentId && !agentsLoading && !showWelcome && (
        <div className="jc-onboarding-banner" role="status">
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong>Configure um agente antes da primeira mensagem.</strong>
            <span style={{ display: "block", fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
              Cadastre sua chave em Configurações &rarr; Provedores, depois vá em Admin &rarr; Agentes e ative provedor + modelo no CEO JurisAI.
            </span>
          </div>
          <button
            type="button"
            onClick={() => navigate("/tech/providers")}
            className="jc-onboarding-cta"
          >
            Configurar agora
          </button>
        </div>
      )}
    </>
  );
}
