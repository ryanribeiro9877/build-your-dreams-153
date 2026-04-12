import { useState, useEffect, useRef } from "react";

/* ─────────────────────────────────────────────────────────────
   JURISCLOUD OS  –  Sistema Operacional Empresarial Conversacional
   Paste this entire file into Lovable as a single component.
   Uses only Tailwind + Google Fonts (loaded via style tag).
───────────────────────────────────────────────────────────── */

// ── DATA ────────────────────────────────────────────────────
const DEPARTMENTS = [
  { id: "assistente",  label: "Meu Assistente",  icon: "◈",  color: "#c9a84c", badge: 8  },
  { id: "recepcao",    label: "Recepção",         icon: "⌀",  color: "#4f8ef7", badge: 3  },
  { id: "bancario",    label: "Bancário",         icon: "⬡",  color: "#2dd4a0", badge: 12 },
  { id: "civel",       label: "Cível",            icon: "⬠",  color: "#a78bfa", badge: 5  },
  { id: "previdencia", label: "Previdenciário",   icon: "⬟",  color: "#f59e0b", badge: 7  },
  { id: "familia",     label: "Família",          icon: "⬢",  color: "#f472b6", badge: 2  },
  { id: "financeiro",  label: "Financeiro",       icon: "⬣",  color: "#34d399", badge: 4  },
  { id: "protocolo",   label: "Protocolo",        icon: "⎔",  color: "#60a5fa", badge: 9  },
  { id: "calculos",    label: "Cálculos",         icon: "⬭",  color: "#fb923c", badge: 1  },
  { id: "diretoria",   label: "Diretoria",        icon: "◉",  color: "#c9a84c", badge: 0  },
];

const AGENTS = [
  { id: 1, name: "Recepção Inteligente",  status: "active",  avatar: "RI", color: "#4f8ef7" },
  { id: 2, name: "Pesquisador Jurídico",  status: "active",  avatar: "PJ", color: "#2dd4a0" },
  { id: 3, name: "Redator Processual",    status: "idle",    avatar: "RP", color: "#a78bfa" },
  { id: 4, name: "Analista de Contratos", status: "active",  avatar: "AC", color: "#f59e0b" },
  { id: 5, name: "Controlador de Prazos", status: "alert",   avatar: "CP", color: "#ef4444" },
  { id: 6, name: "Gerador de Relatórios", status: "idle",    avatar: "GR", color: "#34d399" },
  { id: 7, name: "Gestor de Clientes",    status: "active",  avatar: "GC", color: "#60a5fa" },
  { id: 8, name: "Supervisor Contencioso",status: "active",  avatar: "SC", color: "#c9a84c" },
];

const PROCESSES = [
  { id: "0023847", client: "Marcos Vinícius S.",  area: "Bancário",  status: "urgente",   prazo: "HOJE",    tribunal: "TJBA", value: "R$ 48.200" },
  { id: "0019234", client: "Ana Paula Ferreira",  area: "Cível",     status: "normal",    prazo: "3 dias",  tribunal: "TJBA", value: "R$ 22.000" },
  { id: "0031102", client: "Roberto Mendes",      area: "Previdência",status: "revisar",  prazo: "5 dias",  tribunal: "TRF5", value: "R$ 91.500" },
  { id: "0041887", client: "Clínica São Lucas",   area: "Contratos", status: "normal",    prazo: "7 dias",  tribunal: "—",    value: "R$ 135.000"},
];

const ALERTS = [
  { type: "fatal",   text: "Prazo fatal: caso #0023847 – Bancário",  time: "HOJE 17h" },
  { type: "warning", text: "4 clientes sem retorno há +48h",          time: "2h atrás"  },
  { type: "info",    text: "12 iniciais aguardam aprovação",          time: "Hoje"      },
  { type: "success", text: "Protocolo #0029991 confirmado no TJBA",  time: "09:42"     },
];

const INITIAL_MESSAGES = [
  {
    id: 1, role: "assistant", agent: "Meu Assistente",
    content: null,
    card: {
      type: "briefing",
      title: "Bom dia, Dr. JurisCloud ✦",
      summary: "Aqui está sua visão operacional de hoje",
      items: [
        { icon: "⚠", label: "Prazos críticos",      value: "3", accent: "#ef4444" },
        { icon: "✦", label: "Revisões pendentes",    value: "12", accent: "#f59e0b" },
        { icon: "◈", label: "Novos contratos",       value: "2", accent: "#2dd4a0" },
        { icon: "⬡", label: "Audiências esta semana",value: "7", accent: "#4f8ef7" },
        { icon: "◉", label: "Leads qualificados",    value: "5", accent: "#c9a84c" },
        { icon: "⬠", label: "Protocolos em fila",   value: "9", accent: "#a78bfa" },
      ],
    },
    timestamp: "08:00",
  },
  {
    id: 2, role: "user",
    content: "Mostre os casos mais urgentes do bancário hoje",
    timestamp: "08:03",
  },
  {
    id: 3, role: "assistant", agent: "Pesquisador Jurídico",
    content: "Identifiquei **3 casos críticos** no departamento bancário. O caso #0023847 tem prazo fatal **hoje às 17h** para contestação. Recomendo acionar o Redator Processual imediatamente.",
    card: {
      type: "process-list",
      processes: PROCESSES.filter(p => p.area === "Bancário" || p.area === "Cível"),
    },
    timestamp: "08:03",
  },
];

const QUICK_COMMANDS = [
  "Gerar petição inicial",
  "Ver prazos fatais",
  "Resumir caso",
  "Avisar cliente",
  "Abrir fila de revisão",
  "Relatório do dia",
];

// ── STYLE INJECTION ──────────────────────────────────────────
const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg:       #09090f;
      --bg2:      #111118;
      --bg3:      #16161f;
      --bg4:      #1d1d28;
      --border:   #252534;
      --border2:  #2e2e42;
      --gold:     #c9a84c;
      --gold2:    #e8c96a;
      --blue:     #4f8ef7;
      --teal:     #2dd4a0;
      --purple:   #a78bfa;
      --red:      #ef4444;
      --amber:    #f59e0b;
      --text1:    #eeeef5;
      --text2:    #9898b0;
      --text3:    #5a5a72;
      --font-disp: 'Cormorant Garamond', Georgia, serif;
      --font-body: 'DM Sans', sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
    }
    body { background: var(--bg); color: var(--text1); font-family: var(--font-body); }

    .jc-root { display: flex; height: 100vh; overflow: hidden; background: var(--bg); }

    /* ── SIDEBAR ── */
    .jc-sidebar {
      width: 260px; min-width: 260px;
      background: var(--bg2);
      border-right: 1px solid var(--border);
      display: flex; flex-direction: column;
      overflow: hidden;
    }
    .jc-logo {
      padding: 20px 20px 16px;
      border-bottom: 1px solid var(--border);
      display: flex; align-items: center; gap: 10px;
    }
    .jc-logo-mark {
      width: 32px; height: 32px;
      background: linear-gradient(135deg, var(--gold), var(--gold2));
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-size: 16px; font-weight: 700; color: #0a0a12;
      font-family: var(--font-disp);
      box-shadow: 0 0 16px rgba(201,168,76,0.35);
    }
    .jc-logo-text { font-family: var(--font-disp); font-size: 18px; font-weight: 600; letter-spacing: 0.02em; }
    .jc-logo-sub  { font-size: 9px; color: var(--text3); letter-spacing: 0.12em; text-transform: uppercase; }

    .jc-search {
      margin: 12px 12px 8px;
      background: var(--bg3); border: 1px solid var(--border);
      border-radius: 8px; padding: 8px 12px;
      display: flex; align-items: center; gap: 8px;
      cursor: text; transition: border-color 0.2s;
    }
    .jc-search:hover { border-color: var(--border2); }
    .jc-search input {
      background: none; border: none; outline: none;
      font-family: var(--font-body); font-size: 12px; color: var(--text2);
      width: 100%;
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
      transition: background 0.15s; position: relative;
      margin-bottom: 1px;
    }
    .jc-nav-item:hover { background: var(--bg4); }
    .jc-nav-item.active { background: rgba(201,168,76,0.08); border: 1px solid rgba(201,168,76,0.15); }
    .jc-nav-icon { font-size: 14px; width: 20px; text-align: center; opacity: 0.85; }
    .jc-nav-label { font-size: 13px; font-weight: 400; color: var(--text1); flex: 1; }
    .jc-nav-badge {
      font-size: 10px; font-family: var(--font-mono);
      background: rgba(255,255,255,0.07); border-radius: 10px;
      padding: 1px 7px; color: var(--text2); min-width: 22px; text-align: center;
    }
    .jc-nav-badge.alert { background: rgba(239,68,68,0.18); color: #ff8080; }

    .jc-agents-section { padding: 8px; border-top: 1px solid var(--border); }
    .jc-agent-item {
      display: flex; align-items: center; gap: 8px;
      padding: 6px 8px; border-radius: 6px; cursor: pointer;
      transition: background 0.15s;
    }
    .jc-agent-item:hover { background: var(--bg3); }
    .jc-agent-avatar {
      width: 26px; height: 26px; border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      font-size: 9px; font-weight: 700; font-family: var(--font-mono);
      flex-shrink: 0;
    }
    .jc-agent-name { font-size: 11px; color: var(--text2); flex: 1; line-height: 1.2; }
    .jc-agent-dot {
      width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
    }
    .jc-agent-dot.active  { background: var(--teal); box-shadow: 0 0 6px rgba(45,212,160,0.6); animation: pulse 2s infinite; }
    .jc-agent-dot.idle    { background: var(--border2); }
    .jc-agent-dot.alert   { background: var(--red); box-shadow: 0 0 6px rgba(239,68,68,0.6); animation: pulse 1s infinite; }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    /* ── MAIN ── */
    .jc-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

    /* TOPBAR */
    .jc-topbar {
      height: 52px; min-height: 52px;
      background: var(--bg2); border-bottom: 1px solid var(--border);
      display: flex; align-items: center; padding: 0 20px; gap: 12px;
    }
    .jc-dept-title { font-family: var(--font-disp); font-size: 20px; font-weight: 600; color: var(--text1); letter-spacing: 0.01em; }
    .jc-dept-sub   { font-size: 11px; color: var(--text3); letter-spacing: 0.08em; text-transform: uppercase; margin-top: 1px; }
    .jc-topbar-spacer { flex: 1; }
    .jc-alert-chip {
      display: flex; align-items: center; gap: 6px;
      padding: 5px 10px; border-radius: 20px; cursor: pointer;
      font-size: 11px; font-weight: 500; border: 1px solid;
      transition: opacity 0.15s;
    }
    .jc-alert-chip:hover { opacity: 0.8; }
    .jc-alert-chip.fatal   { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.3); color: #ff8080; }
    .jc-alert-chip.warning { background: rgba(245,158,11,0.1); border-color: rgba(245,158,11,0.3); color: #fbbf24; }
    .jc-alert-chip.info    { background: rgba(79,142,247,0.1); border-color: rgba(79,142,247,0.3); color: #93c5fd; }
    .jc-alert-chip.success { background: rgba(45,212,160,0.1); border-color: rgba(45,212,160,0.3); color: #6ee7b7; }
    .jc-user-chip {
      display: flex; align-items: center; gap: 8px;
      padding: 4px 12px 4px 4px;
      background: var(--bg3); border: 1px solid var(--border);
      border-radius: 20px; cursor: pointer;
    }
    .jc-user-avatar {
      width: 26px; height: 26px; border-radius: 50%;
      background: linear-gradient(135deg, var(--gold), var(--gold2));
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 700; color: #0a0a12; font-family: var(--font-disp);
    }
    .jc-user-name { font-size: 12px; color: var(--text1); }

    /* MESSAGES */
    .jc-messages {
      flex: 1; overflow-y: auto;
      padding: 24px 0;
      scroll-behavior: smooth;
    }
    .jc-messages::-webkit-scrollbar { width: 4px; }
    .jc-messages::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }

    .jc-msg-wrap {
      display: flex; gap: 12px;
      padding: 8px 24px; max-width: 860px; margin: 0 auto;
      animation: fadeUp 0.3s ease both;
    }
    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .jc-msg-wrap.user { flex-direction: row-reverse; }

    .jc-msg-avatar {
      width: 32px; height: 32px; min-width: 32px; border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 700; font-family: var(--font-mono);
    }
    .jc-msg-bubble {
      max-width: 72%; background: var(--bg3); border: 1px solid var(--border);
      border-radius: 12px; padding: 12px 14px;
      font-size: 13.5px; line-height: 1.65; color: var(--text1);
    }
    .jc-msg-wrap.user .jc-msg-bubble {
      background: rgba(201,168,76,0.08); border-color: rgba(201,168,76,0.2);
    }
    .jc-msg-meta {
      font-size: 10px; color: var(--text3); margin-bottom: 4px;
      font-family: var(--font-mono); display: flex; align-items: center; gap: 6px;
    }
    .jc-msg-meta .agent-tag {
      font-size: 9px; padding: 2px 7px; border-radius: 4px;
      background: rgba(201,168,76,0.12); color: var(--gold); border: 1px solid rgba(201,168,76,0.2);
      font-family: var(--font-body); font-weight: 500; letter-spacing: 0.04em;
    }
    .jc-msg-text b, .jc-msg-text strong { color: var(--gold2); font-weight: 600; }

    /* BRIEFING CARD */
    .jc-card-briefing {
      background: linear-gradient(135deg, rgba(201,168,76,0.06), rgba(79,142,247,0.04));
      border: 1px solid rgba(201,168,76,0.2);
      border-radius: 14px; padding: 20px; margin-top: 2px;
    }
    .jc-card-briefing-title {
      font-family: var(--font-disp); font-size: 22px; font-weight: 600;
      color: var(--gold2); margin-bottom: 4px; letter-spacing: 0.01em;
    }
    .jc-card-briefing-sub { font-size: 12px; color: var(--text3); margin-bottom: 16px; }
    .jc-card-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
    .jc-kpi {
      background: var(--bg2); border: 1px solid var(--border);
      border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 4px;
      transition: border-color 0.2s;
    }
    .jc-kpi:hover { border-color: var(--border2); }
    .jc-kpi-icon { font-size: 16px; }
    .jc-kpi-value { font-family: var(--font-disp); font-size: 26px; font-weight: 600; line-height: 1; }
    .jc-kpi-label { font-size: 10px; color: var(--text3); text-transform: uppercase; letter-spacing: 0.08em; }

    /* PROCESS LIST CARD */
    .jc-card-processes { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }
    .jc-process-row {
      background: var(--bg2); border: 1px solid var(--border);
      border-radius: 10px; padding: 11px 14px;
      display: flex; align-items: center; gap: 12px; cursor: pointer;
      transition: all 0.2s;
    }
    .jc-process-row:hover { border-color: var(--border2); background: var(--bg3); transform: translateX(2px); }
    .jc-process-id { font-family: var(--font-mono); font-size: 10px; color: var(--text3); min-width: 72px; }
    .jc-process-client { font-size: 12.5px; font-weight: 500; flex: 1; }
    .jc-process-area { font-size: 10px; padding: 2px 8px; border-radius: 5px; }
    .jc-process-prazo { font-family: var(--font-mono); font-size: 10px; }
    .jc-process-badge {
      font-size: 9px; padding: 3px 8px; border-radius: 5px; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.06em;
    }
    .jc-process-badge.urgente { background: rgba(239,68,68,0.15); color: #ff8080; border: 1px solid rgba(239,68,68,0.25); }
    .jc-process-badge.normal  { background: rgba(79,142,247,0.12); color: #93c5fd; border: 1px solid rgba(79,142,247,0.2); }
    .jc-process-badge.revisar { background: rgba(245,158,11,0.12); color: #fbbf24; border: 1px solid rgba(245,158,11,0.2); }
    .jc-process-value { font-family: var(--font-mono); font-size: 11px; color: var(--teal); min-width: 80px; text-align: right; }

    /* THINKING INDICATOR */
    .jc-thinking {
      display: flex; align-items: center; gap: 4px; padding: 4px 0;
    }
    .jc-thinking span {
      width: 6px; height: 6px; border-radius: 50%; background: var(--gold);
      animation: thinking 1.2s infinite; display: inline-block;
    }
    .jc-thinking span:nth-child(2) { animation-delay: 0.2s; }
    .jc-thinking span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes thinking {
      0%, 60%, 100% { opacity: 0.2; transform: scale(0.8); }
      30% { opacity: 1; transform: scale(1.2); }
    }

    /* INPUT BAR */
    .jc-input-area {
      background: var(--bg2); border-top: 1px solid var(--border);
      padding: 12px 24px 16px;
    }
    .jc-commands { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
    .jc-cmd {
      font-size: 11px; padding: 4px 10px; border-radius: 16px;
      background: var(--bg3); border: 1px solid var(--border2);
      color: var(--text2); cursor: pointer; white-space: nowrap;
      transition: all 0.15s; font-family: var(--font-body);
    }
    .jc-cmd:hover { background: rgba(201,168,76,0.08); border-color: rgba(201,168,76,0.25); color: var(--gold2); }
    .jc-input-row {
      display: flex; align-items: flex-end; gap: 10px;
      background: var(--bg3); border: 1px solid var(--border2);
      border-radius: 14px; padding: 10px 14px;
      transition: border-color 0.2s;
    }
    .jc-input-row:focus-within { border-color: rgba(201,168,76,0.4); }
    .jc-textarea {
      flex: 1; background: none; border: none; outline: none; resize: none;
      font-family: var(--font-body); font-size: 14px; color: var(--text1);
      line-height: 1.5; max-height: 120px; min-height: 22px;
    }
    .jc-textarea::placeholder { color: var(--text3); }
    .jc-send-btn {
      width: 34px; height: 34px; border-radius: 9px;
      background: linear-gradient(135deg, var(--gold), var(--gold2));
      border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      color: #0a0a12; font-size: 15px; font-weight: 700;
      transition: all 0.2s; flex-shrink: 0;
    }
    .jc-send-btn:hover { transform: scale(1.05); box-shadow: 0 0 16px rgba(201,168,76,0.4); }
    .jc-send-btn:disabled { opacity: 0.4; cursor: default; transform: none; }
    .jc-input-hint { font-size: 10px; color: var(--text3); text-align: center; margin-top: 6px; letter-spacing: 0.04em; }

    /* RIGHT PANEL */
    .jc-right-panel {
      width: 300px; min-width: 300px;
      background: var(--bg2); border-left: 1px solid var(--border);
      display: flex; flex-direction: column; overflow: hidden;
    }
    .jc-right-header {
      padding: 16px 16px 12px;
      border-bottom: 1px solid var(--border);
      font-family: var(--font-disp); font-size: 16px; font-weight: 600; color: var(--text1);
    }
    .jc-right-tabs {
      display: flex; border-bottom: 1px solid var(--border); padding: 0 12px;
    }
    .jc-right-tab {
      font-size: 11px; padding: 9px 12px; cursor: pointer; color: var(--text3);
      border-bottom: 2px solid transparent; transition: all 0.15s; white-space: nowrap;
      font-weight: 500;
    }
    .jc-right-tab.active { color: var(--gold); border-color: var(--gold); }
    .jc-right-body { flex: 1; overflow-y: auto; padding: 12px; }
    .jc-right-body::-webkit-scrollbar { width: 3px; }
    .jc-right-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

    /* CASE CARD right panel */
    .jc-case-card {
      background: var(--bg3); border: 1px solid var(--border);
      border-radius: 10px; padding: 12px; margin-bottom: 8px;
      cursor: pointer; transition: all 0.2s;
    }
    .jc-case-card:hover { border-color: var(--border2); background: var(--bg4); }
    .jc-case-num { font-family: var(--font-mono); font-size: 10px; color: var(--text3); margin-bottom: 4px; }
    .jc-case-name { font-size: 13px; font-weight: 500; color: var(--text1); margin-bottom: 6px; }
    .jc-case-row { display: flex; justify-content: space-between; align-items: center; }
    .jc-case-area-tag { font-size: 10px; padding: 2px 7px; border-radius: 4px; font-weight: 500; }
    .jc-case-prazo-row { display: flex; align-items: center; gap: 4px; font-size: 10px; color: var(--text3); margin-top: 6px; }

    /* ALERT LIST */
    .jc-alert-item {
      display: flex; gap: 10px; align-items: flex-start;
      padding: 10px; border-radius: 8px; margin-bottom: 6px;
      border: 1px solid; cursor: pointer; transition: opacity 0.15s;
    }
    .jc-alert-item:hover { opacity: 0.8; }
    .jc-alert-item.fatal   { background: rgba(239,68,68,0.07); border-color: rgba(239,68,68,0.2); }
    .jc-alert-item.warning { background: rgba(245,158,11,0.07); border-color: rgba(245,158,11,0.2); }
    .jc-alert-item.info    { background: rgba(79,142,247,0.07); border-color: rgba(79,142,247,0.2); }
    .jc-alert-item.success { background: rgba(45,212,160,0.07); border-color: rgba(45,212,160,0.2); }
    .jc-alert-dot { width: 7px; height: 7px; border-radius: 50%; margin-top: 4px; flex-shrink: 0; }
    .jc-alert-item.fatal .jc-alert-dot   { background: var(--red); }
    .jc-alert-item.warning .jc-alert-dot { background: var(--amber); }
    .jc-alert-item.info .jc-alert-dot    { background: var(--blue); }
    .jc-alert-item.success .jc-alert-dot { background: var(--teal); }
    .jc-alert-text { font-size: 11.5px; color: var(--text1); line-height: 1.4; flex: 1; }
    .jc-alert-time { font-size: 9px; color: var(--text3); font-family: var(--font-mono); white-space: nowrap; }

    /* SCROLLBAR global tweak */
    * { scrollbar-color: var(--border) transparent; scrollbar-width: thin; }
  `}</style>
);

// ── SUB-COMPONENTS ───────────────────────────────────────────

function BriefingCard({ card }) {
  return (
    <div className="jc-card-briefing">
      <div className="jc-card-briefing-title">{card.title}</div>
      <div className="jc-card-briefing-sub">{card.summary}</div>
      <div className="jc-card-grid">
        {card.items.map((item, i) => (
          <div className="jc-kpi" key={i} style={{ borderLeftColor: item.accent, borderLeftWidth: 2 }}>
            <div className="jc-kpi-icon" style={{ color: item.accent }}>{item.icon}</div>
            <div className="jc-kpi-value" style={{ color: item.accent }}>{item.value}</div>
            <div className="jc-kpi-label">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProcessListCard({ processes }) {
  const areaColors = { "Bancário": "#2dd4a0", "Cível": "#a78bfa", "Previdência": "#f59e0b", "Contratos": "#4f8ef7" };
  return (
    <div className="jc-card-processes">
      {processes.map(p => (
        <div className="jc-process-row" key={p.id}>
          <div className="jc-process-id">#{p.id}</div>
          <div className="jc-process-client">{p.client}</div>
          <div className="jc-process-area" style={{
            background: `${areaColors[p.area] || "#4f8ef7"}18`,
            color: areaColors[p.area] || "#4f8ef7",
            border: `1px solid ${areaColors[p.area] || "#4f8ef7"}30`
          }}>{p.area}</div>
          <div className="jc-process-prazo" style={{ color: p.prazo === "HOJE" ? "#ff8080" : "#9898b0" }}>
            {p.prazo === "HOJE" ? "⚠ HOJE" : `⏱ ${p.prazo}`}
          </div>
          <div className={`jc-process-badge ${p.status}`}>{p.status}</div>
          <div className="jc-process-value">{p.value}</div>
        </div>
      ))}
    </div>
  );
}

function MessageBubble({ msg }) {
  const agentColors = {
    "Meu Assistente": "#c9a84c", "Pesquisador Jurídico": "#2dd4a0",
    "Redator Processual": "#a78bfa", "Controlador de Prazos": "#ef4444",
    "Gerador de Relatórios": "#34d399",
  };
  const isUser = msg.role === "user";
  const color = agentColors[msg.agent] || "#4f8ef7";

  return (
    <div className={`jc-msg-wrap ${isUser ? "user" : ""}`}>
      {!isUser && (
        <div className="jc-msg-avatar" style={{ background: `${color}20`, color, border: `1px solid ${color}30`, fontSize: 11 }}>
          {msg.agent ? msg.agent.split(" ").map(w => w[0]).join("").slice(0, 2) : "AI"}
        </div>
      )}
      {isUser && (
        <div className="jc-msg-avatar" style={{ background: "rgba(201,168,76,0.15)", color: "#c9a84c", border: "1px solid rgba(201,168,76,0.25)", fontFamily: "'Cormorant Garamond', serif", fontSize: 14 }}>
          JC
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: "80%" }}>
        {!isUser && msg.agent && (
          <div className="jc-msg-meta">
            <span className="agent-tag">{msg.agent}</span>
            <span>{msg.timestamp}</span>
          </div>
        )}
        {isUser && <div className="jc-msg-meta" style={{ justifyContent: "flex-end" }}>{msg.timestamp}</div>}
        <div className="jc-msg-bubble">
          {msg.content && (
            <div className="jc-msg-text" dangerouslySetInnerHTML={{
              __html: msg.content.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
            }} />
          )}
          {msg.card?.type === "briefing" && <BriefingCard card={msg.card} />}
          {msg.card?.type === "process-list" && <ProcessListCard processes={msg.card.processes} />}
        </div>
      </div>
    </div>
  );
}

function ThinkingBubble({ agent }) {
  return (
    <div className="jc-msg-wrap">
      <div className="jc-msg-avatar" style={{ background: "rgba(201,168,76,0.1)", color: "#c9a84c", border: "1px solid rgba(201,168,76,0.2)", fontSize: 11 }}>
        {agent.split(" ").map(w => w[0]).join("").slice(0, 2)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div className="jc-msg-meta"><span className="agent-tag">{agent}</span><span>agora</span></div>
        <div className="jc-msg-bubble" style={{ padding: "14px 18px" }}>
          <div className="jc-thinking"><span /><span /><span /></div>
        </div>
      </div>
    </div>
  );
}

// ── MAIN COMPONENT ───────────────────────────────────────────
export default function JurisCloudOS() {
  const [activeDept, setActiveDept]     = useState("assistente");
  const [messages, setMessages]         = useState(INITIAL_MESSAGES);
  const [inputVal, setInputVal]         = useState("");
  const [thinking, setThinking]         = useState(false);
  const [rightTab, setRightTab]         = useState("processos");
  const [sidebarSearch, setSidebarSearch] = useState("");
  const messagesEndRef = useRef(null);
  const textareaRef    = useRef(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, thinking]);

  const handleSend = (text) => {
    const val = (text || inputVal).trim();
    if (!val) return;
    const userMsg = { id: Date.now(), role: "user", content: val, timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) };
    setMessages(prev => [...prev, userMsg]);
    setInputVal("");
    setThinking(true);

    setTimeout(() => {
      setThinking(false);
      const agentResponses = [
        { agent: "Pesquisador Jurídico", content: "Encontrei **3 precedentes relevantes** no TJBA relacionados à sua consulta. O mais recente é de março/2026 e fortalece a tese de revisão contratual. Deseja que eu prepare uma minuta com essas citações?" },
        { agent: "Controlador de Prazos", content: "⚠ Atenção: detectei **2 prazos críticos** para os próximos 3 dias úteis. O caso #0023847 (Bancário) vence **hoje às 17h**. Recomendo acionar o Redator Processual imediatamente." },
        { agent: "Redator Processual",   content: "Posso gerar a **petição inicial** ou **contestação** com base nos documentos do cliente. Para iniciar, preciso confirmar: qual a vara e tribunal de destino?" },
        { agent: "Meu Assistente",       content: "Entendido. Estou **orquestrando os agentes necessários** para atender sua solicitação. O Pesquisador Jurídico está mapeando jurisprudência e o Controlador de Prazos verificando impactos." },
      ];
      const response = agentResponses[Math.floor(Math.random() * agentResponses.length)];
      const asstMsg = {
        id: Date.now() + 1, role: "assistant", agent: response.agent,
        content: response.content,
        timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages(prev => [...prev, asstMsg]);
    }, 1800 + Math.random() * 600);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const activeDeptData = DEPARTMENTS.find(d => d.id === activeDept);
  const areaColors = { "Bancário": "#2dd4a0", "Cível": "#a78bfa", "Previdenciário": "#f59e0b", "Contratos": "#4f8ef7" };

  return (
    <>
      <GlobalStyles />
      <div className="jc-root">

        {/* ── SIDEBAR ── */}
        <aside className="jc-sidebar">
          <div className="jc-logo">
            <div className="jc-logo-mark">J</div>
            <div>
              <div className="jc-logo-text">JurisCloud</div>
              <div className="jc-logo-sub">OAB/BA 12.345</div>
            </div>
          </div>

          <div className="jc-search">
            <span style={{ fontSize: 12, color: "var(--text3)" }}>⌕</span>
            <input
              placeholder="Buscar processo, cliente..."
              value={sidebarSearch}
              onChange={e => setSidebarSearch(e.target.value)}
            />
          </div>

          <nav className="jc-nav">
            <div className="jc-section-label">Departamentos</div>
            {DEPARTMENTS.map(dept => (
              <div
                key={dept.id}
                className={`jc-nav-item ${activeDept === dept.id ? "active" : ""}`}
                onClick={() => setActiveDept(dept.id)}
              >
                <span className="jc-nav-icon" style={{ color: dept.color }}>{dept.icon}</span>
                <span className="jc-nav-label">{dept.label}</span>
                {dept.badge > 0 && (
                  <span className={`jc-nav-badge ${dept.badge >= 8 ? "alert" : ""}`}>{dept.badge}</span>
                )}
              </div>
            ))}
          </nav>

          <div className="jc-agents-section">
            <div className="jc-section-label">Agentes Ativos</div>
            {AGENTS.slice(0, 5).map(agent => (
              <div className="jc-agent-item" key={agent.id}>
                <div className="jc-agent-avatar" style={{ background: `${agent.color}18`, color: agent.color, border: `1px solid ${agent.color}25` }}>
                  {agent.avatar}
                </div>
                <div className="jc-agent-name">{agent.name}</div>
                <div className={`jc-agent-dot ${agent.status}`} />
              </div>
            ))}
          </div>
        </aside>

        {/* ── MAIN COLUMN ── */}
        <main className="jc-main">

          {/* TOPBAR */}
          <header className="jc-topbar">
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div className="jc-dept-title" style={{ color: activeDeptData?.color }}>
                {activeDeptData?.icon} {activeDeptData?.label}
              </div>
              <div className="jc-dept-sub">Sistema Operacional Conversacional</div>
            </div>
            <div className="jc-topbar-spacer" />
            {ALERTS.slice(0, 2).map((a, i) => (
              <div key={i} className={`jc-alert-chip ${a.type}`}>
                <span>{a.type === "fatal" ? "⚠" : a.type === "warning" ? "◈" : a.type === "success" ? "✓" : "ℹ"}</span>
                <span>{a.text.slice(0, 28)}...</span>
              </div>
            ))}
            <div className="jc-user-chip">
              <div className="jc-user-avatar">J</div>
              <div className="jc-user-name">Dr. JurisCloud</div>
            </div>
          </header>

          {/* MESSAGES */}
          <div className="jc-messages">
            {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
            {thinking && <ThinkingBubble agent={AGENTS[Math.floor(Math.random() * AGENTS.length)].name} />}
            <div ref={messagesEndRef} />
          </div>

          {/* INPUT */}
          <div className="jc-input-area">
            <div className="jc-commands">
              {QUICK_COMMANDS.map((cmd, i) => (
                <button key={i} className="jc-cmd" onClick={() => handleSend(cmd)}>/{cmd}</button>
              ))}
            </div>
            <div className="jc-input-row">
              <textarea
                ref={textareaRef}
                className="jc-textarea"
                placeholder={`Fale com os agentes do ${activeDeptData?.label || "departamento"}...`}
                value={inputVal}
                onChange={e => {
                  setInputVal(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                }}
                onKeyDown={handleKeyDown}
                rows={1}
              />
              <button className="jc-send-btn" onClick={() => handleSend()} disabled={thinking || !inputVal.trim()}>
                ↑
              </button>
            </div>
            <div className="jc-input-hint">Enter para enviar · Shift+Enter para nova linha · Use / para comandos rápidos</div>
          </div>
        </main>

        {/* ── RIGHT PANEL ── */}
        <aside className="jc-right-panel">
          <div className="jc-right-header">
            Central de Operações
          </div>
          <div className="jc-right-tabs">
            {["processos", "alertas", "agentes"].map(tab => (
              <div key={tab} className={`jc-right-tab ${rightTab === tab ? "active" : ""}`} onClick={() => setRightTab(tab)}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </div>
            ))}
          </div>
          <div className="jc-right-body">
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
                      <span className="jc-case-area-tag" style={{
                        background: `${areaColors[p.area] || "#4f8ef7"}18`,
                        color: areaColors[p.area] || "#4f8ef7",
                        border: `1px solid ${areaColors[p.area] || "#4f8ef7"}30`
                      }}>{p.area}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--teal)" }}>{p.value}</span>
                    </div>
                    <div className="jc-case-prazo-row">
                      <span style={{ color: p.prazo === "HOJE" ? "#ff8080" : "var(--text3)" }}>
                        {p.prazo === "HOJE" ? "⚠ Prazo HOJE" : `⏱ Prazo em ${p.prazo}`}
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
                    <div className="jc-alert-dot" />
                    <div className="jc-alert-text">{a.text}</div>
                    <div className="jc-alert-time">{a.time}</div>
                  </div>
                ))}
              </>
            )}

            {rightTab === "agentes" && (
              <>
                <div style={{ fontSize: 10, color: "var(--text3)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
                  {AGENTS.filter(a => a.status === "active").length} agentes ativos
                </div>
                {AGENTS.map(agent => (
                  <div key={agent.id} style={{
                    background: "var(--bg3)", border: "1px solid var(--border)",
                    borderRadius: 10, padding: "12px", marginBottom: 8,
                    display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                    transition: "border-color 0.2s"
                  }}>
                    <div className="jc-agent-avatar" style={{
                      width: 36, height: 36, borderRadius: 9,
                      background: `${agent.color}18`, color: agent.color,
                      border: `1px solid ${agent.color}25`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 700, fontFamily: "var(--font-mono)"
                    }}>{agent.avatar}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text1)", marginBottom: 2 }}>{agent.name}</div>
                      <div style={{ fontSize: 10, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        {agent.status === "active" ? "● Em operação" : agent.status === "alert" ? "⚠ Atenção" : "○ Ocioso"}
                      </div>
                    </div>
                    <div className={`jc-agent-dot ${agent.status}`} />
                  </div>
                ))}
              </>
            )}
          </div>
        </aside>

      </div>
    </>
  );
}
