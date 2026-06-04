import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAgents } from "@/hooks/useAgents";
import { useProviders, PROVIDER_LABELS, PROVIDER_HINTS } from "@/hooks/useProviders";
import { useAgentLLMConfig, SUGGESTED_BY_LEVEL } from "@/hooks/useAgentLLMConfig";
import { validateProviderKey, type ValidationResult } from "@/lib/validateProviderKey";
import { useAgentDocuments, type AgentDocument } from "@/hooks/useAgentDocuments";
import type { ProviderCode, AgentLLMConfig } from "@/types/jurisai";
import { toast } from "sonner";
import { HexagonLoader } from "@/components/HexagonLoader";

/**
 * /admin/agentes/:id
 *
 * Página completa de configuração do agente, estilo "Meus Agentes" do bot.zanetti.
 * Abas: Identidade · Modelo · Prompt · Memória · Provedor.
 *
 * Refatorada para usar as classes utilitárias `.lf-*` definidas em
 * `src/styles/jurisai-modern.css` — mantém toda a lógica de hooks,
 * estado, queries e callbacks intactos. Só o visual foi reorganizado.
 */

type TabKey = "identidade" | "modelo" | "prompt" | "memoria" | "markdown" | "provedor" | "mcp" | "tools";

const TABS: Array<{ key: TabKey; label: string; hint: string }> = [
  { key: "identidade", label: "Identidade", hint: "Nome, papel, departamento" },
  { key: "modelo", label: "Modelo", hint: "Provedor e modelo de IA" },
  { key: "prompt", label: "Prompt", hint: "Persona e tom" },
  { key: "memoria", label: "Memória", hint: "Contexto e long-term" },
  { key: "markdown", label: "Markdown", hint: "Arquivos de referência" },
  { key: "provedor", label: "Provedor", hint: "Chaves de API" },
  { key: "tools", label: "Tools", hint: "Habilidades do agente" },
  { key: "mcp", label: "MCP", hint: "Model Context Protocol" },
];

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

  const isAdmin = hasRole("admin") || hasRole("tech");

  const agent = agents.find((a) => a.id === agentId);
  const configuredProviders = useMemo(
    () => new Set(configs.map((c) => c.provider)),
    [configs],
  );

  // Carrega config do agente
  useEffect(() => {
    if (!agentId) return;
    setLoadingConfig(true);
    (async () => {
      const cfg = await getConfig(agentId);
      setEditConfig(
        cfg || {
          provider: null,
          model: null,
          temperature: null,
          top_p: null,
          max_tokens: null,
          memory_enabled: null,
          history_limit: null,
          allow_fallbacks: null,
          system_prompt: null,
        },
      );
      setLoadingConfig(false);
      setDirty(false);
    })();
  }, [agentId, getConfig]);

  const updateField = <K extends keyof AgentLLMConfig>(key: K, value: AgentLLMConfig[K]) => {
    if (!editConfig) return;
    setEditConfig({ ...editConfig, [key]: value });
    setDirty(true);
  };

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
      toast.error("Provedor e modelo são obrigatórios na aba Modelo.");
      setActiveTab("modelo");
      return;
    }
    if (!configuredProviders.has(editConfig.provider)) {
      toast.error(
        `Chave do ${PROVIDER_LABELS[editConfig.provider]} não cadastrada. Vá na aba Provedor.`,
      );
      setActiveTab("provedor");
      return;
    }
    setSaving(true);
    const result = await updateConfig(agentId, editConfig);
    setSaving(false);
    if (result.ok) {
      toast.success("Configuração salva.");
      setDirty(false);
      await reloadAgents();
    } else {
      toast.error(result.error || "Falha ao salvar.");
    }
  };

  const handleClear = async () => {
    if (!agentId) return;
    if (!confirm("Limpar toda configuração de IA deste agente?")) return;
    setSaving(true);
    const ok = await clearConfig(agentId);
    setSaving(false);
    if (ok) {
      toast.success("Configuração limpa.");
      setEditConfig({
        provider: null,
        model: null,
        temperature: null,
        top_p: null,
        max_tokens: null,
        memory_enabled: null,
        history_limit: null,
        allow_fallbacks: null,
        system_prompt: null,
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
      <div className="lf-modern lf-page">
        <div className="lf-container" style={{ textAlign: "center", paddingTop: 64 }}>
          <div className="lf-panel" style={{ maxWidth: 420, margin: "0 auto" }}>
            <h2 style={{ margin: "0 0 6px", fontSize: 18 }}>Acesso restrito</h2>
            <p className="lf-panel__hint">Apenas administradores podem editar agentes.</p>
            <button type="button" onClick={() => navigate(-1)} className="lf-btn lf-btn--ghost">
              Voltar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="lf-modern lf-page">
        <div className="lf-container" style={{ textAlign: "center", paddingTop: 64 }}>
          <div className="lf-panel" style={{ maxWidth: 420, margin: "0 auto" }}>
            <h2 style={{ margin: "0 0 6px", fontSize: 18 }}>Agente não encontrado</h2>
            <p className="lf-panel__hint">O agente solicitado não existe ou foi removido.</p>
            <button
              type="button"
              onClick={() => navigate("/admin/agentes")}
              className="lf-btn lf-btn--ghost"
            >
              Voltar para a lista
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isConfigured = !!(editConfig?.provider && editConfig?.model);
  const providerHasKey = editConfig?.provider ? configuredProviders.has(editConfig.provider) : false;

  const initials = agent.name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // Evita warning de "supabase importado mas não usado" — preserva o import para
  // continuar disponível caso alguma query direta seja necessária no futuro.
  void supabase;

  return (
    <div className="lf-modern lf-page">
      {/* Header */}
      <header className="lf-header">
        <button
          type="button"
          onClick={() => navigate("/admin/agentes")}
          className="lf-btn lf-btn--ghost btn-voltar"
          aria-label="Voltar para a lista de agentes"
        >
          ← Voltar
        </button>

        <div
          className="lf-avatar"
          style={agent.color ? { background: agent.color } : undefined}
          aria-hidden
        >
          {initials}
        </div>

        <div style={{ flex: "1 1 200px", minWidth: 0 }}>
          <h1>{agent.name}</h1>
          <p className="lf-header__subtitle">
            {agent.role} · N{agent.level} · {agent.departmentName || "Sem departamento"}
            {isConfigured && editConfig?.model && (
              <>
                {" · "}
                <span style={{ color: "var(--lf-success)" }}>{editConfig.model}</span>
              </>
            )}
          </p>
        </div>

        {dirty && (
          <span className="lf-badge lf-badge--gold">
            <span className="lf-dot" style={{ background: "var(--lf-gold)" }} />
            Alterações não salvas
          </span>
        )}

        <button
          type="button"
          onClick={handleSave}
          className="lf-btn lf-btn--primary"
          disabled={saving || !dirty}
        >
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </header>

      <main className="lf-container lf-fade-in">
        {/* Tabs horizontais (pill) */}
        <nav className="lf-tabs" aria-label="Seções do agente">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={activeTab === t.key}
              className={`lf-tab ${activeTab === t.key ? "is-active" : ""}`}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* Conteúdo da aba ativa */}
        <section className="lf-fade-in" key={activeTab}>
          {loadingConfig ? (
            <HexagonLoader variant="inline" label="Carregando configuração..." />
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
                <TabMemoria editConfig={editConfig} updateField={updateField} />
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
              {activeTab === "markdown" && <TabMarkdown agentId={agentId!} />}
              {activeTab === "tools" && <TabTools agentId={agentId!} />}
              {activeTab === "mcp" && <TabMCP agentId={agentId!} />}
            </>
          )}
        </section>

        {/* Zona de perigo */}
        <div className="lf-panel" style={{ marginTop: 22, borderStyle: "dashed" }}>
          <h3 className="lf-panel__title">Zona de risco</h3>
          <p className="lf-panel__hint" style={{ marginBottom: 12 }}>
            Ações destrutivas sobre este agente. Use com cuidado.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className="lf-btn lf-btn--danger-ghost"
              onClick={handleClear}
              disabled={saving}
            >
              Limpar config de IA
            </button>
            <button
              type="button"
              className="lf-btn lf-btn--ghost"
              style={{ borderColor: "rgba(251,191,36,0.4)", color: "#fbbf24" }}
              disabled={saving}
              onClick={async () => {
                if (!agentId) return;
                if (!confirm("Desativar este agente?")) return;
                setSaving(true);
                const { error } = await supabase.from("agents").update({ is_active: false } as any).eq("id", agentId);
                setSaving(false);
                if (error) { toast.error(error.message); return; }
                toast.success("Agente desativado");
                reloadAgents();
                navigate("/admin/agentes");
              }}
            >
              ⏸ Desativar agente
            </button>
            <button
              type="button"
              className="lf-btn lf-btn--danger-ghost"
              disabled={saving}
              onClick={async () => {
                if (!agentId) return;
                if (!confirm(`Excluir permanentemente o agente "${agent?.name}"? Esta ação não pode ser desfeita.`)) return;
                setSaving(true);
                const { error } = await supabase.from("agents").delete().eq("id", agentId);
                setSaving(false);
                if (error) { toast.error(error.message); return; }
                toast.success("Agente excluído");
                navigate("/admin/agentes");
              }}
            >
              🗑 Excluir agente
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ==================================================================
   ABAS
   ================================================================== */

function TabIdentidade({
  agent,
}: {
  agent: {
    name: string;
    role: string;
    level: number;
    departmentName: string;
    description: string | null;
    permissions: string[];
    status: string;
  };
}) {
  return (
    <div className="lf-panel">
      <h2 className="lf-panel__title">Identidade</h2>
      <p className="lf-panel__hint">
        Informações estruturais do agente (somente leitura). Edição via SQL/migração.
      </p>

      <div className="lf-field">
        <label className="lf-field__label">Nome</label>
        <input className="lf-input" value={agent.name} readOnly style={{ opacity: 0.75 }} />
      </div>

      <div className="lf-fields-grid">
        <div className="lf-field">
          <label className="lf-field__label">Papel (role)</label>
          <input className="lf-input" value={agent.role} readOnly style={{ opacity: 0.75 }} />
        </div>
        <div className="lf-field">
          <label className="lf-field__label">Nível</label>
          <input className="lf-input" value={`N${agent.level}`} readOnly style={{ opacity: 0.75 }} />
        </div>
        <div className="lf-field">
          <label className="lf-field__label">Status</label>
          <input className="lf-input" value={agent.status} readOnly style={{ opacity: 0.75 }} />
        </div>
      </div>

      <div className="lf-field">
        <label className="lf-field__label">Departamento</label>
        <input
          className="lf-input"
          value={agent.departmentName || "—"}
          readOnly
          style={{ opacity: 0.75 }}
        />
      </div>

      <div className="lf-field">
        <label className="lf-field__label">Descrição</label>
        <textarea
          className="lf-textarea"
          value={agent.description || ""}
          readOnly
          rows={3}
          style={{ opacity: 0.75, resize: "none" }}
        />
      </div>

      {agent.permissions.length > 0 && (
        <div className="lf-field" style={{ marginBottom: 0 }}>
          <label className="lf-field__label">Permissões ({agent.permissions.length})</label>
          <div className="lf-row">
            {agent.permissions.map((p) => (
              <span key={p} className="lf-badge lf-badge--gold lf-badge--mono">
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
  editConfig,
  updateField,
  applyProviderSelection,
  applySuggested,
  agentLevel,
  models,
  configuredProviders,
  onGoToProvider,
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
  const modelsForProvider = models.filter((m) => m.provider === editConfig.provider);

  return (
    <div className="lf-panel">
      <h2 className="lf-panel__title">
        Modelo de IA
        <button
          type="button"
          className="lf-btn lf-btn--ghost"
          onClick={() => applySuggested(agentLevel)}
        >
          ✨ Preset N{agentLevel}
        </button>
      </h2>
      <p className="lf-panel__hint">
        Provedor e modelo que este agente vai usar nas conversas.
      </p>

      <div className="lf-field">
        <label className="lf-field__label">Provedor</label>
        <select
          className="lf-select"
          value={editConfig.provider || ""}
          onChange={(e) => {
            const newProvider = (e.target.value || null) as ProviderCode | null;
            if (!newProvider) {
              applyProviderSelection(null);
              return;
            }
            if (!configuredProviders.has(newProvider)) {
              toast.warning("Chave de API não cadastrada", {
                description:
                  `Configure a chave de ${PROVIDER_LABELS[newProvider]} na aba "Provedor" desta página. Sem a chave, o agente não consegue usar esse provedor.`,
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
        >
          <option value="">— Selecione —</option>
          {(Object.keys(PROVIDER_LABELS) as ProviderCode[]).map((p) => (
            <option key={p} value={p}>
              {PROVIDER_LABELS[p]}
              {!configuredProviders.has(p) && " · sem chave"}
            </option>
          ))}
        </select>
      </div>

      {/* Alerta inline quando provider escolhido não tem chave */}
      {editConfig.provider && !configuredProviders.has(editConfig.provider) && (
        <div
          className="lf-panel lf-panel--ghost"
          style={{
            border: "1px solid rgba(245, 179, 66, 0.35)",
            background: "rgba(245, 179, 66, 0.08)",
            padding: 14,
            margin: "0 0 14px",
            display: "flex",
            gap: 12,
            alignItems: "center",
          }}
        >
          <span className="lf-dot lf-dot--warn" />
          <div style={{ flex: 1, fontSize: 13 }}>
            Você ainda não cadastrou chave para{" "}
            <strong>{PROVIDER_LABELS[editConfig.provider]}</strong>. Sem chave, este agente
            não vai conseguir responder.
          </div>
          <button type="button" className="lf-btn lf-btn--primary" onClick={onGoToProvider}>
            Cadastrar agora
          </button>
        </div>
      )}

      <div className="lf-field">
        <label className="lf-field__label">Modelo</label>
        <select
          className="lf-select"
          value={editConfig.model || ""}
          onChange={(e) => updateField("model", e.target.value || null)}
          disabled={!editConfig.provider}
          style={{ opacity: editConfig.provider ? 1 : 0.55 }}
        >
          <option value="">— Selecione um modelo —</option>
          {modelsForProvider.map((m) => (
            <option key={m.id} value={m.model_id}>
              {m.display_name} · {m.tier} · ${Number(m.input_price_per_mtok).toFixed(2)}/$
              {Number(m.output_price_per_mtok).toFixed(2)}/MTok
            </option>
          ))}
        </select>
        {editConfig.provider && modelsForProvider.length === 0 && (
          <span className="lf-field__hint" style={{ color: "var(--lf-danger)" }}>
            Nenhum modelo no catálogo para este provedor.
          </span>
        )}
      </div>

      <div className="lf-fields-grid">
        <div className="lf-field" style={{ marginBottom: 0 }}>
          <label className="lf-field__label">Temperatura</label>
          <input
            className="lf-input"
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={editConfig.temperature ?? ""}
            onChange={(e) =>
              updateField("temperature", e.target.value === "" ? null : parseFloat(e.target.value))
            }
            placeholder="0.3"
          />
          <span className="lf-field__hint">0 = determinístico · 1 = balanceado · 2 = criativo</span>
        </div>
        <div className="lf-field" style={{ marginBottom: 0 }}>
          <label className="lf-field__label">Max tokens</label>
          <input
            className="lf-input"
            type="number"
            min={1}
            max={100000}
            value={editConfig.max_tokens ?? ""}
            onChange={(e) =>
              updateField("max_tokens", e.target.value === "" ? null : parseInt(e.target.value))
            }
            placeholder="1500"
          />
          <span className="lf-field__hint">Limite da resposta — afeta custo e latência.</span>
        </div>
      </div>
    </div>
  );
}

function TabPrompt({
  editConfig,
  updateField,
  agentName,
}: {
  editConfig: AgentLLMConfig;
  updateField: <K extends keyof AgentLLMConfig>(k: K, v: AgentLLMConfig[K]) => void;
  agentName: string;
}) {
  const charCount = (editConfig.system_prompt ?? "").length;
  return (
    <div className="lf-panel">
      <h2 className="lf-panel__title">
        System prompt
        <span className="lf-badge lf-badge--neutral lf-badge--mono">{charCount} caracteres</span>
      </h2>
      <p className="lf-panel__hint">
        Instrução base que define a persona, tom e regras deste agente. Se ficar vazio, a edge
        function gera um prompt automático baseado em nome e descrição.
      </p>

      <div className="lf-field" style={{ marginBottom: 0 }}>
        <label className="lf-field__label">Prompt do sistema</label>
        <textarea
          className="lf-textarea lf-mono"
          value={editConfig.system_prompt ?? ""}
          onChange={(e) => updateField("system_prompt", e.target.value || null)}
          placeholder={`Você é ${agentName}.\n\nEx: "Sou especialista em direito do trabalho. Sempre cito Súmulas do TST. Tom: formal mas acessível. Nunca prometo resultado."`}
          rows={14}
          style={{ minHeight: 280, fontSize: 12 }}
        />
      </div>
    </div>
  );
}

function TabMemoria({
  editConfig,
  updateField,
}: {
  editConfig: AgentLLMConfig;
  updateField: <K extends keyof AgentLLMConfig>(k: K, v: AgentLLMConfig[K]) => void;
}) {
  return (
    <div className="lf-panel">
      <h2 className="lf-panel__title">Memória e contexto</h2>
      <p className="lf-panel__hint">
        Quanto histórico o agente carrega a cada turno, e se mantém memória de longo prazo.
      </p>

      <div className="lf-field">
        <label className="lf-field__label">History limit (mensagens recentes)</label>
        <input
          className="lf-input"
          type="number"
          min={1}
          max={50}
          value={editConfig.history_limit ?? ""}
          onChange={(e) =>
            updateField("history_limit", e.target.value === "" ? null : parseInt(e.target.value))
          }
          placeholder="10"
        />
        <span className="lf-field__hint">
          Quantas mensagens anteriores enviar no contexto. Maior = mais coerência mas mais caro.
        </span>
      </div>

      <div
        className="lf-panel lf-panel--ghost"
        style={{
          border: "1px solid hsl(var(--border))",
          padding: 14,
          margin: 0,
        }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            cursor: "pointer",
            margin: 0,
          }}
        >
          <input
            type="checkbox"
            checked={!!editConfig.memory_enabled}
            onChange={(e) => updateField("memory_enabled", e.target.checked)}
            style={{ accentColor: "var(--lf-gold)", width: 16, height: 16, marginTop: 2 }}
          />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Memória eterna (long-term)</div>
            <div className="lf-field__hint" style={{ marginTop: 4 }}>
              Persiste fatos relevantes entre conversas. Disponível quando a Onda 4 (RAG/KB) for
              liberada. Hoje a flag é armazenada mas não ativa nenhum comportamento.
            </div>
          </div>
        </label>
      </div>
    </div>
  );
}

function TabProvedor({
  configs,
  models,
  registerKey,
  deleteConfig,
  setDefaultConfig,
  selectedProvider,
  providerHasKey,
}: {
  configs: ReturnType<typeof useProviders>["configs"];
  models: ReturnType<typeof useProviders>["models"];
  registerKey: ReturnType<typeof useProviders>["registerKey"];
  deleteConfig: ReturnType<typeof useProviders>["deleteConfig"];
  setDefaultConfig: ReturnType<typeof useProviders>["setDefaultConfig"];
  selectedProvider: ProviderCode | null;
  providerHasKey: boolean;
}) {
  const [showForm, setShowForm] = useState(!providerHasKey && !!selectedProvider);
  const [formProvider, setFormProvider] = useState<ProviderCode>(selectedProvider || "anthropic");
  const [formApiKey, setFormApiKey] = useState("");
  const [formBudget, setFormBudget] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formSetDefault, setFormSetDefault] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Validação em tempo real da chave do provedor.
  const [validationStatus, setValidationStatus] = useState<
    "idle" | "checking" | "valid" | "invalid" | "unknown"
  >("idle");
  const [validationDetail, setValidationDetail] = useState<string>("");

  useEffect(() => {
    setValidationStatus("idle");
    setValidationDetail("");
    const trimmed = formApiKey.trim();
    if (trimmed.length < 20) return;
    setValidationStatus("checking");
    const t = setTimeout(async () => {
      const result: ValidationResult = await validateProviderKey(formProvider, trimmed);
      if (result.ok === true) setValidationStatus("valid");
      else if (result.ok === false) setValidationStatus("invalid");
      else setValidationStatus("unknown");
      setValidationDetail(result.detail);
    }, 700);
    return () => clearTimeout(t);
  }, [formApiKey, formProvider]);

  useEffect(() => {
    if (!providerHasKey && selectedProvider) {
      setShowForm(true);
      setFormProvider(selectedProvider);
    }
  }, [providerHasKey, selectedProvider]);

  const handleRegister = async () => {
    if (formApiKey.trim().length < 20) {
      toast.error("Chave muito curta.");
      return;
    }
    if (validationStatus === "invalid") {
      toast.error("Chave inválida — corrija antes de cadastrar.");
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
      toast.error("Não foi possível cadastrar. Verifique o formato.");
    }
  };

  const handleDelete = async (configId: string, label: string) => {
    if (!confirm(`Remover a chave do ${label}? Agentes que dependem dela vão parar de funcionar.`))
      return;
    const ok = await deleteConfig(configId);
    if (ok) toast.success("Chave removida.");
  };

  const modelCount = (p: ProviderCode) => models.filter((m) => m.provider === p).length;

  return (
    <div className="lf-panel">
      <h2 className="lf-panel__title">Provedores e chaves</h2>
      <p className="lf-panel__hint">
        Suas chaves de API ficam criptografadas no Supabase Vault. São usadas por todos os agentes
        que escolherem este provedor.
      </p>

      {/* Aviso de privacidade */}
      <div
        className="lf-panel lf-panel--ghost"
        style={{
          background: "rgba(45, 212, 160, 0.06)",
          border: "1px solid rgba(45, 212, 160, 0.25)",
          padding: 12,
          margin: "0 0 14px",
          fontSize: 12,
        }}
      >
        <strong style={{ color: "var(--lf-success)" }}>Privacidade.</strong>{" "}
        Cadastramos no Vault (criptografia AES-256). A chave nunca é exibida de volta, só os últimos
        4 caracteres.
      </div>

      {/* Lista de chaves */}
      <section>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <h3 style={{ fontSize: 13, margin: 0, fontWeight: 600 }}>
            Chaves cadastradas ({configs.length})
          </h3>
          {!showForm && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="lf-btn lf-btn--primary"
              style={{ padding: "7px 14px" }}
            >
              + Adicionar chave
            </button>
          )}
        </div>

        {configs.length === 0 && !showForm ? (
          <div className="lf-empty">Nenhuma chave cadastrada ainda.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {configs.map((c) => (
              <div
                key={c.id}
                className="lf-panel lf-panel--ghost"
                style={{
                  border:
                    c.provider === selectedProvider
                      ? "1px solid rgba(45, 212, 160, 0.4)"
                      : "1px solid hsl(var(--border))",
                  background: "hsl(var(--card))",
                  padding: 14,
                  margin: 0,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="lf-row" style={{ gap: 8, marginBottom: 4 }}>
                    <strong style={{ fontSize: 13 }}>{PROVIDER_LABELS[c.provider]}</strong>
                    {c.is_default && (
                      <span className="lf-badge lf-badge--gold">★ Padrão</span>
                    )}
                    {c.provider === selectedProvider && (
                      <span className="lf-badge lf-badge--success">Usado neste agente</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
                    Chave:{" "}
                    <span className="lf-mono" style={{ color: "var(--lf-gold)" }}>
                      ****{c.api_key_last_4 || "????"}
                    </span>{" "}
                    · {modelCount(c.provider)} modelos
                    {c.monthly_budget_usd !== null && (
                      <>
                        {" · "}${Number(c.monthly_spent_usd ?? 0).toFixed(4)}/$
                        {Number(c.monthly_budget_usd).toFixed(2)}/mês
                      </>
                    )}
                  </div>
                </div>
                <div className="lf-row" style={{ gap: 6 }}>
                  {!c.is_default && (
                    <button
                      type="button"
                      onClick={() => setDefaultConfig(c.id)}
                      title="Tornar padrão"
                      className="lf-btn lf-btn--ghost"
                      style={{ padding: "6px 12px", fontSize: 12 }}
                    >
                      ★ Padrão
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(c.id, PROVIDER_LABELS[c.provider])}
                    title="Remover"
                    className="lf-btn lf-btn--danger-ghost"
                    style={{ padding: "6px 12px", fontSize: 12 }}
                  >
                    Remover
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Form inline */}
      {showForm && (
        <section
          className="lf-panel lf-panel--ghost lf-fade-in"
          style={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            padding: 18,
            marginTop: 16,
          }}
        >
          <h3 style={{ fontSize: 13, margin: "0 0 14px", fontWeight: 600 }}>Nova chave</h3>

          <div className="lf-field">
            <label className="lf-field__label">Provedor</label>
            <select
              className="lf-select"
              value={formProvider}
              onChange={(e) => setFormProvider(e.target.value as ProviderCode)}
            >
              {(Object.keys(PROVIDER_LABELS) as ProviderCode[]).map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABELS[p]}
                </option>
              ))}
            </select>
            <span className="lf-field__hint">{PROVIDER_HINTS[formProvider]}</span>
          </div>

          <div className="lf-field">
            <label className="lf-field__label">
              Chave de API
              {validationStatus === "checking" && (
                <span style={{ marginLeft: 8, fontSize: 10, color: "hsl(var(--muted-foreground))", fontWeight: 500 }}>
                  · validando...
                </span>
              )}
              {validationStatus === "valid" && (
                <span style={{ marginLeft: 8, fontSize: 10, color: "var(--lf-success)", fontWeight: 600 }}>
                  · válida ✓
                </span>
              )}
              {validationStatus === "invalid" && (
                <span style={{ marginLeft: 8, fontSize: 10, color: "var(--lf-danger)", fontWeight: 600 }}>
                  · inválida ✗
                </span>
              )}
              {validationStatus === "unknown" && (
                <span style={{ marginLeft: 8, fontSize: 10, color: "var(--lf-warn)", fontWeight: 600 }}>
                  · não confirmável
                </span>
              )}
            </label>
            <input
              className="lf-input"
              type="password"
              value={formApiKey}
              onChange={(e) => setFormApiKey(e.target.value)}
              placeholder={
                formProvider === "anthropic"
                  ? "sk-ant-..."
                  : formProvider === "openrouter"
                    ? "sk-or-v1-..."
                    : "sk-..."
              }
              autoComplete="off"
              spellCheck={false}
              style={{
                background:
                  validationStatus === "valid"
                    ? "rgba(45, 212, 160, 0.10)"
                    : validationStatus === "invalid"
                      ? "rgba(255, 107, 107, 0.10)"
                      : validationStatus === "checking"
                        ? "rgba(234, 179, 8, 0.06)"
                        : undefined,
                borderColor:
                  validationStatus === "valid"
                    ? "rgba(45, 212, 160, 0.55)"
                    : validationStatus === "invalid"
                      ? "rgba(255, 107, 107, 0.55)"
                      : validationStatus === "checking"
                        ? "rgba(234, 179, 8, 0.45)"
                        : undefined,
                boxShadow:
                  validationStatus === "valid"
                    ? "0 0 0 3px rgba(45, 212, 160, 0.12)"
                    : validationStatus === "invalid"
                      ? "0 0 0 3px rgba(255, 107, 107, 0.15)"
                      : undefined,
                transition: "background 200ms ease, border-color 200ms ease, box-shadow 200ms ease",
              }}
            />
            {(validationStatus === "invalid" || validationStatus === "unknown") && validationDetail && (
              <span
                className="lf-field__hint"
                style={{
                  color:
                    validationStatus === "invalid"
                      ? "var(--lf-danger)"
                      : "var(--lf-warn)",
                  fontWeight: 500,
                  marginTop: 6,
                }}
              >
                {validationDetail}
              </span>
            )}
          </div>

          <div className="lf-fields-grid">
            <div className="lf-field">
              <label className="lf-field__label">Orçamento mensal (USD)</label>
              <input
                className="lf-input"
                type="text"
                inputMode="decimal"
                value={formBudget}
                onChange={(e) => setFormBudget(e.target.value)}
                placeholder="opcional"
              />
            </div>
            <div className="lf-field">
              <label className="lf-field__label">&nbsp;</label>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 0",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={formSetDefault}
                  onChange={(e) => setFormSetDefault(e.target.checked)}
                  style={{ accentColor: "var(--lf-gold)" }}
                />
                Usar como padrão
              </label>
            </div>
          </div>

          <div className="lf-field">
            <label className="lf-field__label">Anotações (opcional)</label>
            <input
              className="lf-input"
              type="text"
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              placeholder="ex: chave de teste"
            />
          </div>

          <div
            className="lf-row"
            style={{ justifyContent: "flex-end", marginTop: 6, gap: 8 }}
          >
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="lf-btn lf-btn--ghost"
              disabled={submitting}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleRegister}
              className="lf-btn lf-btn--primary"
              disabled={submitting || validationStatus === "invalid" || validationStatus === "checking"}
              title={
                validationStatus === "invalid"
                  ? "Corrija a chave antes de cadastrar"
                  : validationStatus === "checking"
                    ? "Aguarde a validação terminar"
                    : "Cadastrar chave"
              }
            >
              {submitting
                ? "Cadastrando..."
                : validationStatus === "checking"
                  ? "Validando..."
                  : "Cadastrar"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

/* ==================================================================
   TAB MARKDOWN — Arquivos de referência na memória do agente
   ================================================================== */

function TabMarkdown({ agentId }: { agentId: string }) {
  const { documents, loading, upload, remove, toggleActive, updateDescription, getDownloadUrl } =
    useAgentDocuments(agentId);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [editingDesc, setEditingDesc] = useState<string | null>(null);
  const [descDraft, setDescDraft] = useState("");

  const handleFiles = async (files: FileList | File[]) => {
    setUploading(true);
    for (const file of Array.from(files)) {
      const ok = await upload(file);
      if (ok) toast.success(`${file.name} enviado`);
    }
    setUploading(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files);
    e.target.value = "";
  };

  const handleDownload = async (doc: AgentDocument) => {
    const url = await getDownloadUrl(doc.storage_path);
    if (url) window.open(url, "_blank");
  };

  const handleRemove = async (doc: AgentDocument) => {
    if (!confirm(`Remover "${doc.file_name}" permanentemente?`)) return;
    const ok = await remove(doc);
    if (ok) toast.success("Documento removido");
  };

  const startEditDesc = (doc: AgentDocument) => {
    setEditingDesc(doc.id);
    setDescDraft(doc.description || "");
  };

  const saveDesc = async (docId: string) => {
    await updateDescription(docId, descDraft);
    setEditingDesc(null);
    toast.success("Descricao atualizada");
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const extIcon = (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase() || "";
    if (ext === "pdf") return "\u{1F4C4}";
    if (ext === "docx") return "\u{1F4DD}";
    if (ext === "md" || ext === "markdown") return "\u{1F4D1}";
    return "\u{1F4C3}";
  };

  if (loading) return <HexagonLoader variant="inline" label="Carregando documentos..." />;

  return (
    <div>
      {/* Upload zone */}
      <div className="lf-panel">
        <h2 className="lf-panel__title">
          Arquivos de Referencia
          <span className="lf-badge lf-badge--neutral lf-badge--mono">
            {documents.length} arquivo{documents.length !== 1 ? "s" : ""}
          </span>
        </h2>
        <p className="lf-panel__hint">
          Envie arquivos de texto (.txt, .md, .pdf, .docx) que servem como base de conhecimento
          para este agente. O conteudo sera injetado no contexto das conversas, permitindo que o
          agente siga modelos, templates e instrucoes especificas.
        </p>

        {/* Dica de uso */}
        <div
          className="lf-panel lf-panel--ghost"
          style={{
            background: "rgba(92, 194, 255, 0.06)",
            border: "1px solid rgba(92, 194, 255, 0.25)",
            padding: 12,
            margin: "0 0 14px",
            fontSize: 12,
          }}
        >
          <strong style={{ color: "var(--lf-info, #5cc2ff)" }}>Como usar.</strong>{" "}
          Faca upload de modelos de pecas, templates de documentos ou instrucoes detalhadas.
          Na aba <strong>Prompt</strong>, instrua o agente a seguir o conteudo dos documentos
          carregados. Ex: <em>"Crie a peca inicial seguindo o modelo fornecido nos documentos
          de referencia."</em>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          style={{
            border: `2px dashed ${dragOver ? "var(--lf-gold)" : "hsl(var(--border))"}`,
            borderRadius: 10,
            padding: "28px 20px",
            textAlign: "center",
            background: dragOver ? "rgba(201, 168, 76, 0.08)" : "transparent",
            transition: "all 200ms ease",
            cursor: "pointer",
            marginBottom: 16,
          }}
          onClick={() => document.getElementById("md-file-input")?.click()}
        >
          <div style={{ fontSize: 28, marginBottom: 6, opacity: 0.6 }}>
            {uploading ? "⏳" : "\u{1F4E4}"}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            {uploading ? "Enviando..." : "Arraste arquivos aqui ou clique para selecionar"}
          </div>
          <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
            .txt, .md, .markdown, .pdf, .docx — ate 10 MB por arquivo
          </div>
          <input
            id="md-file-input"
            type="file"
            multiple
            accept=".txt,.md,.markdown,.pdf,.docx"
            onChange={handleFileInput}
            style={{ display: "none" }}
          />
        </div>
      </div>

      {/* Lista de documentos */}
      {documents.length > 0 && (
        <div className="lf-panel" style={{ marginTop: 16 }}>
          <h3 className="lf-panel__title">
            Documentos Carregados
          </h3>
          <p className="lf-panel__hint" style={{ marginBottom: 16 }}>
            Documentos ativos sao incluidos no contexto do agente durante as conversas.
            Desative um documento para mante-lo salvo sem injeta-lo no contexto.
          </p>

          <div style={{ display: "grid", gap: 10 }}>
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="lf-panel lf-panel--ghost"
                style={{
                  border: doc.is_active
                    ? "1px solid rgba(45, 212, 160, 0.4)"
                    : "1px solid hsl(var(--border))",
                  background: "hsl(var(--card))",
                  padding: 14,
                  margin: 0,
                  opacity: doc.is_active ? 1 : 0.6,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="lf-row" style={{ gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 18 }}>{extIcon(doc.file_name)}</span>
                      <strong style={{ fontSize: 13, wordBreak: "break-word" }}>
                        {doc.file_name}
                      </strong>
                      {doc.is_active ? (
                        <span className="lf-badge lf-badge--success">Ativo</span>
                      ) : (
                        <span
                          className="lf-badge"
                          style={{ background: "rgba(156,163,175,0.15)", color: "#9ca3af" }}
                        >
                          Inativo
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "hsl(var(--muted-foreground))",
                        display: "flex",
                        gap: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      <span>{formatSize(doc.file_size)}</span>
                      <span>{doc.mime_type || "—"}</span>
                      <span>{new Date(doc.created_at).toLocaleDateString("pt-BR")}</span>
                    </div>

                    {/* Descricao */}
                    {editingDesc === doc.id ? (
                      <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center" }}>
                        <input
                          className="lf-input"
                          style={{ fontSize: 12, padding: "5px 10px", flex: 1 }}
                          value={descDraft}
                          onChange={(e) => setDescDraft(e.target.value)}
                          placeholder="Descricao do documento..."
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveDesc(doc.id);
                            if (e.key === "Escape") setEditingDesc(null);
                          }}
                        />
                        <button
                          type="button"
                          className="lf-btn lf-btn--primary"
                          style={{ fontSize: 11, padding: "4px 10px" }}
                          onClick={() => saveDesc(doc.id)}
                        >
                          Salvar
                        </button>
                        <button
                          type="button"
                          className="lf-btn lf-btn--ghost"
                          style={{ fontSize: 11, padding: "4px 10px" }}
                          onClick={() => setEditingDesc(null)}
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 11,
                          color: doc.description
                            ? "hsl(var(--foreground))"
                            : "hsl(var(--muted-foreground))",
                          cursor: "pointer",
                          fontStyle: doc.description ? "normal" : "italic",
                        }}
                        onClick={() => startEditDesc(doc)}
                        title="Clique para editar a descricao"
                      >
                        {doc.description || "Clique para adicionar uma descricao..."}
                      </div>
                    )}
                  </div>

                  <div className="lf-row" style={{ gap: 6, flexShrink: 0 }}>
                    <button
                      type="button"
                      className="lf-btn lf-btn--ghost"
                      style={{ padding: "6px 10px", fontSize: 11 }}
                      onClick={() => handleDownload(doc)}
                      title="Baixar arquivo"
                    >
                      Baixar
                    </button>
                    <button
                      type="button"
                      className="lf-btn lf-btn--ghost"
                      style={{ padding: "6px 10px", fontSize: 11 }}
                      onClick={() => toggleActive(doc)}
                    >
                      {doc.is_active ? "Desativar" : "Ativar"}
                    </button>
                    <button
                      type="button"
                      className="lf-btn lf-btn--danger-ghost"
                      style={{ padding: "6px 10px", fontSize: 11 }}
                      onClick={() => handleRemove(doc)}
                    >
                      Remover
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ==================================================================
   TAB TOOLS — Habilidades do agente
   ================================================================== */

type ToolCatalogEntry = {
  id: string;
  code: string;
  display_name: string;
  description: string;
  category: string;
  icon: string;
  tool_schema: Record<string, unknown>;
  allowed_roles: string[] | null;
  is_active: boolean;
};

type AgentToolLink = {
  id: string;
  agent_id: string;
  tool_id: string;
  enabled: boolean;
  config: Record<string, unknown>;
};

function TabTools({ agentId }: { agentId: string }) {
  const [catalog, setCatalog] = useState<ToolCatalogEntry[]>([]);
  const [links, setLinks] = useState<AgentToolLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTool, setExpandedTool] = useState<string | null>(null);

  const loadData = async () => {
    const [catalogRes, linksRes] = await Promise.all([
      supabase.from("tool_catalog" as any).select("*").eq("is_active", true).order("sort_order"),
      supabase.from("agent_tools" as any).select("*").eq("agent_id", agentId),
    ]);
    setCatalog((catalogRes.data as any) || []);
    setLinks(((linksRes.data as any) || []).map((r: any) => ({
      ...r, config: r.config && typeof r.config === "object" ? r.config : {},
    })));
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [agentId]);

  const linkedToolIds = new Set(links.map((l) => l.tool_id));

  const handleEnable = async (tool: ToolCatalogEntry) => {
    const { data, error } = await supabase
      .from("agent_tools" as any)
      .insert({ agent_id: agentId, tool_id: tool.id, enabled: true, config: {} } as any)
      .select()
      .single();
    if (error) {
      toast.error("Erro ao habilitar: " + error.message);
      return;
    }
    const row = data as any;
    setLinks((prev) => [...prev, { ...row, config: row.config || {} }]);
    toast.success(`${tool.display_name} habilitada`);
  };

  const handleToggle = async (linkId: string, current: boolean) => {
    const { error } = await supabase
      .from("agent_tools" as any)
      .update({ enabled: !current } as any)
      .eq("id", linkId);
    if (error) {
      toast.error(error.message);
      return;
    }
    setLinks((prev) =>
      prev.map((l) => (l.id === linkId ? { ...l, enabled: !current } : l)),
    );
  };

  const handleRemove = async (linkId: string) => {
    if (!confirm("Remover esta tool do agente?")) return;
    const { error } = await supabase
      .from("agent_tools" as any)
      .delete()
      .eq("id", linkId);
    if (error) {
      toast.error(error.message);
      return;
    }
    setLinks((prev) => prev.filter((l) => l.id !== linkId));
    toast.success("Tool removida");
  };

  if (loading) return <HexagonLoader variant="inline" label="Carregando tools..." />;

  return (
    <div>
      {/* Tools habilitadas */}
      <div className="lf-panel">
        <h3 className="lf-panel__title">Tools Habilitadas</h3>
        <p className="lf-panel__hint" style={{ marginBottom: 16 }}>
          Tools ativas neste agente. Quando habilitada, a tool é injetada como function call
          no contexto do chat-orchestrator — o agente pode invocá-la durante a conversa.
        </p>

        {links.length === 0 ? (
          <p
            style={{
              fontSize: 12,
              color: "hsl(var(--muted-foreground))",
              textAlign: "center",
              padding: 16,
            }}
          >
            Nenhuma tool habilitada. Adicione do catálogo abaixo.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {links.map((link) => {
              const tool = catalog.find((c) => c.id === link.tool_id);
              if (!tool) return null;
              const isExpanded = expandedTool === link.id;

              return (
                <div
                  key={link.id}
                  className="lf-panel lf-panel--ghost"
                  style={{
                    border: link.enabled
                      ? "1px solid rgba(45, 212, 160, 0.4)"
                      : "1px solid hsl(var(--border))",
                    background: "hsl(var(--card))",
                    padding: 14,
                    margin: 0,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="lf-row" style={{ gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 18 }}>{tool.icon}</span>
                        <strong style={{ fontSize: 13 }}>{tool.display_name}</strong>
                        <span className="lf-badge lf-badge--neutral lf-badge--mono">
                          {tool.code}
                        </span>
                        {link.enabled ? (
                          <span className="lf-badge lf-badge--success">Ativa</span>
                        ) : (
                          <span className="lf-badge" style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>
                            Desativada
                          </span>
                        )}
                      </div>
                      <p
                        style={{
                          fontSize: 11,
                          color: "hsl(var(--muted-foreground))",
                          margin: 0,
                          lineHeight: 1.5,
                        }}
                      >
                        {tool.description}
                      </p>
                    </div>
                    <div className="lf-row" style={{ gap: 6 }}>
                      <button
                        type="button"
                        className="lf-btn lf-btn--ghost"
                        style={{ padding: "6px 12px", fontSize: 11 }}
                        onClick={() => setExpandedTool(isExpanded ? null : link.id)}
                      >
                        {isExpanded ? "▲ Fechar" : "▼ Schema"}
                      </button>
                      <button
                        type="button"
                        className="lf-btn lf-btn--ghost"
                        style={{ padding: "6px 12px", fontSize: 11 }}
                        onClick={() => handleToggle(link.id, link.enabled)}
                      >
                        {link.enabled ? "⏸ Desativar" : "✓ Ativar"}
                      </button>
                      <button
                        type="button"
                        className="lf-btn lf-btn--danger-ghost"
                        style={{ padding: "6px 12px", fontSize: 11 }}
                        onClick={() => handleRemove(link.id)}
                      >
                        Remover
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ marginTop: 12 }}>
                      <label
                        className="lf-field__label"
                        style={{ fontSize: 11, marginBottom: 6 }}
                      >
                        Function Schema (OpenAI format)
                      </label>
                      <pre
                        className="lf-mono"
                        style={{
                          fontSize: 11,
                          background: "hsl(var(--background))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 6,
                          padding: 12,
                          overflow: "auto",
                          maxHeight: 300,
                          whiteSpace: "pre-wrap",
                          margin: 0,
                        }}
                      >
                        {JSON.stringify(tool.tool_schema, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Catálogo de tools disponíveis */}
      {catalog.filter((c) => !linkedToolIds.has(c.id)).length > 0 && (
        <div className="lf-panel" style={{ marginTop: 16 }}>
          <h3 className="lf-panel__title">Catálogo de Tools</h3>
          <p className="lf-panel__hint" style={{ marginBottom: 16 }}>
            Tools nativas disponíveis para habilitar neste agente.
          </p>

          <div style={{ display: "grid", gap: 10 }}>
            {catalog
              .filter((c) => !linkedToolIds.has(c.id))
              .map((tool) => (
                <div
                  key={tool.id}
                  className="lf-panel lf-panel--ghost"
                  style={{
                    border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--card))",
                    padding: 14,
                    margin: 0,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="lf-row" style={{ gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 18 }}>{tool.icon}</span>
                      <strong style={{ fontSize: 13 }}>{tool.display_name}</strong>
                      <span className="lf-badge lf-badge--neutral lf-badge--mono">
                        {tool.category}
                      </span>
                    </div>
                    <p
                      style={{
                        fontSize: 11,
                        color: "hsl(var(--muted-foreground))",
                        margin: 0,
                        lineHeight: 1.5,
                      }}
                    >
                      {tool.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="lf-btn lf-btn--primary"
                    style={{ padding: "7px 14px", fontSize: 12, whiteSpace: "nowrap" }}
                    onClick={() => handleEnable(tool)}
                  >
                    + Habilitar
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ==================================================================
   TAB MCP — Model Context Protocol
   ================================================================== */

type McpRequiredCredential = {
  key: string; label: string; hint: string; required: boolean;
};

type McpCatalogEntry = {
  id: string; name: string; slug: string; url: string;
  description: string | null; transport: string; enabled: boolean;
  config: Record<string, string>;
  required_credentials: McpRequiredCredential[];
};

type AgentMcpLink = {
  id: string; agent_id: string; mcp_server_id: string | null;
  name: string; url: string; description: string;
  enabled: boolean; config: Record<string, string>;
};

function TabMCP({ agentId }: { agentId: string }) {
  const [catalog, setCatalog] = useState<McpCatalogEntry[]>([]);
  const [links, setLinks] = useState<AgentMcpLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [manualName, setManualName] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [manualDesc, setManualDesc] = useState("");
  const [newCreds, setNewCreds] = useState<Array<{ key: string; value: string }>>([]);

  const loadData = async () => {
    const [catalogRes, linksRes] = await Promise.all([
      supabase.from("mcp_servers" as any).select("*").order("name"),
      supabase.from("agent_mcp_servers" as any).select("*").eq("agent_id", agentId).order("created_at", { ascending: true }),
    ]);
    setCatalog(((catalogRes.data as any) || []).map((r: any) => ({
      ...r,
      config: r.config && typeof r.config === "object" ? r.config : {},
      required_credentials: Array.isArray(r.required_credentials) ? r.required_credentials : [],
    })));
    setLinks(((linksRes.data as any) || []).map((r: any) => ({
      ...r, config: r.config && typeof r.config === "object" ? r.config : {},
    })));
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [agentId]);

  const linkedServerIds = new Set(links.map(l => l.mcp_server_id).filter(Boolean));
  const availableCatalog = catalog.filter(c => !linkedServerIds.has(c.id));

  const handleLinkCatalog = async (srv: McpCatalogEntry) => {
    const prefilledConfig: Record<string, string> = {};
    for (const cred of (srv.required_credentials || [])) {
      prefilledConfig[cred.key] = "";
    }
    const { data, error } = await supabase
      .from("agent_mcp_servers" as any)
      .insert({
        agent_id: agentId, mcp_server_id: srv.id,
        name: srv.name, url: srv.url,
        description: srv.description || "", enabled: true, config: prefilledConfig,
      } as any)
      .select().single();
    if (error) { toast.error("Erro ao vincular: " + error.message); return; }
    const row = data as any;
    setLinks(prev => [...prev, { ...row, config: row.config || {} }]);
    setExpandedId(row.id);
    toast.success(`${srv.name} vinculado — configure as credenciais abaixo`);
  };

  const handleAddManual = async () => {
    if (!manualName.trim() || !manualUrl.trim()) { toast.error("Nome e URL sao obrigatorios"); return; }
    const cfg: Record<string, string> = {};
    for (const c of newCreds) { if (c.key.trim()) cfg[c.key.trim()] = c.value; }
    const { data, error } = await supabase
      .from("agent_mcp_servers" as any)
      .insert({
        agent_id: agentId, name: manualName.trim(), url: manualUrl.trim(),
        description: manualDesc.trim(), enabled: true, config: cfg,
      } as any)
      .select().single();
    if (error) { toast.error("Erro: " + error.message); return; }
    setLinks(prev => [...prev, { ...(data as any), config: (data as any).config || {} }]);
    setManualName(""); setManualUrl(""); setManualDesc(""); setNewCreds([]);
    toast.success("MCP adicionado manualmente");
  };

  const handleToggle = async (id: string, current: boolean) => {
    const { error } = await supabase.from("agent_mcp_servers" as any).update({ enabled: !current } as any).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setLinks(prev => prev.map(m => m.id === id ? { ...m, enabled: !current } : m));
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remover este MCP server do agente?")) return;
    const { error } = await supabase.from("agent_mcp_servers" as any).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setLinks(prev => prev.filter(m => m.id !== id));
    toast.success("MCP removido");
  };

  const handleSaveConfig = async (id: string, config: Record<string, string>) => {
    const { error } = await supabase.from("agent_mcp_servers" as any).update({ config } as any).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setLinks(prev => prev.map(m => m.id === id ? { ...m, config } : m));
    toast.success("Credenciais salvas");
  };

  if (loading) return <HexagonLoader variant="inline" label="Carregando MCPs..." />;

  const inputSm: React.CSSProperties = { fontSize: 12, padding: "6px 10px" };
  const mask = (v: string) => v.length <= 6 ? "••••••" : v.slice(0, 3) + "•".repeat(v.length - 6) + v.slice(-3);

  const thStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, padding: "8px 12px", textAlign: "left",
    color: "hsl(var(--muted-foreground))", borderBottom: "1px solid hsl(var(--border))",
    whiteSpace: "nowrap",
  };
  const tdStyle: React.CSSProperties = {
    fontSize: 12, padding: "10px 12px", borderBottom: "1px solid hsl(var(--border) / 0.5)",
    color: "hsl(var(--foreground))", verticalAlign: "top",
  };

  return (
    <div>
      {/* ── MCP Servers vinculados ao agente (tabela) ── */}
      <div className="lf-panel">
        <h3 className="lf-panel__title">MCP Servers do Agente</h3>
        <p className="lf-panel__hint" style={{ marginBottom: 16 }}>
          MCPs vinculados a este agente. Configure credenciais e ative/desative conforme necessario.
        </p>

        {links.length === 0 ? (
          <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", textAlign: "center", padding: 16 }}>
            Nenhum MCP vinculado a este agente. Vincule um do catalogo abaixo ou adicione manualmente.
          </p>
        ) : (
          <div style={{ overflowX: "auto", marginBottom: 16, borderRadius: 8, border: "1px solid hsl(var(--border))" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", background: "hsl(var(--card))" }}>
              <thead>
                <tr style={{ background: "hsl(var(--muted) / 0.3)" }}>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Nome</th>
                  <th style={thStyle}>URL</th>
                  <th style={thStyle}>Credenciais</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {links.map(link => {
                  const isExpanded = expandedId === link.id;
                  const configCount = Object.keys(link.config || {}).length;
                  const catalogMatch = catalog.find(c => c.id === link.mcp_server_id);
                  return (
                    <tr key={link.id} style={{ opacity: link.enabled ? 1 : 0.5 }}>
                      <td style={tdStyle}>
                        <div style={{
                          display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11,
                          padding: "2px 8px", borderRadius: 12,
                          background: link.enabled ? "rgba(34,197,94,0.1)" : "rgba(156,163,175,0.1)",
                          color: link.enabled ? "#22c55e" : "hsl(var(--muted-foreground))",
                        }}>
                          <span style={{
                            width: 6, height: 6, borderRadius: "50%",
                            background: link.enabled ? "#22c55e" : "hsl(var(--muted-foreground))",
                          }} />
                          {link.enabled ? "Ativo" : "Inativo"}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{link.name}</div>
                        {link.description && (
                          <div style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", marginTop: 2 }}>{link.description}</div>
                        )}
                        {catalogMatch && (
                          <div style={{
                            fontSize: 9, color: "hsl(var(--muted-foreground))", marginTop: 2,
                            display: "inline-flex", alignItems: "center", gap: 4,
                            background: "hsl(var(--muted) / 0.3)", padding: "1px 6px", borderRadius: 4,
                          }}>
                            catalogo: {catalogMatch.slug}
                          </div>
                        )}
                      </td>
                      <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 11, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {link.url}
                      </td>
                      <td style={tdStyle}>
                        <button type="button" className="lf-btn lf-btn--ghost" style={{ fontSize: 10, padding: "3px 8px" }}
                          onClick={() => setExpandedId(isExpanded ? null : link.id)}
                        >
                          {isExpanded ? "▲ Fechar" : `⚙ ${configCount} credencia${configCount === 1 ? "l" : "is"}`}
                        </button>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center", whiteSpace: "nowrap" }}>
                        <button type="button" className="lf-btn lf-btn--ghost" style={{ fontSize: 10, padding: "3px 8px" }}
                          onClick={() => handleToggle(link.id, link.enabled)}
                        >
                          {link.enabled ? "Desativar" : "Ativar"}
                        </button>
                        <button type="button" className="lf-btn lf-btn--ghost" style={{ fontSize: 10, padding: "3px 8px", color: "#ef4444" }}
                          onClick={() => handleDelete(link.id)}
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {expandedId && links.find(l => l.id === expandedId) && (() => {
              const expandedLink = links.find(l => l.id === expandedId)!;
              const catalogMatch = catalog.find(c => c.id === expandedLink.mcp_server_id);
              return (
                <McpCredentialsEditor
                  config={expandedLink.config}
                  requiredCredentials={catalogMatch?.required_credentials || []}
                  onSave={(cfg) => handleSaveConfig(expandedId, cfg)}
                  mask={mask}
                  inputSm={inputSm}
                />
              );
            })()}
          </div>
        )}
      </div>

      {/* ── Catalogo global de MCPs disponiveis ── */}
      <div className="lf-panel" style={{ marginTop: 16 }}>
        <h3 className="lf-panel__title">Catalogo de MCPs Disponiveis</h3>
        <p className="lf-panel__hint" style={{ marginBottom: 16 }}>
          MCPs cadastrados no sistema. Clique em "Vincular" para adicionar ao agente.
        </p>

        {catalog.length === 0 ? (
          <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", textAlign: "center", padding: 16 }}>
            Nenhum MCP cadastrado no sistema.
          </p>
        ) : (
          <div style={{ overflowX: "auto", marginBottom: 16, borderRadius: 8, border: "1px solid hsl(var(--border))" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", background: "hsl(var(--card))" }}>
              <thead>
                <tr style={{ background: "hsl(var(--muted) / 0.3)" }}>
                  <th style={thStyle}>Nome</th>
                  <th style={thStyle}>URL</th>
                  <th style={thStyle}>Transporte</th>
                  <th style={thStyle}>Status Global</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Acao</th>
                </tr>
              </thead>
              <tbody>
                {catalog.map(srv => {
                  const alreadyLinked = linkedServerIds.has(srv.id);
                  return (
                    <tr key={srv.id} style={{ opacity: srv.enabled ? 1 : 0.6 }}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{srv.name}</div>
                        {srv.description && (
                          <div style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", marginTop: 2 }}>{srv.description}</div>
                        )}
                      </td>
                      <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 11, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {srv.url}
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          fontSize: 10, padding: "2px 8px", borderRadius: 4,
                          background: "hsl(var(--muted) / 0.5)", color: "hsl(var(--foreground))",
                        }}>
                          {srv.transport}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          fontSize: 10, padding: "2px 8px", borderRadius: 12,
                          background: srv.enabled ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                          color: srv.enabled ? "#22c55e" : "#ef4444",
                        }}>
                          {srv.enabled ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        {alreadyLinked ? (
                          <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>Ja vinculado</span>
                        ) : (
                          <button type="button" className="lf-btn lf-btn--primary" style={{ fontSize: 11, padding: "4px 12px" }}
                            onClick={() => handleLinkCatalog(srv)}
                          >
                            + Vincular
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Adicionar MCP manual ── */}
      <div className="lf-panel" style={{ marginTop: 16 }}>
        <h3 className="lf-panel__title">Adicionar MCP Manualmente</h3>
        <p className="lf-panel__hint" style={{ marginBottom: 16 }}>
          Adicione um MCP customizado que nao esta no catalogo.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div className="lf-field">
            <label className="lf-field__label">Nome do MCP *</label>
            <input className="lf-input" style={inputSm} value={manualName} onChange={e => setManualName(e.target.value)} placeholder="Ex: Supabase MCP" />
          </div>
          <div className="lf-field">
            <label className="lf-field__label">URL / Endpoint *</label>
            <input className="lf-input" style={inputSm} value={manualUrl} onChange={e => setManualUrl(e.target.value)} placeholder="https://mcp.example.com" />
          </div>
          <div className="lf-field" style={{ gridColumn: "1 / -1" }}>
            <label className="lf-field__label">Descricao (opcional)</label>
            <input className="lf-input" style={inputSm} value={manualDesc} onChange={e => setManualDesc(e.target.value)} placeholder="O que este MCP faz..." />
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label className="lf-field__label" style={{ marginBottom: 6, display: "block" }}>
              Credenciais / Variaveis de Configuracao
            </label>
            {newCreds.map((c, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <input className="lf-input" style={{ ...inputSm, flex: 1 }} value={c.key} placeholder="Nome (ex: SUPABASE_URL)"
                  onChange={e => setNewCreds(prev => prev.map((cc, ii) => ii === i ? { ...cc, key: e.target.value } : cc))} />
                <input className="lf-input" style={{ ...inputSm, flex: 1 }} value={c.value} placeholder="Valor"
                  onChange={e => setNewCreds(prev => prev.map((cc, ii) => ii === i ? { ...cc, value: e.target.value } : cc))} />
                <button type="button" className="lf-btn lf-btn--ghost" style={{ fontSize: 10, padding: "3px 8px", color: "#ef4444" }}
                  onClick={() => setNewCreds(prev => prev.filter((_, ii) => ii !== i))}>✕</button>
              </div>
            ))}
            <button type="button" className="lf-btn lf-btn--ghost" style={{ fontSize: 11, padding: "4px 10px" }}
              onClick={() => setNewCreds(prev => [...prev, { key: "", value: "" }])}>
              + Adicionar credencial
            </button>
          </div>

          <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}>
            <button type="button" className="lf-btn lf-btn--primary" onClick={handleAddManual}>
              + Adicionar MCP
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Inline credentials editor for an existing MCP */
function McpCredentialsEditor({
  config, requiredCredentials, onSave, mask, inputSm,
}: {
  config: Record<string, string>;
  requiredCredentials: McpRequiredCredential[];
  onSave: (cfg: Record<string, string>) => void;
  mask: (v: string) => string;
  inputSm: React.CSSProperties;
}) {
  const [entries, setEntries] = useState<Array<{
    key: string; value: string; revealed: boolean;
    label?: string; hint?: string; isRequired?: boolean; fromSchema?: boolean;
  }>>(() => {
    const schemaKeys = new Set(requiredCredentials.map(c => c.key));
    const fromSchema = requiredCredentials.map(c => ({
      key: c.key, value: config[c.key] || "", revealed: !config[c.key],
      label: c.label, hint: c.hint, isRequired: c.required, fromSchema: true,
    }));
    const extra = Object.entries(config)
      .filter(([k]) => !schemaKeys.has(k))
      .map(([k, v]) => ({ key: k, value: v, revealed: false, fromSchema: false }));
    return [...fromSchema, ...extra];
  });

  const addRow = () => setEntries(prev => [...prev, { key: "", value: "", revealed: true, fromSchema: false }]);
  const removeRow = (i: number) => setEntries(prev => prev.filter((_, ii) => ii !== i));
  const updateRow = (i: number, field: "key" | "value", val: string) =>
    setEntries(prev => prev.map((e, ii) => ii === i ? { ...e, [field]: val } : e));
  const toggleReveal = (i: number) =>
    setEntries(prev => prev.map((e, ii) => ii === i ? { ...e, revealed: !e.revealed } : e));

  const handleSave = () => {
    const cfg: Record<string, string> = {};
    for (const e of entries) { if (e.key.trim()) cfg[e.key.trim()] = e.value; }
    onSave(cfg);
  };

  const missingRequired = entries.filter(e => e.isRequired && !e.value.trim());

  return (
    <div style={{ padding: "14px 14px", borderTop: "1px solid hsl(var(--border) / 0.3)", background: "hsl(var(--card) / 0.5)" }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "hsl(var(--foreground))", marginBottom: 10 }}>
        Credenciais &amp; Variaveis
      </div>

      {entries.length === 0 && (
        <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", margin: "4px 0 8px" }}>
          Nenhuma credencial configurada.
        </p>
      )}

      {entries.map((e, i) => (
        <div key={i} style={{ marginBottom: e.fromSchema ? 12 : 6 }}>
          {e.fromSchema && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "hsl(var(--foreground))" }}>
                {e.label || e.key}
              </span>
              {e.isRequired && (
                <span style={{
                  fontSize: 9, padding: "1px 6px", borderRadius: 4, fontWeight: 600,
                  background: "rgba(239,68,68,0.15)", color: "#ef4444",
                }}>obrigatorio</span>
              )}
              {!e.isRequired && (
                <span style={{
                  fontSize: 9, padding: "1px 6px", borderRadius: 4,
                  background: "hsl(var(--muted) / 0.3)", color: "hsl(var(--muted-foreground))",
                }}>opcional</span>
              )}
            </div>
          )}
          {e.fromSchema && e.hint && (
            <div style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", marginBottom: 4, lineHeight: 1.4 }}>
              {e.hint}
            </div>
          )}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {e.fromSchema ? (
              <span style={{
                ...inputSm, flex: 0.8, fontFamily: "monospace", fontSize: 11,
                background: "hsl(var(--muted) / 0.3)", borderRadius: 6, display: "inline-flex",
                alignItems: "center", color: "hsl(var(--muted-foreground))",
                border: "1px solid hsl(var(--border) / 0.5)", padding: "6px 10px",
              }}>
                {e.key}
              </span>
            ) : (
              <input className="lf-input" style={{ ...inputSm, flex: 0.8, fontFamily: "monospace", fontSize: 11 }}
                value={e.key} placeholder="CHAVE" onChange={ev => updateRow(i, "key", ev.target.value)} />
            )}
            <input
              className="lf-input"
              style={{
                ...inputSm, flex: 1.2, fontFamily: "monospace", fontSize: 11,
                borderColor: e.isRequired && !e.value.trim() ? "rgba(239,68,68,0.5)" : undefined,
              }}
              value={e.revealed ? e.value : mask(e.value)}
              placeholder={e.fromSchema ? `Insira o ${e.label || e.key}...` : "valor"}
              onChange={ev => { updateRow(i, "value", ev.target.value); if (!e.revealed) toggleReveal(i); }}
              onFocus={() => { if (!e.revealed) toggleReveal(i); }}
            />
            <button type="button" className="lf-btn lf-btn--ghost" style={{ fontSize: 10, padding: "2px 6px" }}
              onClick={() => toggleReveal(i)} title={e.revealed ? "Ocultar" : "Revelar"}>
              {e.revealed ? "🙈" : "👁"}
            </button>
            {!e.fromSchema && (
              <button type="button" className="lf-btn lf-btn--ghost" style={{ fontSize: 10, padding: "2px 6px", color: "#ef4444" }}
                onClick={() => removeRow(i)}>✕</button>
            )}
          </div>
        </div>
      ))}

      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
        <button type="button" className="lf-btn lf-btn--ghost" style={{ fontSize: 11, padding: "4px 10px" }}
          onClick={addRow}>+ Adicionar variavel</button>
        <span style={{ flex: 1 }} />
        {missingRequired.length > 0 && (
          <span style={{ fontSize: 10, color: "#ef4444" }}>
            {missingRequired.length} campo{missingRequired.length > 1 ? "s" : ""} obrigatorio{missingRequired.length > 1 ? "s" : ""} pendente{missingRequired.length > 1 ? "s" : ""}
          </span>
        )}
        <button type="button" className="lf-btn lf-btn--primary" style={{ fontSize: 11, padding: "4px 14px" }}
          onClick={handleSave}>Salvar credenciais</button>
      </div>
    </div>
  );
}
