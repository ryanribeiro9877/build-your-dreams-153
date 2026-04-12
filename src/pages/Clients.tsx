import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const DOCUMENT_TYPES = [
  { value: "rg", label: "RG" },
  { value: "cpf", label: "CPF" },
  { value: "comprovante_residencia", label: "Comprovante de Residência" },
  { value: "extrato_conta", label: "Extrato de Conta" },
  { value: "extrato_inss", label: "Extrato INSS" },
  { value: "cnis", label: "CNIS" },
  { value: "procuracao", label: "Procuração" },
  { value: "contrato", label: "Contrato" },
  { value: "certidao", label: "Certidão" },
  { value: "outro", label: "Outro" },
];

const STATES = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

interface Client {
  id: string;
  full_name: string;
  cpf: string | null;
  rg: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  notes: string | null;
  status: string;
  created_at: string;
}

interface ClientDocument {
  id: string;
  document_type: string;
  document_name: string;
  file_path: string;
  file_size: number | null;
  notes: string | null;
  created_at: string;
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 8,
  background: "var(--bg3)", border: "1px solid var(--border)", color: "var(--text1)",
  fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 10, color: "var(--text3)", marginBottom: 4,
  textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600,
};

export default function Clients() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [docName, setDocName] = useState("");
  const [docType, setDocType] = useState("outro");
  const [docNotes, setDocNotes] = useState("");
  const [search, setSearch] = useState("");

  // Form fields
  const [form, setForm] = useState({
    full_name: "", cpf: "", rg: "", email: "", phone: "",
    address: "", city: "", state: "BA", zip_code: "", notes: "",
  });

  useEffect(() => { fetchClients(); }, []);

  async function fetchClients() {
    setLoading(true);
    const { data, error } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
    if (error) toast.error("Erro ao carregar clientes");
    else setClients(data || []);
    setLoading(false);
  }

  async function fetchDocuments(clientId: string) {
    const { data, error } = await supabase.from("client_documents").select("*").eq("client_id", clientId).order("created_at", { ascending: false });
    if (error) toast.error("Erro ao carregar documentos");
    else setDocuments(data || []);
  }

  async function handleCreateClient(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from("clients").insert({
      ...form, created_by: user.id,
    });
    if (error) { toast.error("Erro ao criar cliente: " + error.message); return; }
    toast.success("Cliente cadastrado com sucesso!");
    setForm({ full_name: "", cpf: "", rg: "", email: "", phone: "", address: "", city: "", state: "BA", zip_code: "", notes: "" });
    setShowForm(false);
    fetchClients();
  }

  async function handleUploadDoc(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length || !selectedClient || !user) return;
    setUploading(true);
    const file = e.target.files[0];
    const filePath = `${selectedClient.id}/${Date.now()}_${file.name}`;

    const { error: uploadErr } = await supabase.storage.from("client-documents").upload(filePath, file);
    if (uploadErr) { toast.error("Erro no upload: " + uploadErr.message); setUploading(false); return; }

    const { error: dbErr } = await supabase.from("client_documents").insert({
      client_id: selectedClient.id,
      document_type: docType,
      document_name: docName || file.name,
      file_path: filePath,
      file_size: file.size,
      mime_type: file.type,
      notes: docNotes || null,
      uploaded_by: user.id,
    });
    if (dbErr) { toast.error("Erro ao salvar documento: " + dbErr.message); setUploading(false); return; }

    toast.success("Documento anexado!");
    setDocName(""); setDocType("outro"); setDocNotes("");
    fetchDocuments(selectedClient.id);
    setUploading(false);
    e.target.value = "";
  }

  async function handleDeleteDoc(doc: ClientDocument) {
    await supabase.storage.from("client-documents").remove([doc.file_path]);
    const { error } = await supabase.from("client_documents").delete().eq("id", doc.id);
    if (error) { toast.error("Erro ao excluir"); return; }
    toast.success("Documento removido");
    if (selectedClient) fetchDocuments(selectedClient.id);
  }

  const filtered = clients.filter(c =>
    c.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (c.cpf && c.cpf.includes(search)) ||
    (c.email && c.email.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg)", color: "var(--text1)",
      fontFamily: "'DM Sans', sans-serif", padding: 20,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <button onClick={() => navigate("/")} style={{
          padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)",
          background: "var(--bg2)", color: "var(--text2)", cursor: "pointer", fontSize: 13,
          fontFamily: "'DM Sans', sans-serif",
        }}>← Voltar</button>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 600, color: "var(--gold, #c9a84c)", margin: 0 }}>
          Gestão de Clientes
        </h1>
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowForm(!showForm)} style={{
          padding: "10px 20px", borderRadius: 8, border: "none", cursor: "pointer",
          background: "linear-gradient(135deg, #c9a84c, #e8c96a)", color: "#0a0a12",
          fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
        }}>
          {showForm ? "✕ Fechar" : "+ Novo Cliente"}
        </button>
      </div>

      {/* New Client Form */}
      {showForm && (
        <form onSubmit={handleCreateClient} style={{
          background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12,
          padding: 24, marginBottom: 20,
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text1)", marginBottom: 16 }}>Cadastrar Novo Cliente</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            <div><label style={labelStyle}>Nome Completo *</label><input required style={inputStyle} value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} /></div>
            <div><label style={labelStyle}>CPF</label><input style={inputStyle} value={form.cpf} onChange={e => setForm({...form, cpf: e.target.value})} placeholder="000.000.000-00" /></div>
            <div><label style={labelStyle}>RG</label><input style={inputStyle} value={form.rg} onChange={e => setForm({...form, rg: e.target.value})} /></div>
            <div><label style={labelStyle}>Email</label><input type="email" style={inputStyle} value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></div>
            <div><label style={labelStyle}>Telefone</label><input style={inputStyle} value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="(71) 99999-9999" /></div>
            <div><label style={labelStyle}>Endereço</label><input style={inputStyle} value={form.address} onChange={e => setForm({...form, address: e.target.value})} /></div>
            <div><label style={labelStyle}>Cidade</label><input style={inputStyle} value={form.city} onChange={e => setForm({...form, city: e.target.value})} /></div>
            <div>
              <label style={labelStyle}>Estado</label>
              <select style={inputStyle} value={form.state} onChange={e => setForm({...form, state: e.target.value})}>
                {STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div><label style={labelStyle}>CEP</label><input style={inputStyle} value={form.zip_code} onChange={e => setForm({...form, zip_code: e.target.value})} /></div>
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>Observações</label>
            <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
          </div>
          <button type="submit" style={{
            marginTop: 16, padding: "10px 24px", borderRadius: 8, border: "none", cursor: "pointer",
            background: "linear-gradient(135deg, #c9a84c, #e8c96a)", color: "#0a0a12",
            fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
          }}>Cadastrar Cliente</button>
        </form>
      )}

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input
          style={{ ...inputStyle, maxWidth: 400 }}
          placeholder="🔍 Buscar por nome, CPF ou email..."
          value={search} onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        {/* Client list */}
        <div style={{ flex: "1 1 350px", minWidth: 300 }}>
          <div style={{ fontSize: 10, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
            {filtered.length} clientes
          </div>
          {loading ? <div style={{ color: "var(--text3)" }}>Carregando...</div> :
            filtered.map(client => (
              <div
                key={client.id}
                onClick={() => { setSelectedClient(client); fetchDocuments(client.id); }}
                style={{
                  padding: 14, borderRadius: 10, marginBottom: 8, cursor: "pointer",
                  background: selectedClient?.id === client.id ? "rgba(201,168,76,0.08)" : "var(--bg2)",
                  border: selectedClient?.id === client.id ? "1px solid rgba(201,168,76,0.3)" : "1px solid var(--border)",
                  transition: "all 0.2s",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text1)", marginBottom: 4 }}>{client.full_name}</div>
                <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--text3)" }}>
                  {client.cpf && <span>CPF: {client.cpf}</span>}
                  {client.phone && <span>📞 {client.phone}</span>}
                  <span style={{
                    padding: "1px 8px", borderRadius: 4, fontSize: 9, textTransform: "uppercase",
                    background: client.status === "ativo" ? "rgba(45,212,160,0.15)" : "rgba(239,68,68,0.15)",
                    color: client.status === "ativo" ? "#2dd4a0" : "#ef4444",
                  }}>{client.status}</span>
                </div>
              </div>
            ))
          }
        </div>

        {/* Client Detail + Documents */}
        {selectedClient && (
          <div style={{ flex: "1 1 400px", minWidth: 350 }}>
            <div style={{
              background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12,
              padding: 20, marginBottom: 16,
            }}>
              <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text1)", marginBottom: 12, fontFamily: "'Cormorant Garamond', serif" }}>
                {selectedClient.full_name}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
                {selectedClient.cpf && <div><span style={{ color: "var(--text3)" }}>CPF:</span> <span style={{ color: "var(--text1)" }}>{selectedClient.cpf}</span></div>}
                {selectedClient.rg && <div><span style={{ color: "var(--text3)" }}>RG:</span> <span style={{ color: "var(--text1)" }}>{selectedClient.rg}</span></div>}
                {selectedClient.email && <div><span style={{ color: "var(--text3)" }}>Email:</span> <span style={{ color: "var(--text1)" }}>{selectedClient.email}</span></div>}
                {selectedClient.phone && <div><span style={{ color: "var(--text3)" }}>Tel:</span> <span style={{ color: "var(--text1)" }}>{selectedClient.phone}</span></div>}
                {selectedClient.address && <div style={{ gridColumn: "1/-1" }}><span style={{ color: "var(--text3)" }}>Endereço:</span> <span style={{ color: "var(--text1)" }}>{selectedClient.address}, {selectedClient.city}/{selectedClient.state} - {selectedClient.zip_code}</span></div>}
              </div>
            </div>

            {/* Upload Document */}
            <div style={{
              background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12,
              padding: 20, marginBottom: 16,
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text1)", marginBottom: 12 }}>📎 Anexar Documento</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={labelStyle}>Tipo do Documento</label>
                  <select style={inputStyle} value={docType} onChange={e => setDocType(e.target.value)}>
                    {DOCUMENT_TYPES.map(dt => <option key={dt.value} value={dt.value}>{dt.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Nome do Documento</label>
                  <input style={inputStyle} value={docName} onChange={e => setDocName(e.target.value)} placeholder="Ex: RG Frente" />
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Observações</label>
                <input style={inputStyle} value={docNotes} onChange={e => setDocNotes(e.target.value)} placeholder="Notas sobre o documento" />
              </div>
              <label style={{
                display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 20px",
                borderRadius: 8, cursor: uploading ? "wait" : "pointer",
                background: "linear-gradient(135deg, #4f8ef7, #60a5fa)", color: "#fff",
                fontSize: 13, fontWeight: 500, fontFamily: "'DM Sans', sans-serif",
                opacity: uploading ? 0.6 : 1,
              }}>
                {uploading ? "Enviando..." : "⬆ Selecionar Arquivo"}
                <input type="file" hidden onChange={handleUploadDoc} disabled={uploading} accept="image/*,.pdf,.doc,.docx" />
              </label>
            </div>

            {/* Documents list */}
            <div style={{
              background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12,
              padding: 20,
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text1)", marginBottom: 12 }}>
                📄 Documentos ({documents.length})
              </div>
              {documents.length === 0 ? (
                <div style={{ color: "var(--text3)", fontSize: 12, padding: 12, textAlign: "center" }}>Nenhum documento anexado</div>
              ) : (
                documents.map(doc => {
                  const typeLabel = DOCUMENT_TYPES.find(dt => dt.value === doc.document_type)?.label || doc.document_type;
                  return (
                    <div key={doc.id} style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
                      background: "var(--bg3)", borderRadius: 8, marginBottom: 6,
                      border: "1px solid var(--border)",
                    }}>
                      <div style={{ fontSize: 20 }}>📄</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {doc.document_name}
                        </div>
                        <div style={{ fontSize: 10, color: "var(--text3)" }}>
                          {typeLabel} · {doc.file_size ? `${(doc.file_size / 1024).toFixed(0)} KB` : ""} · {new Date(doc.created_at).toLocaleDateString("pt-BR")}
                        </div>
                        {doc.notes && <div style={{ fontSize: 10, color: "var(--text2)", marginTop: 2 }}>{doc.notes}</div>}
                      </div>
                      <button onClick={() => handleDeleteDoc(doc)} style={{
                        padding: "4px 8px", borderRadius: 4, border: "1px solid rgba(239,68,68,0.3)",
                        background: "rgba(239,68,68,0.1)", color: "#ef4444", cursor: "pointer",
                        fontSize: 10, fontFamily: "'DM Sans', sans-serif",
                      }}>✕</button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
