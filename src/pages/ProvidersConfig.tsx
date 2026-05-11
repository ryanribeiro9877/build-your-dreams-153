import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProviders, PROVIDER_LABELS, PROVIDER_HINTS } from "@/hooks/useProviders";
import type { ProviderCode } from "@/types/lexforce";
import { toast } from "sonner";
import { ArrowLeft, Key, Plus, Trash2, Star, AlertCircle, DollarSign, ShieldCheck } from "lucide-react";

/**
 * /configuracoes/providers
 *
 * Onde o usuario cadastra suas chaves Anthropic/OpenAI/Google (BYOK).
 * Chaves vao para Supabase Vault, criptografadas. So mostramos last 4 chars.
 */
export default function ProvidersConfig() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { configs, models, loading, error, registerKey, deleteConfig, setDefaultConfig } = useProviders();

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [provider, setProvider] = useState<ProviderCode>("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [budgetUsd, setBudgetUsd] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [setAsDefault, setSetAsDefault] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  if (!user) {
    navigate("/auth");
    return null;
  }

  const handleSubmit = async () => {
    if (apiKey.trim().length < 16) {
      toast.error("Chave muito curta. Verifique se colou completa.");
      return;
    }
    setSubmitting(true);
    const budget = budgetUsd.trim() ? parseFloat(budgetUsd.replace(",", ".")) : undefined;
    const id = await registerKey(provider, apiKey.trim(), {
      setDefault: setAsDefault,
      monthlyBudgetUsd: Number.isFinite(budget) ? budget : undefined,
      notes: notes.trim() || undefined,
    });
    setSubmitting(false);
    if (id) {
      toast.success(`Chave do ${PROVIDER_LABELS[provider]} cadastrada com seguranca.`);
      setApiKey("");
      setBudgetUsd("");
      setNotes("");
      setShowForm(false);
    } else {
      toast.error("Nao foi possivel cadastrar. Verifique o formato da chave.");
    }
  };

  const handleDelete = async (configId: string, label: string) => {
    if (!confirm(`Remover a chave do ${label}? Agentes que dependem dela vao parar de funcionar.`)) return;
    const ok = await deleteConfig(configId);
    if (ok) toast.success("Chave removida.");
    else toast.error("Falha ao remover.");
  };

  const handleSetDefault = async (configId: string) => {
    const ok = await setDefaultConfig(configId);
    if (ok) toast.success("Definido como padrao.");
  };

  // Styles padrao do projeto
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 14px", borderRadius: 8,
    background: "#16161f", border: "1px solid #252534", color: "#eeeef5",
    fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 11, color: "#9898b0", marginBottom: 6,
    textTransform: "uppercase", letterSpacing: "0.08em",
  };
  const cardStyle: React.CSSProperties = {
    background: "#0d0d14", border: "1px solid #252534", borderRadius: 12, padding: 18,
  };
  const buttonPrimary: React.CSSProperties = {
    padding: "10px 18px", borderRadius: 8, border: "none",
    background: "#c9a84c", color: "#09090f", fontWeight: 600, cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif", display: "inline-flex", alignItems: "center", gap: 8,
  };
  const buttonGhost: React.CSSProperties = {
    padding: "10px 16px", borderRadius: 8, border: "1px solid #252534",
    background: "transparent", color: "#9898b0", cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
  };

  const modelCount = (p: ProviderCode) => models.filter(m => m.provider === p).length;

  return (
    <div style={{ minHeight: "100vh", background: "#09090f", color: "#eeeef5", fontFamily: "'DM Sans', sans-serif" }}>
      {/* Header */}
      <header style={{ padding: "20px 32px", borderBottom: "1px solid #252534", display: "flex", alignItems: "center", gap: 16 }}>
        <button onClick={() => navigate(-1)} style={{ ...buttonGhost, padding: 8 }}>
          <ArrowLeft size={18} />
        </button>
        <Key size={22} color="#c9a84c" />
        <div>
          <h1 style={{ fontSize: 20, margin: 0, color: "#eeeef5" }}>Provedores de IA</h1>
          <p style={{ fontSize: 12, color: "#9898b0", margin: 0 }}>
            Suas chaves de API (BYOK). Criptografadas no Supabase Vault.
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: 32 }}>
        {/* Aviso de seguranca */}
        <div style={{
          background: "rgba(45, 212, 160, 0.08)", border: "1px solid rgba(45, 212, 160, 0.25)",
          borderRadius: 8, padding: 14, marginBottom: 24, display: "flex", gap: 12,
        }}>
          <ShieldCheck size={20} color="#2dd4a0" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 13, color: "#c0d5cc" }}>
            <strong style={{ color: "#2dd4a0" }}>Sua chave fica segura.</strong>
            {" "}Cadastramos no Supabase Vault (criptografia AES-256). O LexForce nunca exibe a chave de volta,
            so os ultimos 4 caracteres. Sao usadas exclusivamente para chamar a API do provedor escolhido.
          </div>
        </div>

        {error && (
          <div style={{
            background: "rgba(255, 107, 107, 0.08)", border: "1px solid rgba(255, 107, 107, 0.3)",
            borderRadius: 8, padding: 12, marginBottom: 16, display: "flex", gap: 10, alignItems: "center",
          }}>
            <AlertCircle size={18} color="#ff6b6b" />
            <span style={{ fontSize: 13, color: "#ffb8b8" }}>{error}</span>
          </div>
        )}

        {/* Lista de configs */}
        <section style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, margin: 0, color: "#eeeef5" }}>
              Chaves cadastradas {configs.length > 0 && (
                <span style={{ color: "#9898b0", fontSize: 13, fontWeight: 400 }}>
                  ({configs.length})
                </span>
              )}
            </h2>
            {!showForm && (
              <button onClick={() => setShowForm(true)} style={buttonPrimary}>
                <Plus size={16} />
                Adicionar chave
              </button>
            )}
          </div>

          {loading ? (
            <div style={{ ...cardStyle, color: "#9898b0", fontSize: 13 }}>Carregando...</div>
          ) : configs.length === 0 && !showForm ? (
            <div style={{ ...cardStyle, textAlign: "center", padding: 40 }}>
              <Key size={32} color="#252534" style={{ margin: "0 auto 12px" }} />
              <p style={{ color: "#9898b0", fontSize: 14, margin: "0 0 8px" }}>
                Voce ainda nao cadastrou nenhuma chave.
              </p>
              <p style={{ color: "#6b6b80", fontSize: 12, margin: 0 }}>
                Sem chave nenhum agente consegue responder. Comece pela Anthropic — recomendamos Claude Sonnet 4.6.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {configs.map(c => (
                <div key={c.id} style={cardStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                        <strong style={{ color: "#eeeef5", fontSize: 15 }}>
                          {PROVIDER_LABELS[c.provider]}
                        </strong>
                        {c.is_default && (
                          <span style={{
                            background: "rgba(201, 168, 76, 0.18)", color: "#c9a84c",
                            padding: "2px 8px", borderRadius: 12, fontSize: 10,
                            textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600,
                          }}>
                            <Star size={10} style={{ display: "inline", marginRight: 4 }} />
                            Padrao
                          </span>
                        )}
                        <span style={{
                          background: c.is_active ? "rgba(45, 212, 160, 0.18)" : "rgba(155, 155, 175, 0.15)",
                          color: c.is_active ? "#2dd4a0" : "#9898b0",
                          padding: "2px 8px", borderRadius: 12, fontSize: 10,
                          textTransform: "uppercase", letterSpacing: "0.06em",
                        }}>
                          {c.is_active ? "Ativa" : "Inativa"}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: "#9898b0", marginBottom: 6 }}>
                        Chave: <span style={{ fontFamily: "monospace", color: "#c9a84c" }}>
                          ****{c.api_key_last_4 || "????"}
                        </span>
                        {" · "}
                        <span style={{ fontSize: 11 }}>
                          {modelCount(c.provider)} modelo{modelCount(c.provider) !== 1 ? "s" : ""} disponivel{modelCount(c.provider) !== 1 ? "is" : ""}
                        </span>
                      </div>
                      {c.monthly_budget_usd !== null && (
                        <div style={{ fontSize: 12, color: "#9898b0" }}>
                          <DollarSign size={11} style={{ display: "inline", marginRight: 2 }} />
                          Orcamento mensal: <strong style={{ color: "#eeeef5" }}>
                            ${Number(c.monthly_spent_usd ?? 0).toFixed(4)}
                          </strong> / ${Number(c.monthly_budget_usd).toFixed(2)}
                        </div>
                      )}
                      {c.notes && (
                        <div style={{ fontSize: 11, color: "#6b6b80", marginTop: 6, fontStyle: "italic" }}>
                          {c.notes}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {!c.is_default && (
                        <button
                          onClick={() => handleSetDefault(c.id)}
                          style={{ ...buttonGhost, padding: "6px 10px", fontSize: 12 }}
                          title="Definir como padrao"
                        >
                          <Star size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(c.id, PROVIDER_LABELS[c.provider])}
                        style={{ ...buttonGhost, padding: "6px 10px", color: "#ff6b6b", borderColor: "rgba(255, 107, 107, 0.2)" }}
                        title="Remover"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Form de cadastro */}
        {showForm && (
          <section style={{ ...cardStyle, marginBottom: 24 }}>
            <h3 style={{ fontSize: 15, margin: "0 0 16px", color: "#eeeef5" }}>Nova chave de provedor</h3>

            <div style={{ display: "grid", gap: 16 }}>
              <div>
                <label style={labelStyle}>Provedor</label>
                <select
                  value={provider}
                  onChange={e => setProvider(e.target.value as ProviderCode)}
                  style={inputStyle as React.CSSProperties}
                >
                  {(Object.keys(PROVIDER_LABELS) as ProviderCode[]).map(p => (
                    <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
                  ))}
                </select>
                <div style={{ fontSize: 11, color: "#6b6b80", marginTop: 6 }}>
                  {PROVIDER_HINTS[provider]}
                </div>
              </div>

              <div>
                <label style={labelStyle}>Chave de API</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder={provider === "anthropic" ? "sk-ant-..." : provider === "openai" ? "sk-..." : "..."}
                  style={inputStyle}
                  autoComplete="off"
                  spellCheck={false}
                />
                <div style={{ fontSize: 11, color: "#6b6b80", marginTop: 6 }}>
                  Sera enviada uma unica vez. Nao mostramos de novo.
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelStyle}>Orcamento mensal (USD)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={budgetUsd}
                    onChange={e => setBudgetUsd(e.target.value)}
                    placeholder="20.00 (opcional)"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Definir como padrao?</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0" }}>
                    <input
                      type="checkbox"
                      id="setdefault"
                      checked={setAsDefault}
                      onChange={e => setSetAsDefault(e.target.checked)}
                      style={{ width: 16, height: 16, accentColor: "#c9a84c" }}
                    />
                    <label htmlFor="setdefault" style={{ fontSize: 13, color: "#c0c0d0", cursor: "pointer" }}>
                      Usar como provider padrao
                    </label>
                  </div>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Anotacoes (opcional)</label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="ex: chave da minha conta pessoal"
                  style={inputStyle}
                />
              </div>

              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 8 }}>
                <button
                  onClick={() => { setShowForm(false); setApiKey(""); setBudgetUsd(""); setNotes(""); }}
                  style={buttonGhost}
                  disabled={submitting}
                >
                  Cancelar
                </button>
                <button onClick={handleSubmit} style={buttonPrimary} disabled={submitting}>
                  {submitting ? "Cadastrando..." : "Cadastrar chave"}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Modelos disponiveis (info) */}
        {models.length > 0 && (
          <section style={cardStyle}>
            <h3 style={{ fontSize: 14, margin: "0 0 12px", color: "#c0c0d0" }}>
              Modelos disponiveis no catalogo ({models.length})
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
              {models.map(m => (
                <div key={m.id} style={{
                  padding: 10, background: "#16161f", borderRadius: 6,
                  border: "1px solid #1f1f2c",
                }}>
                  <div style={{ fontSize: 12, color: "#eeeef5", fontWeight: 600, marginBottom: 4 }}>
                    {m.display_name}
                  </div>
                  <div style={{ fontSize: 10, color: "#9898b0", display: "flex", justifyContent: "space-between" }}>
                    <span>{m.tier}</span>
                    <span>${Number(m.input_price_per_mtok).toFixed(2)}/${Number(m.output_price_per_mtok).toFixed(2)}/MTok</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 10, color: "#6b6b80", marginTop: 10 }}>
              Precos em USD por 1 milhao de tokens (input/output). Cobranca via API do provedor.
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
