import { useEffect, useState, useRef, KeyboardEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { trackUiEvent } from "@/lib/uiTracking";
import {
  ClipboardList, Clock, Loader, AlertTriangle,
  Plus, Mic, Send, AudioLines,
} from "lucide-react";

interface TaskSummary {
  total: number;
  critical: number;
  pending: number;
  inProgress: number;
}

interface WelcomeScreenProps {
  /** Mantido para compat com chamada existente, mas o submit agora é direto. */
  onDismiss: () => void;
  /** Quando o usuário envia uma mensagem, dispara o fluxo principal de chat. */
  onSubmit?: (message: string) => void;
}

export default function WelcomeScreen({ onDismiss, onSubmit }: WelcomeScreenProps) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [displayName, setDisplayName] = useState("");
  const [summary, setSummary] = useState<TaskSummary>({
    total: 0, critical: 0, pending: 0, inProgress: 0,
  });
  const [loading, setLoading] = useState(true);
  const [value, setValue] = useState("");
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
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

      const { data: tasks } = await supabase
        .from("agent_tasks")
        .select("priority, status")
        .eq("user_id", user.id);
      if (tasks) {
        setSummary({
          total: tasks.length,
          critical: tasks.filter((t) => t.priority === "critical").length,
          pending: tasks.filter((t) => t.status === "pending").length,
          inProgress: tasks.filter((t) => t.status === "in_progress").length,
        });
      }
      setLoading(false);
    };
    load();
  }, [user]);

  const handleSubmit = () => {
    const v = value.trim();
    if (!v) return;
    trackUiEvent("cta_click", {
      surface: "welcome",
      target_id: "welcome_chat_submit",
      target_label: "Chat inicial",
      section: "primary_cta",
    });
    if (onSubmit) {
      onSubmit(v);
    } else {
      onDismiss();
    }
    setValue("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleAttach = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    trackUiEvent("cta_click", {
      surface: "welcome",
      target_id: "welcome_attach_files",
      target_label: `${files.length} arquivo(s)`,
    });
    const names = Array.from(files).map((f) => f.name).join(", ");
    setValue((cur) => (cur ? `${cur}\n[Arquivos: ${names}]` : `[Arquivos: ${names}]`));
    e.target.value = "";
  };

  const toggleRecording = () => {
    setIsRecording((r) => !r);
    trackUiEvent("cta_click", {
      surface: "welcome",
      target_id: isRecording ? "welcome_record_stop" : "welcome_record_start",
      target_label: "Gravar áudio",
    });
  };

  if (loading) {
    return (
      <div className="ws-root">
        <div className="ws-loading">
          <Loader size={28} className="ws-loading-spinner" />
          <p>Carregando…</p>
        </div>
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
        <h1 className="ws-greeting">
          Olá {displayName}, como posso te ajudar?
        </h1>

        <div className="ws-composer">
          <button
            type="button"
            className="ws-attach"
            onClick={handleAttach}
            aria-label="Anexar arquivos"
            title="Anexar arquivos"
          >
            <Plus size={20} strokeWidth={2} />
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
            aria-label="Mensagem para o assistente"
          />

          <button
            type="button"
            className={`ws-icon-btn ${isRecording ? "is-recording" : ""}`}
            onClick={toggleRecording}
            aria-label={isRecording ? "Parar gravação" : "Gravar áudio"}
            title={isRecording ? "Parar gravação" : "Gravar áudio"}
          >
            <Mic size={18} strokeWidth={2} />
          </button>

          <button
            type="button"
            className="ws-send-btn"
            onClick={handleSubmit}
            disabled={!value.trim()}
            aria-label="Enviar mensagem"
            title="Enviar"
          >
            {value.trim() ? <Send size={16} strokeWidth={2.4} /> : <AudioLines size={16} strokeWidth={2.4} />}
          </button>
        </div>

        <div className="ws-kpis">
          {kpis.map((k) => (
            <div key={k.label} className="ws-kpi">
              <k.icon size={18} className="ws-kpi-icon" />
              <div className="ws-kpi-value">{k.value}</div>
              <div className="ws-kpi-label">{k.label}</div>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="ws-skip"
          onClick={() => {
            trackUiEvent("cta_click", {
              surface: "welcome",
              target_id: "welcome_skip",
              target_label: "Pular para o chat",
            });
            onDismiss();
          }}
        >
          Pular para o chat
        </button>
      </div>

      <style>{`
        .ws-root {
          height: 100%;
          width: 100%;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 80px 24px 40px;
          background: transparent;
          overflow-y: auto;
        }
        .ws-stage {
          width: 100%;
          max-width: 760px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 28px;
        }
        .ws-greeting {
          font-family: var(--font-disp);
          font-size: clamp(22px, 3.4vw, 32px);
          font-weight: 600;
          color: var(--text1);
          letter-spacing: -0.01em;
          text-align: center;
          margin: 0;
          line-height: 1.2;
        }
        .ws-composer {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          background: var(--bg3);
          border: 1px solid var(--border);
          border-radius: 28px;
          padding: 8px 8px 8px 14px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .ws-composer:focus-within {
          border-color: rgba(234, 179, 8, 0.55);
          box-shadow:
            0 8px 24px rgba(0, 0, 0, 0.55),
            0 0 0 3px rgba(234, 179, 8, 0.18);
        }
        .ws-attach {
          flex-shrink: 0;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: 1px solid var(--border);
          background: transparent;
          color: var(--text2);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease;
        }
        .ws-attach:hover {
          background: var(--bg4);
          color: var(--gold);
          border-color: rgba(234, 179, 8, 0.4);
        }
        .ws-textarea {
          flex: 1;
          min-width: 0;
          background: transparent;
          border: none;
          outline: none;
          resize: none;
          color: var(--text1);
          font-family: var(--font-body);
          font-size: 15px;
          line-height: 1.5;
          padding: 8px 4px;
          max-height: 160px;
        }
        .ws-textarea::placeholder { color: var(--text3); }
        .ws-icon-btn {
          flex-shrink: 0;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: transparent;
          border: none;
          color: var(--text2);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.18s ease, color 0.18s ease;
        }
        .ws-icon-btn:hover {
          background: var(--bg4);
          color: var(--gold);
        }
        .ws-icon-btn.is-recording {
          color: var(--gold);
          animation: wsPulse 1.4s ease-in-out infinite;
        }
        @keyframes wsPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(234, 179, 8, 0.45); }
          50%      { box-shadow: 0 0 0 6px rgba(234, 179, 8, 0); }
        }
        .ws-send-btn {
          flex-shrink: 0;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: none;
          background: var(--gold);
          color: #0a0a12;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: filter 0.18s ease, transform 0.12s ease;
        }
        .ws-send-btn:hover:not(:disabled) {
          filter: brightness(1.08);
          transform: scale(1.04);
        }
        .ws-send-btn:disabled {
          background: var(--bg4);
          color: var(--text3);
          cursor: default;
        }
        .ws-kpis {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
          width: 100%;
          margin-top: 4px;
        }
        @media (max-width: 640px) {
          .ws-kpis { grid-template-columns: repeat(2, 1fr); }
        }
        .ws-kpi {
          background: var(--bg3);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 14px 12px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          transition: border-color 0.18s ease, background 0.18s ease;
        }
        .ws-kpi:hover {
          border-color: rgba(234, 179, 8, 0.35);
          background: var(--bg4);
        }
        .ws-kpi-icon { color: var(--gold); }
        .ws-kpi-value {
          font-family: var(--font-disp);
          font-size: 22px;
          font-weight: 600;
          color: var(--gold);
          line-height: 1;
        }
        .ws-kpi-label {
          font-size: 11px;
          color: var(--text3);
          letter-spacing: 0.03em;
          text-align: center;
        }
        .ws-skip {
          background: transparent;
          border: none;
          color: var(--text3);
          font-size: 12px;
          letter-spacing: 0.04em;
          cursor: pointer;
          padding: 6px 10px;
          margin-top: 4px;
          border-radius: 6px;
          transition: color 0.18s ease;
        }
        .ws-skip:hover { color: var(--text2); }
        .ws-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          color: var(--text3);
          padding: 80px 24px;
        }
        .ws-loading-spinner { animation: wsSpin 1.4s linear infinite; color: var(--gold); }
        @keyframes wsSpin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
        .ws-root svg.lucide { display: inline-block !important; }
      `}</style>
    </div>
  );
}
