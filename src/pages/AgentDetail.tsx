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
import { TabIdentidade } from "@/components/agent-detail/TabIdentidade";
import { TabModelo } from "@/components/agent-detail/TabModelo";
import { TabPrompt } from "@/components/agent-detail/TabPrompt";
import { TabMemoria } from "@/components/agent-detail/TabMemoria";
import { TabProvedor } from "@/components/agent-detail/TabProvedor";
import { TabMarkdown } from "@/components/agent-detail/TabMarkdown";
import { TabTools } from "@/components/agent-detail/TabTools";
import { TabMCP } from "@/components/agent-detail/TabMCP";

/**
 * /tech/agentes/:id
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
              onClick={() => navigate("/tech/agentes")}
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
          onClick={() => navigate("/tech/agentes")}
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
                navigate("/tech/agentes");
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
                navigate("/tech/agentes");
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
