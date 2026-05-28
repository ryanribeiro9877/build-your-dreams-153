import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { HexagonLoader } from "@/components/HexagonLoader";
import {
  useInterAssistantInbox,
  useInterAssistantOutbox,
  useUsersForInterAssistant,
  createInterAssistantRequest,
  answerInterAssistantRequest,
} from "@/hooks/useInterAssistant";
import { toast } from "sonner";
import type { InterAssistantStatus } from "@/types/jurisai";

type TabKey = "inbox" | "outbox" | "new";

const STATUS_LABELS: Record<InterAssistantStatus, string> = {
  pending: "Pendente",
  in_progress: "Em andamento",
  answered: "Respondido",
  denied: "Negado",
  expired: "Expirado",
};

const STATUS_COLORS: Record<InterAssistantStatus, string> = {
  pending:     "#facc15",
  in_progress: "#3b82f6",
  answered:    "#22c55e",
  denied:      "#ef4444",
  expired:     "#7a7a92",
};

// Tipos de pedido sugeridos (a UI deixa também digitar livre)
const REQUEST_TYPE_SUGGESTIONS = [
  { code: "consultar_documento_cliente", label: "Consultar documento de cliente" },
  { code: "consultar_status_processo",   label: "Consultar status de processo" },
  { code: "solicitar_protocolo",         label: "Solicitar protocolo de peça" },
  { code: "solicitar_validacao_calculo", label: "Solicitar validação de cálculo" },
  { code: "solicitar_documentacao",      label: "Solicitar documentação adicional" },
  { code: "solicitar_audiencia_externa", label: "Solicitar audiência externa (Robson)" },
  { code: "consultar_disponibilidade",   label: "Consultar disponibilidade de agenda" },
  { code: "outro",                       label: "Outro (especificar no detalhe)" },
];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function InterAssistantInbox() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>("inbox");

  return (
    <div style={{
      minHeight: "100vh", background: "#09090f", color: "#eeeef5",
      fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", padding: 24,
    }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <button
            onClick={() => navigate("/sistema")}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "1px solid #25253a",
              background: "#11111a", color: "#c4c4d4", cursor: "pointer", fontSize: 13,
            }}
          >
            ← Voltar
          </button>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#eab308", margin: 0 }}>
            Protocolo entre Assistentes
          </h1>
        </div>

        <p style={{ fontSize: 13, color: "#7a7a92", marginBottom: 16, marginTop: 0, lineHeight: 1.5 }}>
          Aqui você pode pedir informações pro <strong>Meu Assistente</strong> de outro colega,
          ou responder ao que pediram pro seu. Pedidos expiram em 72h por padrão.
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          <TabButton active={tab === "inbox"}  onClick={() => setTab("inbox")}>📥 Recebidos</TabButton>
          <TabButton active={tab === "outbox"} onClick={() => setTab("outbox")}>📤 Enviados</TabButton>
          <TabButton active={tab === "new"}    onClick={() => setTab("new")}>+ Novo pedido</TabButton>
        </div>

        {tab === "inbox" && <InboxTab />}
        {tab === "outbox" && <OutboxTab />}
        {tab === "new" && <NewRequestTab onCreated={() => setTab("outbox")} />}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 16px", borderRadius: 8,
        border: `1px solid ${active ? "#eab308" : "#25253a"}`,
        background: active ? "rgba(234, 179, 8, 0.15)" : "#11111a",
        color: active ? "#facc15" : "#c4c4d4",
        cursor: "pointer", fontSize: 13, fontWeight: 600,
      }}
    >
      {children}
    </button>
  );
}

// ─── INBOX (Recebidos) ────────────────────────────────────────────────────────
function InboxTab() {
  const [includeFinalized, setIncludeFinalized] = useState(false);
  const { items, loading } = useInterAssistantInbox(includeFinalized);
  const [responding, setResponding] = useState<string | null>(null);
  const [responseText, setResponseText] = useState("");

  if (loading) return <HexagonLoader variant="inline" label="Carregando" />;

  const handleAnswer = async (id: string, status: "answered" | "denied") => {
    try {
      await answerInterAssistantRequest(
        id,
        { message: responseText.trim() || (status === "denied" ? "Pedido negado." : "Respondido.") },
        status,
      );
      toast.success(status === "answered" ? "Pedido respondido!" : "Pedido negado.");
      setResponding(null);
      setResponseText("");
    } catch (e) {
      toast.error(`Erro: ${(e as Error).message}`);
    }
  };

  return (
    <>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, fontSize: 13, color: "#c4c4d4", cursor: "pointer" }}>
        <input type="checkbox" checked={includeFinalized} onChange={(e) => setIncludeFinalized(e.target.checked)} />
        Mostrar finalizados
      </label>

      {items.length === 0 ? (
        <EmptyState message="Nenhum pedido recebido no momento." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {items.map(item => {
            const msg = (item.payload as { message?: string })?.message || "(sem mensagem)";
            const isResponding = responding === item.id;
            const canAnswer = item.status === "pending" || item.status === "in_progress";
            return (
              <div key={item.id} style={cardStyle(item.status)}>
                <Header
                  label={item.request_type}
                  badge={STATUS_LABELS[item.status]}
                  badgeColor={STATUS_COLORS[item.status]}
                  isExpired={item.is_expired}
                />
                <div style={{ fontSize: 14, color: "#eeeef5", marginBottom: 8 }}>
                  <strong>{item.from_user_name}</strong>
                  <span style={{ color: "#7a7a92", fontWeight: 400 }}> ({item.from_user_role_label})</span> pediu:
                </div>
                <Quote text={msg} />
                <Meta items={[
                  `🕒 ${formatDate(item.created_at)}`,
                  item.expires_at ? `⏰ Expira: ${formatDate(item.expires_at)}` : null,
                ]} />

                {canAnswer && (
                  isResponding ? (
                    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                      <textarea
                        placeholder="Sua resposta..."
                        value={responseText}
                        onChange={(e) => setResponseText(e.target.value)}
                        rows={3}
                        style={textareaStyle}
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => handleAnswer(item.id, "answered")} style={btnSuccess}>
                          ✓ Enviar resposta
                        </button>
                        <button onClick={() => handleAnswer(item.id, "denied")} style={btnDanger}>
                          ✗ Negar pedido
                        </button>
                        <button
                          onClick={() => { setResponding(null); setResponseText(""); }}
                          style={btnSecondary}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 8 }}>
                      <button onClick={() => setResponding(item.id)} style={btnPrimary}>
                        Responder
                      </button>
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ─── OUTBOX (Enviados) ────────────────────────────────────────────────────────
function OutboxTab() {
  const { items, loading } = useInterAssistantOutbox(true);
  if (loading) return <HexagonLoader variant="inline" label="Carregando" />;

  if (items.length === 0) {
    return <EmptyState message="Você ainda não enviou nenhum pedido inter-Assistente." />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {items.map(item => {
        const msg = (item.payload as { message?: string })?.message || "(sem mensagem)";
        const response = (item.response_payload as { message?: string })?.message;
        return (
          <div key={item.id} style={cardStyle(item.status)}>
            <Header
              label={item.request_type}
              badge={STATUS_LABELS[item.status]}
              badgeColor={STATUS_COLORS[item.status]}
            />
            <div style={{ fontSize: 14, color: "#eeeef5", marginBottom: 8 }}>
              Para <strong>{item.to_user_name}</strong>
              <span style={{ color: "#7a7a92", fontWeight: 400 }}> ({item.to_user_role_label})</span>
            </div>
            <Quote text={msg} />
            {response && (
              <>
                <div style={{ fontSize: 11, color: "#7a7a92", marginTop: 12, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Resposta:
                </div>
                <Quote text={response} accent="#22c55e" />
              </>
            )}
            <Meta items={[
              `🕒 Enviado: ${formatDate(item.created_at)}`,
              item.answered_at ? `✓ Respondido: ${formatDate(item.answered_at)}` : null,
            ]} />
          </div>
        );
      })}
    </div>
  );
}

// ─── NOVO PEDIDO ──────────────────────────────────────────────────────────────
function NewRequestTab({ onCreated }: { onCreated: () => void }) {
  const { users, loading: usersLoading } = useUsersForInterAssistant();
  const [toUserId, setToUserId] = useState("");
  const [requestType, setRequestType] = useState(REQUEST_TYPE_SUGGESTIONS[0].code);
  const [customType, setCustomType] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const eligibleUsers = useMemo(() => users.filter(u => u.has_assistant), [users]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!toUserId || !message.trim()) {
      toast.error("Selecione um destinatário e escreva a mensagem.");
      return;
    }
    setSubmitting(true);
    try {
      const finalType = requestType === "outro" ? (customType.trim() || "outro") : requestType;
      await createInterAssistantRequest({
        to_user_id: toUserId,
        request_type: finalType,
        payload: { message: message.trim() },
        expires_in_hours: 72,
      });
      toast.success("Pedido enviado!");
      onCreated();
    } catch (e) {
      toast.error(`Erro: ${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (usersLoading) return <HexagonLoader variant="inline" label="Carregando colegas" />;

  if (eligibleUsers.length === 0) {
    return (
      <div style={{
        padding: 24, borderRadius: 12, textAlign: "center",
        background: "#11111a", border: "1px solid #25253a", color: "#7a7a92",
      }}>
        Nenhum colega com Meu Assistente provisionado ainda.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <label style={labelStyle}>Para qual colega *</label>
        <select value={toUserId} onChange={(e) => setToUserId(e.target.value)} style={inputStyle} required>
          <option value="">— Selecione —</option>
          {eligibleUsers.map(u => (
            <option key={u.user_id} value={u.user_id}>
              {u.full_name} · {u.role_label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label style={labelStyle}>Tipo do pedido</label>
        <select value={requestType} onChange={(e) => setRequestType(e.target.value)} style={inputStyle}>
          {REQUEST_TYPE_SUGGESTIONS.map(s => (
            <option key={s.code} value={s.code}>{s.label}</option>
          ))}
        </select>
      </div>

      {requestType === "outro" && (
        <div>
          <label style={labelStyle}>Especifique o tipo</label>
          <input
            type="text"
            value={customType}
            onChange={(e) => setCustomType(e.target.value)}
            placeholder="Ex.: solicitar_extrato_inss"
            style={inputStyle}
          />
        </div>
      )}

      <div>
        <label style={labelStyle}>Mensagem *</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Descreva o que está pedindo. Ex.: 'Cliente João Silva CPF 123 — você tem o extrato Consignado dele?'"
          rows={5}
          style={{ ...inputStyle, resize: "vertical", minHeight: 100 } as React.CSSProperties}
          required
        />
      </div>

      <button
        type="submit"
        disabled={submitting || !toUserId || !message.trim()}
        style={{
          padding: "12px 16px", borderRadius: 8, border: "none",
          background: "linear-gradient(145deg, #eab308 0%, #facc15 100%)",
          color: "#0a0a12", fontSize: 14, fontWeight: 700,
          cursor: "pointer", opacity: submitting ? 0.6 : 1,
        }}
      >
        {submitting ? "Enviando..." : "Enviar pedido"}
      </button>
    </form>
  );
}

// ─── UI helpers ───────────────────────────────────────────────────────────────
const cardStyle = (status: InterAssistantStatus): React.CSSProperties => ({
  background: "#11111a",
  border: `1px solid ${status === "pending" ? "rgba(250, 204, 21, 0.3)" : "#25253a"}`,
  borderRadius: 12, padding: 16,
});

function Header({ label, badge, badgeColor, isExpired }: {
  label: string; badge: string; badgeColor: string; isExpired?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
      <span style={{
        fontSize: 11, color: "#7a7a92",
        letterSpacing: "0.06em", textTransform: "uppercase",
      }}>
        {label}
      </span>
      <div style={{ display: "flex", gap: 6 }}>
        {isExpired && (
          <span style={{
            padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700,
            background: "rgba(239, 68, 68, 0.15)", color: "#fca5a5", border: "1px solid rgba(239, 68, 68, 0.3)",
          }}>
            EXPIRADO
          </span>
        )}
        <span style={{
          padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
          background: `${badgeColor}26`, color: badgeColor, border: `1px solid ${badgeColor}66`,
        }}>
          {badge}
        </span>
      </div>
    </div>
  );
}

function Quote({ text, accent = "#7a7a92" }: { text: string; accent?: string }) {
  return (
    <div style={{
      fontSize: 13, color: "#c4c4d4", whiteSpace: "pre-line",
      padding: 12, background: "#16161f", borderRadius: 6,
      borderLeft: `3px solid ${accent}`,
    }}>
      {text}
    </div>
  );
}

function Meta({ items }: { items: Array<string | null> }) {
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11, color: "#7a7a92", marginTop: 10 }}>
      {items.filter(Boolean).map((it, i) => <span key={i}>{it}</span>)}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{
      padding: 32, textAlign: "center", color: "#7a7a92",
      background: "#11111a", border: "1px solid #25253a", borderRadius: 12,
    }}>
      {message}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, color: "#9898b0",
  textTransform: "uppercase", letterSpacing: "0.06em",
  marginBottom: 6, fontWeight: 600,
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 8,
  background: "#16161f", border: "1px solid #25253a",
  color: "#eeeef5", fontSize: 13, outline: "none",
  boxSizing: "border-box", fontFamily: "inherit",
};
const textareaStyle: React.CSSProperties = {
  ...inputStyle, resize: "vertical", minHeight: 80,
};
const btnBase: React.CSSProperties = {
  padding: "8px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
};
const btnPrimary: React.CSSProperties = {
  ...btnBase, border: "1px solid #eab308",
  background: "rgba(234, 179, 8, 0.15)", color: "#facc15",
};
const btnSuccess: React.CSSProperties = {
  ...btnBase, border: "1px solid #22c55e",
  background: "rgba(34, 197, 94, 0.15)", color: "#86efac",
};
const btnDanger: React.CSSProperties = {
  ...btnBase, border: "1px solid #ef4444",
  background: "rgba(239, 68, 68, 0.1)", color: "#fca5a5",
};
const btnSecondary: React.CSSProperties = {
  ...btnBase, border: "1px solid #25253a", background: "#16161f", color: "#c4c4d4",
};
