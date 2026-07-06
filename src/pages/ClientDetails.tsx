import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMyWorkspace } from "@/hooks/useMyWorkspace";
import { toast } from "sonner";
import { HexagonLoader } from "@/components/HexagonLoader";

const DOCUMENT_TYPES: Record<string, string> = {
  rg: "RG", cpf: "CPF", comprovante_residencia: "Comprovante de Residência",
  extrato_conta: "Extrato de Conta", extrato_inss: "Extrato INSS", cnis: "CNIS",
  procuracao: "Procuração", contrato: "Contrato", certidao: "Certidão", outro: "Outro",
};

const PRIORITY_COLORS: Record<string, { bg: string; color: string }> = {
  critical: { bg: "rgba(239,68,68,0.15)", color: "#ef4444" },
  high: { bg: "rgba(251,146,60,0.15)", color: "#fb923c" },
  medium: { bg: "rgba(59,130,246,0.15)", color: "#3b82f6" },
  low: { bg: "rgba(107,114,128,0.15)", color: "#6b7280" },
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending: { bg: "rgba(251,191,36,0.15)", color: "#fbbf24" },
  in_progress: { bg: "rgba(59,130,246,0.15)", color: "#3b82f6" },
  review: { bg: "rgba(168,85,247,0.15)", color: "#a855f7" },
  completed: { bg: "rgba(45,212,160,0.15)", color: "#2dd4a0" },
  approved: { bg: "rgba(34,197,94,0.15)", color: "#22c55e" },
  rejected: { bg: "rgba(239,68,68,0.15)", color: "#ef4444" },
  cancelled: { bg: "rgba(107,114,128,0.15)", color: "#6b7280" },
};

// Projeção explícita (minimização de PII — R-2 Fase 1): só os campos que o
// detalhe renderiza. Sem dados bancários/PIX, filiação ou demais colunas.
const CLIENT_DETAIL_COLUMNS =
  "id, full_name, cpf, rg, email, phone, address, city, state, zip_code, notes, status, created_at";

interface Client {
  id: string; full_name: string; cpf: string | null; rg: string | null;
  email: string | null; phone: string | null; address: string | null;
  city: string | null; state: string | null; zip_code: string | null;
  notes: string | null; status: string; created_at: string;
}

interface ClientTaskRow {
  id: string;
  title?: string;
  description?: string | null;
  agent_name?: string | null;
  due_date?: string | null;
  priority?: string;
  status?: string;
}

interface ClientProcessRow {
  id: string;
  process_number?: string | null;
  description?: string | null;
  responsible_lawyer?: string | null;
  next_hearing_date?: string | null;
  status?: string;
}

interface ClientDocumentRow {
  id: string;
  document_name?: string | null;
  document_type?: string;
  created_at: string;
  file_size?: number | null;
  notes?: string | null;
}

const sectionStyle: React.CSSProperties = {
  background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12,
  padding: 20, marginBottom: 16,
};
const badgeStyle = (bg: string, color: string): React.CSSProperties => ({
  padding: "2px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600,
  background: bg, color, textTransform: "uppercase", letterSpacing: "0.04em",
});

const ALLOWED_ROLES = ["socio", "lider_recepcao", "recepcionista"];

export default function ClientDetails() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { workspace } = useMyWorkspace();
  const navigate = useNavigate();
  const hasAccess = ALLOWED_ROLES.includes(workspace?.role_template?.code ?? "");
  const [client, setClient] = useState<Client | null>(null);
  const [tasks, setTasks] = useState<ClientTaskRow[]>([]);
  const [processes, setProcesses] = useState<ClientProcessRow[]>([]);
  const [documents, setDocuments] = useState<ClientDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"tasks" | "processes" | "documents">("tasks");

  const loadAll = useCallback(async (clientId: string) => {
    setLoading(true);
    const [clientRes, docsRes] = await Promise.all([
      supabase.from("clients").select(CLIENT_DETAIL_COLUMNS).eq("id", clientId).single(),
      supabase.from("client_documents").select("*").eq("client_id", clientId).order("created_at", { ascending: false }),
    ]);
    if (clientRes.error) { toast.error("Cliente não encontrado"); navigate("/clientes"); return; }
    setClient(clientRes.data);
    setDocuments((docsRes.data as ClientDocumentRow[]) || []);

    // Fetch tasks and processes by client name
    const name = clientRes.data.full_name;
    const [tasksRes, procRes] = await Promise.all([
      supabase.from("agent_tasks").select("*").eq("client_name", name).order("created_at", { ascending: false }),
      supabase.from("processes").select("*").eq("client_name", name).order("created_at", { ascending: false }),
    ]);
    setTasks((tasksRes.data as ClientTaskRow[]) || []);
    setProcesses((procRes.data as ClientProcessRow[]) || []);
    setLoading(false);
  }, [navigate]);

  useEffect(() => {
    if (id) void loadAll(id);
  }, [id, loadAll]);

  if (loading) return <HexagonLoader variant="fullscreen" label="Carregando detalhes..." />;

  if (!client) return null;

  if (workspace && !hasAccess) {
    return (
      <div style={{
        minHeight: "100vh", background: "var(--bg)", color: "var(--text1)",
        fontFamily: "'Roboto', sans-serif", padding: 40,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16,
      }}>
        <div style={{ fontSize: 48 }}>🔒</div>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: "var(--gold, #c9a84c)" }}>Acesso restrito</h1>
        <p style={{ color: "var(--text3)", fontSize: 13, textAlign: "center", maxWidth: 400 }}>
          A gestão de clientes é exclusiva da <strong>Recepção</strong>.
        </p>
        <button className="btn-voltar" onClick={() => navigate("/sistema")} style={{
          padding: "10px 20px", borderRadius: 8, border: "1px solid var(--border)",
          background: "var(--bg2)", color: "var(--text2)", cursor: "pointer", fontSize: 13,
        }}>← Voltar ao Sistema</button>
      </div>
    );
  }

  const tabs = [
    { key: "tasks" as const, label: "Tarefas", count: tasks.length, icon: "" },
    { key: "processes" as const, label: "Processos", count: processes.length, icon: "️" },
    { key: "documents" as const, label: "Documentos", count: documents.length, icon: "" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text1)", fontFamily: "'DM Sans', sans-serif", padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate("/clientes")} style={{
          padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)",
          background: "var(--bg2)", color: "var(--text2)", cursor: "pointer", fontSize: 13,
          fontFamily: "'DM Sans', sans-serif",
        }}>← Clientes</button>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 600, color: "var(--gold, #c9a84c)", margin: 0 }}>
          {client.full_name}
        </h1>
        <span style={badgeStyle(
          client.status === "ativo" ? "rgba(45,212,160,0.15)" : client.status === "em_analise" ? "rgba(251,191,36,0.15)" : "rgba(239,68,68,0.15)",
          client.status === "ativo" ? "#2dd4a0" : client.status === "em_analise" ? "#fbbf24" : "#ef4444"
        )}>{client.status}</span>
      </div>

      {/* Client Info Card */}
      <div style={sectionStyle}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text1)", marginBottom: 14 }}>Dados do Cliente</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12, fontSize: 13 }}>
          {client.cpf && <InfoField label="CPF" value={client.cpf} />}
          {client.rg && <InfoField label="RG" value={client.rg} />}
          {client.email && <InfoField label="Email" value={client.email} />}
          {client.phone && <InfoField label="Telefone" value={client.phone} />}
          {client.address && <InfoField label="Endereço" value={client.address} />}
          {client.city && <InfoField label="Cidade" value={`${client.city}/${client.state}`} />}
          {client.zip_code && <InfoField label="CEP" value={client.zip_code} />}
          <InfoField label="Cadastrado em" value={new Date(client.created_at).toLocaleDateString("pt-BR")} />
        </div>
        {client.notes && (
          <div style={{ marginTop: 12, padding: 10, background: "var(--bg)", borderRadius: 8, fontSize: 12, color: "var(--text2)" }}>
            <span style={{ fontSize: 10, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Observações:</span>
            <div style={{ marginTop: 4 }}>{client.notes}</div>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
        {tabs.map(t => (
          <div key={t.key} onClick={() => setActiveTab(t.key)} style={{
            ...sectionStyle, marginBottom: 0, cursor: "pointer", textAlign: "center",
            border: activeTab === t.key ? "1px solid rgba(201,168,76,0.4)" : "1px solid var(--border)",
            background: activeTab === t.key ? "rgba(201,168,76,0.06)" : "var(--bg2)",
            transition: "all 0.2s",
          }}>
            <div style={{ fontSize: 28 }}>{t.icon}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text1)" }}>{t.count}</div>
            <div style={{ fontSize: 11, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs Content */}
      <div style={sectionStyle}>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
              padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
              background: activeTab === t.key ? "linear-gradient(135deg, #c9a84c, #e8c96a)" : "var(--bg)",
              color: activeTab === t.key ? "#0a0a12" : "var(--text2)",
              fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s",
            }}>
              {t.icon} {t.label} ({t.count})
            </button>
          ))}
        </div>

        {activeTab === "tasks" && (
          <div>
            {tasks.length === 0 ? (
              <div style={{ color: "var(--text3)", fontSize: 13, textAlign: "center", padding: 30 }}>Nenhuma tarefa encontrada para este cliente.</div>
            ) : tasks.map(task => (
              <div key={task.id} style={{
                padding: 14, borderRadius: 10, marginBottom: 8,
                background: "var(--bg)", border: "1px solid var(--border)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text1)", marginBottom: 4 }}>{task.title}</div>
                    {task.description && <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 6 }}>{task.description}</div>}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      {task.agent_name && <span style={{ fontSize: 10, color: "var(--text3)" }}> {task.agent_name}</span>}
                      {task.due_date && (
                        <span style={{ fontSize: 10, color: new Date(task.due_date) < new Date() ? "#ef4444" : "var(--text3)" }}>
                           {new Date(task.due_date).toLocaleDateString("pt-BR")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <span style={badgeStyle(
                      PRIORITY_COLORS[task.priority]?.bg || "rgba(107,114,128,0.15)",
                      PRIORITY_COLORS[task.priority]?.color || "#6b7280"
                    )}>{task.priority}</span>
                    <span style={badgeStyle(
                      STATUS_COLORS[task.status]?.bg || "rgba(107,114,128,0.15)",
                      STATUS_COLORS[task.status]?.color || "#6b7280"
                    )}>{task.status}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "processes" && (
          <div>
            {processes.length === 0 ? (
              <div style={{ color: "var(--text3)", fontSize: 13, textAlign: "center", padding: 30 }}>Nenhum processo encontrado para este cliente.</div>
            ) : processes.map(proc => (
              <div key={proc.id} style={{
                padding: 14, borderRadius: 10, marginBottom: 8,
                background: "var(--bg)", border: "1px solid var(--border)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text1)", marginBottom: 4 }}>
                      {proc.process_number}
                    </div>
                    {proc.description && <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 6 }}>{proc.description}</div>}
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 10, color: "var(--text3)" }}>
                      {proc.responsible_lawyer && <span>‍️ {proc.responsible_lawyer}</span>}
                      {proc.next_hearing_date && (
                        <span style={{ color: new Date(proc.next_hearing_date) < new Date() ? "#ef4444" : "var(--text3)" }}>
                           Audiência: {new Date(proc.next_hearing_date).toLocaleDateString("pt-BR")}
                        </span>
                      )}
                    </div>
                  </div>
                  <span style={badgeStyle(
                    proc.status === "ativo" ? "rgba(45,212,160,0.15)" : proc.status === "em_recurso" ? "rgba(168,85,247,0.15)" : proc.status === "arquivado" ? "rgba(107,114,128,0.15)" : "rgba(251,191,36,0.15)",
                    proc.status === "ativo" ? "#2dd4a0" : proc.status === "em_recurso" ? "#a855f7" : proc.status === "arquivado" ? "#6b7280" : "#fbbf24"
                  )}>{proc.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "documents" && (
          <div>
            {documents.length === 0 ? (
              <div style={{ color: "var(--text3)", fontSize: 13, textAlign: "center", padding: 30 }}>Nenhum documento encontrado para este cliente.</div>
            ) : documents.map(doc => (
              <div key={doc.id} style={{
                padding: 14, borderRadius: 10, marginBottom: 8,
                background: "var(--bg)", border: "1px solid var(--border)",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text1)", marginBottom: 2 }}>{doc.document_name}</div>
                  <div style={{ fontSize: 10, color: "var(--text3)" }}>
                    {DOCUMENT_TYPES[doc.document_type] || doc.document_type} • {new Date(doc.created_at).toLocaleDateString("pt-BR")}
                    {doc.file_size && ` • ${(doc.file_size / 1024).toFixed(0)} KB`}
                  </div>
                  {doc.notes && <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 2 }}>{doc.notes}</div>}
                </div>
                <span style={badgeStyle("rgba(59,130,246,0.15)", "#3b82f6")}> {DOCUMENT_TYPES[doc.document_type] || "Outro"}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span style={{ fontSize: 10, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
      <div style={{ color: "var(--text1)", fontWeight: 500 }}>{value}</div>
    </div>
  );
}
