import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import CreateEmployee from "@/pages/CreateEmployee";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useAgents } from "@/hooks/useAgents";
import { useInboxCount } from "@/hooks/useUserTasks";
import { useInterAssistantCount } from "@/hooks/useInterAssistant";
import { useMyWorkspace, STAGE_LABELS, AREA_LABELS, type WorkspaceAgent } from "@/hooks/useMyWorkspace";
import { useChatOrchestrator, friendlyError } from "@/hooks/useChatOrchestrator";
import { ingestChatAttachments } from "@/lib/ingestChatAttachments";
import { useRealtimeNotifications } from "@/hooks/useRealtimeNotifications";
import { useBottleneckDetection } from "@/hooks/useBottleneckDetection";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useUiPreferences } from "@/hooks/useUiPreferences";
import { useMasterAdmin } from "@/hooks/useMasterAdmin";
import { trackUiEvent } from "@/lib/uiTracking";
import {
  Sparkles, Crown, Users, BarChart3, Network, Activity, User, LogOut,
  Bot, Clock, Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Sub-components
import JurisSidebar from "./juris-cloud/JurisSidebar";
import JurisTopBar from "./juris-cloud/JurisTopBar";
import JurisChatPanel from "./juris-cloud/JurisChatPanel";
import JurisRightPanel from "./juris-cloud/JurisRightPanel";

// Shared constants & types
import type { Agent, JcChatMessage, SidebarItem, MenuItem } from "./juris-cloud/types";
import { parseAgentPermissions } from "./juris-cloud/types";
import {
  ACCENT, ACCENT_SOFT,
  DEPARTMENTS, AGENTS_FALLBACK, ALERTS,
  ALL_COMMANDS, INITIAL_MESSAGES,
  getTokenCost, formatTokenRefundMessage, formatInsufficientBalanceMessage,
  getAgentsForDepartment, toLegacyAgent,
} from "./juris-cloud/constants";

/* ─────────────────────────────────────────────────────────────
   JURISAI  –  Sua força de trabalho de IA jurídica
   Orchestrator — composes sidebar, topbar, chat, right panel.
───────────────────────────────────────────────────────────── */

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
    .jc-input-area, .jc-msg-bubble, .jc-kpi, .jc-case-card, .jc-alert-item,
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
    .jc-sidebar.collapsed { width: 52px; min-width: 52px; }
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
    .jc-sidebar-toggle.is-collapsed { left: 56px; }
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
    .jc-alert-chip {
      display: flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 20px;
      cursor: pointer; font-size: 11px; font-weight: 500; border: 1px solid; transition: opacity 0.15s;
      max-width: min(240px, 36vw); flex-shrink: 1;
    }
    .jc-alert-chip:hover { opacity: 0.8; }
    .jc-alert-chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .jc-alert-chip.fatal { background: rgba(234,179,8,0.12); border-color: rgba(250,204,21,0.45); color: #FEF9C3; }
    .jc-alert-chip.warning { background: rgba(234,179,8,0.08); border-color: rgba(234,179,8,0.35); color: #FACC15; }
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
      max-width: 75%; background: var(--bg3); border: 1px solid var(--border);
      border-radius: 12px; padding: 14px 16px; font-size: 14px; line-height: 1.7; color: var(--text1);
    }
    .jc-msg-wrap.user .jc-msg-bubble { background: var(--user-bubble-bg); border-color: var(--user-bubble-border); }
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
    .jc-card-briefing {
      background: linear-gradient(135deg, rgba(234,179,8,0.08), rgba(0,0,0,0.12));
      border: 1px solid rgba(234,179,8,0.28); border-radius: 14px; padding: 20px; margin-top: 2px;
    }
    .jc-card-briefing-title { font-family: var(--font-disp); font-size: 22px; font-weight: 600; color: var(--gold2); margin-bottom: 4px; }
    .jc-card-briefing-sub { font-size: 12px; color: var(--text3); margin-bottom: 16px; }
    .jc-card-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
    .jc-kpi {
      background: var(--bg2); border: 1px solid var(--border);
      border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 4px;
    }
    .jc-kpi:hover { border-color: var(--border2); }
    .jc-kpi-value { font-family: var(--font-disp); font-size: 26px; font-weight: 600; line-height: 1; }
    .jc-kpi-label { font-size: 10px; color: var(--text3); text-transform: uppercase; letter-spacing: 0.08em; }
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
      .jc-sidebar-overlay.visible { display: block; }
      .jc-hamburger { display: block; }
      .jc-topbar { padding: 8px 10px 10px; gap: 8px; }
      .jc-topbar-brand { flex-basis: 100%; }
      .jc-topbar-trailing { flex-basis: 100%; justify-content: flex-start; }
      .jc-alert-chip { display: none; }
      .jc-dept-title { font-size: 16px; }
      .jc-msg-wrap { padding: 8px 16px; }
      .jc-msg-bubble { max-width: 85%; font-size: 13px; }
      .jc-card-grid { grid-template-columns: 1fr 1fr; }
      .jc-input-area { padding: 8px 12px 12px; }
      .jc-cmd { font-size: 10px; padding: 3px 8px; }
    }
    @media (max-width: 480px) {
      .jc-card-grid { grid-template-columns: 1fr 1fr; gap: 6px; }
      .jc-kpi { padding: 8px; }
      .jc-kpi-value { font-size: 20px; }
      .jc-user-chip { display: none; }
    }
  `}</style>
);

// ── MAIN COMPONENT ───────────────────────────────────────────
export default function JurisCloudOS() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const showCreateEmployee = searchParams.get("criar") === "funcionario";
  const openCreateEmployee = () => setSearchParams({ criar: "funcionario" });
  const closeCreateEmployee = () => setSearchParams({});
  const { user, signOut, hasRole } = useAuth();
  const { isMaster } = useMasterAdmin();
  const { canAccessDepartment, canSeeCommand, canSeeMenuItem, canSeeAgentRole, canAccessAdmin, canAccessClients, isReadOnly, roleLabel, visibility } = usePermissions();
  useRealtimeNotifications();
  useBottleneckDetection(navigate);
  const { tokenBalance, consumeTokensWithRef, refundTokens } = useTokenBalance(navigate);

  const { agents: dbAgents, loading: agentsLoading } = useAgents();
  const inboxCount = useInboxCount();
  const interAssistantCount = useInterAssistantCount();
  const [validationCount, setValidationCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const fetchValidation = async () => {
      const { data } = await supabase.rpc("get_validation_count" as never);
      if (!cancelled && typeof data === "number") setValidationCount(data);
    };
    void fetchValidation();
    const interval = setInterval(fetchValidation, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const { workspace } = useMyWorkspace();
  const { startSession, startOrchestration } = useChatOrchestrator();
  const [assistantSessionId, setAssistantSessionId] = useState<string | null>(null);
  const [entryAgentId, setEntryAgentId] = useState<string | null>(null);

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
      const ceo = dbAgents.find((a) => a.role === "ceo");
      const { data: configured } = await supabase
        .from("agents")
        .select("id")
        .not("provider" as never, "is", null)
        .not("model" as never, "is", null);
      const configuredIds = new Set(((configured as unknown as { id: string }[]) || []).map((r) => r.id));
      const pick = ceo && configuredIds.has(ceo.id)
        ? ceo
        : dbAgents.find((a) => configuredIds.has(a.id));
      if (pick) setEntryAgentId(pick.id);
    })();
  }, [agentsLoading, dbAgents]);

  useEffect(() => { setAssistantSessionId(null); }, [entryAgentId]);

  const [showWelcome, setShowWelcome]     = useState(true);
  const [activeDept, setActiveDept]       = useState("assistente");
  const [messages, setMessages]           = useState<JcChatMessage[]>(INITIAL_MESSAGES);
  const [inputVal, setInputVal]           = useState("");
  const [thinking, setThinking]           = useState(false);
  const [rightTab, setRightTab]           = useState("processos");
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [sidebarOpen, setSidebarOpen]     = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const {
    sidebarCollapsed, rightCollapsed,
    setSidebarCollapsed, setRightCollapsed,
  } = useUiPreferences();
  const [isRecording, setIsRecording]     = useState(false);
  const [shortcutAnnouncement, setShortcutAnnouncement] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", "dark");
      document.documentElement.classList.add("dark");
    }
  }, []);

  // V23: acompanha a orquestracao via Realtime. Etapas (role=system) e a resposta
  // final (role=assistant) chegam como linhas em chat_messages. Fetch inicial
  // (catch-up) + assinatura de INSERTs. Dedup por id; desliga "thinking" no final.
  useEffect(() => {
    if (!assistantSessionId) return;
    let cancelled = false;

    const mapRow = (r: Record<string, any>): JcChatMessage => ({
      id: r.id,
      role: r.role,
      agent: r.metadata?.agent_name || (r.role === "assistant" ? "Assistente" : undefined),
      content: r.content,
      kind: r.metadata?.kind,
      stage: r.metadata?.stage,
      timestamp: r.created_at
        ? new Date(r.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
        : new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    });
    const upsert = (rows: JcChatMessage[]) => setMessages(prev => {
      const seen = new Set(prev.map(m => String(m.id)));
      const add = rows.filter(r => !seen.has(String(r.id)));
      return add.length ? [...prev, ...add] : prev;
    });

    (async () => {
      const { data } = await supabase.from("chat_messages")
        .select("id, role, content, metadata, created_at, sequence_number")
        .eq("session_id", assistantSessionId)
        .order("sequence_number", { ascending: true });
      if (cancelled || !data) return;
      upsert((data as Record<string, any>[]).map(mapRow));
      if ((data as Record<string, any>[]).some(r => r.metadata?.kind === "final" || r.metadata?.kind === "error")) setThinking(false);
    })();

    const channel = supabase.channel(`chat:${assistantSessionId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `session_id=eq.${assistantSessionId}` },
        (payload) => {
          const row = payload.new as Record<string, any>;
          upsert([mapRow(row)]);
          if (row.metadata?.kind === "final" || row.metadata?.kind === "error") setThinking(false);
        })
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [assistantSessionId]);

  const systemOnline = !AGENTS.some(a => a.status === "alert") && !ALERTS.some(a => a.type === "fatal");

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

  const handleRightToggle = (source: "click" | "keyboard" = "click") => {
    const narrow = typeof window !== "undefined" && window.matchMedia("(max-width: 1024px)").matches;
    if (narrow) {
      if (!rightPanelOpen) {
        setRightPanelOpen(true);
        setRightCollapsed(false);
        trackUiEvent("right_panel_toggle", { surface: "right_panel", collapsed: false, source });
        announce("Painel de operações expandido");
        return;
      }
      const nextCollapsed = !rightCollapsed;
      setRightCollapsed(nextCollapsed);
      if (nextCollapsed) setRightPanelOpen(false);
      trackUiEvent("right_panel_toggle", { surface: "right_panel", collapsed: nextCollapsed, source });
      announce(nextCollapsed ? "Painel de operações recolhido" : "Painel de operações expandido");
      return;
    }
    setRightCollapsed(prev => {
      const next = !prev;
      trackUiEvent("right_panel_toggle", { surface: "right_panel", collapsed: next, source });
      announce(next ? "Painel de operações recolhido" : "Painel de operações expandido");
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
      } else if (key === "o") {
        e.preventDefault();
        trackUiEvent("shortcut_used", { target_id: "ctrl+o", surface: "right_panel" });
        handleRightToggle("keyboard");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Voice input
  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }
    const w = window as Window & {
      SpeechRecognition?: new () => SpeechRecognition;
      webkitSpeechRecognition?: new () => SpeechRecognition;
    };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.lang = "pt-BR";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = e.results[0][0].transcript;
      setInputVal(prev => prev + (prev ? " " : "") + transcript);
    };
    recognition.onend = () => setIsRecording(false);
    recognition.onerror = () => setIsRecording(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  };

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

    // V23: a user message, as etapas e a resposta final chegam via Realtime
    // (inseridas pelo backend). Nao inserimos a conversa localmente — apenas
    // mensagens de SISTEMA locais (saldo/estorno) que nao passam pelo banco.
    setInputVal("");
    setThinking(true);

    const refundAndNotify = async (reason: string) => {
      await refundTokens(cost, requestId, `Estorno automatico: ${reason}`);
      setThinking(false);
      setMessages(prev => [...prev, {
        id: `local_${Date.now()}`, role: "assistant", agent: "Sistema",
        content: formatTokenRefundMessage(cost, reason),
        timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      }]);
    };

    try {
      if (!entryAgentId) {
        await refundAndNotify(
          "nenhum agente com IA configurada — vá em /admin/agentes, escolha o agente, na aba Modelo configure provedor + modelo, e salve",
        );
        return;
      }
      let sid = assistantSessionId;
      if (!sid) {
        const { sessionId, error: startErr } = await startSession(entryAgentId, { title: "Meu Assistente" });
        if (!sessionId) { await refundAndNotify(friendlyError(startErr)); return; }
        setAssistantSessionId(sessionId); // dispara a assinatura Realtime
        sid = sessionId;
      }
      // Canal A: sobe e extrai os DOCUMENTOS DO CASO ANTES de orquestrar, para que
      // o especialista (N3) leia o conteudo real (nao apenas os nomes dos arquivos).
      if (files && files.length > 0 && user) {
        try {
          const ing = await ingestChatAttachments(sid, user.id, files);
          if (ing.failedUpload.length || ing.failedExtraction.length) {
            const parts: string[] = [];
            if (ing.failedUpload.length) parts.push(`falha ao enviar: ${ing.failedUpload.join(", ")}`);
            if (ing.failedExtraction.length) parts.push(`sem texto legivel (use PDF/DOCX/TXT pesquisavel): ${ing.failedExtraction.join(", ")}`);
            setMessages(prev => [...prev, {
              id: `local_attach_${Date.now()}`, role: "assistant", agent: "Sistema",
              content: `⚠ Anexos — ${parts.join(" · ")}.`,
              timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
            }]);
          }
        } catch (e) {
          console.warn("[handleSend] ingestao de anexos falhou:", e);
        }
      }
      // Dispara a orquestracao assincrona. As mensagens chegam via Realtime.
      const { ok, error: sendErr } = await startOrchestration(sid, val);
      if (!ok) {
        await refundAndNotify(friendlyError(sendErr ?? { error: "request_failed", message: "agente nao respondeu" }));
        return;
      }
      // Catch-up: garante que a user message e a 1a etapa aparecam mesmo se o
      // canal assinou apos o INSERT inicial.
      setTimeout(async () => {
        const { data } = await supabase.from("chat_messages")
          .select("id, role, content, metadata, created_at, sequence_number")
          .eq("session_id", sid).order("sequence_number", { ascending: true });
        if (!data) return;
        setMessages(prev => {
          const seen = new Set(prev.map(m => String(m.id)));
          const add = (data as Record<string, any>[])
            .filter(r => !seen.has(String(r.id)))
            .map(r => ({
              id: r.id, role: r.role,
              agent: r.metadata?.agent_name || (r.role === "assistant" ? "Assistente" : undefined),
              content: r.content, kind: r.metadata?.kind, stage: r.metadata?.stage,
              timestamp: new Date(r.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
            } as JcChatMessage));
          return add.length ? [...prev, ...add] : prev;
        });
      }, 1200);
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

  const visibleCommands = ALL_COMMANDS.filter(c => canSeeCommand(c));

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

  // Menu items
  const MENU_ITEMS: MenuItem[] = [
    { id: "clientes", label: "Clientes", icon: Users, color: ACCENT, action: () => navigate("/clientes"), show: canSeeMenuItem("clientes") && canAccessClients },
    { id: "admin", label: "Administração", icon: Crown, color: ACCENT_SOFT, action: () => navigate("/admin"), show: canSeeMenuItem("admin") && canAccessAdmin },
    { id: "dashboard", label: "Dashboard", icon: BarChart3, color: ACCENT, action: () => navigate("/dashboard"), show: canSeeMenuItem("dashboard") },
    { id: "organograma", label: "Organograma", icon: Network, color: ACCENT_SOFT, action: () => navigate("/organograma"), show: canSeeMenuItem("organograma") && hasRole("tech") },
    { id: "eficiencia", label: "KPIs Eficiência", icon: Activity, color: ACCENT, action: () => navigate("/eficiencia"), show: canSeeMenuItem("eficiencia") },
    { id: "agentes", label: "Agentes", icon: Bot, color: ACCENT, action: () => navigate("/admin/agentes"), show: hasRole("tech") },
    { id: "crons", label: "Crons", icon: Clock, color: ACCENT_SOFT, action: () => navigate("/admin/crons"), show: hasRole("tech") },
    { id: "providers", label: "Providers", icon: Settings, color: ACCENT, action: () => navigate("/configuracoes/providers"), show: hasRole("tech") },
    { id: "perfil", label: "Meu Perfil", icon: User, color: ACCENT_SOFT, action: () => navigate("/perfil"), show: canSeeMenuItem("perfil") },
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
        />

        {/* MAIN */}
        <main className="jc-main">
          <JurisTopBar
            activeDeptData={activeDeptData}
            setSidebarOpen={setSidebarOpen}
            isMaster={isMaster}
            openCreateEmployee={openCreateEmployee}
            tokenBalance={tokenBalance}
            user={user}
            inboxCount={inboxCount}
            interAssistantCount={interAssistantCount}
            validationCount={validationCount}
            visibility={visibility}
            isReadOnly={isReadOnly}
            roleLabel={roleLabel}
            entryAgentId={entryAgentId}
            agentsLoading={agentsLoading}
            showWelcome={showWelcome}
          />

          <JurisChatPanel
            messages={messages}
            thinking={thinking}
            thinkingAgentName={AGENTS[Math.floor(Math.random() * 5)]?.name || "Assistente"}
            showWelcome={showWelcome}
            setShowWelcome={setShowWelcome}
            inputVal={inputVal}
            setInputVal={setInputVal}
            handleSend={handleSend}
            visibleCommands={visibleCommands}
            isRecording={isRecording}
            toggleRecording={toggleRecording}
            isReadOnly={isReadOnly}
            roleLabel={roleLabel}
            activeDeptLabel={activeDeptData?.label || "departamento"}
          />
        </main>

        {/* RIGHT PANEL */}
        <JurisRightPanel
          rightPanelOpen={rightPanelOpen}
          setRightPanelOpen={setRightPanelOpen}
          rightCollapsed={rightCollapsed}
          setRightCollapsed={setRightCollapsed}
          rightTab={rightTab}
          setRightTab={setRightTab}
          allAgents={AGENTS}
          visibleAgents={visibleAgents}
          visibility={visibility}
          hasRole={hasRole}
        />

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

        {withTooltip("Ctrl+O",
          <button
            className={`jc-right-toggle-desk ${rightCollapsed ? "is-collapsed" : ""} ${rightPanelOpen ? "is-panel-open" : ""}`}
            onClick={() => handleRightToggle("click")}
            aria-label={rightCollapsed ? "Expandir painel" : "Recolher painel"}
            aria-expanded={!rightCollapsed}
            aria-controls="jc-right-panel"
            aria-keyshortcuts="Control+O Meta+O"
            type="button"
          >
            <span className="jc-toggle-arrow" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </span>
          </button>,
          "right_panel_toggle_btn",
          { side: "left", surface: "right_panel", alwaysOn: true }
        )}

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
