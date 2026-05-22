import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAgents } from "@/hooks/useAgents";
import { useProviders } from "@/hooks/useProviders";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Bot, Search, ChevronRight, CheckCircle2, AlertTriangle, Lock, Server } from "lucide-react";
import { LfPage, LfInput, LfGhostBtn, LfCard, LfHeaderBackBtn } from "@/lib/lexforceShellTheme";

/**
 * /admin/agentes
 *
 * Lista de agentes. Cada linha eh inteira clicavel: navega pra
 * /admin/agentes/:id (AgentDetail), onde tudo eh configurado em abas.
 *
 * Sem modal. Sem state de edicao aqui. Pagina e somente listagem.
 */
export default function AgentsAdmin() {
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  const { agents, loading: loadingAgents } = useAgents();
  const { configs, loading: loadingProviders } = useProviders();

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "configured" | "unconfigured">("all");
  const [agentLLMStatus, setAgentLLMStatus] = useState<Record<string, { configured: boolean; model: string | null }>>({});

  const isAdmin = hasRole("admin");

  // Buscar provider/model de todos os agentes em uma so query
  useEffect(() => {
    if (!isAdmin || agents.length === 0) return;
    (async () => {
      const { data } = await supabase
        .from("agents")
        .select("id, provider, model");
      if (data) {
        const map: Record<string, { configured: boolean; model: string | null }> = {};
        for (const row of data as { id: string; provider: string | null; model: string | null }[]) {
          map[row.id] = {
            configured: !!(row.provider && row.model),
            model: row.model,
          };
        }
        setAgentLLMStatus(map);
      }
    })();
  }, [isAdmin, agents.length]);

  const visibleAgents = useMemo(() => {
    return agents
      .filter(a => {
        if (search && !a.name.toLowerCase().includes(search.toLowerCase()) && !a.role.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      })
      .filter(a => {
        if (filterStatus === "all") return true;
        const status = agentLLMStatus[a.id];
        if (filterStatus === "configured") return status?.configured === true;
        if (filterStatus === "unconfigured") return !status?.configured;
        return true;
      });
  }, [agents, search, filterStatus, agentLLMStatus]);

  const configuredCount = Object.values(agentLLMStatus).filter(s => s.configured).length;

  const exit = () => navigate("/sistema");

  if (!user) {
    navigate("/auth");
    return null;
  }

  if (!isAdmin) {
    return (
      <div style={{ ...LfPage, padding: 40, textAlign: "center" }}>
        <Lock size={32} style={{ color: "hsl(var(--muted-foreground))" }} />
        <h2>Acesso restrito</h2>
        <p style={{ color: "hsl(var(--muted-foreground))" }}>Apenas administradores podem acessar esta pagina.</p>
        <button type="button" onClick={exit} style={LfGhostBtn}>Voltar</button>
      </div>
    );
  }

  return (
    <div style={LfPage}>
      <header style={{
        padding: "20px 32px", borderBottom: "1px solid hsl(var(--border))",
        display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
      }}
      >
        <button type="button" onClick={exit} style={LfHeaderBackBtn} aria-label="Voltar">
          <ArrowLeft size={18} aria-hidden />
          {" "}
          Voltar
        </button>
        <Bot size={22} color="#c9a84c" />
        <div style={{ flex: "1 1 200px", minWidth: 0 }}>
          <h1 style={{ fontSize: 20, margin: 0 }}>Agentes do sistema</h1>
          <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", margin: 0 }}>
            {agents.length} agentes · {configuredCount} com IA configurada · Clique numa linha para configurar.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto", flexShrink: 0, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" onClick={() => navigate("/configuracoes/providers")} style={LfGhostBtn} title="Gestao centralizada de provedores (acessivel tambem pela aba Provedor dentro de cada agente)">
            <Server size={14} style={{ display: "inline", marginRight: 6 }} />
            Provedores
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: 32 }}>
        {!loadingProviders && configs.length === 0 && (
          <div style={{
            background: "rgba(255, 107, 107, 0.08)", border: "1px solid rgba(255, 107, 107, 0.3)",
            borderRadius: 8, padding: 14, marginBottom: 20, display: "flex", gap: 12, alignItems: "center",
          }}>
            <AlertTriangle size={20} color="#ff6b6b" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, fontSize: 13, color: "#ffb8b8" }}>
              <strong>Voce ainda nao cadastrou nenhuma chave de provedor.</strong>{" "}
              Clique num agente abaixo, va na aba <strong>Provedor</strong> e cadastre la mesmo.
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1, position: "relative" }}>
            <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "hsl(var(--muted-foreground))" }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nome ou papel..."
              style={{ ...LfInput, paddingLeft: 36 }}
            />
          </div>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as "all" | "configured" | "unconfigured")}
            style={{ ...LfInput, width: 240 }}
          >
            <option value="all">Todos ({agents.length})</option>
            <option value="configured">Apenas configurados</option>
            <option value="unconfigured">Apenas nao configurados</option>
          </select>
        </div>

        {loadingAgents ? (
          <div style={{ ...LfCard, borderRadius: 12, padding: 40, textAlign: "center", color: "hsl(var(--muted-foreground))" }}>
            Carregando agentes...
          </div>
        ) : visibleAgents.length === 0 ? (
          <div style={{ ...LfCard, borderRadius: 12, padding: 40, textAlign: "center", color: "hsl(var(--muted-foreground))" }}>
            Nenhum agente corresponde aos filtros.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {visibleAgents.map(agent => {
              const status = agentLLMStatus[agent.id];
              return (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  status={status}
                  onClick={() => navigate(`/admin/agentes/${agent.id}`)}
                />
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

/** Card clicavel de agente. Linha inteira eh um botao. */
function AgentCard({
  agent,
  status,
  onClick,
}: {
  agent: { id: string; name: string; departmentName: string; role: string; level: number; color: string };
  status?: { configured: boolean; model: string | null };
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: "100%", textAlign: "left",
        background: hover ? "hsl(var(--accent))" : "hsl(var(--card))",
        border: `1px solid ${hover ? "rgba(201, 168, 76, 0.45)" : "hsl(var(--border))"}`,
        borderRadius: 10, padding: "14px 18px",
        display: "flex", alignItems: "center", gap: 14,
        cursor: "pointer", color: "hsl(var(--foreground))",
        fontFamily: "'DM Sans', sans-serif",
        transition: "background 0.12s, border-color 0.12s",
      }}
    >
      <div style={{
        width: 38, height: 38, borderRadius: "50%",
        background: agent.color || "#252534",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#09090f", fontWeight: 700, fontSize: 13, flexShrink: 0,
      }}>
        {agent.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 3 }}>
          <strong style={{ fontSize: 14, color: "hsl(var(--foreground))" }}>{agent.name}</strong>
          <span style={{
            background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))",
            padding: "2px 8px", borderRadius: 10, fontSize: 10,
            fontFamily: "monospace",
          }}>
            N{agent.level}
          </span>
        </div>
        <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
          {agent.role}{agent.departmentName ? ` · ${agent.departmentName}` : ""}
        </div>
      </div>

      <div style={{ fontSize: 11, textAlign: "right", minWidth: 180 }}>
        {status?.configured ? (
          <span style={{ color: "#2dd4a0", display: "inline-flex", alignItems: "center", gap: 4 }}>
            <CheckCircle2 size={11} />
            <code style={{ fontFamily: "monospace", color: "#2dd4a0" }}>{status.model}</code>
          </span>
        ) : (
          <span style={{ color: "#6b6b80", fontStyle: "italic" }}>
            Sem IA configurada
          </span>
        )}
      </div>

      <ChevronRight size={16} color={hover ? "#c9a84c" : "hsl(var(--muted-foreground))"} style={{ flexShrink: 0, transition: "color 0.12s" }} />
    </button>
  );
}
