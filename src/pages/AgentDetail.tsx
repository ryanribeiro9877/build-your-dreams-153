import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAgents } from "@/hooks/useAgents";
import { useProviders, PROVIDER_LABELS, PROVIDER_HINTS } from "@/hooks/useProviders";
import { useAgentLLMConfig, SUGGESTED_BY_LEVEL } from "@/hooks/useAgentLLMConfig";
import type { ProviderCode, AgentLLMConfig } from "@/types/lexforce";
import { toast } from "sonner";
import {
  ArrowLeft, Bot, Save, Sparkles, AlertTriangle, CheckCircle2, Lock, Key,
  Cpu, FileText, Brain, Server, Trash2, Plus, Star, DollarSign,
} from "lucide-react";
import { LfPage, LfInput, LfLabel, LfGhostBtn, LfPrimaryBtn, LfHeaderBackBtn } from "@/lib/lexforceShellTheme";

/**
 * /admin/agentes/:id
 *
 * Tela completa de configuracao do agente, estilo bot.zanetti.
 * Abas: Identidade, Modelo, Prompt, Memoria, Provedor.
 *
 * Diferenciais vs versao com modal:
 *  - Tudo numa pagina dedicada, sem perder contexto
 *  - Aba "Provedor" permite cadastrar/gerenciar chave do provider AQUI
 *    sem precisar sair para /configuracoes/providers
 *  - Aba "Modelo" alerta inline se o provider escolhido nao tem chave
 *    e oferece link direto pra aba "Provedor"
 */

type TabKey = "identidade" | "modelo" | "prompt" | "memoria" | "provedor";

const TABS: Array<{ key: TabKey; label: string; icon: typeof Bot }> = [
  { key: "identidade", label: "Identidade", icon: Bot },
  { key: "modelo", label: "Modelo", icon: Cpu },
  { key: "prompt", label: "Prompt", icon: FileText },
  { key: "memoria", label: "Memória", icon: Brain },
  { key: "provedor", label: "Provedor", icon: Server },
];

const inputStyle: React.CSSProperties = { ...LfInput, fontFamily: "'DM Sans', sans-serif" };
const labelStyle: React.CSSProperties = { ...LfLabel, fontFamily: "'DM Sans', sans-serif" };
const buttonPrimary: React.CSSProperties = { ...LfPrimaryBtn, fontFamily: "'DM Sans', sans-serif" };
const buttonGhost: React.CSSProperties = { ...LfGhostBtn, fontFamily: "'DM Sans', sans-serif" };

export default function AgentDetail() {
  const navigate = useNavigate();
  const { id: agentId } = useParams<{ id: string }>();
  const { user, hasRole } = useAuth();
  const { agents, reload: reloadAgents } = useAgents();
  const { configs, models, registerKey, deleteConfig, setDefaultConfig } = useProviders();
  const { getConfig, updateConfig, clearConfig } = useAgentLLMConfig();

  const [activeTab, setActiveTab] = useState<TabKey>("identidade");
  const [editConfig, setEditConfig] = useState<AgentLLMConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const isAdmin = hasRole("admin");

  const agent = agents.find(a => a.id === agentId);
  const configuredProviders = useMemo(() => new Set(configs.map(c => c.provider)), [configs]);

  // Carregar config do agente
  useEffect(() => {
    if (!agentId) return;
    setLoadingConfig(true);
    (async () => {
      const cfg = await getConfig(agentId);
      // Sempre inicializa imediatamente com objeto (mesmo se vazio), evita
      // tela em branco esperando promise.
      setEditConfig(cfg || {
        provider: null, model: null, temperature: null, top_p: null,
        max_tokens: null, memory_enabled: null, history_limit: null,
        allow_fallbacks: null, system_prompt: null,
      });
      setLoadingConfig(false);
      setDirty(false);
    })();
  }, [agentId, getConfig]);

  const updateField = <K extends keyof AgentLLMConfig>(key: K, value: AgentLLMConfig[K]) => {
    if (!editConfig) return;
    setEditConfig({ ...editConfig, [key]: value });
    setDirty(true);
  };

  /** Troca provedor e zera modelo num único update (evita race entre dois updateField). */
  const applyProviderSelection = (newProvider: ProviderCode | null) => {
    setEditConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, provider: newProvider, model: null };
    });
    setDirty(true);
  };

  const applySuggested = (level: number) => {
    if (!editConfig) return;
    const suggested = SUGGESTED_BY_LEVEL[level];
    if (suggested) {
      setEditConfig({ ...editConfig, ...suggested } as AgentLLMConfig);
      setDirty(true);
      toast.success(`Aplicado preset N${level}. Lembre de salvar.`);
    }
  };

  const handleSave = async () => {
    if (!agentId || !editConfig) return;
    if (!editConfig.provider || !editConfig.model) {
      toast.error("Provedor e modelo sao obrigatorios na aba Modelo.");
      setActiveTab("modelo");
      return;
    }
    if (!configuredProviders.has(editConfig.provider)) {
      toast.error(`Chave do ${PROVIDER_LABELS[editConfig.provider]} nao cadastrada. Va na aba Provedor.`);
      setActiveTab("provedor");
      return;
    }
    setSaving(true);
    const result = await updateConfig(agentId, editConfig);
    setSaving(false);
    if (result.ok) {
      toast.success("Configuracao salva.");
      setDirty(false);
      await reloadAgents();
    } else {
      toast.error(result.error || "Falha ao salvar.");
    }
  };

  const handleClear = async () => {
    if (!agentId) return;
    if (!confirm("Limpar toda configuracao de IA deste agente?")) return;
    setSaving(true);
    const ok = await clearConfig(agentId);
    setSaving(false);
    if (ok) {
      toast.success("Configuracao limpa.");
      setEditConfig({
        provider: null, model: null, temperature: null, top_p: null,
        max_tokens: null, memory_enabled: null, history_limit: null,
        allow_fallbacks: null, system_prompt: null,
      });
      setDirty(false);
      await reloadAgents();
    } else {
      toast.error("Falha ao limpar.");
    }
  };

  if (!user) {
    navigate("/auth");
    return null;
  }

  if (!isAdmin) {
    return (
      <div style={{ ...LfPage, padding: 40, textAlign: "center" }}>
        <Lock size={32} style={{ color: "hsl(var(--muted-foreground))" }} />
        <h2>Acesso restrito</h2>
        <p style={{ color: "hsl(var(--muted-foreground))" }}>Apenas administradores.</p>
        <button type="button" onClick={() => navigate(-1)} style={buttonGhost}>Voltar</button>
      </div>
    );
  }

  if (!agent) {
    return (
      <div style={{ ...LfPage, padding: 40, textAlign: "center" }}>
        <Bot size={48} style={{ color: "hsl(var(--border))" }} />
        <h2>Agente nao encontrado</h2>
        <p style={{ color: "hsl(var(--muted-foreground))" }}>O agente solicitado nao existe ou foi removido.</p>
        <button type="button" onClick={() => navigate("/admin/agentes")} style={buttonGhost}>Voltar para lista</button>
      </div>
    );
  }

  const isConfigured = !!(editConfig?.provider && editConfig?.model);
  const providerHasKey = editConfig?.provider ? configuredProviders.has(editConfig.provider) : false;

  const exitAgent = () => navigate("/admin/agentes");

  return (
    <div style={LfPage}>
      {/* Header */}
      <header style={{ padding: "16px 32px", borderBottom: "1px solid hsl(var(--border))", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <button type="button" onClick={exitAgent} style={{ ...LfHeaderBackBtn, fontFamily: "'DM Sans', sans-serif" }} aria-label="Voltar">
          <ArrowLeft size={18} aria-hidden />
          {" "}
          Voltar
        </button>
        <div style={{
          width: 40, height: 40, borderRadius: "50%",
          background: agent.color || "#252534", display: "flex",
          alignItems: "center", justifyContent: "center", color: "#09090f", fontWeight: 700,
        }}>
          {agent.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 18, margin: 0 }}>{agent.name}</h1>
          <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginTop: 2 }}>
            {agent.role} · N{agent.level} · {agent.departmentName || "Sem departamento"}
            {isConfigured && editConfig?.model && (
              <span style={{ color: "#2dd4a0", marginLeft: 8 }}>
                <CheckCircle2 size={10} style={{ display: "inline", marginRight: 3 }} />
                {editConfig.model}
              </span>
            )}
          </div>
        </div>
        {dirty && (
          <span style={{
            background: "rgba(201, 168, 76, 0.12)", color: "#c9a84c",
            padding: "4px 10px", borderRadius: 12, fontSize: 11,
            textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600,
          }}>
            Alteracoes nao salvas
          </span>
        )}
        <button
          type="button"
          onClick={handleSave}
          style={{ ...buttonPrimary, opacity: saving ? 0.6 : 1 }}
          disabled={saving || !dirty}
        >
          <Save size={14} />
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </header>

      {/* Layout: sidebar de tabs + conteudo */}
      <div style={{ display: "flex", minHeight: "calc(100vh - 73px)" }}>
        {/* Sidebar de tabs */}
        <nav style={{
          width: 220, background: "hsl(var(--muted))", borderRight: "1px solid hsl(var(--border))",
          padding: "20px 0", display: "flex", flexDirection: "column", gap: 2,
        }}>
          {TABS.map(t => {
            const Icon = t.icon;
            const active = t.key === activeTab;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                style={{
                  width: "100%", textAlign: "left",
                  padding: "10px 22px",
                  background: active ? "rgba(201, 168, 76, 0.08)" : "transparent",
                  borderLeft: active ? "3px solid #c9a84c" : "3px solid transparent",
                  border: "none",
                  color: active ? "#c9a84c" : "hsl(var(--muted-foreground))",
                  fontSize: 13, fontWeight: active ? 600 : 400,
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                <Icon size={14} />
                {t.label}
              </button>
            );
          })}
          <div style={{ marginTop: "auto", padding: 20 }}>
            <button onClick={handleClear} style={{ ...buttonGhost, width: "100%", color: "#ff6b6b", fontSize: 11 }} disabled={saving}>
              <Trash2 size={11} style={{ display: "inline", marginRight: 6 }} />
              Limpar config IA
            </button>
          </div>
        </nav>

        {/* Conteudo */}
        <main style={{ flex: 1, padding: "28px 36px", maxWidth: 720 }}>
          {loadingConfig ? (
            <div style={{ color: "hsl(var(--muted-foreground))" }}>Carregando configuracao...</div>
          ) : !editConfig ? null : (
            <>
              {activeTab === "identidade" && <TabIdentidade agent={agent} />}
              {activeTab === "modelo" && (
                <TabModelo
                  editConfig={editConfig}
                  updateField={updateField}
                  applyProviderSelection={applyProviderSelection}
                  applySuggested={applySuggested}
                  agentLevel={agent.level}
                  models={models}
                  configuredProviders={configuredProviders}
                  onGoToProvider={() => setActiveTab("provedor")}
                />
              )}
              {activeTab === "prompt" && (
                <TabPrompt
                  editConfig={editConfig}
                  updateField={updateField}
                  agentName={agent.name}
                />
              )}
              {activeTab === "memoria" && (
                <TabMemoria
                  editConfig={editConfig}
                  updateField={updateField}
                />
              )}
              {activeTab === "provedor" && (
                <TabProvedor
                  configs={configs}
                  models={models}
                  registerKey={registerKey}
                  deleteConfig={deleteConfig}
                  setDefaultConfig={setDefaultConfig}
                  selectedProvider={editConfig.provider}
                  providerHasKey={providerHasKey}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

// ====================================================================
// ABAS
// ====================================================================

function TabIdentidade({ agent }: { agent: { name: string; role: string; level: number; departmentName: string; description: string | null; permissions: string[]; status: string } }) {
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <h2 style={{ fontSize: 16, margin: 0, color: "hsl(var(--foreground))" }}>Identidade</h2>
      <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", margin: 0 }}>
        Informacoes estruturais do agente. So edicao via SQL/migracao.
      </p>

      <div>
        <label style={labelStyle}>Nome</label>
        <input value={agent.name} readOnly style={{ ...inputStyle, opacity: 0.7 }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <div>
          <label style={labelStyle}>Papel (role)</label>
          <input value={agent.role} readOnly style={{ ...inputStyle, opacity: 0.7 }} />
        </div>
        <div>
          <label style={labelStyle}>Nivel</label>
          <input value={`N${agent.level}`} readOnly style={{ ...inputStyle, opacity: 0.7 }} />
        </div>
        <div>
          <label style={labelStyle}>Status</label>
          <input value={agent.status} readOnly style={{ ...inputStyle, opacity: 0.7 }} />
        </div>
      </div>
      <div>
        <label style={labelStyle}>Departamento</label>
        <input value={agent.departmentName || "—"} readOnly style={{ ...inputStyle, opacity: 0.7 }} />
      </div>
      <div>
        <label style={labelStyle}>Descricao</label>
        <textarea
          value={agent.description || ""}
          readOnly
          rows={3}
          style={{ ...inputStyle, opacity: 0.7, resize: "none" }}
        />
      </div>
      {agent.permissions.length > 0 && (
        <div>
          <label style={labelStyle}>Permissoes ({agent.permissions.length})</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {agent.permissions.map(p => (
              <span key={p} style={{
                background: "rgba(201, 168, 76, 0.08)", color: "#c9a84c",
                padding: "3px 10px", borderRadius: 12, fontSize: 11, fontFamily: "monospace",
              }}>
                {p}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TabModelo({
  editConfig, updateField, applyProviderSelection, applySuggested, agentLevel,
  models, configuredProviders, onGoToProvider,
}: {
  editConfig: AgentLLMConfig;
  updateField: <K extends keyof AgentLLMConfig>(k: K, v: AgentLLMConfig[K]) => void;
  applyProviderSelection: (provider: ProviderCode | null) => void;
  applySuggested: (lvl: number) => void;
  agentLevel: number;
  models: ReturnType<typeof useProviders>["models"];
  configuredProviders: Set<ProviderCode>;
  onGoToProvider: () => void;
}) {
  const modelsForProvider = models.filter(m => m.provider === editConfig.provider);

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontSize: 16, margin: 0, color: "hsl(var(--foreground))" }}>Modelo de IA</h2>
        <button onClick={() => applySuggested(agentLevel)} style={{ ...buttonGhost, color: "#c9a84c", borderColor: "rgba(201, 168, 76, 0.3)" }}>
          <Sparkles size={11} style={{ display: "inline", marginRight: 4 }} />
          Aplicar preset N{agentLevel}
        </button>
      </div>
      <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", margin: 0 }}>
        Provedor e modelo que este agente vai usar nas conversas.
      </p>

      <div>
        <label style={labelStyle}>Provedor</label>
        <select
          value={editConfig.provider || ""}
          onChange={e => {
            const newProvider = (e.target.value || null) as ProviderCode | null;
            if (!newProvider) {
              applyProviderSelection(null);
              return;
            }
            if (!configuredProviders.has(newProvider)) {
              toast.warning("Chave de API nao cadastrada", {
                description:
                  `Configure a chave de ${PROVIDER_LABELS[newProvider]} na aba "Provedor" desta pagina (ultima aba no menu lateral). Sem a chave, o agente nao consegue usar esse provedor.`,
                duration: 8000,
                action: {
                  label: "Abrir Provedor",
                  onClick: () => onGoToProvider(),
                },
              });
              return;
            }
            applyProviderSelection(newProvider);
          }}
          style={inputStyle}
        >
          <option value="">— Selecione —</option>
          {(Object.keys(PROVIDER_LABELS) as ProviderCode[]).map(p => (
            <option key={p} value={p}>
              {PROVIDER_LABELS[p]}{!configuredProviders.has(p) && " · sem chave"}
            </option>
          ))}
        </select>
      </div>

      {/* Alerta inline quando provider escolhido nao tem chave */}
      {editConfig.provider && !configuredProviders.has(editConfig.provider) && (
        <div style={{
          background: "rgba(255, 165, 0, 0.08)", border: "1px solid rgba(255, 165, 0, 0.3)",
          borderRadius: 8, padding: 14, display: "flex", gap: 12, alignItems: "center",
        }}>
          <AlertTriangle size={18} color="#ffa500" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: 13, color: "#ffd9a0" }}>
            Voce ainda nao cadastrou chave para <strong>{PROVIDER_LABELS[editConfig.provider]}</strong>.
            {" "}Sem chave, este agente nao vai conseguir responder.
          </div>
          <button onClick={onGoToProvider} style={{ ...buttonPrimary, padding: "8px 14px", fontSize: 12 }}>
            <Key size={12} />
            Cadastrar agora
          </button>
        </div>
      )}

      <div>
        <label style={labelStyle}>Modelo</label>
        <select
          value={editConfig.model || ""}
          onChange={e => updateField("model", e.target.value || null)}
          disabled={!editConfig.provider}
          style={{ ...inputStyle, opacity: editConfig.provider ? 1 : 0.5 }}
        >
          <option value="">— Selecione um modelo —</option>
          {modelsForProvider.map(m => (
            <option key={m.id} value={m.model_id}>
              {m.display_name} · {m.tier} · ${Number(m.input_price_per_mtok).toFixed(2)}/${Number(m.output_price_per_mtok).toFixed(2)}/MTok
            </option>
          ))}
        </select>
        {editConfig.provider && modelsForProvider.length === 0 && (
          <div style={{ fontSize: 11, color: "#ff6b6b", marginTop: 6 }}>
            Nenhum modelo no catalogo para este provedor. Pode ser bug — me avise.
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={labelStyle}>Temperatura</label>
          <input
            type="number" min={0} max={2} step={0.1}
            value={editConfig.temperature ?? ""}
            onChange={e => updateField("temperature", e.target.value === "" ? null : parseFloat(e.target.value))}
            placeholder="0.3"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Max tokens</label>
          <input
            type="number" min={1} max={100000}
            value={editConfig.max_tokens ?? ""}
            onChange={e => updateField("max_tokens", e.target.value === "" ? null : parseInt(e.target.value))}
            placeholder="1500"
            style={inputStyle}
          />
        </div>
      </div>
    </div>
  );
}

function TabPrompt({ editConfig, updateField, agentName }: {
  editConfig: AgentLLMConfig;
  updateField: <K extends keyof AgentLLMConfig>(k: K, v: AgentLLMConfig[K]) => void;
  agentName: string;
}) {
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <h2 style={{ fontSize: 16, margin: 0, color: "hsl(var(--foreground))" }}>System prompt</h2>
      <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", margin: 0 }}>
        Instrucao base que define a persona, tom e regras deste agente. Se ficar vazio,
        a edge function gera um prompt automatico baseado em nome e descricao.
      </p>

      <div>
        <label style={labelStyle}>Prompt do sistema</label>
        <textarea
          value={editConfig.system_prompt ?? ""}
          onChange={e => updateField("system_prompt", e.target.value || null)}
          placeholder={`Voce e ${agentName}.\n\nEx: "Sou especialista em direito do trabalho. Sempre cito Sumulas do TST. Tom: formal mas acessivel. Nunca prometo resultado."`}
          rows={14}
          style={{ ...inputStyle, fontFamily: "monospace", fontSize: 12, resize: "vertical", minHeight: 240 }}
        />
        <div style={{ fontSize: 11, color: "#6b6b80", marginTop: 6 }}>
          {(editConfig.system_prompt ?? "").length} caracteres
        </div>
      </div>
    </div>
  );
}

function TabMemoria({ editConfig, updateField }: {
  editConfig: AgentLLMConfig;
  updateField: <K extends keyof AgentLLMConfig>(k: K, v: AgentLLMConfig[K]) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <h2 style={{ fontSize: 16, margin: 0, color: "hsl(var(--foreground))" }}>Memória e contexto</h2>
      <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", margin: 0 }}>
        Quanto historico o agente carrega a cada turno, e se mantem memoria de longo prazo.
      </p>

      <div>
        <label style={labelStyle}>History limit (mensagens recentes)</label>
        <input
          type="number" min={1} max={50}
          value={editConfig.history_limit ?? ""}
          onChange={e => updateField("history_limit", e.target.value === "" ? null : parseInt(e.target.value))}
          placeholder="10"
          style={inputStyle}
        />
        <div style={{ fontSize: 11, color: "#6b6b80", marginTop: 4 }}>
          Quantas mensagens anteriores enviar no contexto. Maior = mais coerencia mas mais caro.
        </div>
      </div>

      <div style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, padding: 14 }}>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={!!editConfig.memory_enabled}
            onChange={e => updateField("memory_enabled", e.target.checked)}
            style={{ accentColor: "#c9a84c", width: 16, height: 16, marginTop: 2 }}
          />
          <div>
            <div style={{ fontSize: 13, color: "#c0c0d0", fontWeight: 500 }}>Memoria eterna (long-term)</div>
            <div style={{ fontSize: 11, color: "#6b6b80", marginTop: 4 }}>
              Persiste fatos relevantes entre conversas. Vai estar disponivel quando a Onda 4 (RAG/KB) for liberada.
              Hoje a flag e armazenada mas nao ativa nenhum comportamento.
            </div>
          </div>
        </label>
      </div>
    </div>
  );
}

function TabProvedor({
  configs, models, registerKey, deleteConfig, setDefaultConfig,
  selectedProvider, providerHasKey,
}: {
  configs: ReturnType<typeof useProviders>["configs"];
  models: ReturnType<typeof useProviders>["models"];
  registerKey: ReturnType<typeof useProviders>["registerKey"];
  deleteConfig: ReturnType<typeof useProviders>["deleteConfig"];
  setDefaultConfig: ReturnType<typeof useProviders>["setDefaultConfig"];
  selectedProvider: ProviderCode | null;
  providerHasKey: boolean;
}) {
  // Form inline pra cadastrar nova chave
  const [showForm, setShowForm] = useState(!providerHasKey && !!selectedProvider);
  const [formProvider, setFormProvider] = useState<ProviderCode>(selectedProvider || "anthropic");
  const [formApiKey, setFormApiKey] = useState("");
  const [formBudget, setFormBudget] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formSetDefault, setFormSetDefault] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!providerHasKey && selectedProvider) {
      setShowForm(true);
      setFormProvider(selectedProvider);
    }
  }, [providerHasKey, selectedProvider]);

  const handleRegister = async () => {
    if (formApiKey.trim().length < 16) {
      toast.error("Chave muito curta.");
      return;
    }
    setSubmitting(true);
    const budget = formBudget.trim() ? parseFloat(formBudget.replace(",", ".")) : undefined;
    const id = await registerKey(formProvider, formApiKey.trim(), {
      setDefault: formSetDefault,
      monthlyBudgetUsd: Number.isFinite(budget) ? budget : undefined,
      notes: formNotes.trim() || undefined,
    });
    setSubmitting(false);
    if (id) {
      toast.success(`Chave do ${PROVIDER_LABELS[formProvider]} cadastrada.`);
      setFormApiKey("");
      setFormBudget("");
      setFormNotes("");
      setShowForm(false);
    } else {
      toast.error("Nao foi possivel cadastrar. Verifique o formato.");
    }
  };

  const handleDelete = async (configId: string, label: string) => {
    if (!confirm(`Remover a chave do ${label}? Agentes que dependem dela vao parar de funcionar.`)) return;
    const ok = await deleteConfig(configId);
    if (ok) toast.success("Chave removida.");
  };

  const modelCount = (p: ProviderCode) => models.filter(m => m.provider === p).length;

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <h2 style={{ fontSize: 16, margin: 0, color: "hsl(var(--foreground))" }}>Provedores e chaves</h2>
      <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", margin: 0 }}>
        Suas chaves de API ficam criptografadas no Supabase Vault. Sao usadas por todos os agentes
        que escolherem este provedor.
      </p>

      {/* Alerta de seguranca */}
      <div style={{
        background: "rgba(45, 212, 160, 0.08)", border: "1px solid rgba(45, 212, 160, 0.25)",
        borderRadius: 8, padding: 12, fontSize: 12, color: "#c0d5cc",
      }}>
        <strong style={{ color: "#2dd4a0" }}>Privacidade.</strong>{" "}
        Cadastramos no Vault (criptografia AES-256). A chave nunca e exibida de volta, so os ultimos 4 caracteres.
      </div>

      {/* Lista de chaves */}
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ fontSize: 13, margin: 0, color: "#c0c0d0" }}>
            Chaves cadastradas ({configs.length})
          </h3>
          {!showForm && (
            <button onClick={() => setShowForm(true)} style={{ ...buttonPrimary, padding: "6px 12px", fontSize: 12 }}>
              <Plus size={12} />
              Adicionar chave
            </button>
          )}
        </div>

        {configs.length === 0 && !showForm ? (
          <div style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, padding: 20, textAlign: "center" }}>
            <Key size={24} color="#252534" style={{ margin: "0 auto 8px" }} />
            <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", margin: 0 }}>Nenhuma chave cadastrada ainda.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {configs.map(c => (
              <div key={c.id} style={{
                background: "hsl(var(--card))", border: c.provider === selectedProvider ? "1px solid rgba(45, 212, 160, 0.35)" : "1px solid hsl(var(--border))",
                borderRadius: 8, padding: 14,
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <strong style={{ fontSize: 13, color: "hsl(var(--foreground))" }}>{PROVIDER_LABELS[c.provider]}</strong>
                    {c.is_default && (
                      <span style={{ background: "rgba(201, 168, 76, 0.18)", color: "#c9a84c", padding: "2px 8px", borderRadius: 10, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
                        <Star size={9} style={{ display: "inline", marginRight: 3 }} />
                        Padrao
                      </span>
                    )}
                    {c.provider === selectedProvider && (
                      <span style={{ background: "rgba(45, 212, 160, 0.18)", color: "#2dd4a0", padding: "2px 8px", borderRadius: 10, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        <CheckCircle2 size={9} style={{ display: "inline", marginRight: 3 }} />
                        Usado neste agente
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
                    Chave: <span style={{ fontFamily: "monospace", color: "#c9a84c" }}>****{c.api_key_last_4 || "????"}</span>
                    {" · "}{modelCount(c.provider)} modelos
                    {c.monthly_budget_usd !== null && (
                      <>
                        {" · "}
                        <DollarSign size={10} style={{ display: "inline" }} />
                        ${Number(c.monthly_spent_usd ?? 0).toFixed(4)}/${Number(c.monthly_budget_usd).toFixed(2)}/mes
                      </>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {!c.is_default && (
                    <button onClick={() => setDefaultConfig(c.id)} title="Tornar padrao" style={{ ...buttonGhost, padding: "5px 8px" }}>
                      <Star size={12} />
                    </button>
                  )}
                  <button onClick={() => handleDelete(c.id, PROVIDER_LABELS[c.provider])} title="Remover" style={{ ...buttonGhost, padding: "5px 8px", color: "#ff6b6b", borderColor: "rgba(255, 107, 107, 0.25)" }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Form inline */}
      {showForm && (
        <section style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, padding: 18 }}>
          <h3 style={{ fontSize: 13, margin: "0 0 14px", color: "#c0c0d0" }}>Nova chave</h3>

          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <label style={labelStyle}>Provedor</label>
              <select
                value={formProvider}
                onChange={e => setFormProvider(e.target.value as ProviderCode)}
                style={inputStyle}
              >
                {(Object.keys(PROVIDER_LABELS) as ProviderCode[]).map(p => (
                  <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: "#6b6b80", marginTop: 4 }}>
                {PROVIDER_HINTS[formProvider]}
              </div>
            </div>

            <div>
              <label style={labelStyle}>Chave de API</label>
              <input
                type="password"
                value={formApiKey}
                onChange={e => setFormApiKey(e.target.value)}
                placeholder={formProvider === "anthropic" ? "sk-ant-..." : formProvider === "openrouter" ? "sk-or-v1-..." : "sk-..."}
                style={inputStyle}
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Orcamento mensal (USD)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={formBudget}
                  onChange={e => setFormBudget(e.target.value)}
                  placeholder="opcional"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>&nbsp;</label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0", fontSize: 13, color: "#c0c0d0", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={formSetDefault}
                    onChange={e => setFormSetDefault(e.target.checked)}
                    style={{ accentColor: "#c9a84c" }}
                  />
                  Usar como padrao
                </label>
              </div>
            </div>

            <div>
              <label style={labelStyle}>Anotacoes (opcional)</label>
              <input
                type="text"
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                placeholder="ex: chave de teste"
                style={inputStyle}
              />
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
              <button onClick={() => setShowForm(false)} style={buttonGhost} disabled={submitting}>
                Cancelar
              </button>
              <button onClick={handleRegister} style={buttonPrimary} disabled={submitting}>
                {submitting ? "Cadastrando..." : "Cadastrar"}
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
