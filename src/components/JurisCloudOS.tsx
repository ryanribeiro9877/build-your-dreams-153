import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import CreateEmployee from "@/pages/CreateEmployee";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useAgents } from "@/hooks/useAgents";
import { useInboxCount, createChatTask } from "@/hooks/useUserTasks";
import { useMyWorkspace, STAGE_LABELS, AREA_LABELS, type WorkspaceAgent } from "@/hooks/useMyWorkspace";
import { isDashboardRole, isSocioRole, isRecepcaoRole, isTechRole } from "@/components/DashboardRoute";
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
  ListTodo, LayoutGrid, ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMenuAccess } from "@/hooks/useMenuAccess";

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
import GlobalStyles from "./juris-cloud/GlobalStyles";
import { toast } from "sonner";
import { transcribeVoiceMessage } from "@/lib/transcribeVoiceMessage";
import { useChatSessions } from "./juris-cloud/useChatSessions";

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
  const { canSeeMenu } = useMenuAccess(); // Admin chave-mestra: fonte única de acesso a menu
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
  // Recepção (mesmos role codes de is_recepcao() no banco) → card de
  // aniversariantes na tela de boas-vindas. 1:1 com o gate da RPC.
  const isRecepcao = isRecepcaoRole(workspace?.role_template?.code);
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
  const { chatSessions, sessionsLoading, loadSessions, loadSessionsRef, removeSession } = useChatSessions(user);

  useEffect(() => { loadSessions(); }, [user, assistantSessionId]);

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
    removeSession(sessionId);
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
  const [shortcutAnnouncement, setShortcutAnnouncement] = useState("");

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
    // E1 — DESFECHO PERSISTIDO: o wizard grava o cliente via save_client DIRETO do
    // browser (a PII cifrada não trafega pelo chat), então o edge nunca fica sabendo
    // e o histórico "mente por omissão" — o especialista do próximo turno pede o
    // cadastro de novo. Aqui gravamos, para TODOS os caminhos, uma mensagem de
    // desfecho na sessão (metadata.kind='final' no server → entra no histórico lido
    // pelo N3) + carry-over do cliente (client_id/entities). Sem UUID no texto
    // (cláusula H). Best-effort: falha aqui não bloqueia o fluxo pós-cadastro.
    const sidNow = assistantSessionId;
    if (sidNow) {
      try {
        // RPC ainda não refletida no types.ts gerado → escape hatch tipado (mesmo
        // padrão de definir_tipo_acao_processo em relationalTabs.tsx).
        const rpc = supabase.rpc as unknown as (
          fn: string, args: Record<string, unknown>,
        ) => Promise<{ error: unknown }>;
        await rpc("registrar_desfecho_chat", {
          p_session_id: sidNow,
          p_summary: `✔ Cliente ${clientName} cadastrado.`,
          p_client_id: clientId,
          p_client_name: clientName,
          p_kind: "cadastro",
        });
      } catch { /* desfecho é best-effort; segue o fluxo mesmo se falhar */ }
    }

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
  }, [pendingMeeting, pendingTask, assistantSessionId]);

  // Trilho A — mensagem de voz (gravar → transcrever → revisar → enviar).
  // Recebe o Blob do useChatVoiceRecorder (no JurisChatPanel), garante uma sessão
  // (mesma lógica do handleSend, sem cobrança de tokens — a cobrança é no envio),
  // transcreve via Whisper e preenche o campo pra revisão. Nunca envia sozinho.
  const handleVoiceRecorded = async (blob: Blob) => {
    if (!user) { toast.error("Faça login para usar a mensagem de voz."); return; }
    let sid = assistantSessionId;
    if (!sid) {
      const test = activeTest;
      if (test) {
        const { sessionId, error } = await startTestSession(test);
        if (!sessionId) { toast.error(error ?? "Não consegui iniciar a conversa."); return; }
        setAssistantSessionId(sessionId); sid = sessionId;
      } else if (entryAgentId) {
        const { sessionId, error } = await startSession(entryAgentId, { title: "Meu Assistente" });
        if (!sessionId) { toast.error(friendlyError(error)); return; }
        setAssistantSessionId(sessionId); sid = sessionId;
      } else {
        toast.error("Configure um agente com IA antes de usar a mensagem de voz.");
        return;
      }
    }
    const loadingId = toast.loading("Transcrevendo o áudio…");
    const { ok, text } = await transcribeVoiceMessage(sid, user.id, blob);
    toast.dismiss(loadingId);
    if (ok && text) {
      setInputVal((prev) => (prev.trim() ? prev.trim() + " " : "") + text);
      toast.success("Transcrição pronta — revise e envie.");
    } else {
      toast.error("Não consegui transcrever o áudio. Tente de novo.");
    }
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
    { id: "permissoes-menu", label: "Permissões de menu", icon: ShieldCheck, color: ACCENT, action: () => navigate("/configuracoes/permissoes"), show: canAccessAdmin },
    { id: "perfil", label: "Meu Perfil", icon: User, color: ACCENT_SOFT, action: () => navigate("/perfil"), show: canSeeMenuItem("perfil") },
  ];

  // Menu items
  // Admin chave-mestra: cada item canônico usa canSeeMenu(<chave>) — admin vê tudo,
  // demais seguem default do papel + override. Itens tech/importar/sair/organograma
  // não são chaves canônicas e mantêm o gate próprio.
  const MENU_ITEMS: MenuItem[] = [
    { id: "clientes", label: "Clientes", icon: Users, color: ACCENT, action: () => navigate("/clientes"), show: canSeeMenu("clientes") },
    { id: "agenda", label: "Agenda", icon: CalendarDays, color: ACCENT, action: () => navigate("/sistema/agenda"), show: canSeeMenu("agenda") },
    { id: "audiencias", label: "Audiências", icon: Scale, color: ACCENT, action: () => navigate("/sistema/audiencias"), show: canSeeMenu("agenda") },
    { id: "tarefas", label: "Tarefas", icon: ListTodo, color: ACCENT, action: () => navigate("/sistema/tarefas"), show: canSeeMenu("tarefas") },
    { id: "kanban", label: "Kanban", icon: LayoutGrid, color: ACCENT, action: () => navigate("/sistema/kanban"), show: canSeeMenu("kanban") },
    { id: "admin", label: "Administração", icon: Crown, color: ACCENT_SOFT, action: () => navigate("/admin"), show: canSeeMenu("administracao") },
    { id: "dashboard", label: "Dashboard", icon: BarChart3, color: ACCENT, action: () => navigate("/dashboard"), show: canSeeMenu("dashboard") },
    { id: "dashboard_ia", label: "Dashboard IA", icon: Sparkles, color: ACCENT, action: () => navigate("/dashboard-ia"), show: canSeeMenu("dashboard_ia") },
    { id: "dashboard_operacional", label: "Recepção & Jurídico", icon: Users, color: ACCENT, action: () => navigate("/dashboard-operacional"), show: canSeeMenu("recepcao_juridico") },
    { id: "dashboard_prazos", label: "Prazos & Audiências", icon: Clock, color: ACCENT, action: () => navigate("/dashboard-prazos"), show: canSeeMenu("prazos_audiencias") },
    { id: "organograma", label: "Organograma", icon: Network, color: ACCENT_SOFT, action: () => navigate("/organograma"), show: false /* removido do menu do tech */ },
    { id: "eficiencia", label: "KPIs Eficiência", icon: Activity, color: ACCENT, action: () => navigate("/eficiencia"), show: canSeeMenu("kpis") },
    { id: "agentes", label: "Agentes", icon: Bot, color: ACCENT, action: () => navigate("/tech/agentes"), show: hasRole("tech") },
    { id: "testes", label: "Testes", icon: FlaskConical, color: ACCENT, action: () => navigate("/tech/testes"), show: hasRole("tech") },
    { id: "crons", label: "Crons", icon: Clock, color: ACCENT_SOFT, action: () => navigate("/tech/crons"), show: hasRole("tech") },
    { id: "providers", label: "Providers", icon: Settings, color: ACCENT, action: () => navigate("/tech/providers"), show: hasRole("tech") },
    { id: "importar", label: "Importar dados", icon: Upload, color: ACCENT_SOFT, action: () => navigate("/tech/importar"), show: isRecepcaoRole(workspace?.role_template?.code) },
    { id: "configuracoes", label: "Configurações", icon: Settings, color: ACCENT, action: () => {}, show: canSeeMenu("configuracoes") && CONFIG_MENU_CHILDREN.some(c => c.show), children: CONFIG_MENU_CHILDREN },
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
            onVoiceBlob={handleVoiceRecorded}
            isReadOnly={isReadOnly}
            roleLabel={roleLabel}
            activeDeptLabel={activeDeptData?.label || "departamento"}
            canAuthorPeca={canAuthorPeca}
            isRecepcao={isRecepcao}
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
