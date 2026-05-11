import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAgents } from "@/hooks/useAgents";
import { useProviders } from "@/hooks/useProviders";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Bot, Search, ChevronRight, CheckCircle2, AlertTriangle, Lock, Server } from "lucide-react";

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

  if (!user) { navigate("/auth"); return null; }

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

  const buttonGhost: React.CSSProperties = {
    padding: "8px 14px", borderRadius: 8, border: "1px solid #252534",
    background: "transparent", color: "#9898b0", cursor: "pointer",
    fontFamily: "'DM Sans', sans-serif", fontSize: 13,
  };
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 14px", borderRadius: 8,
    background: "#16161f", border: "1px solid #252534", color: "#eeeef5",
    fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box",
  };

  if (!isAdmin) {
    return (
      <div style={{ minHeight: "100vh", background: "#09090f", color: "#eeeef5", padding: 40, textAlign: "center", fontFamily: "'DM Sans', sans-serif" }}>
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
          <h1 style={{ fontSize: 20, margin: 0 }}>Agentes do sistema</h1>
          <p style={{ fontSize: 12, color: "#9898b0", margin: 0 }}>
            {agents.length} agentes · {configuredCount} com IA configurada · Clique numa linha para configurar.
          </p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={() => navigate("/configuracoes/providers")} style={buttonGhost} title="Gestao centralizada de provedores (acessivel tambem pela aba Provedor dentro de cada agente)">
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
            <Search size={16} color="#9898b0" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nome ou papel..."
              style={{ ...inputStyle, paddingLeft: 36 }}
            />
          </div>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as "all" | "configured" | "unconfigured")}
            style={{ ...inputStyle, width: 240 }}
          >
            <option value="all">Todos ({agents.length})</option>
            <option value="configured">Apenas configurados</option>
            <option value="unconfigured">Apenas nao configurados</option>
          </select>
        </div>

        {loadingAgents ? (
          <div style={{ background: "#0d0d14", border: "1px solid #252534", borderRadius: 12, padding: 40, textAlign: "center", color: "#9898b0" }}>
            Carregando agentes...
          </div>
        ) : visibleAgents.length === 0 ? (
          <div style={{ background: "#0d0d14", border: "1px solid #252534", borderRadius: 12, padding: 40, textAlign: "center", color: "#9898b0" }}>
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
        background: hover ? "#11111a" : "#0d0d14",
        border: `1px solid ${hover ? "rgba(201, 168, 76, 0.35)" : "#252534"}`,
        borderRadius: 10, padding: "14px 18px",
        display: "flex", alignItems: "center", gap: 14,
        cursor: "pointer", color: "#eeeef5",
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
          <strong style={{ fontSize: 14, color: "#eeeef5" }}>{agent.name}</strong>
          <span style={{
            background: "#16161f", color: "#9898b0",
            padding: "2px 8px", borderRadius: 10, fontSize: 10,
            fontFamily: "monospace",
          }}>
            N{agent.level}
          </span>
        </div>
        <div style={{ fontSize: 11, color: "#9898b0" }}>
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

      <ChevronRight size={16} color={hover ? "#c9a84c" : "#6b6b80"} style={{ flexShrink: 0, transition: "color 0.12s" }} />
    </button>
  );
}
