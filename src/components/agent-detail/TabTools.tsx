import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { HexagonLoader } from "@/components/HexagonLoader";

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

export function TabTools({ agentId }: { agentId: string }) {
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
