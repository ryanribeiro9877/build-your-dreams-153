import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SessionSummary = {
  id: string; title: string; preview: string;
  lastMessageAt: string; messageCount: number;
  clientName: string | null; runStatus: string | null;
};

/**
 * Lista de conversas do usuário (sidebar): carrega as sessões ativas e as
 * enriquece com título/preview/status/cliente. Extraído do JurisCloudOS
 * (comportamento idêntico) — depende apenas do `user`. As AÇÕES de sessão
 * (trocar/nova/excluir) ficam no orquestrador porque mexem no estado do chat;
 * elas chamam `loadSessions`/`loadSessionsRef` daqui.
 */
export function useChatSessions(user: { id: string } | null) {
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

  // Remoção otimista de uma conversa da lista (usada pelo deleteSession antes
  // de confirmar no banco; em caso de erro, o orquestrador chama loadSessions).
  const removeSession = (id: string) =>
    setChatSessions(prev => prev.filter(s => s.id !== id));

  // Ref estável para chamar loadSessions de dentro de efeitos/handlers sem
  // recriá-los a cada render (evita reassinar canais) nem dependências obsoletas.
  const loadSessionsRef = useRef(loadSessions);
  useEffect(() => { loadSessionsRef.current = loadSessions; });

  return { chatSessions, sessionsLoading, loadSessions, loadSessionsRef, removeSession };
}
