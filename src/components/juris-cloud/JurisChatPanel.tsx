import React, { useRef, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { SafeMarkdown } from "@/components/SafeMarkdown";
import WelcomeScreen from "@/components/WelcomeScreen";
import {
  AlertTriangle, Lock,
} from "lucide-react";
import type { JcChatMessage, PendingMeeting, PendingTask, ProcessListRow, Agent } from "./types";
import type { ClientFormValues } from "@/components/clients/shared";
import { getInitials, getCaseAreaChip } from "./constants";
import { downloadMessageAsPdf } from "@/lib/messageToPdf";
import { downloadMessageAsDocx } from "@/lib/bacellarDocx";
import { ActionCard } from "@/components/chat/ActionCard";
import { TaskAlertCard } from "@/components/chat/TaskAlertCard";
import { TarefaConfirmCard } from "@/components/chat/TarefaConfirmCard";
import { ReuniaoConfirmCard } from "@/components/chat/ReuniaoConfirmCard";
import { ReuniaoAcaoCard } from "@/components/chat/ReuniaoAcaoCard";
import ClienteFormWizard from "@/components/clients/ClienteFormWizard";
import { formatElapsed, LONG_RUN_NOTICE_MS, type LiveStage } from "./liveStatus";
import { PecaModal } from "./PecaModal";
import { truncatePecaPreview } from "./pecaPreview";

// Detecta se o conteúdo é uma PEÇA/DOCUMENTO jurídico (petição, contestação,
// procuração, notificação, contrato…) — e não uma resposta de chat comum ou um
// aviso do sistema. Só nesses casos faz sentido oferecer "Baixar em PDF".
// Heurística: exige um marcador FORTE de fechamento de peça, ou 2+ sinais estruturais.
function looksLikePeticao(text: string): boolean {
  if (!text || text.length < 500) return false;
  const t = text.toLowerCase();
  const markers = [
    /excelent[ií]ssim|exmo\.?\s|merit[ií]ssim/,
    /peti[cç][aã]o inicial|reclama[cç][aã]o trabalhista|contesta[cç][aã]o|r[eé]plica|embargos|recurso (?:inominado|ordin[aá]rio|de apela[cç][aã]o)|notifica[cç][aã]o extrajudicial/,
    /dos fatos|do direito|do m[eé]rito|dos pedidos|das preliminares/,
    /nestes termos|termos em que|pede deferimento|p\.\s*deferimento/,
    /\bvara\b|juizado especial|comarca de/,
    /outorgante|outorgad[oa]|instrumento particular|cl[aá]usula/,
  ];
  const strong = /nestes termos|pede deferimento|p\.\s*deferimento/.test(t);
  if (strong) return true;
  const hits = markers.reduce((n, re) => n + (re.test(t) ? 1 : 0), 0);
  return hits >= 2;
}

/* ── Sub-components (chat bubbles) ── */

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

function MessageBubble({ msg, onCadastrarCliente, onCadastrarClienteTask }: {
  msg: JcChatMessage;
  onCadastrarCliente?: (snapshot: PendingMeeting) => void;
  onCadastrarClienteTask?: (snapshot: PendingTask) => void;
}) {
  const { user } = useAuth();
  // "Ver peça completa" abre a peça inteira num painel separado (fora do chat).
  // A expansão vive no painel, não no balão — ao fechar, o chat volta ao trecho.
  const [showFullPeca, setShowFullPeca] = useState(false);
  // Proposta de acao agentica: renderiza o ActionCard (Confirmar/Cancelar) no
  // lugar do balao normal. A confirmacao chama o chat-orchestrator em mode=confirm;
  // a atualizacao da timeline volta via realtime/refetch.
  if (msg.kind === "action_proposal" && msg.proposal) {
    return <ActionCard key={msg.id} proposal={msg.proposal} onDone={() => { /* realtime/refetch ja atualiza */ }} />;
  }
  // Alerta de tarefa (kind === 'task_alert') e avisos de reuniao da TRILHA B
  // (meeting_created/meeting_reminder/meeting_rescheduled): renderiza o
  // TaskAlertCard no lugar do balao normal (rotulo/icone por kind).
  if ((msg.kind === "task_alert" || msg.kind === "meeting_created" || msg.kind === "meeting_reminder" || msg.kind === "meeting_rescheduled") && msg.taskAlert) {
    return <TaskAlertCard key={msg.id} payload={msg.taskAlert} kind={msg.kind} />;
  }
  // Rascunho de tarefa extraido em linguagem natural (kind === 'tarefa_confirm'):
  // renderiza o TarefaConfirmCard (editavel) no lugar do balao normal. So cria a
  // tarefa quando o usuario confirmar (Task 19).
  if (msg.kind === "tarefa_confirm" && msg.tarefaDraft) {
    return <TarefaConfirmCard key={msg.id} draft={msg.tarefaDraft} onCadastrarCliente={onCadastrarClienteTask} />;
  }
  // Ciclo da Agenda pelo chat: cartão de agendar (editável) e cartão de
  // ciclo/reagendar. Só gravam em meetings ao confirmar.
  if (msg.kind === "reuniao_confirm" && msg.reuniaoDraft) {
    return <ReuniaoConfirmCard key={msg.id} draft={msg.reuniaoDraft} onCadastrarCliente={onCadastrarCliente} />;
  }
  if (msg.kind === "reuniao_acao" && msg.reuniaoAcao) {
    return <ReuniaoAcaoCard key={msg.id} payload={msg.reuniaoAcao} />;
  }
  // Etapas intermediarias da orquestracao nao sao exibidas.
  if (msg.kind === "stage" || (msg.role === "system" && msg.stage)) {
    return null;
  }
  const agentColors: Record<string, string> = {
    "Meu Assistente": "#EAB308",
    "Pesquisador Jurídico": "#CA8A04",
    "Redator Processual": "#FACC15",
    "Controlador de Prazos": "#A16207",
  };
  const isUser = msg.role === "user";
  // Estado de ERRO claro (ex.: watchdog de timeout): destaque visual + ícone,
  // para nunca ficar ambíguo com uma resposta normal (Frente 2).
  const isError = msg.kind === "error";
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
      <div style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: "90%", minWidth: 0 }}>
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
        <div
          className="jc-msg-bubble"
          style={isError ? { border: "1px solid rgba(248,113,113,0.5)", background: "rgba(248,113,113,0.08)" } : undefined}
        >
          {isError && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, color: "#F87171", fontWeight: 700, fontSize: 12 }}>
              <AlertTriangle size={13} /> Não foi possível concluir
            </div>
          )}
          {msg.content && (() => {
            const fileMatch = msg.content.match(/\[Arquivos:\s*(.+?)\]/);
            const fileNames = fileMatch ? fileMatch[1].split(",").map((n: string) => n.trim()).filter(Boolean) : [];
            const cleanContent = msg.content.replace(/\n?\[Arquivos:\s*.+?\]/, "").trim();
            return (
              <>
                {fileNames.length > 0 && (
                  <div style={{
                    display: "flex", flexWrap: "wrap", gap: 4, marginBottom: cleanContent ? 8 : 0,
                  }}>
                    {fileNames.map((name: string, i: number) => (
                      <span key={i} style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        padding: "3px 8px", borderRadius: 6, fontSize: 10,
                        background: "rgba(234,179,8,0.12)", border: "1px solid rgba(234,179,8,0.25)",
                        color: "#eab308", maxWidth: 180, overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        📎 {name}
                      </span>
                    ))}
                  </div>
                )}
                {cleanContent && (() => {
                  // É uma PEÇA gerada (não mensagem de chat comum nem aviso do
                  // sistema)? Só nesses casos truncamos o trecho e oferecemos os
                  // botões de download + "Ver peça completa".
                  const isPeca = !isUser && msg.agent !== "Sistema" && looksLikePeticao(cleanContent);
                  if (!isPeca) {
                    // Mensagem curta/normal: exibida inteira, sem "Ver mais".
                    return <SafeMarkdown className="jc-msg-text">{cleanContent}</SafeMarkdown>;
                  }
                  // Peça: mostra só o trecho (primeiras linhas) no balão. O download
                  // e o "Ver peça completa" sempre usam a peça COMPLETA (cleanContent).
                  const { preview, truncated } = truncatePecaPreview(cleanContent);
                  return (
                    <>
                      <div style={{ position: "relative" }}>
                        <SafeMarkdown className="jc-msg-text">{preview}</SafeMarkdown>
                        {truncated && (
                          // Fade indicando que há mais conteúdo além do trecho.
                          <div
                            aria-hidden="true"
                            style={{
                              position: "absolute", left: 0, right: 0, bottom: 0, height: 44,
                              background: "linear-gradient(to bottom, rgba(22,22,31,0), var(--bg3, #16161f))",
                              pointerEvents: "none",
                            }}
                          />
                        )}
                      </div>
                      {truncated && (
                        <button
                          type="button"
                          onClick={() => setShowFullPeca(true)}
                          title="Abrir a peça completa num painel separado"
                          style={{
                            alignSelf: "flex-start", marginTop: 6,
                            display: "inline-flex", alignItems: "center", gap: 6,
                            padding: "4px 10px", borderRadius: 8, fontSize: 11.5, cursor: "pointer",
                            background: "transparent", border: "1px solid rgba(234,179,8,0.4)",
                            color: "#EAB308", fontWeight: 600,
                          }}
                        >
                          Ver peça completa →
                        </button>
                      )}
                      <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8, alignSelf: "flex-start" }}>
                        <button
                          type="button"
                          onClick={() => downloadMessageAsPdf(cleanContent, { agentName: msg.agent, title: "peca" })}
                          title="Baixar esta resposta em PDF"
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 6,
                            padding: "5px 12px", borderRadius: 8, fontSize: 11, cursor: "pointer",
                            background: "rgba(234,179,8,0.12)", border: "1px solid rgba(234,179,8,0.3)",
                            color: "#EAB308", fontWeight: 600,
                          }}
                        >
                          ⬇ Baixar em PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            downloadMessageAsDocx(cleanContent, { title: "peca" })
                              .catch((e) => console.error("[docx] falha ao exportar:", e));
                          }}
                          title="Baixar no padrão Bacellar (.docx com logo e marca d'água)"
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 6,
                            padding: "5px 12px", borderRadius: 8, fontSize: 11, cursor: "pointer",
                            background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.35)",
                            color: "#60A5FA", fontWeight: 600,
                          }}
                        >
                          ⬇ Baixar em DOCX (padrão Bacellar)
                        </button>
                      </div>
                      {showFullPeca && (
                        <PecaModal
                          content={cleanContent}
                          agentName={msg.agent}
                          onClose={() => setShowFullPeca(false)}
                        />
                      )}
                    </>
                  );
                })()}
              </>
            );
          })()}
          {msg.card?.type === "process-list" && <ProcessListCard processes={msg.card.processes} />}
          {msg.actions && msg.actions.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              {msg.actions.map((a, i) => {
                const ghost = a.tone === "ghost";
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={a.onClick}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "6px 14px", borderRadius: 8, fontSize: 11.5, cursor: "pointer",
                      fontWeight: 600,
                      background: ghost ? "transparent" : "rgba(234,179,8,0.14)",
                      border: `1px solid ${ghost ? "rgba(148,163,184,0.35)" : "rgba(234,179,8,0.4)"}`,
                      color: ghost ? "#94A3B8" : "#EAB308",
                    }}
                  >
                    {a.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Indicador de "processando" com FEEDBACK REAL (Frentes 1 e 2):
//  - Rótulo amigável da fase (liveStage.label) + "bloco X de N" quando o backend
//    informa um contador real. Sem dado real → só rótulo + cronômetro (nunca os
//    três pontinhos mudos sozinhos).
//  - Cronômetro ao vivo (segundos desde o início do processamento).
//  - Após LONG_RUN_NOTICE_MS, acrescenta um aviso de que peças longas podem
//    demorar — sem cancelar nada; o run segue.
//  - Linha única (não empilha) — o texto é substituído a cada nova etapa.
function StatusIndicator({
  agent,
  liveStage,
  thinkingStartedAt,
}: {
  agent: string;
  liveStage: LiveStage | null;
  thinkingStartedAt: number | null;
}) {
  // Tick de 1s para o cronômetro andar. Só liga quando há início marcado.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!thinkingStartedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [thinkingStartedAt]);

  const elapsedMs = thinkingStartedAt ? Math.max(0, now - thinkingStartedAt) : 0;
  const label = liveStage?.label || "Processando";
  const hasBlocks =
    typeof liveStage?.blockCurrent === "number" && typeof liveStage?.blockTotal === "number";
  const longRun = elapsedMs >= LONG_RUN_NOTICE_MS;

  return (
    <div className="jc-msg-wrap">
      <div className="jc-msg-avatar" style={{ background: "rgba(234,179,8,0.12)", color: "#EAB308", border: "1px solid rgba(234,179,8,0.28)", fontSize: 11 }}>
        {getInitials(agent)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div className="jc-msg-meta"><span className="agent-tag">{agent}</span><span>agora</span></div>
        <div className="jc-msg-bubble" style={{ padding: "12px 16px" }}>
          <div
            className="jc-status-line"
            role="status"
            aria-live="polite"
            style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
          >
            <span className="jc-thinking" aria-hidden="true"><span /><span /><span /></span>
            <span style={{ fontSize: 12.5, color: "var(--text2, #94A3B8)", fontWeight: 600 }}>
              {label}
              {hasBlocks && (
                <span style={{ color: "#EAB308" }}> · bloco {liveStage!.blockCurrent} de {liveStage!.blockTotal}</span>
              )}
              {thinkingStartedAt && (
                <span style={{ color: "var(--text3, #64748B)", fontWeight: 500 }}> · {formatElapsed(elapsedMs / 1000)}</span>
              )}
            </span>
          </div>
          {longRun && (
            <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--text3, #64748B)", lineHeight: 1.4 }}>
              Ainda processando — peças longas podem levar alguns minutos. Pode continuar acompanhando; o resultado aparece aqui automaticamente.
            </div>
          )}
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
  liveStage: LiveStage | null;
  thinkingStartedAt: number | null;
  showWelcome: boolean;
  setShowWelcome: (v: boolean) => void;
  inputVal: string;
  setInputVal: (v: string) => void;
  handleSend: (text?: string, files?: File[]) => void;
  /** STOP instantâneo: cancela a run desta conversa (botão vira quadrado enquanto processa). */
  onStop?: () => void;
  /** A run já existe (runId conhecido)? O STOP só fica ATIVO quando true — evita a
   *  corrida do clique cedo, antes de a run nascer (que dava 404 no console). */
  canStop?: boolean;
  /** Cancelamento em andamento (clique feito, aguardando o backend reagir). */
  stopping?: boolean;
  isRecording: boolean;
  toggleRecording: () => void;
  /** Ditado por voz suportado neste navegador? Se não, o botão de mic é desabilitado. */
  speechSupported: boolean;
  isReadOnly: boolean;
  roleLabel: string;
  activeDeptLabel: string;
  /** Cliente não encontrado no cartão de agendar → leva ao cadastro (Modelo A). */
  onCadastrarClienteFromMeeting?: (snapshot: PendingMeeting) => void;
  /** Cliente não encontrado no cartão de TAREFA → leva ao cadastro (Modelo A). */
  onCadastrarClienteFromTask?: (snapshot: PendingTask) => void;
  /** Chamado quando o wizard de cadastro inline grava (agenda automática pós-cadastro). */
  onClienteCadastrado?: (clientId: string, clientName: string) => void;
  /** Pré-preenche o wizard inline (ex.: Nome vindo do cartão de agendar). */
  cadastroInitialValues?: ClientFormValues;
}

export default function JurisChatPanel({
  messages,
  thinking,
  thinkingAgentName,
  liveStage,
  thinkingStartedAt,
  showWelcome,
  setShowWelcome,
  inputVal,
  setInputVal,
  handleSend,
  onStop,
  canStop,
  stopping,
  isRecording,
  toggleRecording,
  speechSupported,
  isReadOnly,
  roleLabel,
  activeDeptLabel,
  onCadastrarClienteFromMeeting,
  onCadastrarClienteFromTask,
  onClienteCadastrado,
  cadastroInitialValues,
}: JurisChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  // Envia anexando os nomes a mensagem (chips na UI) E passando os arquivos reais
  // para o backend (Canal A — sobe, extrai texto e grava em chat_attachments).
  const doSend = (text?: string) => {
    const base = (text ?? inputVal).trim();
    if (!base && attachedFiles.length === 0) return;
    // Guarda-corpo de volume: muitos anexos numa só leva aumentam o risco de
    // resumo lossy. Acima de 25, exige confirmação explícita antes de enviar.
    if (attachedFiles.length > 25) {
      const ok = window.confirm(
        `Você anexou ${attachedFiles.length} arquivos. Volume alto aumenta o risco de o conteúdo ` +
        `precisar ser resumido (com perda) ao analisar. Recomendado enviar em levas menores.\n\n` +
        `Deseja enviar mesmo assim?`,
      );
      if (!ok) return;
    }
    let msg = base;
    if (attachedFiles.length > 0) {
      const names = attachedFiles.map((f) => f.name).join(", ");
      msg = msg ? `${msg}\n[Arquivos: ${names}]` : `[Arquivos: ${names}]`;
    }
    handleSend(msg, attachedFiles.length ? attachedFiles : undefined);
    setAttachedFiles([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doSend(); }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fl = e.target.files;
    if (!fl || fl.length === 0) return;
    const captured = Array.from(fl);
    e.target.value = "";
    setAttachedFiles((prev) => [...prev, ...captured]);
  };

  const removeAttachedFile = (i: number) =>
    setAttachedFiles((prev) => prev.filter((_, idx) => idx !== i));

  return (
    <>
      {/* CONTENT */}
      {showWelcome ? (
        <div className="jc-messages">
          <WelcomeScreen
            onDismiss={() => setShowWelcome(false)}
            onSubmit={(msg, files) => {
              setShowWelcome(false);
              setInputVal(msg);
              setTimeout(() => handleSend(msg, files), 60);
            }}
          />
        </div>
      ) : (
        <div className="jc-messages">
          {messages.map(msg =>
            // CADASTRO-MODELO-A: quando o disparo chega (metadata.kind="cadastro_form"),
            // além da bolha de texto, monta o ClienteFormWizard inline. O envio grava
            // direto via save_client (cifrado) — a PII não trafega pelo chat.
            msg.kind === "cadastro_form" ? (
              <div key={msg.id}>
                <MessageBubble msg={msg} onCadastrarCliente={onCadastrarClienteFromMeeting} onCadastrarClienteTask={onCadastrarClienteFromTask} />
                {/* Alinha o wizard SOB a bolha do agente: mesma linha centrada
                    (.jc-msg-wrap) com um espaçador invisível no lugar do avatar.
                    onSaved/initialValues: quando o cadastro veio de um agendamento,
                    o container agenda automaticamente ao concluir e pré-preenche o Nome. */}
                <div className="jc-msg-wrap jc-inline-widget">
                  <div className="jc-msg-avatar" aria-hidden="true" style={{ visibility: "hidden" }} />
                  <ClienteFormWizard mode="create" variant="chat" onSaved={onClienteCadastrado} initialValues={cadastroInitialValues} />
                </div>
              </div>
            ) : (
              <MessageBubble key={msg.id} msg={msg} onCadastrarCliente={onCadastrarClienteFromMeeting} onCadastrarClienteTask={onCadastrarClienteFromTask} />
            ),
          )}
          {thinking && <StatusIndicator agent={thinkingAgentName} liveStage={liveStage} thinkingStartedAt={thinkingStartedAt} />}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* INPUT */}
      {!showWelcome && (
        <div className="jc-input-area">
          {attachedFiles.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 0 8px" }}>
              {attachedFiles.map((f, i) => (
                <div key={`${f.name}-${i}`} style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "4px 10px", borderRadius: 8, fontSize: 11,
                  background: "rgba(234,179,8,0.12)", border: "1px solid rgba(234,179,8,0.25)",
                  color: "#EAB308", maxWidth: 200,
                }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                    📎 {f.name}
                  </span>
                  <button type="button" onClick={() => removeAttachedFile(i)}
                    style={{ background: "none", border: "none", color: "#EAB308", cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1, opacity: 0.7, flexShrink: 0 }}
                    aria-label={`Remover ${f.name}`}>×</button>
                </div>
              ))}
            </div>
          )}
          <div className="jc-input-row">
            <input ref={fileInputRef} type="file" multiple hidden onChange={handleFileChange} aria-hidden="true" />
            <button
              className="jc-mic-btn"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Anexar arquivo"
              type="button"
              title="Anexar arquivo"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2.2"
                   strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span className="jc-sr-only">Anexar arquivo</span>
            </button>
            <textarea ref={textareaRef} className="jc-textarea"
              placeholder={`Fale com os agentes do ${activeDeptLabel}...`}
              value={inputVal}
              onChange={e => { setInputVal(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
              onKeyDown={handleKeyDown} rows={1} />
            <button
              className={`jc-mic-btn ${isRecording ? "recording" : ""}`}
              onClick={toggleRecording}
              disabled={!speechSupported}
              aria-label={
                !speechSupported
                  ? "Ditado por voz não suportado neste navegador"
                  : isRecording
                    ? "Parar ditado"
                    : "Ditar por voz"
              }
              title={
                !speechSupported
                  ? "Ditado não suportado neste navegador"
                  : isRecording
                    ? "Parar ditado"
                    : "Ditar por voz (fala → texto)"
              }
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
              <span className="jc-sr-only">
                {!speechSupported ? "Ditado não suportado neste navegador" : isRecording ? "Parar ditado" : "Ditar por voz"}
              </span>
            </button>
            {thinking && onStop ? (
              // STOP instantâneo: enquanto processa, a seta vira um QUADRADO de stop.
              // Clicar cancela a run DESTA conversa (o botão volta a ser seta ao
              // encerrar). Fica desabilitado no intervalo entre o clique e a reação.
              <button
                className="jc-send-btn is-stop"
                onClick={() => onStop()}
                // Desabilitado até a run existir (canStop) — sem isso, um clique
                // cedo pediria cancel de uma run inexistente. Também trava durante
                // o próprio cancelamento (stopping) para não duplicar o pedido.
                disabled={stopping || !canStop}
                aria-label="Parar geração"
                title={canStop ? "Parar geração" : "Iniciando…"}
                type="button"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"
                     stroke="none" aria-hidden="true">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
                <span className="jc-sr-only">Parar geração</span>
              </button>
            ) : (
              <button
                className="jc-send-btn"
                onClick={() => doSend()}
                disabled={thinking || (!inputVal.trim() && attachedFiles.length === 0)}
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
            )}
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
