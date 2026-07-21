import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { HexagonLoader } from "@/components/HexagonLoader";

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

export function TabMCP({ agentId }: { agentId: string }) {
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
