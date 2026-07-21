import { useEffect, useState, useRef, KeyboardEvent, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { trackUiEvent } from "@/lib/uiTracking";
import {
  ClipboardList, Clock, Loader, AlertTriangle,
  Plus, Mic, Send, X, Check,
} from "lucide-react";
import { HexagonLoader } from "@/components/HexagonLoader";
import AniversariantesCard from "@/components/AniversariantesCard";

// ────────────────────────────────────────────────────────────────────────────
// Tipagens nativas — SpeechRecognition é vendor-prefixed em alguns browsers.
// ────────────────────────────────────────────────────────────────────────────
type SpeechRecognitionEvent = Event & {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string; confidence: number };
  }>;
};
interface ISpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: Event) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechRecognitionCtor = new () => ISpeechRecognition;

interface TaskSummary {
  total: number;
  critical: number;
  pending: number;
  inProgress: number;
}

interface WelcomeScreenProps {
  onDismiss: () => void;
  onSubmit?: (message: string, files?: File[]) => void;
  /** Recepção (role_templates.code ∈ recepção)? Só então mostra o card de
   *  aniversariantes — 1:1 com o gate is_recepcao() da RPC no banco. */
  isRecepcao?: boolean;
}

const WAVEFORM_BARS = 40;
const GREETING_TYPE_MS = 38;

function useTypewriter(text: string, active: boolean) {
  const [displayed, setDisplayed] = useState("");

  useEffect(() => {
    if (!active || !text) {
      setDisplayed("");
      return;
    }
    setDisplayed("");
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setDisplayed(text.slice(0, index));
      if (index >= text.length) window.clearInterval(timer);
    }, GREETING_TYPE_MS);
    return () => window.clearInterval(timer);
  }, [text, active]);

  return displayed;
}

export default function WelcomeScreen({ onDismiss, onSubmit, isRecepcao = false }: WelcomeScreenProps) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [displayName, setDisplayName] = useState("");
  const [summary, setSummary] = useState<TaskSummary>({
    total: 0, critical: 0, pending: 0, inProgress: 0,
  });
  const [loading, setLoading] = useState(true);
  const [value, setValue] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);

  // ── Recording state ────────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [waveLevels, setWaveLevels] = useState<number[]>(() => new Array(WAVEFORM_BARS).fill(2));
  const [liveTranscript, setLiveTranscript] = useState("");
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const transcriptAccumRef = useRef<string>("");

  // ── Profile + KPIs ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("user_id", user.id)
          .maybeSingle();
        const firstName =
          profile?.display_name?.split(" ")[0] ||
          user.email?.split("@")[0] ||
          "Usuário";
        setDisplayName(firstName);

        // Tarefas vivas ficam em `user_tasks` (humano→humano). A antiga
        // `agent_tasks` é um subsistema morto que nunca recebeu dados, então as
        // KPIs aqui exibiam sempre zero. Filtramos pelas tarefas atribuídas ao
        // usuário logado (`assignee_user_id`) e descartamos as encerradas, em
        // linha com a semântica do inbox (`get_my_inbox` exclui concluídas).
        const { data: tasks } = await supabase
          .from("user_tasks")
          .select("priority, status")
          .eq("assignee_user_id", user.id)
          .not("status", "in", "(completed,cancelled,draft)");
        if (tasks) {
          setSummary({
            total: tasks.length,
            critical: tasks.filter((t) => t.priority === "critical").length,
            // "Pendentes" = atribuída mas ainda não iniciada.
            pending: tasks.filter((t) => t.status === "assigned").length,
            inProgress: tasks.filter((t) => t.status === "in_progress").length,
          });
        }
      } catch (err) {
        console.warn("[WelcomeScreen] Falha ao carregar dados:", err);
        setDisplayName(user.email?.split("@")[0] || "Usuário");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [user]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────
  useEffect(() => {
    return () => stopRecordingInternals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopRecordingInternals = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* noop */ }
      recognitionRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => { /* noop */ });
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  // ── Submit ─────────────────────────────────────────────────────────────
  const handleSubmit = useCallback((overrideValue?: string) => {
    const v = (overrideValue ?? value).trim();
    if (!v && attachedFiles.length === 0) return;
    trackUiEvent("cta_click", {
      surface: "welcome",
      target_id: "welcome_chat_submit",
      target_label: "Chat inicial",
      section: "primary_cta",
    });
    let msg = v;
    const filesToSend = attachedFiles.length ? [...attachedFiles] : undefined;
    if (attachedFiles.length > 0) {
      const names = attachedFiles.map((f) => f.name).join(", ");
      msg = msg ? `${msg}\n[Arquivos: ${names}]` : `[Arquivos: ${names}]`;
    }
    if (onSubmit) onSubmit(msg, filesToSend);
    else onDismiss();
    setValue("");
    setAttachedFiles([]);
  }, [value, attachedFiles, onSubmit, onDismiss]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // ── File attach ────────────────────────────────────────────────────────
  const handleAttach = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const captured = Array.from(fileList);
    e.target.value = "";
    setAttachedFiles((prev) => [...prev, ...captured]);
    try {
      trackUiEvent("cta_click", {
        surface: "welcome",
        target_id: "welcome_attach_files",
        target_label: `${captured.length} arquivo(s)`,
      });
    } catch { /* tracking nao deve bloquear upload */ }
  };

  const removeAttachedFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Recording — start ───────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    trackUiEvent("cta_click", {
      surface: "welcome",
      target_id: "welcome_record_start",
      target_label: "Iniciar gravação",
    });

    // 1) Microfone + AnalyserNode pra waveform
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ACtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new ACtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      audioContextRef.current = ctx;
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(data);
        const bins = data.length;
        const step = Math.max(1, Math.floor(bins / WAVEFORM_BARS));
        const next: number[] = [];
        for (let i = 0; i < WAVEFORM_BARS; i++) {
          let sum = 0;
          for (let j = 0; j < step; j++) {
            sum += data[i * step + j] ?? 0;
          }
          // 0..255 → 2..40 (mínimo 2 para uma linha de base sempre visível)
          next.push(2 + (sum / step / 255) * 38);
        }
        setWaveLevels(next);
        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (err) {
      // Sem permissão de microfone — desliga gracefully.
      console.warn("[WelcomeScreen] Microphone access denied:", err);
      setIsRecording(false);
      return;
    }

    // 2) Web Speech API pra transcrição
    transcriptAccumRef.current = "";
    setLiveTranscript("");
    const SR =
      (window as unknown as { SpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition;
    if (SR) {
      try {
        const rec = new SR();
        rec.lang = "pt-BR";
        rec.continuous = true;
        rec.interimResults = true;
        rec.onresult = (e: SpeechRecognitionEvent) => {
          let interim = "";
          let final = transcriptAccumRef.current;
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const res = e.results[i];
            const txt = res[0].transcript;
            if (res.isFinal) {
              final = (final + " " + txt).trim();
            } else {
              interim += txt;
            }
          }
          transcriptAccumRef.current = final;
          setLiveTranscript((final + " " + interim).trim());
        };
        rec.onerror = () => { /* erro silencioso — waveform continua */ };
        rec.onend = () => { /* termina junto com o stream */ };
        rec.start();
        recognitionRef.current = rec;
      } catch (err) {
        console.warn("[WelcomeScreen] SpeechRecognition not available:", err);
      }
    }

    setIsRecording(true);
  }, []);

  // ── Recording — cancel (descarta) ───────────────────────────────────────
  const cancelRecording = useCallback(() => {
    trackUiEvent("cta_click", {
      surface: "welcome",
      target_id: "welcome_record_cancel",
      target_label: "Cancelar gravação",
    });
    stopRecordingInternals();
    transcriptAccumRef.current = "";
    setLiveTranscript("");
    setIsRecording(false);
  }, [stopRecordingInternals]);

  // ── Recording — confirm (envia transcript) ──────────────────────────────
  const confirmRecording = useCallback(() => {
    trackUiEvent("cta_click", {
      surface: "welcome",
      target_id: "welcome_record_confirm",
      target_label: "Confirmar gravação",
    });
    const finalText = (transcriptAccumRef.current || liveTranscript).trim();
    stopRecordingInternals();
    setIsRecording(false);
    setLiveTranscript("");
    transcriptAccumRef.current = "";
    if (finalText) {
      // Dispara o submit direto com o transcript (não passa pelo state `value`).
      handleSubmit(finalText);
    }
  }, [liveTranscript, stopRecordingInternals, handleSubmit]);

  const greetingFull = useMemo(
    () => `Olá ${displayName}, como posso te ajudar?`,
    [displayName],
  );
  const typedGreeting = useTypewriter(greetingFull, !loading);
  const greetingDone = typedGreeting.length >= greetingFull.length;

  // E7 / UX-01: focar o textarea ASSIM QUE a tela sai do loading — sem esperar o
  // fim da animação do título (~1,2s). Antes o foco dependia de `greetingDone`, e o
  // composer ficava com `pointer-events: none`/opacity 0 durante a digitação do
  // título, engolindo a 1ª tecla/Enter. Agora o composer é revelado de imediato (ver
  // className abaixo) e o foco acontece no mount, então a 1ª mensagem nunca se perde.
  useEffect(() => {
    if (!loading && !isRecording) {
      textareaRef.current?.focus();
    }
  }, [loading, isRecording]);

  if (loading) {
    return (
      <div className="ws-root">
        <HexagonLoader variant="inline" />
      </div>
    );
  }

  const kpis = [
    { label: "Total de Tarefas", value: summary.total, icon: ClipboardList },
    { label: "Pendentes", value: summary.pending, icon: Clock },
    { label: "Em Andamento", value: summary.inProgress, icon: Loader },
    { label: "Críticas", value: summary.critical, icon: AlertTriangle },
  ];

  return (
    <div className="ws-root">
      <div className="ws-stage">
        <h1 className="ws-greeting" aria-label={greetingFull}>
          {typedGreeting}
          {!greetingDone && <span className="ws-greeting-cursor" aria-hidden="true">|</span>}
        </h1>

        {/* Composer — dois modos: idle e recording.
            UX-01: o wrapper idle é revelado de imediato (animação de entrada no mount),
            nunca gated em `greetingDone` — evita a janela morta (pointer-events:none)
            durante a animação do título em que a 1ª tecla/Enter se perdia. */}
        {!isRecording ? (
          <div className="ws-composer-wrapper ws-composer--enter">
            {attachedFiles.length > 0 && (
              <div style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                padding: "8px 12px",
                background: "rgba(255,255,255,0.04)",
                borderRadius: "12px 12px 0 0",
                border: "1px solid rgba(255,255,255,0.08)",
                borderBottom: "none",
                maxWidth: 620,
                width: "100%",
                boxSizing: "border-box",
              }}>
                {attachedFiles.map((f, i) => (
                  <div
                    key={`${f.name}-${i}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 10px",
                      borderRadius: 8,
                      background: "rgba(234,179,8,0.12)",
                      border: "1px solid rgba(234,179,8,0.25)",
                      fontSize: 11,
                      color: "#eab308",
                      maxWidth: 200,
                    }}
                  >
                    <span style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      flex: 1,
                    }}>
                      {f.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAttachedFile(i)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#eab308",
                        cursor: "pointer",
                        padding: 0,
                        fontSize: 14,
                        lineHeight: 1,
                        opacity: 0.7,
                        flexShrink: 0,
                      }}
                      aria-label={`Remover ${f.name}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="ws-composer" style={attachedFiles.length > 0 ? { borderTopLeftRadius: 0, borderTopRightRadius: 0 } : undefined}>
              <button
                type="button"
                className="ws-btn ws-attach"
                onClick={handleAttach}
              >
                <Plus size={20} strokeWidth={2.2} aria-hidden="true" />
                <span className="ws-sr-only">Anexar arquivos</span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={handleFileChange}
                aria-hidden="true"
              />

              <textarea
                ref={textareaRef}
                autoFocus
                className="ws-textarea"
                placeholder="Pergunte alguma coisa"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
                }}
                onKeyDown={handleKeyDown}
                rows={1}
              />

              {value.trim() || attachedFiles.length > 0 ? (
                <button
                  type="button"
                  className="ws-btn ws-send"
                  onClick={() => handleSubmit()}
                >
                  <Send size={16} strokeWidth={2.4} aria-hidden="true" />
                  <span className="ws-sr-only">Enviar</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="ws-btn ws-mic"
                  onClick={startRecording}
                >
                  <Mic size={18} strokeWidth={2.2} aria-hidden="true" />
                  <span className="ws-sr-only">Gravar áudio</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="ws-composer ws-composer--recording ws-composer--enter">
            <div className="ws-wave" aria-label="Onda do áudio capturado">
              {waveLevels.map((h, i) => (
                <span
                  key={i}
                  className="ws-wave-bar"
                  style={{ height: `${h}px` }}
                />
              ))}
            </div>

            <button
              type="button"
              className="ws-btn ws-cancel"
              onClick={cancelRecording}
            >
              <X size={18} strokeWidth={2.4} aria-hidden="true" />
              <span className="ws-sr-only">Cancelar gravação</span>
            </button>

            <button
              type="button"
              className="ws-btn ws-confirm"
              onClick={confirmRecording}
            >
              <Check size={18} strokeWidth={2.6} aria-hidden="true" />
              <span className="ws-sr-only">Enviar transcrição</span>
            </button>
          </div>
        )}

        {/* Transcrição parcial (preview discreto durante gravação) */}
        {isRecording && liveTranscript && (
          <div className="ws-transcript-preview">{liveTranscript}</div>
        )}

        <div className="ws-kpis">
          {kpis.map((k) => (
            <div key={k.label} className="ws-kpi">
              <k.icon size={18} className="ws-kpi-icon" />
              <div className="ws-kpi-value">{k.value}</div>
              <div className="ws-kpi-label">{k.label}</div>
            </div>
          ))}
        </div>

        {/* Card de aniversariantes do dia — exclusivo da recepção. */}
        {isRecepcao && <AniversariantesCard />}
      </div>

      <style>{`
        .ws-root {
          height: 100%; width: 100%;
          display: flex; align-items: flex-start; justify-content: center;
          padding: 80px 24px 40px;
          background: transparent; overflow-y: auto;
        }
        .ws-stage {
          width: 100%; max-width: 760px;
          display: flex; flex-direction: column; align-items: center;
          gap: 24px;
        }
        .ws-greeting {
          font-family: var(--font-spartan, 'Plus Jakarta Sans', sans-serif);
          font-size: clamp(22px, 3.4vw, 32px);
          font-weight: 700; color: var(--text1);
          letter-spacing: -0.01em; text-align: center;
          margin: 0; line-height: 1.2;
          min-height: 1.2em;
        }
        .ws-greeting-cursor {
          color: var(--gold);
          margin-left: 2px;
          animation: wsCursorBlink 0.9s step-end infinite;
        }
        @keyframes wsCursorBlink {
          50% { opacity: 0; }
        }

        /* ── Composer (idle) ───────────────────────────────────────── */
        .ws-composer--hidden {
          opacity: 0;
          pointer-events: none;
          transform: translateY(14px) scale(0.98);
        }
        .ws-composer--enter {
          animation: wsComposerIn 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes wsComposerIn {
          from {
            opacity: 0;
            transform: translateY(14px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .ws-composer-wrapper {
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .ws-composer {
          display: flex; align-items: center; gap: 8px;
          width: 100%;
          background: var(--bg3);
          border: 1px solid var(--border);
          border-radius: 28px;
          padding: 8px 8px 8px 8px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
          min-height: 56px;
        }
        .ws-composer:focus-within {
          border-color: rgba(234, 179, 8, 0.55);
          box-shadow:
            0 8px 24px rgba(0, 0, 0, 0.55),
            0 0 0 3px rgba(234, 179, 8, 0.18);
        }

        /* Botões — base comum (impede vazamento de aria-label) */
        .ws-btn {
          flex-shrink: 0;
          width: 40px; height: 40px;
          border-radius: 50%;
          border: 1px solid transparent;
          background: transparent;
          display: inline-flex; align-items: center; justify-content: center;
          cursor: pointer; padding: 0; line-height: 0;
          color: var(--text2);
          transition: background 0.18s ease, color 0.18s ease,
                      border-color 0.18s ease, transform 0.12s ease;
        }
        /* Esconde qualquer texto (sr-only / aria-label vazado por extensions) */
        .ws-btn::before,
        .ws-btn::after { content: none !important; }
        .ws-sr-only {
          position: absolute; width: 1px; height: 1px;
          padding: 0; margin: -1px; overflow: hidden;
          clip: rect(0,0,0,0); white-space: nowrap; border: 0;
        }
        .ws-btn:hover { background: var(--bg4); color: var(--gold); }

        .ws-attach { border-color: var(--border); }
        .ws-attach:hover { border-color: rgba(234, 179, 8, 0.45); }
        .ws-mic:hover { background: var(--bg4); }
        .ws-send {
          background: var(--gold); color: #0a0a12;
          border-color: var(--gold);
        }
        .ws-send:hover { background: var(--gold2); color: #0a0a12; filter: brightness(1.04); transform: scale(1.04); }
        .ws-cancel {
          background: var(--bg4); color: var(--text2);
          border-color: var(--border);
        }
        .ws-cancel:hover { background: rgba(239,68,68,0.10); color: #ef4444; border-color: rgba(239,68,68,0.35); }
        .ws-confirm {
          background: var(--gold); color: #0a0a12;
          border-color: var(--gold);
        }
        .ws-confirm:hover { background: var(--gold2); transform: scale(1.04); filter: brightness(1.04); }

        /* Textarea */
        .ws-textarea {
          flex: 1; min-width: 0;
          background: transparent; border: none; outline: none; resize: none;
          color: var(--text1);
          font-family: var(--font-body);
          font-size: 15px; line-height: 1.5;
          padding: 8px 4px;
          max-height: 160px;
        }
        .ws-textarea::placeholder { color: var(--text3); }

        /* ── Composer (recording) ──────────────────────────────────── */
        .ws-composer--recording {
          padding: 8px 10px;
          border-color: rgba(234, 179, 8, 0.45);
          box-shadow:
            0 8px 24px rgba(0, 0, 0, 0.55),
            0 0 0 2px rgba(234, 179, 8, 0.20);
        }
        .ws-wave {
          flex: 1;
          height: 40px;
          display: flex; align-items: center; justify-content: center;
          gap: 3px;
          overflow: hidden;
          padding: 0 8px;
        }
        .ws-wave-bar {
          flex: 1;
          max-width: 4px;
          background: var(--gold);
          border-radius: 2px;
          opacity: 0.9;
          transition: height 60ms linear;
          will-change: height;
        }

        .ws-transcript-preview {
          width: 100%;
          font-family: var(--font-body);
          font-size: 13px; color: var(--text3);
          font-style: italic; text-align: center;
          padding: 4px 12px;
          opacity: 0.85;
          min-height: 22px;
        }

        /* ── KPIs ───────────────────────────────────────────────────── */
        .ws-kpis {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px; width: 100%; margin-top: 4px;
        }
        @media (max-width: 640px) {
          .ws-kpis { grid-template-columns: repeat(2, 1fr); }
        }
        .ws-kpi {
          background: var(--bg3);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 14px 12px;
          display: flex; flex-direction: column; align-items: center; gap: 6px;
          transition: border-color 0.18s ease, background 0.18s ease;
        }
        .ws-kpi:hover {
          border-color: rgba(234, 179, 8, 0.35);
          background: var(--bg4);
        }
        .ws-kpi-icon { color: var(--gold); }
        .ws-kpi-value {
          font-family: var(--font-spartan, var(--font-disp));
          font-size: 22px; font-weight: 700;
          color: var(--gold); line-height: 1;
          letter-spacing: -0.01em;
        }
        .ws-kpi-label {
          font-size: 11px; color: var(--text3);
          letter-spacing: 0.03em; text-align: center;
        }
        .ws-root svg.lucide { display: inline-block !important; }
      `}</style>
    </div>
  );
}
