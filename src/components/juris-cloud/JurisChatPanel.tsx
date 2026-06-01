import React, { useRef, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { SafeMarkdown } from "@/components/SafeMarkdown";
import WelcomeScreen from "@/components/WelcomeScreen";
import {
  AlertTriangle, ChevronRight, Lock,
} from "lucide-react";
import type { JcChatMessage, BriefingCardPayload, ProcessListRow, Agent } from "./types";
import { getInitials, getCaseAreaChip, getTokenCost } from "./constants";

/* ── Sub-components (chat bubbles) ── */

function BriefingCard({ card }: { card: BriefingCardPayload }) {
  return (
    <div className="jc-card-briefing">
      <div className="jc-card-briefing-title">{card.title}</div>
      <div className="jc-card-briefing-sub">{card.summary}</div>
      <div className="jc-card-grid">
        {card.items.map((item, i: number) => (
          <div className="jc-kpi" key={i} style={{ borderLeftColor: item.accent, borderLeftWidth: 2 }}>
            <div className="jc-kpi-value" style={{ color: item.accent }}>{item.value}</div>
            <div className="jc-kpi-label">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProcessListCard({ processes }: { processes: ProcessListRow[] }) {
  return (
    <div className="jc-card-processes">
      {processes.map((p) => (
        <div className="jc-process-row" key={p.id}>
          <div className="jc-process-id">#{p.id}</div>
          <div className="jc-process-client">{p.client}</div>
          <div className="jc-process-area" style={getCaseAreaChip(p.area)}>{p.area}</div>
          <div className="jc-process-prazo" style={{ color: p.prazo === "HOJE" ? "#FACC15" : "var(--text2)" }}>
            {p.prazo === "HOJE" ? (
              <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <AlertTriangle size={10} /> HOJE
              </span>
            ) : p.prazo}
          </div>
          <div className={`jc-process-badge ${p.status}`}>{p.status}</div>
          <div className="jc-process-value">{p.value}</div>
        </div>
      ))}
    </div>
  );
}

function MessageBubble({ msg }: { msg: JcChatMessage }) {
  const { user } = useAuth();
  const agentColors: Record<string, string> = {
    "Meu Assistente": "#EAB308",
    "Pesquisador Jurídico": "#CA8A04",
    "Redator Processual": "#FACC15",
    "Controlador de Prazos": "#A16207",
  };
  const isUser = msg.role === "user";
  const color = agentColors[msg.agent || ""] || "#EAB308";
  const userInitial =
    user?.email?.split("@")[0]?.charAt(0)?.toUpperCase() || "U";

  return (
    <div className={`jc-msg-wrap ${isUser ? "user" : ""}`}>
      <div className="jc-msg-avatar" style={{
        background: isUser ? "rgba(234,179,8,0.15)" : `${color}20`,
        color: isUser ? "#EAB308" : color,
        border: `1px solid ${isUser ? "rgba(234,179,8,0.25)" : `${color}30`}`,
        fontFamily: "var(--font-body)",
        fontSize: 11,
        fontWeight: 700,
      }}>
        {isUser ? userInitial : (msg.agent ? getInitials(msg.agent) : "AI")}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: "80%" }}>
        {!isUser && msg.agent && (
          <div className="jc-msg-meta">
            <span className="agent-tag">{msg.agent}</span>
            <span>{msg.timestamp}</span>
          </div>
        )}
        {isUser && (
          <div className="jc-msg-meta" style={{ justifyContent: "flex-end" }}>
            <span className="agent-tag">VOCÊ</span>
            <span>{msg.timestamp}</span>
          </div>
        )}
        <div className="jc-msg-bubble">
          {msg.content && (
            <SafeMarkdown className="jc-msg-text">{msg.content}</SafeMarkdown>
          )}
          {msg.card?.type === "briefing" && <BriefingCard card={msg.card} />}
          {msg.card?.type === "process-list" && <ProcessListCard processes={msg.card.processes} />}
        </div>
      </div>
    </div>
  );
}

function ThinkingBubble({ agent }: { agent: string }) {
  return (
    <div className="jc-msg-wrap">
      <div className="jc-msg-avatar" style={{ background: "rgba(234,179,8,0.12)", color: "#EAB308", border: "1px solid rgba(234,179,8,0.28)", fontSize: 11 }}>
        {getInitials(agent)}
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

/* ── Main chat panel ── */

export interface JurisChatPanelProps {
  messages: JcChatMessage[];
  thinking: boolean;
  thinkingAgentName: string;
  showWelcome: boolean;
  setShowWelcome: (v: boolean) => void;
  inputVal: string;
  setInputVal: (v: string) => void;
  handleSend: (text?: string) => void;
  visibleCommands: string[];
  isRecording: boolean;
  toggleRecording: () => void;
  isReadOnly: boolean;
  roleLabel: string;
  activeDeptLabel: string;
}

export default function JurisChatPanel({
  messages,
  thinking,
  thinkingAgentName,
  showWelcome,
  setShowWelcome,
  inputVal,
  setInputVal,
  handleSend,
  visibleCommands,
  isRecording,
  toggleRecording,
  isReadOnly,
  roleLabel,
  activeDeptLabel,
}: JurisChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <>
      {/* CONTENT */}
      {showWelcome ? (
        <div className="jc-messages">
          <WelcomeScreen
            onDismiss={() => setShowWelcome(false)}
            onSubmit={(msg) => {
              setShowWelcome(false);
              setInputVal(msg);
              setTimeout(() => handleSend(msg), 60);
            }}
          />
        </div>
      ) : (
        <div className="jc-messages">
          {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
          {thinking && <ThinkingBubble agent={thinkingAgentName} />}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* INPUT */}
      {!showWelcome && (
        <div className="jc-input-area">
          <div className="jc-commands">
            {visibleCommands.map((cmd, i) => {
              const { cost } = getTokenCost(cmd);
              return (
                <button key={i} className="jc-cmd" onClick={() => handleSend(cmd)} title={`Custo: ${cost} token(s)`}>
                  <ChevronRight size={10} /> {cmd} <span style={{ opacity: 0.5, fontSize: 9, marginLeft: 4 }}>({cost}t)</span>
                </button>
              );
            })}
          </div>
          <div className="jc-input-row">
            <textarea ref={textareaRef} className="jc-textarea"
              placeholder={`Fale com os agentes do ${activeDeptLabel}...`}
              value={inputVal}
              onChange={e => { setInputVal(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
              onKeyDown={handleKeyDown} rows={1} />
            <button
              className={`jc-mic-btn ${isRecording ? "recording" : ""}`}
              onClick={toggleRecording}
              aria-label={isRecording ? "Parar gravação" : "Gravar áudio"}
              type="button"
            >
              {isRecording ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2.2"
                     strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="3" y1="3" x2="21" y2="21" />
                  <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                  <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="2.2"
                     strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="9" y="3" width="6" height="12" rx="3" />
                  <path d="M5 11a7 7 0 0 0 14 0" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              )}
              <span className="jc-sr-only">{isRecording ? "Parar gravação" : "Gravar áudio"}</span>
            </button>
            <button
              className="jc-send-btn"
              onClick={() => handleSend()}
              disabled={thinking || !inputVal.trim()}
              aria-label="Enviar"
              type="button"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2.6"
                   strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="5 6 11 12 5 18" />
                <polyline points="12 6 18 12 12 18" />
                <path d="M20 4l0.6 1.4L22 6l-1.4 0.6L20 8l-0.6-1.4L18 6l1.4-0.6z"
                      fill="currentColor" stroke="none" />
              </svg>
              <span className="jc-sr-only">Enviar mensagem</span>
            </button>
          </div>
          <div className="jc-input-hint">
            {isReadOnly && <span style={{ color: "#EAB308", marginRight: 8, display: "inline-flex", alignItems: "center", gap: 3 }}><Lock size={10} /> Modo leitura ({roleLabel})</span>}
            Enter para enviar · Shift+Enter para nova linha
          </div>
        </div>
      )}
    </>
  );
}
