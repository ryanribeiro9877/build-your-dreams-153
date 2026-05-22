import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAgents } from "@/hooks/useAgents";
import { useChatOrchestrator, friendlyError } from "@/hooks/useChatOrchestrator";
import { supabase } from "@/integrations/supabase/client";
import type { ChatMessageRow, ChatSessionRow } from "@/types/lexforce";
import { SafeMarkdown } from "@/components/SafeMarkdown";
import { ArrowLeft, Send, Bot, User as UserIcon, AlertTriangle, Sparkles, Plus, RotateCcw } from "lucide-react";

/**
 * /sistema/chat
 *
 * Chat novo, usando chat-orchestrator. Substitui o chat-with-agent antigo
 * quando voce migrar. Por enquanto convive com /sistema (componente JurisCloudOS).
 *
 * Diferencas:
 *  - Stateful: sessao no banco, Realtime para mensagens
 *  - Custo USD real exibido por mensagem
 *  - Provider/model do agente exibido
 *  - Sem cobranca de tokens proprios (custo real e BYOK)
 */
export default function ChatWithAgent() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { agents, loading: loadingAgents } = useAgents();
  const { pending, lastError, startSession, sendMessage } = useChatOrchestrator();

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [inputVal, setInputVal] = useState("");
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sessions, setSessions] = useState<ChatSessionRow[]>([]);
  const [configuredAgentIds, setConfiguredAgentIds] = useState<Set<string>>(new Set());

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) navigate("/auth");
  }, [user, navigate]);

  useEffect(() => {
    if (agents.length === 0) return;
    supabase
      .from("agents")
      .select("id")
      .not("provider", "is", null)
      .not("model", "is", null)
      .then(({ data }) => {
        if (data) setConfiguredAgentIds(new Set((data as { id: string }[]).map(a => a.id)));
      });
  }, [agents]);

  const eligibleAgents = agents.filter(a => configuredAgentIds.has(a.id));

  // Carregar sessoes existentes
  useEffect(() => {
    if (!user) return;
    supabase
      // @ts-expect-error Tabelas chat_sessions/chat_messages ainda não estão nos tipos gerados.
      .from("chat_sessions")
      .select("*")
      .eq("user_id" as never, user.id)
      .order("last_message_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data) setSessions(data as unknown as ChatSessionRow[]);
      });
  }, [user, sessionId]);

  // Carregar mensagens da sessao atual + subscribe Realtime
  useEffect(() => {
    if (!sessionId) { setMessages([]); return; }
    setLoadingMessages(true);
    supabase
      // @ts-expect-error Tabelas chat_sessions/chat_messages ainda não estão nos tipos gerados.
      .from("chat_messages")
      .select("*")
      .eq("session_id" as never, sessionId)
      .order("sequence_number", { ascending: true })
      .then(({ data }) => {
        if (data) setMessages(data as unknown as ChatMessageRow[]);
        setLoadingMessages(false);
      });

    const channel = supabase
      .channel(`chat_session_${sessionId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          setMessages(prev => {
            const m = payload.new as unknown as ChatMessageRow;
            if (prev.some(x => x.id === m.id)) return prev;
            return [...prev, m].sort((a, b) => a.sequence_number - b.sequence_number);
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId]);

  // Autoscroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, pending]);

  const handleStartNewChat = async () => {
    if (!selectedAgentId) return;
    const sid = await startSession(selectedAgentId, { title: "Nova conversa" });
    if (sid) setSessionId(sid);
  };

  const handleSend = async () => {
    if (!sessionId || !inputVal.trim() || pending) return;
    const text = inputVal.trim();
    setInputVal("");
    // Optimistic: insere user message no UI antes do server confirmar
    // (o Realtime tambem vai entregar, mas evita lag visual)
    await sendMessage(sessionId, text);
  };

  // Styles
  const layoutSide: React.CSSProperties = {
    width: 280, background: "#0d0d14", borderRight: "1px solid #252534",
    display: "flex", flexDirection: "column",
  };
  const buttonGhost: React.CSSProperties = {
    padding: "8px 12px", borderRadius: 6, border: "1px solid #252534",
    background: "transparent", color: "#9898b0", cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif", fontSize: 12,
  };

  const selectedAgent = agents.find(a => a.id === selectedAgentId);
  const totalCost = messages.reduce((s, m) => s + Number(m.cost_usd ?? 0), 0);

  if (!user) return null;

  return (
    <div style={{ display: "flex", height: "100vh", background: "#09090f", color: "#eeeef5", fontFamily: "'DM Sans', sans-serif" }}>
      {/* Sidebar */}
      <aside style={layoutSide}>
        <header style={{ padding: "16px 18px", borderBottom: "1px solid #252534", display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => navigate(-1)} style={{ ...buttonGhost, padding: 6 }}>
            <ArrowLeft size={14} />
          </button>
          <strong style={{ fontSize: 14 }}>Conversas</strong>
        </header>

        {/* Seletor de agente para nova conversa */}
        <div style={{ padding: 14, borderBottom: "1px solid #252534" }}>
          <label style={{ fontSize: 10, color: "#9898b0", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>
            Nova conversa com:
          </label>
          {loadingAgents ? (
            <div style={{ fontSize: 12, color: "#6b6b80" }}>Carregando...</div>
          ) : eligibleAgents.length === 0 ? (
            <div style={{ fontSize: 11, color: "#ffb8b8", padding: 10, background: "rgba(255,107,107,0.08)", borderRadius: 6, border: "1px solid rgba(255,107,107,0.2)" }}>
              <AlertTriangle size={11} style={{ display: "inline", marginRight: 4 }} />
              Nenhum agente configurado.{" "}
              <button onClick={() => navigate("/admin/agentes")} style={{ background: "transparent", border: "none", color: "#c9a84c", padding: 0, textDecoration: "underline", cursor: "pointer", fontSize: 11 }}>
                Configurar
              </button>
            </div>
          ) : (
            <>
              <select
                value={selectedAgentId || ""}
                onChange={e => setSelectedAgentId(e.target.value || null)}
                style={{
                  width: "100%", padding: "8px 10px", borderRadius: 6,
                  background: "#16161f", border: "1px solid #252534", color: "#eeeef5",
                  fontSize: 12, marginBottom: 8,
                }}
              >
                <option value="">— Escolha um agente —</option>
                {eligibleAgents.map(a => (
                  <option key={a.id} value={a.id}>{a.name} ({a.role})</option>
                ))}
              </select>
              <button
                onClick={handleStartNewChat}
                disabled={!selectedAgentId}
                style={{
                  width: "100%", padding: "8px 12px", borderRadius: 6, border: "none",
                  background: selectedAgentId ? "#c9a84c" : "#252534",
                  color: selectedAgentId ? "#09090f" : "#6b6b80",
                  fontWeight: 600, fontSize: 12, cursor: selectedAgentId ? "pointer" : "not-allowed",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                <Plus size={12} style={{ display: "inline", marginRight: 4 }} />
                Iniciar conversa
              </button>
            </>
          )}
        </div>

        {/* Lista de sessoes */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {sessions.length === 0 ? (
            <div style={{ padding: 20, fontSize: 11, color: "#6b6b80", textAlign: "center" }}>
              Suas conversas vao aparecer aqui.
            </div>
          ) : (
            sessions.map(s => (
              <button
                key={s.id}
                onClick={() => setSessionId(s.id)}
                style={{
                  width: "100%", textAlign: "left", padding: "10px 14px",
                  background: s.id === sessionId ? "rgba(201, 168, 76, 0.08)" : "transparent",
                  border: "none", borderLeft: s.id === sessionId ? "3px solid #c9a84c" : "3px solid transparent",
                  cursor: "pointer", color: "#eeeef5",
                  display: "flex", flexDirection: "column", gap: 4,
                }}
              >
                <strong style={{ fontSize: 12, color: s.id === sessionId ? "#c9a84c" : "#eeeef5" }}>
                  {s.title || "Sem titulo"}
                </strong>
                <span style={{ fontSize: 10, color: "#6b6b80" }}>
                  {s.message_count || 0} msgs · ${Number(s.total_cost_usd ?? 0).toFixed(4)}
                </span>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Main chat */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {sessionId ? (
          <>
            {/* Chat header */}
            <header style={{
              padding: "14px 24px", borderBottom: "1px solid #252534",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Bot size={18} color="#c9a84c" />
                <div>
                  <strong style={{ fontSize: 14 }}>
                    {sessions.find(s => s.id === sessionId)?.title || "Conversa"}
                  </strong>
                  <div style={{ fontSize: 10, color: "#6b6b80" }}>
                    {messages.length} mensagens · ${totalCost.toFixed(4)} USD
                  </div>
                </div>
              </div>
              <button onClick={() => setSessionId(null)} style={buttonGhost}>
                <RotateCcw size={12} style={{ display: "inline", marginRight: 4 }} />
                Voltar
              </button>
            </header>

            {/* Mensagens */}
            <div
              ref={scrollRef}
              style={{ flex: 1, overflowY: "auto", padding: "24px 32px", display: "flex", flexDirection: "column", gap: 16 }}
            >
              {loadingMessages ? (
                <div style={{ color: "#9898b0", textAlign: "center" }}>Carregando...</div>
              ) : messages.length === 0 ? (
                <div style={{ color: "#9898b0", textAlign: "center", padding: 40 }}>
                  <Sparkles size={24} color="#6b6b80" style={{ margin: "0 auto 12px" }} />
                  <p style={{ margin: 0 }}>Conversa nova. Mande sua primeira mensagem abaixo.</p>
                </div>
              ) : (
                messages.map(m => (
                  <MessageBubble key={m.id} message={m} />
                ))
              )}
              {pending && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#9898b0", fontSize: 13, fontStyle: "italic" }}>
                  <Bot size={14} color="#c9a84c" />
                  Pensando...
                </div>
              )}
              {lastError && (
                <div style={{
                  background: "rgba(255, 107, 107, 0.08)", border: "1px solid rgba(255, 107, 107, 0.3)",
                  borderRadius: 8, padding: 12, color: "#ffb8b8", fontSize: 12,
                }}>
                  <AlertTriangle size={14} style={{ display: "inline", marginRight: 6 }} />
                  {friendlyError(lastError)}
                </div>
              )}
            </div>

            {/* Input */}
            <div style={{ padding: 20, borderTop: "1px solid #252534" }}>
              <div style={{ display: "flex", gap: 10 }}>
                <input
                  value={inputVal}
                  onChange={e => setInputVal(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Mande sua mensagem..."
                  disabled={pending}
                  style={{
                    flex: 1, padding: "12px 16px", borderRadius: 8,
                    background: "#16161f", border: "1px solid #252534", color: "#eeeef5",
                    fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none",
                  }}
                />
                <button
                  onClick={handleSend}
                  disabled={!inputVal.trim() || pending}
                  style={{
                    padding: "0 20px", borderRadius: 8, border: "none",
                    background: !inputVal.trim() || pending ? "#252534" : "#c9a84c",
                    color: !inputVal.trim() || pending ? "#6b6b80" : "#09090f",
                    fontWeight: 600, cursor: !inputVal.trim() || pending ? "not-allowed" : "pointer",
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ textAlign: "center", color: "#9898b0" }}>
              <Bot size={48} color="#252534" style={{ margin: "0 auto 16px" }} />
              <p style={{ fontSize: 14, margin: 0 }}>
                Selecione um agente na barra lateral pra comecar.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessageRow }) {
  const isUser = message.role === "user";
  return (
    <div style={{ display: "flex", flexDirection: isUser ? "row-reverse" : "row", gap: 12 }}>
      <div style={{
        width: 32, height: 32, borderRadius: "50%",
        background: isUser ? "#16161f" : "rgba(201, 168, 76, 0.15)",
        border: `1px solid ${isUser ? "#252534" : "rgba(201, 168, 76, 0.3)"}`,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        {isUser ? <UserIcon size={14} color="#9898b0" /> : <Bot size={14} color="#c9a84c" />}
      </div>
      <div style={{ maxWidth: "75%" }}>
        <div style={{
          background: isUser ? "#16161f" : "#0d0d14",
          border: "1px solid #252534",
          borderRadius: 12,
          padding: "10px 14px",
          color: "#eeeef5",
        }}>
          {message.content ? (
            <SafeMarkdown>{message.content}</SafeMarkdown>
          ) : message.tool_calls ? (
            <div style={{ fontSize: 11, color: "#9898b0", fontStyle: "italic" }}>
              [chamando ferramentas]
            </div>
          ) : null}
        </div>
        <div style={{ fontSize: 10, color: "#6b6b80", marginTop: 4, paddingLeft: 4, display: "flex", gap: 10 }}>
          <span>{new Date(message.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
          {message.cost_usd !== null && message.cost_usd > 0 && (
            <span>${Number(message.cost_usd).toFixed(4)}</span>
          )}
          {message.model_used && (
            <span style={{ fontFamily: "monospace" }}>{message.model_used}</span>
          )}
          {message.duration_ms && (
            <span>{Math.round(message.duration_ms / 100) / 10}s</span>
          )}
        </div>
      </div>
    </div>
  );
}
