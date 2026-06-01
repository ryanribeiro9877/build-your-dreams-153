import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAgents } from "@/hooks/useAgents";
import { useProviders, PROVIDER_LABELS, PROVIDER_HINTS } from "@/hooks/useProviders";
import { useAgentLLMConfig, SUGGESTED_BY_LEVEL } from "@/hooks/useAgentLLMConfig";
import { validateProviderKey, type ValidationResult } from "@/lib/validateProviderKey";
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

type TabKey = "identidade" | "modelo" | "prompt" | "memoria" | "provedor";

const TABS: Array<{ key: TabKey; label: string; hint: string }> = [
  { key: "identidade", label: "Identidade", hint: "Nome, papel, departamento" },
  { key: "modelo", label: "Modelo", hint: "Provedor e modelo de IA" },
  { key: "prompt", label: "Prompt", hint: "Persona e tom" },
  { key: "memoria", label: "Memória", hint: "Contexto e long-term" },
  { key: "provedor", label: "Provedor", hint: "Chaves de API" },
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
            </>
          )}
        </section>

        {/* Zona de perigo (limpar config) */}
        <div className="lf-panel" style={{ marginTop: 22, borderStyle: "dashed" }}>
          <h3 className="lf-panel__title">
            Zona de risco
            <button
              type="button"
              className="lf-btn lf-btn--danger-ghost"
              onClick={handleClear}
              disabled={saving}
            >
              Limpar config de IA
            </button>
          </h3>
          <p className="lf-panel__hint" style={{ marginBottom: 0 }}>
            Remove provedor, modelo, prompt e demais ajustes deste agente. Não apaga o agente —
            só zera a configuração de IA.
          </p>
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
