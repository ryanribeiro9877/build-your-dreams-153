import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAgents } from "@/hooks/useAgents";
import { useProviders } from "@/hooks/useProviders";
import { supabase } from "@/integrations/supabase/client";

/**
 * /admin/agentes
 *
 * Listagem de agentes — estilo "Meus Agentes" (bot.zanetti).
 * Cabeçalho com KPIs, busca, filtros e grid de cards clicáveis.
 * Toda a configuração acontece em /admin/agentes/:id (AgentDetail).
 *
 * IMPORTANTE: lógica/hooks/queries permanecem idênticas. Só o visual
 * foi reorganizado para usar as classes utilitárias `.lf-*` definidas
 * em `src/styles/lexforce-modern.css`.
 */
export default function AgentsAdmin() {
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  const { agents, loading: loadingAgents } = useAgents();
  const { configs, loading: loadingProviders } = useProviders();

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "configured" | "unconfigured">("all");
  const [filterDepartment, setFilterDepartment] = useState<string>("all");
  const [agentLLMStatus, setAgentLLMStatus] = useState<
    Record<string, { configured: boolean; model: string | null; provider: string | null }>
  >({});

  const isAdmin = hasRole("admin");

  // Buscar provider/model de todos os agentes em uma única query
  useEffect(() => {
    if (!isAdmin || agents.length === 0) return;
    (async () => {
      const { data } = await supabase
        .from("agents")
        .select("id, provider, model");
      if (data) {
        const map: Record<string, { configured: boolean; model: string | null; provider: string | null }> = {};
        // Supabase generated types não incluem `provider`/`model` na tabela `agents`,
        // mas as colunas existem no banco — cast via `unknown` para o tipo real.
        for (const row of data as unknown as { id: string; provider: string | null; model: string | null }[]) {
          map[row.id] = {
            configured: !!(row.provider && row.model),
            model: row.model,
            provider: row.provider,
          };
        }
        setAgentLLMStatus(map);
      }
    })();
  }, [isAdmin, agents.length]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const a of agents) {
      if (a.departmentName) set.add(a.departmentName);
    }
    return Array.from(set).sort();
  }, [agents]);

  const visibleAgents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return agents
      .filter((a) => {
        if (q && !a.name.toLowerCase().includes(q) && !a.role.toLowerCase().includes(q)) return false;
        if (filterDepartment !== "all" && a.departmentName !== filterDepartment) return false;
        const status = agentLLMStatus[a.id];
        if (filterStatus === "configured") return status?.configured === true;
        if (filterStatus === "unconfigured") return !status?.configured;
        return true;
      });
  }, [agents, search, filterStatus, filterDepartment, agentLLMStatus]);

  const configuredCount = Object.values(agentLLMStatus).filter((s) => s.configured).length;
  const unconfiguredCount = agents.length - configuredCount;

  const exit = () => navigate("/sistema");

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
            <p className="lf-panel__hint" style={{ marginBottom: 18 }}>
              Apenas administradores podem acessar esta página.
            </p>
            <button type="button" onClick={exit} className="lf-btn lf-btn--ghost">
              Voltar ao sistema
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lf-modern lf-page">
      <header className="lf-header">
        <button
          type="button"
          onClick={exit}
          className="lf-btn lf-btn--ghost"
          aria-label="Voltar ao sistema"
        >
          ← Voltar
        </button>
        <div style={{ flex: "1 1 200px", minWidth: 0 }}>
          <h1>Agentes do sistema</h1>
          <p className="lf-header__subtitle">
            {agents.length} agentes · {configuredCount} com IA configurada · clique num card para configurar
          </p>
        </div>
        <div className="lf-row" style={{ marginLeft: "auto" }}>
          <button
            type="button"
            onClick={() => navigate("/configuracoes/providers")}
            className="lf-btn lf-btn--ghost"
            title="Gestão centralizada de provedores (também acessível pela aba Provedor dentro de cada agente)"
          >
            Provedores
          </button>
        </div>
      </header>

      <main className="lf-container">
        {/* KPIs */}
        <section className="lf-stats">
          <div className="lf-stat">
            <div className="lf-stat__label">Total</div>
            <div className="lf-stat__value">{agents.length}</div>
            <div className="lf-stat__hint">Agentes cadastrados</div>
          </div>
          <div className="lf-stat lf-stat--success">
            <div className="lf-stat__label">Configurados</div>
            <div className="lf-stat__value">{configuredCount}</div>
            <div className="lf-stat__hint">Com provedor + modelo</div>
          </div>
          <div className="lf-stat lf-stat--warn">
            <div className="lf-stat__label">Sem IA</div>
            <div className="lf-stat__value">{unconfiguredCount}</div>
            <div className="lf-stat__hint">Aguardando configuração</div>
          </div>
          <div className="lf-stat lf-stat--gold">
            <div className="lf-stat__label">Departamentos</div>
            <div className="lf-stat__value">{departments.length}</div>
            <div className="lf-stat__hint">Áreas com agentes ativos</div>
          </div>
        </section>

        {/* Alerta se nenhum provedor cadastrado */}
        {!loadingProviders && configs.length === 0 && (
          <div className="lf-panel" style={{ borderColor: "rgba(255, 107, 107, 0.35)", background: "rgba(255, 107, 107, 0.06)", marginBottom: 18 }}>
            <h3 className="lf-panel__title" style={{ color: "#ff6b6b", fontSize: 13 }}>
              <span className="lf-row" style={{ gap: 8 }}>
                <span className="lf-dot lf-dot--danger" />
                Nenhuma chave de provedor cadastrada
              </span>
            </h3>
            <p className="lf-panel__hint" style={{ marginBottom: 0 }}>
              Clique em qualquer agente abaixo e use a aba <strong>Provedor</strong> para cadastrar
              sua chave de API (OpenAI, OpenRouter, Anthropic, etc.).
            </p>
          </div>
        )}

        {/* Toolbar */}
        <section className="lf-toolbar">
          <div className="lf-search">
            <span className="lf-search__icon" />
            <input
              className="lf-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou papel..."
            />
          </div>
          <select
            className="lf-select"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as "all" | "configured" | "unconfigured")}
            style={{ minWidth: 180 }}
          >
            <option value="all">Todos ({agents.length})</option>
            <option value="configured">Configurados ({configuredCount})</option>
            <option value="unconfigured">Sem IA ({unconfiguredCount})</option>
          </select>
          <select
            className="lf-select"
            value={filterDepartment}
            onChange={(e) => setFilterDepartment(e.target.value)}
            style={{ minWidth: 200 }}
          >
            <option value="all">Todos os departamentos</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </section>

        {/* Lista de agentes */}
        {loadingAgents ? (
          <div className="lf-loading">Carregando agentes...</div>
        ) : visibleAgents.length === 0 ? (
          <div className="lf-empty">
            Nenhum agente corresponde aos filtros.<br />
            Tente limpar a busca ou trocar de departamento.
          </div>
        ) : (
          <>
            <p className="lf-header__subtitle" style={{ margin: "0 0 10px" }}>
              Exibindo {visibleAgents.length} de {agents.length} agentes
            </p>
            <div className="lf-grid lf-stagger">
              {visibleAgents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  status={agentLLMStatus[agent.id]}
                  onClick={() => navigate(`/admin/agentes/${agent.id}`)}
                />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function AgentCard({
  agent,
  status,
  onClick,
}: {
  agent: { id: string; name: string; departmentName: string; role: string; level: number; color: string };
  status?: { configured: boolean; model: string | null; provider: string | null };
  onClick: () => void;
}) {
  const initials = agent.name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <button type="button" onClick={onClick} className="lf-card" aria-label={`Configurar ${agent.name}`}>
      <div className="lf-card__head">
        <div
          className="lf-avatar"
          style={agent.color ? { background: agent.color } : undefined}
          aria-hidden
        >
          {initials}
          </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 className="lf-card__title">{agent.name}</h3>
          <p className="lf-card__subtitle">
            {agent.role}
            {agent.departmentName ? ` · ${agent.departmentName}` : ""}
          </p>
        </div>
      </div>

      <div className="lf-card__meta">
        <span className="lf-badge lf-badge--neutral lf-badge--mono">N{agent.level}</span>
        {status?.configured ? (
          <span className="lf-badge lf-badge--success">
            <span className="lf-dot lf-dot--success" />
            {status.model}
          </span>
        ) : (
          <span className="lf-badge lf-badge--warn">
            <span className="lf-dot lf-dot--warn" />
            Sem IA
          </span>
         )}
        <span className="lf-spacer" />
        <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>Configurar →</span>
      </div>
    </button>
  );
}
