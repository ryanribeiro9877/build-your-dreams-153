import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAgents } from "@/hooks/useAgents";
import { useProviders } from "@/hooks/useProviders";
import { supabase } from "@/integrations/supabase/client";
import { HexagonLoader } from "@/components/HexagonLoader";
import { toast } from "sonner";

interface TemplateCatalogEntry {
  templateId: string;
  code: string;
  displayName: string;
  role: string;
  stage: string | null;
  area: string | null;
  defaultColor: string;
  roleName: string;
  roleCode: string;
}

async function fetchTemplateCatalog(): Promise<TemplateCatalogEntry[]> {
  const { data, error } = await supabase
    .from("agent_templates" as any)
    .select("id, code, display_name, role, stage, area, default_color, sort_order")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw new Error(error.message);

  const templates = (data || []) as any[];
  const templateIds = templates.map((t: any) => t.id);

  const { data: matrixData } = await supabase
    .from("role_agent_matrix" as any)
    .select("agent_template_id, role_template_id")
    .in("agent_template_id", templateIds);

  const roleTemplateIds = [...new Set((matrixData || []).map((m: any) => m.role_template_id))];
  const { data: roleData } = await supabase
    .from("role_templates" as any)
    .select("id, code, display_name, sort_order")
    .in("id", roleTemplateIds)
    .order("sort_order");

  const roleMap: Record<string, { code: string; displayName: string; sortOrder: number }> = {};
  for (const r of (roleData || []) as any[]) {
    roleMap[r.id] = { code: r.code, displayName: r.display_name, sortOrder: r.sort_order };
  }

  const entries: TemplateCatalogEntry[] = [];
  for (const m of (matrixData || []) as any[]) {
    const t = templates.find((tt: any) => tt.id === m.agent_template_id);
    const role = roleMap[m.role_template_id];
    if (!t || !role) continue;
    entries.push({
      templateId: t.id,
      code: t.code,
      displayName: t.display_name,
      role: t.role,
      stage: t.stage,
      area: t.area,
      defaultColor: t.default_color || "#c9a84c",
      roleName: role.displayName,
      roleCode: role.code,
    });
  }

  entries.sort((a, b) => {
    const ra = roleMap[Object.keys(roleMap).find(k => roleMap[k].code === a.roleCode)!]?.sortOrder ?? 99;
    const rb = roleMap[Object.keys(roleMap).find(k => roleMap[k].code === b.roleCode)!]?.sortOrder ?? 99;
    if (ra !== rb) return ra - rb;
    return a.displayName.localeCompare(b.displayName, "pt-BR");
  });

  return entries;
}

export default function AgentsAdmin() {
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  const { agents, loading: loadingAgents } = useAgents();
  const { configs, loading: loadingProviders } = useProviders();

  const [catalog, setCatalog] = useState<TemplateCatalogEntry[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [agentLLMStatus, setAgentLLMStatus] = useState<
    Record<string, { configured: boolean; model: string | null; provider: string | null }>
  >({});

  const isAdmin = hasRole("admin") || hasRole("tech");

  useEffect(() => {
    if (!isAdmin) return;
    fetchTemplateCatalog()
      .then(setCatalog)
      .catch(() => setCatalog([]))
      .finally(() => setLoadingCatalog(false));
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin || agents.length === 0) return;
    const agentIds = agents.map((a) => a.id);
    (async () => {
      const { data } = await supabase
        .from("agents")
        .select("id, provider, model, source_template_id")
        .in("id", agentIds);
      if (data) {
        const map: Record<string, { configured: boolean; model: string | null; provider: string | null }> = {};
        for (const row of data as unknown as { id: string; provider: string | null; model: string | null; source_template_id: string | null }[]) {
          map[row.id] = {
            configured: !!(row.provider && row.model),
            model: row.model,
            provider: row.provider,
          };
        }
        setAgentLLMStatus(map);
      }
    })();
  }, [isAdmin, agents]);

  const agentByTemplate = useMemo(() => {
    const map: Record<string, typeof agents[0]> = {};
    for (const a of agents) {
      const key = a.name;
      if (!map[key]) map[key] = a;
    }
    return map;
  }, [agents]);

  const roleNames = useMemo(() => {
    const set = new Set<string>();
    for (const c of catalog) set.add(c.roleName);
    return Array.from(set);
  }, [catalog]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.filter((c) => {
      if (q && !c.displayName.toLowerCase().includes(q) && !c.role.toLowerCase().includes(q) && !c.roleName.toLowerCase().includes(q)) return false;
      if (filterRole !== "all" && c.roleName !== filterRole) return false;
      return true;
    });
  }, [catalog, search, filterRole]);

  const instancedCount = agents.length;
  const configuredCount = Object.values(agentLLMStatus).filter((s) => s.configured).length;

  const exit = () => navigate("/sistema");

  if (!user) { navigate("/auth"); return null; }

  if (!isAdmin) {
    return (
      <div className="lf-modern lf-page">
        <div className="lf-container" style={{ textAlign: "center", paddingTop: 64 }}>
          <div className="lf-panel" style={{ maxWidth: 420, margin: "0 auto" }}>
            <h2 style={{ margin: "0 0 6px", fontSize: 18 }}>Acesso restrito</h2>
            <p className="lf-panel__hint" style={{ marginBottom: 18 }}>
              Apenas administradores podem acessar esta pagina.
            </p>
            <button type="button" onClick={exit} className="lf-btn lf-btn--ghost">Voltar ao sistema</button>
          </div>
        </div>
      </div>
    );
  }

  const loading = loadingAgents || loadingCatalog;

  return (
    <div className="lf-modern lf-page">
      <header className="lf-header">
        <button type="button" onClick={exit} className="lf-btn lf-btn--ghost btn-voltar" aria-label="Voltar ao sistema">
          ← Voltar
        </button>
        <div style={{ flex: "1 1 200px", minWidth: 0 }}>
          <h1>Agentes do sistema</h1>
          <p className="lf-header__subtitle">
            {catalog.length} agentes definidos · {instancedCount} instanciados · {configuredCount} com IA configurada
          </p>
        </div>
        <div className="lf-row" style={{ marginLeft: "auto" }}>
          <button
            type="button"
            onClick={() => navigate("/configuracoes/providers")}
            className="lf-btn lf-btn--ghost"
          >
            Provedores
          </button>
        </div>
      </header>

      <main className="lf-container">
        {/* KPIs */}
        <section className="lf-stats">
          <div className="lf-stat">
            <div className="lf-stat__label">Total definido</div>
            <div className="lf-stat__value">{catalog.length}</div>
            <div className="lf-stat__hint">Templates por papel</div>
          </div>
          <div className="lf-stat lf-stat--gold">
            <div className="lf-stat__label">Instanciados</div>
            <div className="lf-stat__value">{instancedCount}</div>
            <div className="lf-stat__hint">Criados para usuarios</div>
          </div>
          <div className="lf-stat lf-stat--success">
            <div className="lf-stat__label">Configurados</div>
            <div className="lf-stat__value">{configuredCount}</div>
            <div className="lf-stat__hint">Com provedor + modelo</div>
          </div>
          <div className="lf-stat lf-stat--warn">
            <div className="lf-stat__label">Papeis</div>
            <div className="lf-stat__value">{roleNames.length}</div>
            <div className="lf-stat__hint">Cargos com agentes</div>
          </div>
        </section>

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
              placeholder="Buscar por nome, papel ou cargo..."
            />
          </div>
          <select
            className="lf-select"
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            style={{ minWidth: 220 }}
          >
            <option value="all">Todos os cargos ({catalog.length})</option>
            {roleNames.map((r) => (
              <option key={r} value={r}>
                {r} ({catalog.filter((c) => c.roleName === r).length})
              </option>
            ))}
          </select>
        </section>

        {/* Lista */}
        {loading ? (
          <HexagonLoader variant="inline" label="Carregando agentes..." />
        ) : visible.length === 0 ? (
          <div className="lf-empty">
            Nenhum agente corresponde aos filtros.<br />
            Tente limpar a busca ou trocar o cargo.
          </div>
        ) : (
          <>
            <p className="lf-header__subtitle" style={{ margin: "0 0 10px" }}>
              Exibindo {visible.length} de {catalog.length} agentes
            </p>
            <div className="lf-grid lf-stagger">
              {visible.map((entry, idx) => {
                const matchedAgent = agentByTemplate[entry.displayName];
                const status = matchedAgent ? agentLLMStatus[matchedAgent.id] : undefined;
                const hasInstance = !!matchedAgent;

                return (
                  <TemplateCard
                    key={`${entry.code}-${entry.roleCode}-${idx}`}
                    entry={entry}
                    hasInstance={hasInstance}
                    status={status}
                    onClick={hasInstance ? () => navigate(`/admin/agentes/${matchedAgent.id}`) : undefined}
                  />
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function TemplateCard({
  entry,
  hasInstance,
  status,
  onClick,
}: {
  entry: TemplateCatalogEntry;
  hasInstance: boolean;
  status?: { configured: boolean; model: string | null; provider: string | null };
  onClick?: () => void;
}) {
  const initials = entry.displayName
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className="lf-card"
      style={{ position: "relative", opacity: hasInstance ? 1 : 0.65 }}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        style={{ all: "unset", cursor: onClick ? "pointer" : "default", display: "contents" }}
        aria-label={`${entry.displayName} — ${entry.roleName}`}
      >
        <div className="lf-card__head">
          <div
            className="lf-avatar"
            style={{ background: entry.defaultColor }}
            aria-hidden
          >
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 className="lf-card__title">{entry.displayName}</h3>
            <p className="lf-card__subtitle">
              {entry.role} · {entry.roleName}
            </p>
          </div>
        </div>

        <div className="lf-card__meta">
          {hasInstance ? (
            status?.configured ? (
              <span className="lf-badge lf-badge--success">
                <span className="lf-dot lf-dot--success" />
                {status.model}
              </span>
            ) : (
              <span className="lf-badge lf-badge--warn">
                <span className="lf-dot lf-dot--warn" />
                Sem IA
              </span>
            )
          ) : (
            <span className="lf-badge" style={{ background: "rgba(156,163,175,0.15)", color: "#9ca3af" }}>
              Aguardando usuario
            </span>
          )}
          <span className="lf-spacer" />
          {hasInstance && (
            <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>Configurar →</span>
          )}
        </div>
      </button>
    </div>
  );
}
