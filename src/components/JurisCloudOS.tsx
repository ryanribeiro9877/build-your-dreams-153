import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import CreateEmployee from "@/pages/CreateEmployee";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useAgents } from "@/hooks/useAgents";
import { useInboxCount, createChatTask } from "@/hooks/useUserTasks";
import { useMyWorkspace, STAGE_LABELS, AREA_LABELS, type WorkspaceAgent } from "@/hooks/useMyWorkspace";
import { isDashboardRole, isSocioRole, isRecepcaoRole } from "@/components/DashboardRoute";
import { isPecaAuthor } from "@/lib/pecaAccess";
import { useChatOrchestrator, friendlyError } from "@/hooks/useChatOrchestrator";
import { cancelRun } from "@/hooks/useActionConfirm";
import { ingestChatAttachments } from "@/lib/ingestChatAttachments";
import { useRealtimeNotifications } from "@/hooks/useRealtimeNotifications";
import { useBottleneckDetection } from "@/hooks/useBottleneckDetection";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { trackUiEvent } from "@/lib/uiTracking";
import {
  Sparkles, Crown, Users, BarChart3, Network, Activity, User, LogOut,
  Bot, Clock, Settings, Upload, UserPlus, Coins, CalendarDays, Scale, FlaskConical,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Sub-components
import JurisSidebar from "./juris-cloud/JurisSidebar";
import JurisTopBar from "./juris-cloud/JurisTopBar";
import JurisChatPanel from "./juris-cloud/JurisChatPanel";
import TechActingAsBar from "./juris-cloud/TechActingAsBar";
import { useTechTest, type TestableSector } from "@/hooks/useTechTest";

// Shared constants & types
import type { Agent, JcChatMessage, SidebarItem, MenuItem, PendingMeeting, ReuniaoDraft, PendingTask, TarefaDraft } from "./juris-cloud/types";
import { parseAgentPermissions } from "./juris-cloud/types";
import { createMeeting } from "@/hooks/useMeetings";
import { EMPTY_FORM, type ClientFormValues } from "@/components/clients/shared";
import { deriveLiveStage } from "./juris-cloud/liveStatus";
import { applyRunPatch, type RunState } from "./juris-cloud/runStates";
import { deriveConversationStatus } from "./juris-cloud/sessionStatus";
import {
  ACCENT, ACCENT_SOFT,
  DEPARTMENTS, AGENTS_FALLBACK,
  getTokenCost, formatTokenRefundMessage, formatInsufficientBalanceMessage,
  getAgentsForDepartment, toLegacyAgent,
} from "./juris-cloud/constants";

// Rótulo de hora (HH:MM pt-BR) para mensagens locais injetadas no chat.
const nowLabel = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/* ─────────────────────────────────────────────────────────────
   JURISAI  –  Sua força de trabalho de IA jurídica
   Orchestrator — composes sidebar, topbar, chat, right panel.
───────────────────────────────────────────────────────────── */

// Orçamento de tokens do Canal A — DEVE bater com MAX_CASE_TOKENS da edge
// function chat-orchestrator. Acima disto, o servidor resume (lossy) os anexos;
// o cliente avisa o usuário antes de gerar (Mudança 4C). ~4 chars/token.
const CLIENT_MAX_CASE_TOKENS = 200000;

// V11: tema único — GlobalStyles não precisa mais receber prop.
const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,600;0,7..72,700;1,7..72,400&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=League+Spartan:wght@400;600;700;800&family=Roboto:wght@700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --font-disp: 'Literata', Georgia, 'Times New Roman', serif;
      --font-body: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
      --font-mono: 'Plus Jakarta Sans', system-ui, sans-serif;
      --font-brand: 'Roboto', system-ui, -apple-system, sans-serif;
      --font-spartan: 'League Spartan', 'Plus Jakarta Sans', system-ui, sans-serif;
      --gold: #EAB308; --gold2: #FACC15;
      --theme-transition: 0.42s cubic-bezier(0.22, 1, 0.36, 1);
      --panel-ease: cubic-bezier(0.22, 1, 0.36, 1);
    }
    :root {
      --bg: #09090f; --bg2: #11111a; --bg3: #16161f; --bg4: #1c1c28;
      --border: #25253a; --border2: #34344d;
      --card-border: #25253a;
      --card-border-hover: #3a3a55;
      --text1: #eeeef5; --text2: #c4c4d4; --text3: #7a7a92;
      --logo-text: #0a0a12;
      --user-bubble-bg: rgba(234,179,8,0.08); --user-bubble-border: rgba(234,179,8,0.22);
      --badge-bg: rgba(255,255,255,0.06);
    }
    body, .jc-root, .jc-sidebar, .jc-main, .jc-topbar, .jc-right-panel,
    .jc-input-area, .jc-msg-bubble, .jc-case-card, .jc-alert-item,
    .jc-nav-item, .jc-input-row, .jc-cmd, .jc-user-chip,
    .jc-agent-item, .jc-right-tab, .jc-agents-section {
      transition: background-color var(--theme-transition), border-color var(--theme-transition),
                  color var(--theme-transition), box-shadow var(--theme-transition);
    }
    body { background: var(--bg); color: var(--text1); font-family: var(--font-body); }
    .jc-root { display: flex; height: 100vh; overflow: hidden; background: var(--bg); }
    .jc-create-employee-overlay {
      position: fixed; inset: 0; z-index: 200;
      background: rgba(9, 9, 15, 0.94);
      overflow-y: auto;
      backdrop-filter: blur(4px);
    }
    .jc-sidebar {
      width: 184px; min-width: 184px; background: var(--bg2);
      border-right: 1px solid var(--border);
      display: flex; flex-direction: column;
      overflow-x: visible; overflow-y: hidden;
      transition: width 0.38s var(--panel-ease), min-width 0.38s var(--panel-ease), transform 0.35s ease;
      position: relative; z-index: 6;
    }
    .jc-sidebar-body { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
    .jc-sidebar.collapsed { width: 0; min-width: 0; overflow: hidden; border-right-color: transparent; }
    .jc-sidebar.collapsed .jc-logo-info, .jc-sidebar.collapsed .jc-search,
    .jc-sidebar.collapsed .jc-section-label, .jc-sidebar.collapsed .jc-nav-label,
    .jc-sidebar.collapsed .jc-nav-badge, .jc-sidebar.collapsed .jc-agent-name { display: none; }
    .jc-sidebar.collapsed .jc-logo { padding: 16px 12px; justify-content: center; }
    .jc-sidebar.collapsed .jc-nav-item { justify-content: center; padding: 10px 8px; }
    .jc-sidebar.collapsed .jc-agent-item { justify-content: center; padding: 6px 4px; }
    .jc-sidebar.collapsed .jc-agents-section { padding: 6px 4px; }
    .jc-sidebar.collapsed .jc-agent-status-dot { display: none; }
    .jc-sidebar-toggle {
      position: fixed; top: 78px; left: 188px; z-index: 50;
      width: 32px; height: 56px; border-radius: 999px;
      background: rgba(28, 28, 40, 0.42); border: 1.5px solid rgba(234,179,8,0.32);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; color: rgba(234, 179, 8, 0.88); opacity: 0.92;
      transition: transform 220ms cubic-bezier(0.4, 0, 0.2, 1), left 0.38s var(--panel-ease),
        top 0.38s var(--panel-ease), background 220ms ease, border-color 220ms ease,
        box-shadow 220ms ease, color 220ms ease, opacity 220ms ease;
      box-shadow: 0 6px 18px rgba(0,0,0,0.35), 0 0 0 1px rgba(234,179,8,0.08);
      overflow: hidden; line-height: 0; flex-shrink: 0;
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
    }
    .jc-sidebar-toggle.is-collapsed { left: 12px; }
    /* Barra "Atuar como" (tech): é o 1º elemento do main e cai na mesma faixa
       vertical do jc-sidebar-toggle (position:fixed, top:78px). Recuo o conteúdo
       à esquerda p/ o botão de recolher não sobrepor o rótulo — nos dois estados
       (expandido o toggle invade ~36px do main; recolhido ~44px). No mobile o
       toggle some (display:none) e o recuo volta ao normal (ver @media 768px). */
    .jc-acting-as-bar { padding: 8px 16px 8px 64px; }
    .jc-sidebar-toggle::before {
      content: ""; position: absolute; inset: 0; border-radius: inherit;
      background: radial-gradient(ellipse at center, rgba(234,179,8,0.18) 0%, rgba(234,179,8,0) 70%);
      opacity: 0; transition: opacity 220ms ease; pointer-events: none;
    }
    .jc-sidebar-toggle:hover {
      opacity: 1; color: var(--gold); border-color: rgba(234,179,8,0.72);
      background: rgba(28, 28, 40, 0.62); transform: translateX(2px);
      box-shadow: 0 8px 22px rgba(0,0,0,0.45), 0 0 0 2px rgba(234,179,8,0.18);
    }
    .jc-sidebar-toggle:hover::before { opacity: 1; }
    .jc-sidebar-toggle:active { transform: translateX(2px) scale(0.96); }
    .jc-sidebar-toggle:focus-visible, .jc-right-toggle-desk:focus-visible,
    .jc-nav-item:focus-visible, .jc-agent-item:focus-visible {
      outline: 2px solid var(--gold); outline-offset: 2px; box-shadow: 0 0 0 4px rgba(234,179,8,0.18);
    }
    .jc-toggle-arrow {
      width: 14px; height: 14px; user-select: none; display: flex;
      align-items: center; justify-content: center;
      transition: transform 220ms cubic-bezier(0.4, 0, 0.2, 1);
    }
    .jc-toggle-arrow svg { width: 100%; height: 100%; display: block; }
    .jc-sidebar-toggle.is-collapsed .jc-toggle-arrow { transform: rotate(180deg); }
    .jc-right-toggle-desk.is-collapsed .jc-toggle-arrow { transform: rotate(180deg); }
    .jc-sr-only {
      position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
      overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
    }
    .jc-logo {
      padding: 18px 14px 14px; border-bottom: 1px solid var(--border);
      display: flex; align-items: center; gap: 10px;
    }
    .jc-sidebar:not(.collapsed) .jc-logo { padding-right: 14px; }
    .jc-sidebar.collapsed .jc-logo { padding-left: 10px; padding-right: 12px; }
    .jc-logo-mark {
      width: 30px; height: 30px; min-width: 30px;
      background: linear-gradient(145deg, var(--gold) 0%, var(--gold2) 100%);
      border-radius: 8px; display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; color: var(--logo-text);
      font-family: var(--font-spartan); font-size: 16px; font-weight: 800;
      line-height: 1; letter-spacing: -0.03em; padding-top: 1px;
      box-shadow: 0 2px 8px rgba(234, 179, 8, 0.2); user-select: none;
    }
    .jc-logo-text {
      font-family: var(--font-brand); font-size: 22px; font-weight: 700;
      letter-spacing: 0.02em; line-height: 1; color: #ffffff;
      text-shadow: none; transition: opacity var(--theme-transition);
    }
    .jc-logo-text.offline { opacity: 0.85; }
    .jc-logo-sub { font-size: 9px; color: var(--text3); letter-spacing: 0.12em; text-transform: uppercase; font-weight: 600; }
    .jc-search {
      margin: 12px 12px 8px; background: var(--bg3); border: 1px solid var(--border);
      border-radius: 8px; padding: 8px 12px; display: flex; align-items: center; gap: 8px;
    }
    .jc-search:hover { border-color: var(--border2); }
    .jc-search input {
      background: none; border: none; outline: none;
      font-family: var(--font-body); font-size: 12px; color: var(--text2); width: 100%;
    }
    .jc-search input::placeholder { color: var(--text3); }
    .jc-nav { flex: 1; overflow-y: auto; padding: 4px 8px 8px; }
    .jc-nav::-webkit-scrollbar { width: 4px; }
    .jc-nav::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 4px; }
    .jc-section-label {
      font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase;
      color: var(--text3); padding: 12px 8px 4px; font-weight: 600;
    }
    .jc-nav-item {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 10px; border-radius: 8px; cursor: pointer;
      transition: background 0.15s; margin-bottom: 1px;
    }
    .jc-nav-item:hover { background: var(--bg4); }
    .jc-nav-item.active { background: rgba(234,179,8,0.08); border: 1px solid rgba(234,179,8,0.15); }
    /* Cabeçalho do grupo é um <button>: zera o estilo nativo do botão */
    .jc-nav-group-header {
      width: 100%; background: transparent; border: none;
      font-family: inherit; color: var(--text1); text-align: left;
    }
    .jc-nav-group-header.expanded { background: var(--bg3); }
    .jc-nav-chevron { margin-left: auto; flex-shrink: 0; transition: transform 0.3s ease; }
    .jc-nav-group-header.expanded .jc-nav-chevron { transform: rotate(180deg); }
    /* Slide suave via CSS grid (0fr -> 1fr). O filho direto PRECISA de
       overflow:hidden + min-height:0 para colapsar de fato. Espaçamento
       vertical fica em padding (dentro do overflow) para não "pular". */
    .jc-nav-subwrap {
      display: grid; grid-template-rows: 0fr;
      transition: grid-template-rows 0.3s ease;
    }
    .jc-nav-subwrap.open { grid-template-rows: 1fr; }
    .jc-nav-subitems {
      overflow: hidden; min-height: 0;
      display: flex; flex-direction: column;
      margin-left: 8px; padding: 2px 0 4px 8px;
      border-left: 1px solid var(--border);
      opacity: 0; transition: opacity 0.3s ease;
    }
    .jc-nav-subwrap.open .jc-nav-subitems { opacity: 1; }
    .jc-nav-subitem { padding-left: 10px; }
    @media (prefers-reduced-motion: reduce) {
      .jc-nav-subwrap, .jc-nav-subitems, .jc-nav-chevron { transition: none; }
    }
    .jc-sidebar.collapsed .jc-nav-chevron { display: none; }
    .jc-sidebar.collapsed .jc-nav-subitems { margin-left: 0; padding-left: 0; border-left: none; }
    .jc-sidebar.collapsed .jc-nav-subitem { padding-left: 8px; }
    .jc-session-del { opacity: 0; transition: opacity 0.15s, color 0.15s, background 0.15s; }
    .jc-session-item:hover .jc-session-del, .jc-session-item:focus-within .jc-session-del { opacity: 0.7; }
    .jc-session-del:hover { opacity: 1 !important; color: #ef4444 !important; background: rgba(239,68,68,0.12) !important; }
    .jc-nav-label { font-size: 13px; font-weight: 400; color: var(--text1); flex: 1; }
    .jc-nav-label--brand { font-family: var(--font-spartan); font-weight: 700; letter-spacing: -0.01em; font-size: 14px; }
    .jc-nav-badge {
      font-size: 10px; font-family: var(--font-mono);
      background: var(--badge-bg); border-radius: 10px;
      padding: 1px 7px; color: var(--text2); min-width: 22px; text-align: center;
    }
    .jc-nav-badge.alert { background: rgba(234,179,8,0.16); color: #FEF08A; border: 1px solid rgba(234,179,8,0.35); }
    .jc-agents-section {
      padding: 8px; border-top: 1px solid var(--border); flex-shrink: 0;
      max-height: 38vh; overflow-x: visible; overflow-y: auto;
    }
    .jc-agent-item {
      display: flex; align-items: center; gap: 8px; width: 100%;
      border: none; background: transparent; font: inherit; color: inherit; text-align: left;
      padding: 6px 8px; border-radius: 8px; cursor: pointer; position: relative; z-index: 0;
      transition: transform 0.22s ease, background 0.2s ease, box-shadow 0.22s ease;
    }
    .jc-agents-section .jc-agent-item:hover {
      background: var(--bg3); transform: scale(1.045); z-index: 2;
      box-shadow: 0 10px 28px rgba(0,0,0,0.38);
    }
    .jc-agent-avatar {
      width: 26px; height: 26px; border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      font-size: 9px; font-weight: 700; font-family: var(--font-body); flex-shrink: 0;
    }
    .jc-agent-name { font-size: 11px; color: var(--text2); flex: 1; line-height: 1.2; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    .jc-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; position: relative; z-index: 1; }
    .jc-topbar {
      min-height: 52px; height: auto; background: var(--bg2);
      border-bottom: 1px solid var(--border); display: flex; flex-wrap: wrap;
      align-items: center; padding: 10px 16px 12px; gap: 10px 12px; box-sizing: border-box;
    }
    .jc-topbar-brand { flex: 1 1 160px; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .jc-dept-title {
      font-family: var(--font-spartan); font-size: clamp(15px, 2.4vw, 20px); font-weight: 700;
      letter-spacing: -0.01em; color: var(--text1); display: flex; align-items: center;
      gap: 8px; min-width: 0; line-height: 1.2;
    }
    .jc-dept-icon { flex-shrink: 0; }
    .jc-dept-title-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .jc-dept-sub { font-size: 11px; color: var(--text3); letter-spacing: 0.08em; text-transform: uppercase; font-weight: 600; }
    .jc-topbar-trailing {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end;
      gap: 8px 10px; flex: 1 1 220px; min-width: 0;
    }
    .jc-user-chip {
      display: flex; align-items: center; gap: 8px; padding: 4px 12px 4px 4px;
      background: var(--bg3); border: 1px solid var(--border); border-radius: 20px; cursor: pointer;
    }
    .jc-user-avatar {
      width: 26px; height: 26px; border-radius: 50%;
      background: linear-gradient(135deg, var(--gold), var(--gold2));
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 700; color: var(--logo-text); font-family: var(--font-disp);
    }
    .jc-user-name { font-size: 12px; color: var(--text1); }
    .jc-btn-create-user {
      display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px;
      border: 1px solid rgba(234, 179, 8, 0.5); cursor: pointer; font-family: var(--font-body);
      font-size: 12px; font-weight: 700; color: #0a0a12;
      background: linear-gradient(145deg, var(--gold) 0%, var(--gold2) 100%);
      box-shadow: 0 0 16px rgba(234, 179, 8, 0.28); flex-shrink: 0;
      transition: filter 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
    }
    .jc-btn-create-user:hover { filter: brightness(1.08); transform: translateY(-1px); box-shadow: 0 0 20px rgba(234, 179, 8, 0.4); }
    .jc-btn-team-list {
      display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px;
      border: 1px solid rgba(234, 179, 8, 0.45); cursor: pointer; font-family: var(--font-body);
      font-size: 12px; font-weight: 600; color: #facc15; background: rgba(234, 179, 8, 0.08);
      flex-shrink: 0; transition: filter 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
    }
    .jc-btn-team-list:hover { filter: brightness(1.08); transform: translateY(-1px); box-shadow: 0 0 16px rgba(234, 179, 8, 0.28); }
    .jc-onboarding-banner {
      display: flex; align-items: center; gap: 12px; margin: 10px 16px 0; padding: 12px 14px;
      background: rgba(234,179,8,0.08); border: 1px solid rgba(234,179,8,0.30);
      border-radius: 12px; color: var(--text1); font-size: 13px;
    }
    .jc-onboarding-cta {
      background: var(--gold); color: var(--logo-text); border: none; border-radius: 8px;
      padding: 8px 14px; font-weight: 600; font-size: 12px; cursor: pointer;
      transition: filter 0.15s; white-space: nowrap;
    }
    .jc-onboarding-cta:hover { filter: brightness(1.1); }
    .jc-messages { flex: 1; overflow-y: auto; padding: 24px 0; scroll-behavior: smooth; }
    .jc-messages::-webkit-scrollbar { width: 4px; }
    .jc-messages::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
    .jc-msg-wrap {
      display: flex; gap: 12px; padding: 8px 32px; max-width: 960px; margin: 0 auto;
      animation: fadeUp 0.3s ease both;
    }
    @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    .jc-msg-wrap.user { flex-direction: row-reverse; }
    .jc-msg-avatar {
      width: 32px; height: 32px; min-width: 32px; border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 700; font-family: var(--font-body);
    }
    .jc-msg-bubble {
      /* Dimensionamento por CARACTERE, não por fração do pai. width:fit-content
         faz o balão medir SÓ o conteúdo; o teto é 70ch (~80 caracteres reais em
         Plus Jakarta Sans 14px cabem numa linha; medido: 80 chars ≈ 65-69ch),
         limitado a 75vw em telas estreitas.
         POR QUE ch/vw e NÃO %: um max-width em % é resolvido contra a largura do
         wrapper-coluna pai — que por sua vez é derivada do conteúdo do balão
         (dependência circular) e pode colapsar (o pai tem min-width:0). Quando
         isso acontecia, 88% virava ~2px e o max-width FURAVA o piso do
         min-content, forçando "físi/ca" e "1234/5678/910". ch/vw não dependem do
         pai: curto NUNCA quebra; só passa de ~80 caracteres quebra, no espaço. */
      width: fit-content; max-width: min(70ch, 75vw);
      background: var(--bg3); border: 1px solid var(--border);
      border-radius: 12px; padding: 14px 16px; font-size: 14px; line-height: 1.7; color: var(--text1);
      /* Quebra só palavras REALMENTE longas (URLs/tokens) quando não couberem;
         nunca corta no meio de palavras curtas. break-all quebraria sempre. */
      white-space: normal; overflow-wrap: break-word; word-break: normal; hyphens: none;
    }
    /* Mensagem do usuário: balão encostado à direita (junto do avatar). Como o
       balão agora é fit-content, sem isto ele ficaria alinhado à esquerda da coluna. */
    .jc-msg-wrap.user .jc-msg-bubble {
      background: var(--user-bubble-bg); border-color: var(--user-bubble-border);
      align-self: flex-end;
    }
    /* ── ActionCard — proposta de ação (cadastro etc.), visual "Modelo B" ──
       Quadro âmbar destacado, campos rotulados um a um com faixas escuras
       alternadas e botões com hover/clique. */
    .action-card {
      max-width: 560px; margin: 10px 32px; overflow: hidden;
      background: var(--bg2, #16161f);
      border: 1px solid rgba(234,179,8,0.45); border-radius: 14px;
      box-shadow: 0 0 0 1px rgba(234,179,8,0.06), 0 10px 26px rgba(0,0,0,0.38);
      animation: fadeUp 0.3s ease both;
    }
    .action-card__head {
      display: flex; align-items: center; gap: 8px; padding: 12px 16px;
      background: rgba(234,179,8,0.10); border-bottom: 1px solid rgba(234,179,8,0.28);
      font-family: var(--font-body); font-weight: 700; font-size: 13px; color: #FACC15;
      letter-spacing: 0.02em;
    }
    .action-card__note {
      padding: 8px 16px 0; font-size: 11.5px; color: var(--text3, #8a8a99); line-height: 1.4;
    }
    .action-card__fields { display: flex; flex-direction: column; padding: 4px 0; }
    .action-card__row {
      display: flex; gap: 12px; align-items: baseline; padding: 9px 16px;
    }
    /* Faixa escura contrastante alternada entre os campos. */
    .action-card__row:nth-child(odd) { background: rgba(0,0,0,0.28); }
    .action-card__label {
      min-width: 96px; flex-shrink: 0; color: var(--text3, #8a8a99);
      font-family: var(--font-body); font-size: 10.5px; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.05em;
    }
    .action-card__value {
      flex: 1; min-width: 0; color: var(--text1, #e4e4e7); font-size: 13.5px; font-weight: 500;
      overflow-wrap: break-word; word-break: normal;
    }
    .action-card__desc {
      padding: 12px 16px; font-size: 13.5px; color: var(--text1, #e4e4e7);
      line-height: 1.5; white-space: pre-wrap; overflow-wrap: break-word; word-break: normal;
    }
    .action-card__actions {
      display: flex; gap: 10px; padding: 12px 16px;
      border-top: 1px solid var(--border, rgba(255,255,255,0.08));
    }
    .action-card__btn {
      flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      padding: 10px 16px; border-radius: 10px; border: 1px solid transparent;
      font-family: var(--font-body); font-size: 13px; font-weight: 700; cursor: pointer;
      transition: filter .15s ease, transform .1s ease, box-shadow .15s ease, background .15s ease, border-color .15s ease;
    }
    .action-card__btn:disabled { opacity: 0.55; cursor: not-allowed; }
    .action-card__btn--primary {
      background: var(--gold, #EAB308); color: var(--logo-text, #1a1a10); border-color: rgba(234,179,8,0.6);
    }
    .action-card__btn--primary:not(:disabled):hover { filter: brightness(1.08); transform: translateY(-1px); box-shadow: 0 0 18px rgba(234,179,8,0.38); }
    .action-card__btn--primary:not(:disabled):active { transform: translateY(0) scale(0.98); filter: brightness(0.94); box-shadow: none; }
    .action-card__btn--ghost {
      background: rgba(255,255,255,0.04); color: var(--text2, #cbd5e1); border-color: rgba(148,163,184,0.35);
    }
    .action-card__btn--ghost:not(:disabled):hover { background: rgba(255,255,255,0.09); border-color: rgba(148,163,184,0.6); transform: translateY(-1px); }
    .action-card__btn--ghost:not(:disabled):active { transform: translateY(0) scale(0.98); background: rgba(255,255,255,0.05); }
    .action-card--done {
      max-width: 560px; margin: 10px 32px; padding: 12px 16px;
      display: flex; align-items: center; gap: 8px;
      background: rgba(234,179,8,0.06); border: 1px solid rgba(234,179,8,0.25); border-radius: 12px;
      font-size: 13px; color: var(--text2, #cbd5e1); line-height: 1.45;
    }
    .jc-msg-meta {
      font-size: 10px; color: var(--text3); margin-bottom: 4px;
      font-family: var(--font-body); display: flex; align-items: center; gap: 6px;
    }
    .jc-msg-meta .agent-tag {
      font-size: 10px; padding: 2px 8px; border-radius: 4px;
      background: rgba(234,179,8,0.12); color: var(--gold); border: 1px solid rgba(234,179,8,0.28);
      font-family: var(--font-body); font-weight: 500; letter-spacing: 0.02em;
    }
    .jc-msg-text b, .jc-msg-text strong { color: var(--gold2); font-weight: 600; }
    .jc-card-processes { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }
    .jc-process-row {
      background: var(--bg2); border: 1px solid var(--border); border-radius: 10px;
      padding: 11px 14px; display: flex; align-items: center; gap: 12px; cursor: pointer; transition: all 0.2s;
    }
    .jc-process-row:hover { border-color: var(--border2); background: var(--bg3); }
    .jc-process-id { font-family: var(--font-body); font-size: 10px; color: var(--text3); min-width: 72px; }
    .jc-process-client { font-size: 12.5px; font-weight: 500; flex: 1; color: var(--text1); }
    .jc-process-area { font-size: 10px; padding: 2px 8px; border-radius: 5px; }
    .jc-process-prazo { font-family: var(--font-body); font-size: 10px; }
    .jc-process-badge {
      font-size: 9px; padding: 3px 8px; border-radius: 5px; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.06em;
    }
    .jc-process-badge.urgente { background: rgba(234,179,8,0.18); color: #FEF08A; border: 1px solid rgba(250,204,21,0.45); }
    .jc-process-badge.normal { background: rgba(255,255,255,0.06); color: #e4e4e7; border: 1px solid rgba(255,255,255,0.14); }
    .jc-process-badge.revisar { background: rgba(250,204,21,0.12); color: #FACC15; border: 1px solid rgba(250,204,21,0.35); }
    .jc-process-value { font-family: var(--font-body); font-size: 11px; color: #FACC15; min-width: 80px; text-align: right; font-weight: 600; }
    .jc-thinking { display: flex; align-items: center; gap: 4px; padding: 4px 0; }
    .jc-thinking span {
      width: 6px; height: 6px; border-radius: 50%; background: var(--gold);
      animation: thinking 1.2s infinite; display: inline-block;
    }
    .jc-thinking span:nth-child(2) { animation-delay: 0.2s; }
    .jc-thinking span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes thinking { 0%, 60%, 100% { opacity: 0.2; transform: scale(0.8); } 30% { opacity: 1; transform: scale(1.2); } }
    .jc-input-area { background: var(--bg2); border-top: 1px solid var(--border); padding: 12px 32px 16px; }
    .jc-commands { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
    .jc-cmd {
      font-size: 11px; padding: 5px 12px; border-radius: 16px;
      background: var(--bg3); border: 1px solid var(--border2);
      color: var(--text2); cursor: pointer; white-space: nowrap; transition: all 0.15s;
      font-family: var(--font-body); display: flex; align-items: center; gap: 4px;
    }
    .jc-cmd:hover { background: rgba(234,179,8,0.08); border-color: rgba(234,179,8,0.25); color: var(--gold2); }
    .jc-input-row {
      display: flex; align-items: flex-end; gap: 10px;
      background: var(--bg3); border: 1px solid var(--border2);
      border-radius: 14px; padding: 10px 14px; transition: border-color 0.2s;
    }
    .jc-input-row:focus-within { border-color: rgba(234,179,8,0.4); }
    .jc-textarea {
      flex: 1; background: none; border: none; outline: none; resize: none;
      font-family: var(--font-body); font-size: 14px; color: var(--text1);
      line-height: 1.5; max-height: 120px; min-height: 22px; text-align: left;
    }
    .jc-textarea::placeholder { color: var(--text3); text-align: left; }
    .jc-send-btn, .jc-mic-btn {
      width: 34px; height: 34px; border-radius: 9px; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.2s; flex-shrink: 0; line-height: 0; padding: 0;
    }
    .jc-send-btn::before, .jc-send-btn::after, .jc-mic-btn::before, .jc-mic-btn::after { content: none !important; }
    .jc-send-btn > svg, .jc-mic-btn > svg { display: block; flex-shrink: 0; }
    .jc-send-btn { background: linear-gradient(135deg, var(--gold), var(--gold2)); color: #0a0a12; }
    .jc-send-btn:hover { transform: scale(1.05); box-shadow: 0 0 16px rgba(234,179,8,0.4); }
    .jc-send-btn:disabled { opacity: 0.4; cursor: default; transform: none; }
    .jc-mic-btn { background: var(--bg4); color: var(--text2); border: 1px solid var(--border); }
    .jc-mic-btn:hover { border-color: var(--gold); color: var(--gold); }
    .jc-mic-btn.recording { background: rgba(234,179,8,0.18); border-color: #EAB308; color: #FEF9C3; animation: pulse 1s infinite; }
    .jc-mic-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .jc-mic-btn:disabled:hover { border-color: var(--border); color: var(--text2); }
    .jc-input-hint { font-size: 10px; color: var(--text3); text-align: center; margin-top: 6px; }
    .jc-right-panel {
      width: 320px; min-width: 320px; background: var(--bg2);
      border-left: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden;
      transition: width 0.38s var(--panel-ease), min-width 0.38s var(--panel-ease), opacity 0.3s ease;
      position: relative; z-index: 5;
    }
    .jc-right-panel.collapsed { width: 0; min-width: 0; border-left: none; }
    .jc-right-panel.collapsed > *:not(.jc-right-toggle-desk) { display: none; }
    .jc-right-toggle-desk {
      position: fixed; top: 78px; right: 324px; z-index: 55;
      width: 32px; height: 56px; border-radius: 999px;
      background: rgba(28, 28, 40, 0.42); border: 1.5px solid rgba(234,179,8,0.32);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; color: rgba(234, 179, 8, 0.88); opacity: 0.92;
      transition: transform 220ms cubic-bezier(0.4, 0, 0.2, 1), right 0.38s var(--panel-ease),
        top 0.38s var(--panel-ease), background 220ms ease, border-color 220ms ease,
        box-shadow 220ms ease, color 220ms ease, opacity 220ms ease;
      box-shadow: 0 6px 18px rgba(0,0,0,0.35), 0 0 0 1px rgba(234,179,8,0.08);
      overflow: hidden; line-height: 0; flex-shrink: 0;
      backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
    }
    .jc-right-toggle-desk.is-collapsed { right: 8px; top: 78px; }
    .jc-right-toggle-desk::before {
      content: ""; position: absolute; inset: 0; border-radius: inherit;
      background: radial-gradient(ellipse at center, rgba(234,179,8,0.18) 0%, rgba(234,179,8,0) 70%);
      opacity: 0; transition: opacity 220ms ease; pointer-events: none;
    }
    .jc-right-toggle-desk:hover {
      opacity: 1; color: var(--gold); border-color: rgba(234,179,8,0.72);
      background: rgba(28, 28, 40, 0.62); transform: translateX(-2px);
      box-shadow: 0 8px 22px rgba(0,0,0,0.45), 0 0 0 2px rgba(234,179,8,0.18);
    }
    .jc-right-toggle-desk:hover::before { opacity: 1; }
    .jc-right-toggle-desk:active { transform: translateX(-2px) scale(0.96); }
    .jc-right-header {
      padding: 16px 16px 12px 16px; border-bottom: 1px solid var(--border);
      font-family: var(--font-spartan); font-size: 16px; font-weight: 700;
      letter-spacing: -0.01em; color: var(--text1);
    }
    .jc-right-tabs { display: flex; border-bottom: 1px solid var(--border); padding: 0 12px; }
    .jc-right-tab {
      font-size: 11px; padding: 9px 12px; cursor: pointer; color: var(--text3);
      border-bottom: 2px solid transparent; transition: all 0.15s; white-space: nowrap;
      font-weight: 500; display: flex; align-items: center; gap: 4px;
    }
    .jc-right-tab.active { color: var(--gold); border-color: var(--gold); }
    .jc-right-body { flex: 1; overflow-y: auto; padding: 12px; }
    .jc-right-body::-webkit-scrollbar { width: 3px; }
    .jc-right-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
    .jc-case-card, .jc-agent-card-rp {
      background: var(--bg3); border: 1px solid var(--card-border);
      border-radius: 10px; padding: 12px; margin-bottom: 8px; cursor: pointer; transition: all 0.2s;
    }
    .jc-case-card:hover, .jc-agent-card-rp:hover { border-color: var(--card-border-hover); background: var(--bg4); }
    .jc-case-num { font-family: var(--font-body); font-size: 10px; color: var(--text3); margin-bottom: 4px; }
    .jc-case-name { font-size: 13px; font-weight: 500; color: var(--text1); margin-bottom: 6px; }
    .jc-case-row { display: flex; justify-content: space-between; align-items: center; }
    .jc-case-prazo-row { display: flex; align-items: center; gap: 4px; font-size: 10px; color: var(--text3); margin-top: 6px; }
    .jc-alert-item {
      display: flex; gap: 10px; align-items: flex-start;
      padding: 10px; border-radius: 8px; margin-bottom: 6px; border: 1px solid; cursor: pointer;
    }
    .jc-alert-item.fatal { background: rgba(234,179,8,0.06); border-color: rgba(250,204,21,0.35); }
    .jc-alert-item.warning { background: rgba(234,179,8,0.05); border-color: rgba(234,179,8,0.28); }
    .jc-alert-item.info { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.12); }
    .jc-alert-item.success { background: rgba(250,204,21,0.06); border-color: rgba(250,204,21,0.3); }
    .jc-alert-text { font-size: 11.5px; color: var(--text1); line-height: 1.4; flex: 1; }
    .jc-alert-time { font-size: 9px; color: var(--text3); font-family: var(--font-body); white-space: nowrap; }
    .jc-sidebar-overlay { display: none; position: fixed; inset: 0; z-index: 40; background: rgba(0,0,0,0.5); }
    .jc-sidebar-overlay.visible { display: block; }
    .jc-tooltip-overlay {
      position: fixed; inset: 0; z-index: 45; background: rgba(0,0,0,0.45);
      backdrop-filter: blur(1px); pointer-events: none; animation: jcTooltipFade 120ms ease-out;
    }
    @keyframes jcTooltipFade { from { opacity: 0 } to { opacity: 1 } }
    .jc-hamburger { display: none; background: none; border: none; cursor: pointer; color: var(--text1); padding: 4px; flex-shrink: 0; }
    .jc-right-toggle { display: none; background: var(--bg3); border: 1px solid var(--border); border-radius: 8px; padding: 6px 10px; cursor: pointer; font-size: 11px; color: var(--text2); align-items: center; gap: 4px; }
    * { scrollbar-color: var(--border) transparent; scrollbar-width: thin; }
    @media (max-width: 1024px) {
      .jc-right-panel { display: none; }
      .jc-right-panel.mobile-visible {
        display: flex; position: fixed; right: 0; top: 0; bottom: 0; z-index: 50;
        width: min(320px, 90vw); box-shadow: -4px 0 24px rgba(0,0,0,0.3);
      }
      .jc-right-panel.mobile-visible.collapsed { width: 0; min-width: 0; border-left: none; overflow: hidden; }
      .jc-right-panel.mobile-visible.collapsed > *:not(.jc-right-toggle-desk) { display: none; }
      .jc-right-toggle-desk { display: flex !important; right: 8px; }
      .jc-right-toggle-desk.is-panel-open:not(.is-collapsed) { right: min(320px, 90vw); }
    }
    @media (max-width: 768px) {
      .jc-sidebar {
        position: fixed; left: 0; top: 0; bottom: 0; z-index: 50;
        transform: translateX(-100%); box-shadow: 4px 0 24px rgba(0,0,0,0.3);
        width: 240px !important; min-width: 240px !important;
      }
      .jc-sidebar.mobile-open { transform: translateX(0); }
      .jc-sidebar.collapsed .jc-logo-info, .jc-sidebar.collapsed .jc-search,
      .jc-sidebar.collapsed .jc-section-label, .jc-sidebar.collapsed .jc-nav-label,
      .jc-sidebar.collapsed .jc-nav-badge, .jc-sidebar.collapsed .jc-agent-name { display: revert; }
      .jc-sidebar-toggle { display: none; }
      /* Toggle escondido no mobile → sem sobreposição, recuo volta ao normal. */
      .jc-acting-as-bar { padding-left: 16px; }
      .jc-sidebar-overlay.visible { display: block; }
      .jc-hamburger { display: block; }
      .jc-topbar { padding: 8px 10px 10px; gap: 8px; }
      .jc-topbar-brand { flex-basis: 100%; }
      .jc-topbar-trailing { flex-basis: 100%; justify-content: flex-start; }
      .jc-dept-title { font-size: 16px; }
      .jc-msg-wrap { padding: 8px 16px; }
      /* Mesmo racional do desktop: teto por caractere (não %) para não colapsar.
         Em mobile deixamos ir a 88vw para aproveitar a tela estreita. */
      .jc-msg-bubble { max-width: min(70ch, 88vw); font-size: 13px; }
      .jc-input-area { padding: 8px 12px 12px; }
      .jc-cmd { font-size: 10px; padding: 3px 8px; }
    }
    @media (max-width: 480px) {
      .jc-user-chip { display: none; }
    }
  `}</style>
);

// Status da run que devem ENCERRAR o "pensando" no front. Espelham os kinds de
// mensagem que já param o indicador (final/error/action_proposal/action_done):
//   done → final · failed → error · awaiting_confirmation → action_proposal ·
//   cancelled → STOP instantâneo (geração interrompida pelo usuário).
// No escopo de módulo (constante estável) para não virar dependência de hook.
const TERMINAL_RUN_STATUSES = ["done", "failed", "awaiting_confirmation", "cancelled"];

// ── MAIN COMPONENT ───────────────────────────────────────────
export default function JurisCloudOS() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const showCreateEmployee = searchParams.get("criar") === "funcionario";
  const openCreateEmployee = () => setSearchParams({ criar: "funcionario" });
  const closeCreateEmployee = () => setSearchParams({});
  const { user, signOut, hasRole } = useAuth();
  const { canAccessDepartment, canSeeMenuItem, canSeeAgentRole, canAccessAdmin, canAccessClients, isReadOnly, roleLabel, visibility } = usePermissions();
  useRealtimeNotifications();
  useBottleneckDetection(navigate);
  const { tokenBalance, consumeTokensWithRef, refundTokens } = useTokenBalance(navigate);

  const { agents: dbAgents, loading: agentsLoading } = useAgents();
  const inboxCount = useInboxCount();
  const [validationCount, setValidationCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const fetchValidation = async () => {
      const { data } = await supabase.rpc("get_validation_count");
      if (!cancelled && typeof data === "number") setValidationCount(data);
    };
    void fetchValidation();
    const interval = setInterval(fetchValidation, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const { workspace } = useMyWorkspace();
  // Autoria de peça (role_templates.code = 'socio'|'adv_%'): reusa o workspace
  // já carregado aqui e passa por prop ao chat — evita um segundo useMyWorkspace
  // dentro do painel/bolha (canal realtime duplicado → crash).
  const canAuthorPeca = isPecaAuthor(workspace?.role_template?.code);
  const { startSession, startOrchestration } = useChatOrchestrator();
  const [assistantSessionId, setAssistantSessionId] = useState<string | null>(null);
  const [entryAgentId, setEntryAgentId] = useState<string | null>(null);

  // ── "Atuar como setor" (só tech) ──────────────────────────────────────────
  // O tech testa os agentes de qualquer setor escolhendo o usuário-alvo. Enquanto
  // `activeTest` é não-nulo, a conversa é uma sessão de teste (is_tech_test): o
  // entry_agent aponta para o assistant_root do alvo (a orquestração roda como o
  // setor) e o backend faz dry-run das escritas. null = "Meu tech" (normal).
  const { sectors: testSectors, startTestSession } = useTechTest();
  const [activeTest, setActiveTest] = useState<TestableSector | null>(null);

  // ── Histórico de conversas ──
  // clientName/runStatus (2.4): cliente vinculado (só exibição) + status da
  // última run, para derivar o status da conversa combinado com o sinal ao vivo.
  type SessionSummary = {
    id: string; title: string; preview: string;
    lastMessageAt: string; messageCount: number;
    clientName: string | null; runStatus: string | null;
  };
  const [chatSessions, setChatSessions] = useState<SessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  // Deriva um título curto e legível a partir de um texto (1a mensagem do usuário).
  const deriveTitle = (text: string): string => {
    const clean = (text || "").replace(/\n?\[Arquivos:.*?\]/gi, " ").replace(/\s+/g, " ").trim();
    if (!clean) return "Nova conversa";
    let t = clean.split(" ").slice(0, 9).join(" ");
    if (t.length > 52) t = t.slice(0, 49) + "…";
    else if (clean.length > t.length) t += "…";
    return t.charAt(0).toUpperCase() + t.slice(1);
  };

  // Carrega sessões do usuário + enriquece com proposta (1a msg) e contexto (resumo/última resposta).
  const loadSessions = async () => {
    if (!user) return;
    setSessionsLoading(true);
    const { data } = await supabase
      .from("chat_sessions")
      .select("id, title, summary, last_message_at, message_count, client_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("last_message_at", { ascending: false })
      .limit(30);
    const rows = (data as unknown as { id: string; title: string | null; summary: string | null; last_message_at: string; message_count: number; client_id: string | null }[]) || [];
    if (rows.length === 0) { setChatSessions([]); setSessionsLoading(false); return; }

    // Busca as mensagens (user + assistant final) dessas sessões para montar proposta + contexto.
    const ids = rows.map(r => r.id);
    const { data: msgs } = await supabase
      .from("chat_messages")
      .select("session_id, role, content, metadata, sequence_number")
      .in("session_id", ids)
      .order("sequence_number", { ascending: true });
    const firstUser: Record<string, string> = {};
    const lastAssistant: Record<string, string> = {};
    for (const m of (msgs as unknown as { session_id: string; role: string; content: string; metadata: any }[]) || []) {
      if (!m.content) continue;
      if (m.role === "user" && !firstUser[m.session_id]) firstUser[m.session_id] = m.content;
      if (m.role === "assistant" && (m.metadata?.kind === "final" || m.metadata?.kind == null)) lastAssistant[m.session_id] = m.content;
    }

    // Status por conversa (2.4): status da ÚLTIMA run de cada sessão. Ordenado
    // por created_at asc ⇒ a última escrita (run mais recente) vence no mapa.
    // RLS de orchestration_runs limita a runs do próprio usuário (owner).
    const lastRunStatus: Record<string, string> = {};
    const { data: runRows } = await supabase
      .from("orchestration_runs")
      .select("session_id, status, created_at")
      .in("session_id", ids)
      .order("created_at", { ascending: true });
    for (const r of (runRows as unknown as { session_id: string; status: string }[]) || []) {
      lastRunStatus[r.session_id] = r.status;
    }

    // Cliente vinculado (2.4 — SOMENTE exibição). A coluna client_id JÁ existe
    // em chat_sessions; o vínculo em si é preenchido por OUTRO card (Resolvedor
    // de cliente). Aqui só resolvemos o nome quando o vínculo existe. Se o
    // usuário não tiver acesso à tabela clients (RLS: recepção/sócio), o select
    // volta vazio e o nome fica null — sem quebrar.
    const clientName: Record<string, string> = {};
    const clientIds = Array.from(new Set(rows.map(r => r.client_id).filter((v): v is string => !!v)));
    if (clientIds.length > 0) {
      const { data: clientRows } = await supabase
        .from("clients")
        .select("id, full_name")
        .in("id", clientIds);
      for (const c of (clientRows as unknown as { id: string; full_name: string | null }[]) || []) {
        if (c.full_name) clientName[c.id] = c.full_name;
      }
    }

    const placeholders = ["", "nova conversa", "meu assistente"];
    setChatSessions(rows.map(r => {
      const stored = (r.title || "").trim();
      const isPlaceholder = placeholders.includes(stored.toLowerCase());
      const title = !isPlaceholder && stored
        ? stored
        : (firstUser[r.id] ? deriveTitle(firstUser[r.id]) : "Nova conversa");
      // Contexto/"o que foi feito": resumo rolante > última resposta > 1a mensagem.
      const ctxSource = (r.summary && r.summary.trim())
        ? r.summary
        : (lastAssistant[r.id] || firstUser[r.id] || "");
      let preview = ctxSource.replace(/\n?\[Arquivos:.*?\]/gi, " ").replace(/\s+/g, " ").trim();
      if (preview.length > 90) preview = preview.slice(0, 87) + "…";
      return {
        id: r.id, title, preview,
        lastMessageAt: r.last_message_at, messageCount: r.message_count,
        clientName: r.client_id ? (clientName[r.client_id] ?? null) : null,
        runStatus: lastRunStatus[r.id] ?? null,
      };
    }));
    setSessionsLoading(false);
  };

  useEffect(() => { loadSessions(); }, [user, assistantSessionId]);
  // Ref estável para chamar loadSessions de dentro de efeitos/handlers sem
  // recriá-los a cada render (evita reassinar canais) nem dependências obsoletas.
  const loadSessionsRef = useRef(loadSessions);
  useEffect(() => { loadSessionsRef.current = loadSessions; });

  // Trocar para uma sessão existente. NÃO mexe no "processando" das outras runs:
  // apenas troca qual entrada do mapa é exibida. Se a sessão aberta tiver uma run
  // ativa, o indicador reaparece a partir do mapa (+ reconciliação no efeito de
  // Realtime), SEMPRE ademais das mensagens já persistidas — nunca no lugar delas.
  const switchSession = async (sessionId: string) => {
    setShowWelcome(false);
    setMessages([]);
    setAssistantSessionId(sessionId);
    // Detecta se é uma sessão de TESTE do tech (is_tech_test) para manter o badge
    // e o seletor coerentes ao reabrir — inclusive vindo da aba "Testes por setor".
    if (hasRole("tech")) {
      // Colunas fora dos tipos gerados → cast do builder de select.
      const { data } = await (supabase.from("chat_sessions") as unknown as {
        select: (c: string) => { eq: (col: string, v: string) => { maybeSingle: () => Promise<{ data: { is_tech_test?: boolean; acting_as_user_id?: string | null } | null }> } };
      }).select("is_tech_test, acting_as_user_id").eq("id", sessionId).maybeSingle();
      if (data?.is_tech_test && data.acting_as_user_id) {
        const targetId = data.acting_as_user_id;
        const found = testSectors.find((s) => s.user_id === targetId);
        setActiveTest(found ?? { user_id: targetId, name: "Setor em teste", department: null, role_code: "" });
      } else {
        setActiveTest(null);
      }
    }
  };

  // Seletor "Atuar como": troca o alvo do teste e começa uma conversa nova no
  // modo escolhido (setor selecionado = teste; null = "Meu tech" normal).
  const handleSelectSector = (target: TestableSector | null) => {
    setActiveTest(target);
    setAssistantSessionId(null);
    setMessages([]);
    setShowWelcome(true);
  };

  // Reconcilia o rótulo do badge quando a lista de setores chega DEPOIS de abrir
  // uma sessão de teste via ?session (o nome placeholder vira o nome real).
  useEffect(() => {
    if (!activeTest) return;
    const match = testSectors.find((s) => s.user_id === activeTest.user_id);
    if (match && (match.name !== activeTest.name || match.department !== activeTest.department)) {
      setActiveTest(match);
    }
  }, [testSectors, activeTest]);

  // Abre uma conversa específica via ?session=<id> (deep-link da aba "Testes por
  // setor"). Roda uma vez por valor do parâmetro e o limpa da URL em seguida.
  const sessionParam = searchParams.get("session");
  const openedParamRef = useRef<string | null>(null);
  useEffect(() => {
    if (!sessionParam || openedParamRef.current === sessionParam) return;
    openedParamRef.current = sessionParam;
    void switchSession(sessionParam);
    const next = new URLSearchParams(searchParams);
    next.delete("session");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionParam]);

  // Iniciar nova conversa. Runs de outras conversas continuam no mapa (rodando e
  // sendo rastreadas); como assistantSessionId fica null, a tela nova não mostra
  // "processando" de ninguém.
  const startNewChat = () => {
    setAssistantSessionId(null);
    setMessages([]);
    setShowWelcome(true);
  };

  // Excluir uma conversa (mensagens + sessão). RLS garante que só o dono apaga.
  const deleteSession = async (sessionId: string) => {
    // Remove otimisticamente da lista
    setChatSessions(prev => prev.filter(s => s.id !== sessionId));
    // Descarta também qualquer estado de run rastreado para a conversa apagada.
    patchRunState(sessionId, null);
    // Apaga as mensagens primeiro (caso não haja ON DELETE CASCADE), depois a sessão.
    await supabase
      .from("chat_messages").delete().eq("session_id", sessionId);
    const { error } = await supabase
      .from("chat_sessions").delete().eq("id", sessionId);
    if (error) {
      console.warn("[deleteSession] falha:", error.message);
      loadSessions(); // restaura a lista real em caso de erro
      return;
    }
    // Se a conversa aberta foi a excluída, volta para tela inicial.
    if (assistantSessionId === sessionId) startNewChat();
    loadSessions();
  };

  const AGENTS: Agent[] = agentsLoading || dbAgents.length === 0
    ? AGENTS_FALLBACK
    : dbAgents.map(a => ({
        id: a.externalId ?? 0,
        uuid: a.id,
        name: a.name,
        status: (a.status === "offline" ? "idle" : a.status) as "active" | "idle" | "alert",
        color: a.color,
        role: a.role,
        permissions: parseAgentPermissions(a.permissions),
        department: a.departmentName === "diretoria" ? [a.departmentName] : [a.departmentName, ...(a.role === "ceo" ? ["*","diretoria"] : a.role === "director" ? ["diretoria"] : [])],
        canOrchestrate: a.canOrchestrate,
        maxConcurrentTasks: a.maxConcurrentTasks,
        currentTasks: a.currentTasks,
        description: a.description ?? undefined,
        reportsTo: a.reportsTo ?? undefined,
      }));

  useEffect(() => {
    if (agentsLoading || dbAgents.length === 0) return;
    (async () => {
      const { data: configured } = await supabase
        .from("agents")
        .select("id")
        .not("provider", "is", null)
        .not("model", "is", null);
      const configuredIds = new Set(((configured as unknown as { id: string }[]) || []).map((r) => r.id));
      // Prioridade: assistant_root → ceo → primeiro configurado
      const root = dbAgents.find((a) => (a.role === "assistant_root" || a.role === "ceo") && configuredIds.has(a.id));
      const pick = root ?? dbAgents.find((a) => configuredIds.has(a.id));
      if (pick) {
        if (!root) console.warn("[JurisCloudOS] Nenhum assistant_root/ceo configurado; usando fallback:", pick.name);
        setEntryAgentId(pick.id);
      }
    })();
  }, [agentsLoading, dbAgents]);

  useEffect(() => { setAssistantSessionId(null); }, [entryAgentId]);

  const [showWelcome, setShowWelcome]     = useState(true);
  const [activeDept, setActiveDept]       = useState("assistente");
  const [messages, setMessages]           = useState<JcChatMessage[]>([]);
  // Agenda no chat: rascunho em espera quando o cliente não existe e o usuário vai
  // cadastrar em linha (Modelo A). Consumido ao concluir o cadastro. Só estado
  // client-side — não persiste em banco (reload perde, simétrico ao próprio wizard).
  const [pendingMeeting, setPendingMeeting] = useState<PendingMeeting | null>(null);
  // Simétrico ao pendingMeeting, mas para o fluxo de TAREFA pelo chat: rascunho em
  // espera quando o cliente citado não existe. Mutuamente exclusivo c/ pendingMeeting.
  const [pendingTask, setPendingTask] = useState<PendingTask | null>(null);
  const [cadastroInitialValues, setCadastroInitialValues] = useState<ClientFormValues | undefined>(undefined);
  const [inputVal, setInputVal]           = useState("");
  // ── Estado de "processando" POR conversa (session_id) ─────────────────────
  // MAPA session_id → RunState. Substitui o slot ÚNICO (currentRunId do #18) que
  // misturava o estado de duas runs simultâneas (bug 2.3). Cada conversa mantém
  // seu próprio runId/thinking/liveStage/cronômetro; abrir a conversa B NÃO limpa
  // nem sobrescreve a run ativa em A — as duas continuam sendo rastreadas.
  const [runStates, setRunStates] = useState<Record<string, RunState>>({});
  // Espelho em ref para os handlers de Realtime/polling lerem o estado atual sem
  // recriar as assinaturas a cada mudança (evita closures obsoletas).
  const runStatesRef = useRef<Record<string, RunState>>({});
  useEffect(() => { runStatesRef.current = runStates; }, [runStates]);

  // Única via de escrita no mapa: atualiza/limpa a entrada de UMA conversa sem
  // tocar nas demais. patch=null remove a entrada (encerra o "processando").
  const patchRunState = useCallback((sid: string, patch: Partial<RunState> | null) => {
    setRunStates(prev => applyRunPatch(prev, sid, patch));
  }, []);

  // A UI da conversa ABERTA lê SEMPRE o estado da SUA sessão — nunca o de outra.
  // Trocar de conversa apenas troca qual entrada do mapa é exibida.
  const openRun = assistantSessionId ? runStates[assistantSessionId] : undefined;
  const thinking = openRun?.thinking ?? false;
  const liveStage = openRun?.liveStage ?? null;
  const thinkingStartedAt = openRun?.thinkingStartedAt ?? null;

  // Status por conversa (2.4): combina o status da última run (banco) com o
  // sinal AO VIVO do mapa runStates (thinking) — assim uma conversa gerando
  // mostra "em andamento" mesmo antes de o banco registrar o 1o UPDATE da run.
  // Recomputa a cada render (≤30 itens): barato e sempre reflete o estado atual.
  const sessionsWithStatus = chatSessions.map(s => ({
    ...s,
    status: deriveConversationStatus(s.runStatus, !!runStates[s.id]?.thinking),
  }));

  const [sidebarSearch, setSidebarSearch] = useState("");
  const [sidebarOpen, setSidebarOpen]     = useState(false);
  const {
    sidebarCollapsed,
    setSidebarCollapsed,
  } = useUiPreferences();
  const [isRecording, setIsRecording]     = useState(false);
  // Ditado por voz suportado? (webkitSpeechRecognition/SpeechRecognition).
  // Detectado no mount; controla o estado desabilitado do botão de microfone.
  const [speechSupported, setSpeechSupported] = useState(true);
  const [shortcutAnnouncement, setShortcutAnnouncement] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  // Ditado longo: o usuário ainda quer o mic ligado? (usado pelo onend p/ reiniciar).
  const keepListeningRef = useRef(false);
  // Texto já no input quando o ditado começou + finais acumulados entre reinícios.
  const dictationBaseRef = useRef("");
  const dictationFinalRef = useRef("");

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", "dark");
      document.documentElement.classList.add("dark");
    }
  }, []);

  // O cronômetro/início do "processando" agora vive no mapa por conversa
  // (thinkingStartedAt de cada RunState), marcado ao disparar a run e limpo no
  // status terminal — não há mais um efeito global espelhando um "thinking" único.

  // Ref da conversa aberta, para os fetches assíncronos saberem se a conversa
  // ainda é a mesma quando resolvem (evita mesclar mensagens de A na tela de B —
  // a "sobreposição momentânea" do bug 2.3).
  const assistantSessionIdRef = useRef<string | null>(null);
  useEffect(() => { assistantSessionIdRef.current = assistantSessionId; }, [assistantSessionId]);

  // Reconciliação: re-busca as mensagens da sessão e mescla (dedup por id), sem
  // reexibir 'streaming' nem duplicar a mensagem otimista do usuário. Recupera um
  // 'final'/'error'/etapa que não chegou pelo Realtime. Não decide sozinha o fim
  // do "pensando" (isso é feito pelo status da run — ver applyTerminalRun).
  const fetchAndMergeMessages = useCallback(async (sid: string) => {
    const { data } = await supabase.from("chat_messages")
      .select("id, role, content, metadata, created_at, sequence_number")
      .eq("session_id", sid).order("sequence_number", { ascending: true });
    if (!data) return;
    // A conversa pode ter mudado enquanto o fetch estava no ar: só mescla se esta
    // ainda for a conversa aberta — nunca joga mensagens de uma conversa na outra.
    if (assistantSessionIdRef.current !== sid) return;
    setMessages(prev => {
      const seen = new Set(prev.map(m => String(m.id)));
      const hasOptimistic = prev.some(m => String(m.id).startsWith("local_user_"));
      const add = (data as Record<string, any>[])
        .filter(r => !seen.has(String(r.id)) && !(hasOptimistic && r.role === "user") && r.metadata?.kind !== "streaming")
        .map(r => ({
          id: r.id, role: r.role,
          agent: r.metadata?.agent_name || (r.role === "assistant" ? "Assistente" : undefined),
          content: r.content, kind: r.metadata?.kind, stage: r.metadata?.stage,
          proposal: r.metadata?.proposal,
          taskAlert: r.metadata?.task_alert,
          tarefaDraft: r.metadata?.tarefa_draft,
          reuniaoDraft: r.metadata?.reuniao_draft,
          reuniaoAcao: r.metadata?.reuniao_acao,
          timestamp: new Date(r.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        } as JcChatMessage));
      return add.length ? [...prev, ...add] : prev;
    });
  }, []);

  // Aplica um status TERMINAL da run da conversa ABERTA: reconcilia as mensagens
  // (recupera o que o Realtime perdeu) e encerra o "pensando" DAQUELA conversa
  // (remove só a entrada dela no mapa — as outras runs seguem intactas). Em
  // 'failed' sem resposta do assistente após a última mensagem do usuário, injeta
  // um aviso de erro claro para o card não ficar preso em "pensando".
  // Usada apenas para a conversa aberta (mexe em `messages`); runs de fundo são
  // encerradas por finishBackgroundRun, que não toca nas mensagens à vista.
  const applyTerminalRun = useCallback(async (sid: string, status: string) => {
    await fetchAndMergeMessages(sid);
    if (status === "failed") {
      setMessages(prev => {
        let hasReplyAfterUser = false;
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i].role === "user") break;
          if (prev[i].role === "assistant") { hasReplyAfterUser = true; break; }
        }
        if (hasReplyAfterUser) return prev;
        return [...prev, {
          id: `local_run_failed_${Date.now()}`, role: "assistant", agent: "Sistema",
          content: "Não foi possível concluir o processamento desta solicitação. Tente novamente em instantes.",
          kind: "error",
          timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        } as JcChatMessage];
      });
    }
    patchRunState(sid, null);
  }, [fetchAndMergeMessages, patchRunState]);

  // Encerra uma run de FUNDO (conversa que não está aberta): limpa só a entrada
  // dela no mapa e atualiza a lista lateral. Não mexe em `messages` (não estão à
  // vista); quando o usuário abrir a conversa, o histórico já persistido carrega
  // normalmente pelo efeito de Realtime.
  const finishBackgroundRun = useCallback((sid: string) => {
    patchRunState(sid, null);
    loadSessionsRef.current?.();
  }, [patchRunState]);

  // V23: acompanha a orquestracao via Realtime. Etapas (role=system) e a resposta
  // final (role=assistant) chegam como linhas em chat_messages. Fetch inicial
  // (catch-up) + assinatura de INSERTs. Dedup por id; desliga "thinking" no final.
  //
  // Frente 4 (reconciliação): além das mensagens, assina UPDATEs de
  // orchestration_runs. Se o Realtime perde o 'final', o status terminal da run
  // ainda encerra o "pensando" (ver applyTerminalRun). No (re)SUBSCRIBED, refaz o
  // catch-up para recuperar eventos perdidos durante uma queda de conexão.
  useEffect(() => {
    if (!assistantSessionId) return;
    const sid = assistantSessionId; // conversa ABERTA; canais e mapa escopam por ela
    let cancelled = false;

    const mapRow = (r: Record<string, any>): JcChatMessage => ({
      id: r.id,
      role: r.role,
      agent: r.metadata?.agent_name || (r.role === "assistant" ? "Assistente" : undefined),
      content: r.content,
      kind: r.metadata?.kind,
      stage: r.metadata?.stage,
      proposal: r.metadata?.proposal,
      taskAlert: r.metadata?.task_alert,
      tarefaDraft: r.metadata?.tarefa_draft,
      reuniaoDraft: r.metadata?.reuniao_draft,
      reuniaoAcao: r.metadata?.reuniao_acao,
      timestamp: r.created_at
        ? new Date(r.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
        : new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    });
    const upsert = (rows: JcChatMessage[]) => setMessages(prev => {
      const seen = new Set(prev.map(m => String(m.id)));
      const hasOptimistic = prev.some(m => String(m.id).startsWith("local_user_"));
      const add = rows.filter(r => {
        if (seen.has(String(r.id))) return false;
        // Ignora user messages do banco se ja temos a otimista local
        if (hasOptimistic && r.role === "user") return false;
        return true;
      });
      return add.length ? [...prev, ...add] : prev;
    });
    // Resposta COMPLETA (sem escrita em tempo real): ignoramos linhas 'streaming'
    // (rascunho sendo gerado) e só exibimos quando a mensagem vira 'final'/'error'.
    // O indicador de "processando" + as etapas ao vivo seguem aparecendo até lá.
    const applyRow = (row: Record<string, any>) => {
      const k = row.metadata?.kind;
      if (k === "streaming") return; // não mostra o parcial — espera a resposta pronta
      const m = mapRow(row);
      setMessages(prev => {
        const idx = prev.findIndex(x => String(x.id) === String(m.id));
        if (idx >= 0) {
          const next = prev.slice();
          next[idx] = { ...prev[idx], content: m.content, kind: m.kind, agent: m.agent };
          return next;
        }
        // Linha nova: aplica a mesma regra de dedup da otimista do usuário.
        if (m.role === "user" && prev.some(x => String(x.id).startsWith("local_user_"))) return prev;
        return [...prev, m];
      });
      // Etapa intermediária: alimenta o indicador de progresso (fase amigável +
      // "bloco X de N") DESTA conversa. Não é renderizada como balão (2.1 preserva
      // o log oculto). Só atualiza se a conversa ainda estiver processando — não
      // revive um indicador já encerrado com uma etapa fora de ordem.
      if (k === "stage" && runStatesRef.current[sid]?.thinking) {
        patchRunState(sid, { liveStage: deriveLiveStage(row) });
      }
      // action_proposal pausa o run (awaiting_confirmation) e action_done encerra a
      // ação: ambos devem parar o indicador "pensando", igual a final/error.
      // cadastro_form é resposta síncrona final (dispara o wizard) — também encerra.
      // task_alert/tarefa_confirm são alertas fora do fluxo de uma run do usuário
      // (chegam via trigger/backend) — também encerram o indicador, se houver um ativo.
      if (k === "final" || k === "error" || k === "action_proposal" || k === "action_done" || k === "action_dry_run" || k === "cancelled" || k === "cadastro_form" || k === "task_alert" || k === "tarefa_confirm" || k === "reuniao_confirm" || k === "reuniao_acao" || k === "meeting_created" || k === "meeting_reminder" || k === "meeting_rescheduled") { patchRunState(sid, null); loadSessionsRef.current?.(); }
    };

    // Handler dos UPDATEs de orchestration_runs: encerra o "pensando" no status
    // terminal, mesmo que o 'final' de chat_messages tenha se perdido no Realtime.
    // Só reage à run corrente DESTA conversa (evita runs antigas da mesma sessão).
    const applyRunRow = (row: Record<string, unknown>) => {
      const status = row?.status as string | undefined;
      const id = row?.id as string | undefined;
      if (!status || !TERMINAL_RUN_STATUSES.includes(status)) return;
      const runId = runStatesRef.current[sid]?.runId;
      if (runId && id && id !== runId) return;
      applyTerminalRun(sid, status);
    };

    // Reconcilia o ESTADO DE RUN desta conversa a partir do backend: aplica o
    // indicador de "processando" SÓ quando há run ativa, SEMPRE ademais das
    // mensagens já carregadas (nunca as esconde). No status terminal, encerra o
    // "pensando". lastStageRow reidrata "bloco X de N" ao abrir a conversa.
    const reconcileRun = async (lastStageRow?: Record<string, unknown> | null) => {
      const { data: runRow } = await supabase.from("orchestration_runs")
        .select("id, status")
        .eq("session_id", sid)
        .order("created_at", { ascending: false })
        .limit(1).maybeSingle();
      if (cancelled) return;
      const status = (runRow as { status?: string } | null)?.status;
      const rid = (runRow as { id?: string } | null)?.id ?? null;
      if (!status) return; // sem run conhecida: nada a reconciliar
      if (TERMINAL_RUN_STATUSES.includes(status)) {
        // Só encerra se ainda houvermos marcado esta conversa como processando.
        if (runStatesRef.current[sid]) await applyTerminalRun(sid, status);
        return;
      }
      // Run ATIVA nesta conversa → mostra/mantém o indicador por-sessão. Preserva
      // o cronômetro se já existir; senão marca o início agora.
      const cur = runStatesRef.current[sid];
      patchRunState(sid, {
        runId: rid,
        thinking: true,
        thinkingStartedAt: cur?.thinkingStartedAt ?? Date.now(),
        liveStage: lastStageRow
          ? deriveLiveStage(lastStageRow as { content?: string | null; metadata?: { stage?: string } | null })
          : (cur?.liveStage ?? null),
      });
    };

    (async () => {
      const { data } = await supabase.from("chat_messages")
        .select("id, role, content, metadata, created_at, sequence_number")
        .eq("session_id", sid)
        .order("sequence_number", { ascending: true });
      if (cancelled || !data) return;
      const rows = data as Record<string, unknown>[];
      const kindOf = (r: Record<string, unknown>): string | undefined =>
        (r.metadata as { kind?: string } | null | undefined)?.kind;
      // Não exibe linhas 'streaming' (rascunho em geração) no catch-up inicial.
      upsert(rows.filter(r => kindOf(r) !== "streaming").map(mapRow));
      // Última etapa persistida → reidrata o "bloco X de N" ao abrir a conversa.
      const lastStage = [...rows].reverse().find(r => kindOf(r) === "stage") ?? null;
      await reconcileRun(lastStage);
    })();

    const channel = supabase.channel(`chat:${sid}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `session_id=eq.${sid}` },
        (payload) => applyRow(payload.new as Record<string, any>))
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_messages", filter: `session_id=eq.${sid}` },
        (payload) => applyRow(payload.new as Record<string, any>))
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "orchestration_runs", filter: `session_id=eq.${sid}` },
        (payload) => applyRunRow(payload.new as Record<string, unknown>))
      .subscribe((status) => {
        // Reconexão após queda: refaz o catch-up e reconcilia o estado da run,
        // recuperando stages/final e o status terminal que passaram na queda.
        if (status !== "SUBSCRIBED") return;
        fetchAndMergeMessages(sid);
        reconcileRun();
      });

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [assistantSessionId, applyTerminalRun, fetchAndMergeMessages, patchRunState]);

  // Frente 4 (rede de segurança), agora para N runs: enquanto QUALQUER conversa
  // estiver processando, faz polling conservador (12s) do status de cada run
  // ativa (por id, ou pela última run da sessão), cobrindo o buraco em que o
  // UPDATE de orchestration_runs também se perde no Realtime. A decisão de
  // encerrar o "pensando" vem SEMPRE do status terminal da run — nunca da mera
  // presença de um 'final'. Reconcilia mensagens só da conversa ABERTA (as outras
  // não estão à vista); runs de fundo apenas têm a entrada limpa ao terminarem.
  const activeRunSids = Object.keys(runStates).filter(s => runStates[s]?.thinking).sort();
  const activeRunKey = activeRunSids.join(",");
  useEffect(() => {
    if (activeRunSids.length === 0) return;
    let cancelled = false;
    const POLL_MS = 12_000;
    const id = window.setInterval(async () => {
      if (cancelled) return;
      const states = runStatesRef.current;
      for (const sid of Object.keys(states)) {
        if (cancelled) return;
        const st = states[sid];
        if (!st?.thinking) continue;
        const isOpen = sid === assistantSessionId;
        // Só a conversa aberta reconcilia mensagens (as outras não estão à vista).
        if (isOpen) { await fetchAndMergeMessages(sid); if (cancelled) return; }
        // Confere o status: pela run corrente (por id) ou pela última run da sessão.
        const query = st.runId
          ? supabase.from("orchestration_runs").select("id, status").eq("id", st.runId).maybeSingle()
          : supabase.from("orchestration_runs").select("id, status").eq("session_id", sid).order("created_at", { ascending: false }).limit(1).maybeSingle();
        const { data } = await query;
        if (cancelled) return;
        const status = (data as { status?: string } | null)?.status;
        if (status && TERMINAL_RUN_STATUSES.includes(status)) {
          if (isOpen) await applyTerminalRun(sid, status);
          else finishBackgroundRun(sid);
        }
      }
    }, POLL_MS);
    return () => { cancelled = true; window.clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRunKey, assistantSessionId, applyTerminalRun, finishBackgroundRun, fetchAndMergeMessages]);

  const systemOnline = !AGENTS.some(a => a.status === "alert");

  const announce = (msg: string) => {
    setShortcutAnnouncement(msg);
    window.setTimeout(() => setShortcutAnnouncement(""), 1500);
  };

  const handleSidebarToggle = (source: "click" | "keyboard" = "click") => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      trackUiEvent("sidebar_toggle", { surface: "left_sidebar", collapsed: next, source });
      announce(next ? "Menu lateral recolhido" : "Menu lateral expandido");
      return next;
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "b") {
        e.preventDefault();
        trackUiEvent("shortcut_used", { target_id: "ctrl+b", surface: "left_sidebar" });
        handleSidebarToggle("keyboard");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ditado por voz — detecta suporte no mount (fallback gracioso se ausente).
  const getSpeechRecognitionCtor = () => {
    if (typeof window === "undefined") return undefined;
    const w = window as Window & {
      SpeechRecognition?: new () => SpeechRecognition;
      webkitSpeechRecognition?: new () => SpeechRecognition;
    };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition;
  };

  useEffect(() => {
    setSpeechSupported(!!getSpeechRecognitionCtor());
  }, []);

  // Encerra o reconhecimento sem deixar o mic preso ligado.
  useEffect(() => {
    return () => {
      keepListeningRef.current = false;
      recognitionRef.current?.abort();
    };
  }, []);

  // Compõe o input: texto pré-existente + falas finalizadas + trecho provisório.
  const composeDictation = (interim: string) =>
    [dictationBaseRef.current, dictationFinalRef.current, interim]
      .map(s => s.trim())
      .filter(Boolean)
      .join(" ");

  // Ditado por voz (fala → texto no input, para o usuário revisar e enviar).
  // Modo contínuo + interimResults para transcrição fluida; reinicia sozinho no
  // onend enquanto o usuário mantém o mic ligado, de modo que falas LONGAS não
  // sejam cortadas quando o navegador encerra a sessão após silêncio/tempo.
  const toggleRecording = () => {
    if (isRecording) {
      // Desligar: para de ouvir e não reinicia (mic nunca fica preso ligado).
      keepListeningRef.current = false;
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }
    const SR = getSpeechRecognitionCtor();
    if (!SR) {
      setSpeechSupported(false);
      return;
    }
    // Guarda o texto atual do input e zera o acumulador de falas finalizadas.
    dictationBaseRef.current = inputVal;
    dictationFinalRef.current = "";
    keepListeningRef.current = true;

    const recognition = new SR();
    recognition.lang = "pt-BR";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (e: SpeechRecognitionEvent) => {
      let interim = "";
      let final = dictationFinalRef.current;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const txt = res[0].transcript;
        if (res.isFinal) final = (final + " " + txt).trim();
        else interim += txt;
      }
      dictationFinalRef.current = final;
      setInputVal(composeDictation(interim));
    };
    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      // Erros fatais (permissão negada) encerram o ditado; transitórios
      // (no-speech, aborted) deixam o onend reiniciar enquanto o mic estiver ligado.
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        keepListeningRef.current = false;
        setIsRecording(false);
      }
    };
    recognition.onend = () => {
      // Se o usuário ainda está ditando, reinicia sem perder o texto já transcrito.
      if (keepListeningRef.current) {
        try {
          recognition.start();
          return;
        } catch {
          // Reinício falhou (estado inesperado) — encerra graciosamente.
          keepListeningRef.current = false;
        }
      }
      setIsRecording(false);
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsRecording(true);
    } catch {
      keepListeningRef.current = false;
      setIsRecording(false);
    }
  };

  // Catch-up: garante que a user message e as etapas apareçam mesmo se o canal
  // Realtime assinou após o INSERT inicial. Compartilhado entre handleSend e o
  // caminho de confirmação do gate de anexos. Reusa a reconciliação de mensagens.
  const scheduleCatchUp = (sid: string) => {
    setTimeout(() => { fetchAndMergeMessages(sid); }, 1200);
  };

  // Dispara a geração numa sessão já existente: cobra tokens, opcionalmente
  // injeta um aviso de DOCUMENTOS AUSENTES (quando o usuário decide gerar mesmo
  // sem os anexos que falharam) e orquestra. Usado pelo botão do gate de anexos.
  const proceedGeneration = async (sid: string, val: string, missingDocs: string[] = []) => {
    const { cost, label } = getTokenCost(val);
    const requestId = (typeof crypto !== "undefined" && "randomUUID" in crypto)
      ? crypto.randomUUID()
      : `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const charged = await consumeTokensWithRef(cost, `${label}: ${val.slice(0, 50)}`, requestId);
    if (!charged) {
      setMessages(prev => [...prev, {
        id: `local_${Date.now()}`, role: "assistant", agent: "Sistema",
        content: formatInsufficientBalanceMessage(cost, label),
        timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      }]);
      return;
    }
    // Liga o "processando" DESTA conversa (entra no mapa por session_id).
    patchRunState(sid, { thinking: true, thinkingStartedAt: Date.now(), liveStage: null, runId: null });
    const reason = (msg: string) => `Estorno automatico: ${msg}`;
    const message = missingDocs.length
      ? `[AVISO DO SISTEMA — DOCUMENTOS AUSENTES]\n` +
        `Os seguintes documentos NÃO foram ingeridos e estão AUSENTES desta análise: ${missingDocs.join(", ")}.\n` +
        `Registre no TOPO da análise pré-redação quais documentos estão ausentes e NÃO afirme como certo nada que dependa deles.\n` +
        `------------------------------\n${val}`
      : val;
    try {
      const { ok, runId, error: sendErr } = await startOrchestration(sid, message);
      if (!ok) {
        const msg = friendlyError(sendErr ?? { error: "request_failed", message: "agente nao respondeu" });
        await refundTokens(cost, requestId, reason(msg));
        patchRunState(sid, null);
        setMessages(prev => [...prev, {
          id: `local_${Date.now()}`, role: "assistant", agent: "Sistema",
          content: formatTokenRefundMessage(cost, msg),
          timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        }]);
        return;
      }
      if (runId) patchRunState(sid, { runId });
      scheduleCatchUp(sid);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "erro de rede";
      await refundTokens(cost, requestId, reason(msg));
      patchRunState(sid, null);
      setMessages(prev => [...prev, {
        id: `local_${Date.now()}`, role: "assistant", agent: "Sistema",
        content: formatTokenRefundMessage(cost, msg),
        timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      }]);
    }
  };

  // STOP instantâneo: cancela a run DAQUELA conversa (a aberta). Usa o runId do
  // mapa por session_id (2.3) — cancelar A NÃO afeta B. Otimista: mostra "Geração
  // interrompida" na hora; o backend encerra a run como 'cancelled' e a
  // reconciliação (assinatura de orchestration_runs) confirma e para o "pensando".
  const [stopping, setStopping] = useState(false);
  const handleStop = useCallback(async () => {
    const sid = assistantSessionId;
    if (!sid) return;
    const st = runStatesRef.current[sid];
    if (!st?.thinking) return;
    // Race do STOP cedo (fix 3.x): só dispara o cancel quando a run JÁ existe (o
    // front conhece o runId — veio do retorno de startOrchestration / mapa 2.3).
    // Enquanto o runId não chegou, não há run para cancelar no banco: pedir o
    // cancel agora resultaria em "nada a cancelar". O botão já fica desabilitado
    // (canStop=false) nessa janela; este guard cobre o caso de corrida.
    if (!st.runId) return;
    setStopping(true);
    // Feedback imediato na fase do indicador (não espera o round-trip).
    patchRunState(sid, { liveStage: { label: "Interrompendo…" } });
    try {
      await cancelRun({ runId: st.runId, sessionId: sid });
    } catch (e) {
      console.warn("[handleStop] cancelamento falhou:", e);
      // Falha ao pedir o cancelamento: restaura o indicador (segue processando).
      patchRunState(sid, { liveStage: null });
    } finally {
      setStopping(false);
    }
  }, [assistantSessionId, patchRunState]);

  // ── Agenda no chat: cliente não encontrado → cadastro em linha → agenda auto ──
  // 1) Clique em "Cadastrar cliente" no cartão: guarda o snapshot do agendamento em
  //    estado, pré-preenche o Nome e INJETA localmente o disparo do wizard (mesmo
  //    cartão que o edge produziria) — sem round-trip no edge, sem balão de usuário.
  const handleCadastrarClienteFromMeeting = useCallback((snapshot: PendingMeeting) => {
    setPendingTask(null); // fluxos mutuamente exclusivos
    setPendingMeeting(snapshot);
    const hint = (snapshot.client_name_hint ?? "").trim();
    setCadastroInitialValues(hint ? { ...EMPTY_FORM, full_name: hint.toUpperCase() } : undefined);
    setMessages(prev => [...prev, {
      id: `local_cadastro_${Date.now()}`, role: "assistant", agent: "Meu Assistente",
      kind: "cadastro_form",
      content: "Claro!\nPreencha o formulário de cadastro do cliente abaixo:",
      timestamp: nowLabel(),
    } as JcChatMessage]);
  }, []);

  // Simétrico ao de reunião, para o cartão de TAREFA: guarda o snapshot do rascunho
  // e injeta o disparo do wizard (Modelo A) com o Nome pré-preenchido.
  const handleCadastrarClienteFromTask = useCallback((snapshot: PendingTask) => {
    setPendingMeeting(null); // fluxos mutuamente exclusivos
    setPendingTask(snapshot);
    const hint = (snapshot.client_name_hint ?? "").trim();
    setCadastroInitialValues(hint ? { ...EMPTY_FORM, full_name: hint.toUpperCase() } : undefined);
    setMessages(prev => [...prev, {
      id: `local_cadastro_${Date.now()}`, role: "assistant", agent: "Meu Assistente",
      kind: "cadastro_form",
      content: "Claro!\nPreencha o formulário de cadastro do cliente abaixo:",
      timestamp: nowLabel(),
    } as JcChatMessage]);
  }, []);

  // 2) Wizard gravou (novo client_id): se havia rascunho pendente, agenda automático.
  //    Snapshot completo → create_meeting direto (advogado notificado pelo trigger).
  //    Incompleto ou falha (slot inválido/ocupado/passou) → cliente FICA cadastrado
  //    e reabre um cartão pré-preenchido p/ escolher novo horário. Consome e limpa
  //    o rascunho em todos os casos (não reaparece em cadastros futuros).
  const handleClienteCadastrado = useCallback(async (clientId: string, clientName: string) => {
    // Fluxo de TAREFA: cria a tarefa automaticamente com o novo client_id.
    if (pendingTask) {
      const tsnap = pendingTask;
      setPendingTask(null);
      setCadastroInitialValues(undefined);

      const reopenTaskCard = (leadMsg: string) => {
        const draft: TarefaDraft = {
          title: tsnap.title, description: tsnap.description,
          deadline_at: tsnap.deadline_at, deadline_display: null,
          // [FIX-EXPEDIENTE] o snapshot só existiu porque o edge validou o prazo → herda válido.
          deadline_ok: tsnap.deadline_ok ?? true,
          priority: tsnap.priority, assignee_hint: null,
          assignee_user_id: tsnap.assignee_user_id,
          client_query: clientName,
          client_resolved: { id: clientId, name: clientName, cpf_masked: null, status: null },
          client_candidates: [],
        };
        setMessages(prev => [...prev,
          { id: `local_tarefa_msg_${Date.now()}`, role: "assistant", agent: "Meu Assistente", content: leadMsg, timestamp: nowLabel() } as JcChatMessage,
          { id: `local_tarefa_${Date.now()}`, role: "assistant", agent: "Meu Assistente", kind: "tarefa_confirm", tarefaDraft: draft, timestamp: nowLabel() } as JcChatMessage,
        ]);
      };

      // Título é o único obrigatório; veio do rascunho. Sem título (raro) → reabre p/ preencher.
      if (!tsnap.title?.trim()) {
        reopenTaskCard(`Cliente ${clientName} cadastrado. Confirme os dados da tarefa abaixo.`);
        return;
      }
      try {
        await createChatTask({
          title: tsnap.title.trim(),
          description: tsnap.description?.trim() || undefined,
          client_id: clientId,
          deadline_at: tsnap.deadline_at ?? undefined,
          assignee_user_id: tsnap.assignee_user_id || undefined,
          priority: tsnap.priority ?? "medium",
        });
        setMessages(prev => [...prev, {
          id: `local_tarefa_ok_${Date.now()}`, role: "assistant", agent: "Meu Assistente",
          content: `Cliente ${clientName} cadastrado e tarefa "${tsnap.title.trim()}" criada e vinculada.`,
          timestamp: nowLabel(),
        } as JcChatMessage]);
      } catch (e) {
        // [FIX-EXPEDIENTE] Backstop do banco no auto-create pós-cadastro: se o prazo
        // está fora do expediente, o cliente FICA cadastrado; só a tarefa espera um
        // horário válido — reabre o cartão com a mensagem específica.
        const err = e as { hint?: string; message?: string };
        const foraExpediente = err?.hint === "business_hours" || /fora do expediente/i.test(err?.message ?? "");
        reopenTaskCard(foraExpediente
          ? `Cliente ${clientName} cadastrado, mas o horário está fora do expediente (08h–17h, dias úteis). Ajuste abaixo.`
          : `Cliente ${clientName} cadastrado, mas não consegui criar a tarefa agora. Revise e confirme abaixo.`);
      }
      return;
    }

    const snap = pendingMeeting;
    if (!snap) return; // cadastro normal (não veio de um agendamento)
    setPendingMeeting(null);
    setCadastroInitialValues(undefined);

    const reopenCard = (leadMsg: string) => {
      const draft: ReuniaoDraft = {
        scheduled_date: snap.scheduled_date, start_time: snap.start_time, type: snap.type,
        display: snap.display, lawyer_hint: snap.lawyer_hint, lawyer_user_id: snap.lawyer_user_id || null,
        phone: snap.phone, client_query: clientName,
        client_resolved: { id: clientId, name: clientName, cpf_masked: null, status: null },
        client_candidates: [],
      };
      setMessages(prev => [...prev,
        { id: `local_agenda_msg_${Date.now()}`, role: "assistant", agent: "Meu Assistente", content: leadMsg, timestamp: nowLabel() } as JcChatMessage,
        { id: `local_reuniao_${Date.now()}`, role: "assistant", agent: "Meu Assistente", kind: "reuniao_confirm", reuniaoDraft: draft, timestamp: nowLabel() } as JcChatMessage,
      ]);
    };

    const whenLabel = snap.display ?? [snap.scheduled_date, snap.start_time].filter(Boolean).join(" ");
    const complete = !!(snap.scheduled_date && snap.start_time && snap.type && snap.lawyer_user_id);
    if (!complete) {
      reopenCard(`Cliente ${clientName} cadastrado. Confirme os dados do atendimento abaixo.`);
      return;
    }
    try {
      await createMeeting({
        p_scheduled_date: snap.scheduled_date!, p_start_time: snap.start_time!,
        p_client_id: clientId, p_type: snap.type!, p_lawyer_user_id: snap.lawyer_user_id!,
        p_phone: snap.phone || undefined, p_status: "scheduled",
      });
      setMessages(prev => [...prev, {
        id: `local_agenda_ok_${Date.now()}`, role: "assistant", agent: "Meu Assistente",
        content: `Cliente ${clientName} cadastrado e atendimento agendado para ${whenLabel}. O advogado foi notificado.`,
        timestamp: nowLabel(),
      } as JcChatMessage]);
    } catch {
      reopenCard(`Cliente ${clientName} cadastrado com sucesso, mas o horário ${whenLabel} não está mais disponível. Escolha um novo horário abaixo.`);
    }
  }, [pendingMeeting, pendingTask]);

  const handleSend = async (text?: string, files?: File[]) => {
    const val = (text || inputVal).trim();
    if (!val) return;
    const { cost, label } = getTokenCost(val);
    const requestId = (typeof crypto !== "undefined" && "randomUUID" in crypto)
      ? crypto.randomUUID()
      : `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const charged = await consumeTokensWithRef(cost, `${label}: ${val.slice(0, 50)}`, requestId);
    if (!charged) {
      setMessages(prev => [...prev, {
        id: Date.now(), role: "assistant", agent: "Sistema",
        content: formatInsufficientBalanceMessage(cost, label),
        timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      }]);
      return;
    }

    // Insere a mensagem do usuario localmente de imediato (otimista) para
    // que ela apareca no chat ANTES do indicador de "processando".
    const optimisticId = `local_user_${Date.now()}`;
    setMessages(prev => [...prev, {
      id: optimisticId, role: "user",
      content: val,
      timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    }]);
    setInputVal("");

    // sid da conversa alvo — pode ser criado abaixo para uma conversa nova. O
    // "processando" desta conversa só é ligado (no mapa por session_id) DEPOIS de
    // conhecermos o sid, para nunca misturar o estado com o de outra conversa.
    let sid = assistantSessionId;

    const refundAndNotify = async (reason: string) => {
      await refundTokens(cost, requestId, `Estorno automatico: ${reason}`);
      if (sid) patchRunState(sid, null); // desliga o "processando" só DESTA conversa
      setMessages(prev => [...prev, {
        id: `local_${Date.now()}`, role: "assistant", agent: "Sistema",
        content: formatTokenRefundMessage(cost, reason),
        timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      }]);
    };

    try {
      // Modo TESTE (tech "atuando como setor"): a sessão é criada por insert
      // direto com os flags is_tech_test/acting_as_user_id e o entry_agent do
      // alvo. Não depende do entryAgentId do próprio tech.
      const test = activeTest;
      if (!test && !entryAgentId) {
        await refundAndNotify(
          "nenhum agente com IA configurada — vá em /tech/agentes, escolha o agente, na aba Modelo configure provedor + modelo, e salve",
        );
        return;
      }
      if (!sid) {
        if (test) {
          const { sessionId, error: testErr } = await startTestSession(test);
          if (!sessionId) { await refundAndNotify(testErr ?? "falha ao iniciar a sessão de teste"); return; }
          setAssistantSessionId(sessionId);
          sid = sessionId;
        } else {
          const { sessionId, error: startErr } = await startSession(entryAgentId!, { title: "Meu Assistente" });
          if (!sessionId) { await refundAndNotify(friendlyError(startErr)); return; }
          setAssistantSessionId(sessionId); // dispara a assinatura Realtime
          sid = sessionId;
        }
      }
      // Conversa conhecida: liga o "processando" DELA no mapa (entrada por sid).
      patchRunState(sid, { thinking: true, thinkingStartedAt: Date.now(), liveStage: null, runId: null });
      // Canal A: sobe e extrai os DOCUMENTOS DO CASO ANTES de orquestrar, para que
      // o especialista (N3) leia o conteudo real (nao apenas os nomes dos arquivos).
      //
      // GATE BLOQUEANTE: se QUALQUER anexo desta leva falhou (não subiu OU subiu
      // sem texto legível), a geração NÃO prossegue. Um anexo sem texto é invisível
      // para o agente — gerar assim produziria peça com premissa incompleta. Em vez
      // de gerar, estorna os tokens e exibe mensagem listando TODOS os arquivos que
      // falharam, com a opção explícita de gerar mesmo assim (registrando a ausência).
      if (files && files.length > 0 && user) {
        let ing: Awaited<ReturnType<typeof ingestChatAttachments>> | null = null;
        try {
          ing = await ingestChatAttachments(sid, user.id, files);
        } catch (e) {
          console.warn("[handleSend] ingestao de anexos falhou:", e);
          // Falha total da ingestão também é bloqueante.
          await refundAndNotify("falha ao processar os anexos — reenvie os arquivos");
          return;
        }
        // Aviso de IMAGEM (Opção 2 — cirúrgico): imagem NÃO tem texto extraível hoje
        // (OCR é fase 2). Ela NÃO bloqueia e NÃO entra no cálculo de "documentos
        // ausentes" — só informa de forma explícita que o conteúdo dela não será
        // lido. A imagem continua anexada à conversa. (failedExtraction agora traz
        // apenas DOCUMENTOS textuais ilegíveis — imagens vão em imagesWithoutText.)
        if (ing.imagesWithoutText.length > 0) {
          const nomes = ing.imagesWithoutText.join(", ");
          const plural = ing.imagesWithoutText.length > 1;
          setMessages(prev => [...prev, {
            id: `local_img_notice_${Date.now()}`, role: "assistant", agent: "Sistema",
            content:
              `🖼️ Recebi ${plural ? "suas imagens" : "sua imagem"} **${nomes}**. ` +
              `Ainda não consigo extrair o texto ${plural ? "delas" : "dela"} automaticamente ` +
              `(isso virá com o OCR). Vou gerar a peça **sem considerar o conteúdo da imagem** — ` +
              `se ${plural ? "elas têm" : "ela tem"} informação importante, me conte por texto.`,
            timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
          }]);
        }

        // GATE (documentos textuais apenas): só bloqueia por upload falho ou por
        // documento textual sem texto legível. Imagens NÃO entram aqui.
        const failedAll = [...ing.failedUpload, ...ing.failedExtraction];
        if (failedAll.length > 0) {
          await refundTokens(cost, requestId, "Estorno automatico: anexos falharam — geração bloqueada");
          patchRunState(sid, null);
          const lines: string[] = [];
          if (ing.failedUpload.length) {
            lines.push(`**Não foram enviados** (falha de upload ou acima de 15 MB):\n${ing.failedUpload.map(n => `• ${n}`).join("\n")}`);
          }
          if (ing.failedExtraction.length) {
            lines.push(`**Enviados, mas sem texto legível** (use PDF/DOCX/TXT pesquisável, não imagem escaneada):\n${ing.failedExtraction.map(n => `• ${n}`).join("\n")}`);
          }
          setMessages(prev => [...prev, {
            id: `local_attach_block_${Date.now()}`, role: "assistant", agent: "Sistema",
            content:
              `🚫 **Geração bloqueada — anexos não ingeridos**\n\n${lines.join("\n\n")}\n\n` +
              `A peça **não** foi gerada para não basear a análise em documentos faltando. ` +
              `**Reenvie** os arquivos acima e mande novamente — ou, se preferir, gere mesmo sem eles ` +
              `(a análise registrará no topo quais documentos estão ausentes).`,
            timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
            actions: [{
              label: "Gerar mesmo assim, sem esses documentos",
              tone: "ghost",
              onClick: () => proceedGeneration(sid, val, failedAll),
            }],
          }]);
          return;
        }

        // Mudança 4C: aviso de ORÇAMENTO DE TOKENS. Soma os tokens estimados
        // (chars/4) do extracted_text ATIVO da sessão. Se exceder MAX_CASE_TOKENS,
        // o conteúdo será resumido (lossy) no servidor — os dados canônicos são
        // preservados, mas o usuário precisa SABER da compressão e confirmar.
        try {
          const { data: actives } = await supabase
            .from("chat_attachments")
            .select("file_name, extracted_text")
            .eq("session_id", sid).eq("is_active", true)
            .not("extracted_text", "is", null);
          const rows = ((actives || []) as { file_name: string; extracted_text: string | null }[]);
          const totalChars = rows.reduce((a, r) => a + (r.extracted_text?.length || 0), 0);
          const estTokens = Math.round(totalChars / 4);
          if (estTokens > CLIENT_MAX_CASE_TOKENS) {
            await refundTokens(cost, requestId, "Estorno automatico: confirmacao de orcamento de tokens");
            patchRunState(sid, null);
            const largest = [...rows]
              .sort((a, b) => (b.extracted_text?.length || 0) - (a.extracted_text?.length || 0))
              .slice(0, 5)
              .map(r => `• ${r.file_name} (~${Math.round((r.extracted_text?.length || 0) / 4000)}k tokens)`)
              .join("\n");
            setMessages(prev => [...prev, {
              id: `local_budget_${Date.now()}`, role: "assistant", agent: "Sistema",
              content:
                `⚠ **Documentos excedem o orçamento de contexto**\n\n` +
                `Os anexos ativos somam ~${Math.round(estTokens / 1000)}k tokens e ultrapassam o limite de ` +
                `${Math.round(CLIENT_MAX_CASE_TOKENS / 1000)}k. Para caber, o conteúdo será **resumido (com perda)** — ` +
                `os **dados canônicos** (CPF, contrato, valores) são preservados intactos, mas o detalhamento textual ` +
                `será comprimido.\n\nMaiores anexos:\n${largest}\n\nRemova anexos grandes para evitar a compressão, ` +
                `ou confirme para prosseguir.`,
              timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
              actions: [{
                label: "Gerar mesmo assim (conteúdo será resumido)",
                tone: "ghost",
                onClick: () => proceedGeneration(sid, val, []),
              }],
            }]);
            return;
          }
        } catch (e) {
          // Falha ao estimar orçamento não deve bloquear o envio; segue normalmente.
          console.warn("[handleSend] estimativa de orcamento falhou:", e);
        }
      }
      // Dispara a orquestracao assincrona. As mensagens chegam via Realtime.
      const { ok, runId, error: sendErr } = await startOrchestration(sid, val);
      if (!ok) {
        await refundAndNotify(friendlyError(sendErr ?? { error: "request_failed", message: "agente nao respondeu" }));
        return;
      }
      // Guarda a run corrente DESTA conversa no mapa: fonte de verdade para
      // reconciliar/encerrar o "pensando" se o Realtime perder o 'final' (ver
      // assinatura de orchestration_runs e o polling de reconciliação).
      if (runId) patchRunState(sid, { runId });
      // Catch-up: garante que a user message e a 1a etapa aparecam mesmo se o
      // canal assinou apos o INSERT inicial.
      scheduleCatchUp(sid);
    } catch (e: unknown) {
      await refundAndNotify(e instanceof Error ? e.message : "erro de rede");
    }
  };

  // ── Sidebar dynamic departments (workspace-based or legacy fallback) ──
  // Stages/areas only visible to tech; other users see only "Meu Assistente"
  const dynamicDepts: SidebarItem[] = (() => {
    if (!workspace?.role_template) return [];
    const items: SidebarItem[] = [
      { id: "assistente", label: "Meu Assistente", color: ACCENT, badge: 0, isVirtual: true },
    ];
    if (!hasRole("tech")) return items;
    const stages = workspace.role_template.stages || [];
    const areas = workspace.role_template.areas || [];
    for (const stage of stages) {
      if (stage === "todas") continue;
      const label = STAGE_LABELS[stage] || stage;
      const badge = (workspace.agents || []).filter(
        (a: WorkspaceAgent) => a.template_stage === stage,
      ).length;
      items.push({ id: `stage:${stage}`, label, color: ACCENT_SOFT, badge, isVirtual: true });
    }
    if (areas.length > 1) {
      for (const area of areas) {
        const label = `· ${AREA_LABELS[area] || area}`;
        items.push({ id: `area:${area}`, label, color: ACCENT, badge: 0, isVirtual: true });
      }
    }
    return items;
  })();

  const useDynamic = dynamicDepts.length > 0;
  const visibleDepts: SidebarItem[] = useDynamic
    ? dynamicDepts
    : DEPARTMENTS.filter(d => canAccessDepartment(d.id)).map(d => ({ id: d.id, label: d.label, color: d.color, badge: d.badge }));

  const activeSidebarItem = visibleDepts.find((d) => d.id === activeDept);
  const activeDeptData =
    DEPARTMENTS.find((d) => d.id === activeDept) ??
    (activeSidebarItem ? { id: activeSidebarItem.id, label: activeSidebarItem.label, color: activeSidebarItem.color, badge: activeSidebarItem.badge } : undefined);


  const visibleAgents = (() => {
    let result: ReturnType<typeof toLegacyAgent>[];
    if (useDynamic && workspace) {
      const wsAgents = workspace.agents || [];
      if (activeDept.startsWith("stage:")) {
        const stage = activeDept.slice(6);
        result = wsAgents.filter(a => a.template_stage === stage).map(toLegacyAgent);
      } else if (activeDept.startsWith("area:")) {
        const area = activeDept.slice(5);
        result = wsAgents.filter(a => a.template_area === area).map(toLegacyAgent);
      } else {
        result = wsAgents.map(toLegacyAgent);
      }
    } else {
      const deptAgents = activeDept === "assistente" ? AGENTS : getAgentsForDepartment(AGENTS, activeDept);
      result = deptAgents.filter(a => canSeeAgentRole(a.role)).slice(0, visibility.maxAgentsShown);
    }
    return result.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  })();

  // Itens do menu "Configurações" (grupo expansível na barra lateral).
  // Listar/Criar Funcionário são exclusivos do admin; Meus Tokens e Meu Perfil
  // ficam disponíveis a todos os usuários autenticados.
  const CONFIG_MENU_CHILDREN: MenuItem[] = [
    { id: "tokens", label: "Meus Tokens", icon: Coins, color: ACCENT, action: () => navigate("/tokens"), show: true },
    { id: "usuarios-criar", label: "Criar Funcionário", icon: UserPlus, color: ACCENT, action: () => openCreateEmployee(), show: canAccessAdmin },
    { id: "usuarios-listar", label: "Listar Funcionário", icon: Users, color: ACCENT_SOFT, action: () => navigate("/admin/funcionarios"), show: canAccessAdmin },
    { id: "perfil", label: "Meu Perfil", icon: User, color: ACCENT_SOFT, action: () => navigate("/perfil"), show: canSeeMenuItem("perfil") },
  ];

  // Menu items
  const MENU_ITEMS: MenuItem[] = [
    { id: "clientes", label: "Clientes", icon: Users, color: ACCENT, action: () => navigate("/clientes"), show: canSeeMenuItem("clientes") && canAccessClients },
    { id: "agenda", label: "Agenda", icon: CalendarDays, color: ACCENT, action: () => navigate("/sistema/agenda"), show: canSeeMenuItem("agenda") },
    { id: "audiencias", label: "Audiências", icon: Scale, color: ACCENT, action: () => navigate("/sistema/audiencias"), show: canSeeMenuItem("agenda") },
    { id: "admin", label: "Administração", icon: Crown, color: ACCENT_SOFT, action: () => navigate("/admin"), show: canSeeMenuItem("admin") && canAccessAdmin },
    // Dashboard restrito a tech + sócio (role_templates.code). Mesmo critério do
    // guard de rota (DashboardRoute), para link e rota ficarem 1:1.
    { id: "dashboard", label: "Dashboard", icon: BarChart3, color: ACCENT, action: () => navigate("/dashboard"), show: isDashboardRole(workspace?.role_template?.code) && !hasRole("tech") },
    // Dashboard IA (9.2) — mesmo gate tech+sócio (role_templates.code) e rota
    // guardada por DashboardRoute, para link e rota ficarem 1:1.
    { id: "dashboard_ia", label: "Dashboard IA", icon: Sparkles, color: ACCENT, action: () => navigate("/dashboard-ia"), show: isDashboardRole(workspace?.role_template?.code) },
    { id: "dashboard_operacional", label: "Recepção & Jurídico", icon: Users, color: ACCENT, action: () => navigate("/dashboard-operacional"), show: isSocioRole(workspace?.role_template?.code) },
    { id: "dashboard_prazos", label: "Prazos & Audiências", icon: Clock, color: ACCENT, action: () => navigate("/dashboard-prazos"), show: isSocioRole(workspace?.role_template?.code) },
    { id: "organograma", label: "Organograma", icon: Network, color: ACCENT_SOFT, action: () => navigate("/organograma"), show: false /* removido do menu do tech */ },
    { id: "eficiencia", label: "KPIs Eficiência", icon: Activity, color: ACCENT, action: () => navigate("/eficiencia"), show: canSeeMenuItem("eficiencia") && !hasRole("tech") },
    { id: "agentes", label: "Agentes", icon: Bot, color: ACCENT, action: () => navigate("/tech/agentes"), show: hasRole("tech") },
    { id: "testes", label: "Testes", icon: FlaskConical, color: ACCENT, action: () => navigate("/tech/testes"), show: hasRole("tech") },
    { id: "crons", label: "Crons", icon: Clock, color: ACCENT_SOFT, action: () => navigate("/tech/crons"), show: hasRole("tech") },
    { id: "providers", label: "Providers", icon: Settings, color: ACCENT, action: () => navigate("/tech/providers"), show: hasRole("tech") },
    { id: "importar", label: "Importar dados", icon: Upload, color: ACCENT_SOFT, action: () => navigate("/tech/importar"), show: isRecepcaoRole(workspace?.role_template?.code) },
    { id: "configuracoes", label: "Configurações", icon: Settings, color: ACCENT, action: () => {}, show: CONFIG_MENU_CHILDREN.some(c => c.show), children: CONFIG_MENU_CHILDREN },
    { id: "sair", label: "Sair", icon: LogOut, color: "#FEFCE8", action: () => signOut(), show: canSeeMenuItem("sair") },
  ];

  // Tooltip overlay state
  const [openTooltipCount, setOpenTooltipCount] = useState(0);
  const [tooltipOverlay] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("jc-tooltip-overlay") === "1";
  });

  // withTooltip for toggle buttons (outside sub-components)
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
            trackUiEvent("tooltip_open", { surface, target_id: targetId, target_label: label });
          }
        }}
      >
        <TooltipTrigger asChild>{node}</TooltipTrigger>
        <TooltipContent side={side} sideOffset={8} onEscapeKeyDown={(e) => { e.preventDefault(); }}>
          {label}
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <div data-theme="dark">
      <GlobalStyles />
      <TooltipProvider delayDuration={150}>
      <div className="jc-root">
        {/* MOBILE OVERLAY */}
        <div className={`jc-sidebar-overlay ${sidebarOpen ? "visible" : ""}`} onClick={() => setSidebarOpen(false)} />

        {/* Optional dim overlay when collapsed-sidebar tooltips are open */}
        {tooltipOverlay && openTooltipCount > 0 && (
          <div className="jc-tooltip-overlay" aria-hidden="true" />
        )}

        {/* SIDEBAR */}
        <JurisSidebar
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          sidebarCollapsed={sidebarCollapsed}
          sidebarSearch={sidebarSearch}
          setSidebarSearch={setSidebarSearch}
          activeDept={activeDept}
          setActiveDept={setActiveDept}
          visibleDepts={visibleDepts}
          visibleAgents={visibleAgents}
          menuItems={MENU_ITEMS}
          systemOnline={systemOnline}
          openTooltipCount={openTooltipCount}
          setOpenTooltipCount={setOpenTooltipCount}
          hasRole={hasRole}
          chatSessions={sessionsWithStatus}
          activeSessionId={assistantSessionId}
          onSwitchSession={switchSession}
          onNewChat={startNewChat}
          onDeleteSession={deleteSession}
        />

        {/* MAIN */}
        <main className="jc-main">
          <JurisTopBar
            activeDeptData={activeDeptData}
            setSidebarOpen={setSidebarOpen}
            user={user}
            inboxCount={inboxCount}
            validationCount={validationCount}
            isReadOnly={isReadOnly}
            roleLabel={roleLabel}
            entryAgentId={entryAgentId}
            agentsLoading={agentsLoading}
            showWelcome={showWelcome}
          />

          {/* "Atuar como setor" (só tech): escolhe o usuário-alvo p/ testar os
              agentes daquele setor. Badge de teste + dry-run quando ativo. */}
          {hasRole("tech") && (
            <TechActingAsBar
              sectors={testSectors}
              activeTarget={activeTest}
              onSelect={handleSelectSector}
              disabled={thinking}
            />
          )}

          <JurisChatPanel
            messages={messages}
            thinking={thinking}
            thinkingAgentName="Meu Assistente"
            liveStage={liveStage}
            thinkingStartedAt={thinkingStartedAt}
            showWelcome={showWelcome}
            setShowWelcome={setShowWelcome}
            inputVal={inputVal}
            setInputVal={setInputVal}
            handleSend={handleSend}
            onStop={handleStop}
            canStop={!!openRun?.runId}
            stopping={stopping}
            isRecording={isRecording}
            toggleRecording={toggleRecording}
            speechSupported={speechSupported}
            isReadOnly={isReadOnly}
            roleLabel={roleLabel}
            activeDeptLabel={activeDeptData?.label || "departamento"}
            canAuthorPeca={canAuthorPeca}
            onCadastrarClienteFromMeeting={handleCadastrarClienteFromMeeting}
            onCadastrarClienteFromTask={handleCadastrarClienteFromTask}
            onClienteCadastrado={handleClienteCadastrado}
            cadastroInitialValues={cadastroInitialValues}
          />
        </main>

        {/* TOGGLES — outside panels to escape overflow:hidden */}
        {withTooltip("Ctrl+B",
          <button
            className={`jc-sidebar-toggle ${sidebarCollapsed ? "is-collapsed" : ""}`}
            onClick={() => handleSidebarToggle("click")}
            aria-label={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
            aria-expanded={!sidebarCollapsed}
            aria-controls="jc-sidebar"
            aria-keyshortcuts="Control+B Meta+B"
            type="button"
          >
            <span className="jc-toggle-arrow" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </span>
          </button>
        , "sidebar_toggle_btn")}

        {/* Live region for keyboard shortcut announcements */}
        <div className="jc-sr-only" role="status" aria-live="polite" aria-atomic="true">
          {shortcutAnnouncement}
        </div>

        {showCreateEmployee && (
          <div
            className="jc-create-employee-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Novo funcionário"
          >
            <CreateEmployee embedded onClose={closeCreateEmployee} />
          </div>
        )}
      </div>
      </TooltipProvider>
    </div>
  );
}
