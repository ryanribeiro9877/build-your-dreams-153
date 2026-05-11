import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAgents } from "@/hooks/useAgents";
import { useProviders, PROVIDER_LABELS } from "@/hooks/useProviders";
import { useAgentLLMConfig, SUGGESTED_BY_LEVEL } from "@/hooks/useAgentLLMConfig";
import type { ProviderCode, AgentLLMConfig } from "@/types/lexforce";
import { toast } from "sonner";
import { ArrowLeft, Bot, Search, Settings, Sparkles, Trash2, CheckCircle2, AlertTriangle, Lock } from "lucide-react";

/**
 * /admin/agentes
 *
 * Lista de agentes + configuracao de LLM por agente.
 * Apenas admin pode acessar.
 */
export default function AgentsAdmin() {
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  const { agents, loading: loadingAgents, reload: reloadAgents } = useAgents();
  const { models, configs, loading: loadingProviders } = useProviders();
  const { getConfig, updateConfig, clearConfig } = useAgentLLMConfig();

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "configured" | "unconfigured">("all");
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [editConfig, setEditConfig] = useState<AgentLLMConfig | null>(null);
  const [saving, setSaving] = useState(false);

  // RBAC
  const isAdmin = hasRole("admin");
  if (!user) { navigate("/auth"); return null; }

  // Carregar config do agente quando abre modal
  useEffect(() => {
    if (!editingAgentId) { setEditConfig(null); return; }
    (async () => {
      const cfg = await getConfig(editingAgentId);
      setEditConfig(cfg || {
        provider: null, model: null, temperature: null, top_p: null,
        max_tokens: null, memory_enabled: null, history_limit: null,
        allow_fallbacks: null, system_prompt: null,
      });
    })();
  }, [editingAgentId, getConfig]);

  // Lista filtrada
  const visibleAgents = useMemo(() => {
    return agents
      .filter(a => {
        if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      })
      .filter(a => {
        if (filterStatus === "all") return true;
        // Precisamos saber se o agente esta configurado. Como o hook useAgents nao
        // retorna provider/model, vamos checar via campo conhecido indirectly.
        // Por enquanto deixar passar - filtro real depende de carregar do banco.
        return true;
      });
  }, [agents, search, filterStatus]);

  const configuredProviders = useMemo(() => {
    const set = new Set<ProviderCode>();
    configs.forEach(c => set.add(c.provider));
    return set;
  }, [configs]);

  const handleSave = async () => {
    if (!editingAgentId || !editConfig) return;
    if (!editConfig.provider || !editConfig.model) {
      toast.error("Provedor e modelo sao obrigatorios.");
      return;
    }
    if (!configuredProviders.has(editConfig.provider)) {
      toast.error(`Voce ainda nao cadastrou chave para ${PROVIDER_LABELS[editConfig.provider]}. Cadastre em Configuracoes → Provedores antes.`);
      return;
    }
    setSaving(true);
    const result = await updateConfig(editingAgentId, editConfig);
    setSaving(false);
    if (result.ok) {
      toast.success("Configuracao salva.");
      await reloadAgents();
      setEditingAgentId(null);
    } else {
      toast.error(result.error || "Falha ao salvar.");
    }
  };

  const handleClear = async () => {
    if (!editingAgentId) return;
    if (!confirm("Limpar toda configuracao de IA deste agente? Ele para de poder responder ate ser reconfigurado.")) return;
    setSaving(true);
    const ok = await clearConfig(editingAgentId);
    setSaving(false);
    if (ok) {
      toast.success("Configuracao limpa.");
      await reloadAgents();
      setEditingAgentId(null);
    } else {
      toast.error("Falha ao limpar.");
    }
  };

  const applySuggested = (level: number) => {
    if (!editConfig) return;
    const suggested = SUGGESTED_BY_LEVEL[level];
    if (suggested) setEditConfig({ ...editConfig, ...suggested } as AgentLLMConfig);
  };

  // Styles
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 14px", borderRadius: 8,
    background: "#16161f", border: "1px solid #252534", color: "#eeeef5",
    fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 11, color: "#9898b0", marginBottom: 6,
    textTransform: "uppercase", letterSpacing: "0.08em",
  };
  const buttonPrimary: React.CSSProperties = {
    padding: "10px 18px", borderRadius: 8, border: "none",
    background: "#c9a84c", color: "#09090f", fontWeight: 600, cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif",
  };
  const buttonGhost: React.CSSProperties = {
    padding: "8px 14px", borderRadius: 8, border: "1px solid #252534",
    background: "transparent", color: "#9898b0", cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif", fontSize: 13,
  };

  if (!isAdmin) {
    return (
      <div style={{ minHeight: "100vh", background: "#09090f", color: "#eeeef5", padding: 40, textAlign: "center" }}>
        <Lock size={32} color="#9898b0" />
        <h2>Acesso restrito</h2>
        <p style={{ color: "#9898b0" }}>Apenas administradores podem acessar esta pagina.</p>
        <button onClick={() => navigate(-1)} style={buttonGhost}>Voltar</button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#09090f", color: "#eeeef5", fontFamily: "'DM Sans', sans-serif" }}>
      <header style={{ padding: "20px 32px", borderBottom: "1px solid #252534", display: "flex", alignItems: "center", gap: 16 }}>
        <button onClick={() => navigate(-1)} style={{ ...buttonGhost, padding: 8 }}>
          <ArrowLeft size={18} />
        </button>
        <Bot size={22} color="#c9a84c" />
        <div>
          <h1 style={{ fontSize: 20, margin: 0 }}>Agentes — Configuracao de IA</h1>
          <p style={{ fontSize: 12, color: "#9898b0", margin: 0 }}>
            {agents.length} agentes · Defina provedor e modelo de cada um.
          </p>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <button onClick={() => navigate("/configuracoes/providers")} style={buttonGhost}>
            Provedores de IA
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: 32 }}>
        {/* Aviso se nao tem nenhuma chave cadastrada */}
        {!loadingProviders && configs.length === 0 && (
          <div style={{
            background: "rgba(255, 107, 107, 0.08)", border: "1px solid rgba(255, 107, 107, 0.3)",
            borderRadius: 8, padding: 16, marginBottom: 20, display: "flex", gap: 12, alignItems: "center",
          }}>
            <AlertTriangle size={20} color="#ff6b6b" />
            <div style={{ fontSize: 13, color: "#ffb8b8" }}>
              <strong>Voce ainda nao cadastrou nenhuma chave de provedor.</strong>{" "}
              Sem chave, configurar agentes nao adianta — eles nao vao conseguir responder.{" "}
              <button
                onClick={() => navigate("/configuracoes/providers")}
                style={{ background: "transparent", border: "none", color: "#c9a84c", textDecoration: "underline", cursor: "pointer", padding: 0 }}
              >
                Cadastrar agora
              </button>
            </div>
          </div>
        )}

        {/* Search + Filter */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1, position: "relative" }}>
            <Search size={16} color="#9898b0" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar agente..."
              style={{ ...inputStyle, paddingLeft: 36 }}
            />
          </div>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as "all" | "configured" | "unconfigured")}
            style={{ ...inputStyle, width: 220 }}
          >
            <option value="all">Todos os agentes</option>
            <option value="configured">Apenas configurados</option>
            <option value="unconfigured">Apenas nao configurados</option>
          </select>
        </div>

        {/* Tabela de agentes */}
        <div style={{ background: "#0d0d14", border: "1px solid #252534", borderRadius: 12, overflow: "hidden" }}>
          {loadingAgents ? (
            <div style={{ padding: 40, textAlign: "center", color: "#9898b0" }}>Carregando agentes...</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#16161f", borderBottom: "1px solid #252534" }}>
                  <th style={{ textAlign: "left", padding: "12px 16px", fontSize: 11, color: "#9898b0", textTransform: "uppercase", letterSpacing: "0.08em" }}>Agente</th>
                  <th style={{ textAlign: "left", padding: "12px 16px", fontSize: 11, color: "#9898b0", textTransform: "uppercase", letterSpacing: "0.08em" }}>Departamento</th>
                  <th style={{ textAlign: "left", padding: "12px 16px", fontSize: 11, color: "#9898b0", textTransform: "uppercase", letterSpacing: "0.08em" }}>Papel / Nivel</th>
                  <th style={{ textAlign: "left", padding: "12px 16px", fontSize: 11, color: "#9898b0", textTransform: "uppercase", letterSpacing: "0.08em" }}>IA</th>
                  <th style={{ textAlign: "right", padding: "12px 16px", fontSize: 11, color: "#9898b0", textTransform: "uppercase", letterSpacing: "0.08em" }}>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {visibleAgents.map(agent => (
                  <AgentRow
                    key={agent.id}
                    agent={agent}
                    onEdit={() => setEditingAgentId(agent.id)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {/* Modal de configuracao */}
      {editingAgentId && editConfig && (
        <div
          onClick={() => !saving && setEditingAgentId(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0, 0, 0, 0.7)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
            padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "#0d0d14", border: "1px solid #252534", borderRadius: 12,
              padding: 28, maxWidth: 640, width: "100%", maxHeight: "90vh", overflowY: "auto",
            }}
          >
            <h2 style={{ fontSize: 18, margin: "0 0 4px" }}>
              <Settings size={18} style={{ display: "inline", marginRight: 8, color: "#c9a84c" }} />
              Configurar IA do agente
            </h2>
            <p style={{ fontSize: 12, color: "#9898b0", margin: "0 0 20px" }}>
              {agents.find(a => a.id === editingAgentId)?.name}
            </p>

            {/* Sugestoes rapidas */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              {[1, 2, 3, 4].map(lvl => (
                <button
                  key={lvl}
                  onClick={() => applySuggested(lvl)}
                  style={{
                    ...buttonGhost,
                    padding: "6px 12px",
                    fontSize: 11,
                    color: "#c9a84c",
                    borderColor: "rgba(201, 168, 76, 0.3)",
                  }}
                >
                  <Sparkles size={11} style={{ display: "inline", marginRight: 4 }} />
                  Sugerido N{lvl}
                </button>
              ))}
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={labelStyle}>Provedor</label>
                <select
                  value={editConfig.provider || ""}
                  onChange={e => setEditConfig({ ...editConfig, provider: (e.target.value || null) as ProviderCode | null, model: null })}
                  style={inputStyle}
                >
                  <option value="">— Nao configurado —</option>
                  {(Object.keys(PROVIDER_LABELS) as ProviderCode[]).map(p => (
                    <option key={p} value={p}>
                      {PROVIDER_LABELS[p]}{!configuredProviders.has(p) && " (sem chave cadastrada)"}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Modelo</label>
                <select
                  value={editConfig.model || ""}
                  onChange={e => setEditConfig({ ...editConfig, model: e.target.value || null })}
                  disabled={!editConfig.provider}
                  style={{ ...inputStyle, opacity: editConfig.provider ? 1 : 0.5 }}
                >
                  <option value="">— Selecione um modelo —</option>
                  {models
                    .filter(m => m.provider === editConfig.provider)
                    .map(m => (
                      <option key={m.id} value={m.model_id}>
                        {m.display_name} ({m.tier}) — ${Number(m.input_price_per_mtok).toFixed(2)}/${Number(m.output_price_per_mtok).toFixed(2)}/MTok
                      </option>
                    ))}
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelStyle}>Temperatura</label>
                  <input
                    type="number" min={0} max={2} step={0.1}
                    value={editConfig.temperature ?? ""}
                    onChange={e => setEditConfig({ ...editConfig, temperature: e.target.value === "" ? null : parseFloat(e.target.value) })}
                    placeholder="0.3"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Max tokens</label>
                  <input
                    type="number" min={1} max={100000}
                    value={editConfig.max_tokens ?? ""}
                    onChange={e => setEditConfig({ ...editConfig, max_tokens: e.target.value === "" ? null : parseInt(e.target.value) })}
                    placeholder="1500"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>History limit</label>
                  <input
                    type="number" min={1} max={50}
                    value={editConfig.history_limit ?? ""}
                    onChange={e => setEditConfig({ ...editConfig, history_limit: e.target.value === "" ? null : parseInt(e.target.value) })}
                    placeholder="10"
                    style={inputStyle}
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>System prompt (opcional)</label>
                <textarea
                  value={editConfig.system_prompt ?? ""}
                  onChange={e => setEditConfig({ ...editConfig, system_prompt: e.target.value || null })}
                  placeholder="Deixe vazio para usar prompt automatico baseado no nome/descricao do agente"
                  rows={4}
                  style={{ ...inputStyle, fontFamily: "monospace", fontSize: 12, resize: "vertical" }}
                />
              </div>

              <div style={{ display: "flex", gap: 18, marginTop: 4 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#c0c0d0", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={!!editConfig.memory_enabled}
                    onChange={e => setEditConfig({ ...editConfig, memory_enabled: e.target.checked })}
                    style={{ accentColor: "#c9a84c" }}
                  />
                  Memoria eterna
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#c0c0d0", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={!!editConfig.allow_fallbacks}
                    onChange={e => setEditConfig({ ...editConfig, allow_fallbacks: e.target.checked })}
                    style={{ accentColor: "#c9a84c" }}
                  />
                  Permitir fallback (OpenRouter)
                </label>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, justifyContent: "space-between", marginTop: 24 }}>
              <button onClick={handleClear} style={{ ...buttonGhost, color: "#ff6b6b" }} disabled={saving}>
                <Trash2 size={14} style={{ display: "inline", marginRight: 6 }} />
                Limpar config
              </button>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setEditingAgentId(null)} style={buttonGhost} disabled={saving}>
                  Cancelar
                </button>
                <button onClick={handleSave} style={buttonPrimary} disabled={saving}>
                  {saving ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Linha da tabela - faz fetch da config do agente para mostrar status. */
function AgentRow({ agent, onEdit }: { agent: { id: string; name: string; departmentName: string; role: string; level?: number }; onEdit: () => void }) {
  // Buscar provider/model do agente direto (sem hook, query simples uma vez)
  const [configStatus, setConfigStatus] = useState<{ configured: boolean; provider: string | null; model: string | null }>({ configured: false, provider: null, model: null });

  useEffect(() => {
    import("@/integrations/supabase/client").then(({ supabase }) => {
      supabase
        .from("agents")
        .select("provider, model")
        .eq("id", agent.id)
        .single()
        .then(({ data }) => {
          if (data) {
            const d = data as { provider: string | null; model: string | null };
            setConfigStatus({
              configured: !!(d.provider && d.model),
              provider: d.provider,
              model: d.model,
            });
          }
        });
    });
  }, [agent.id]);

  return (
    <tr style={{ borderBottom: "1px solid #16161f" }}>
      <td style={{ padding: "12px 16px", fontSize: 13, color: "#eeeef5" }}>{agent.name}</td>
      <td style={{ padding: "12px 16px", fontSize: 12, color: "#9898b0" }}>{agent.departmentName || "—"}</td>
      <td style={{ padding: "12px 16px", fontSize: 12, color: "#9898b0" }}>
        {agent.role}{agent.level ? ` · N${agent.level}` : ""}
      </td>
      <td style={{ padding: "12px 16px", fontSize: 12 }}>
        {configStatus.configured ? (
          <span style={{ color: "#2dd4a0" }}>
            <CheckCircle2 size={12} style={{ display: "inline", marginRight: 4 }} />
            {configStatus.model}
          </span>
        ) : (
          <span style={{ color: "#6b6b80", fontStyle: "italic" }}>nao configurado</span>
        )}
      </td>
      <td style={{ padding: "12px 16px", textAlign: "right" }}>
        <button
          onClick={onEdit}
          style={{
            padding: "6px 12px", borderRadius: 6, border: "1px solid #252534",
            background: "transparent", color: "#c9a84c", cursor: "pointer", fontSize: 12,
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          <Settings size={11} style={{ display: "inline", marginRight: 4 }} />
          Configurar
        </button>
      </td>
    </tr>
  );
}
