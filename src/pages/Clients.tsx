import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMyWorkspace } from "@/hooks/useMyWorkspace";
import { toast } from "sonner";
import { HexagonLoader } from "@/components/HexagonLoader";
import { useNavigate } from "react-router-dom";

const DOCUMENT_TYPES = [
  { value: "rg", label: "RG" },
  { value: "comprovante_residencia", label: "Comprovante de Residência" },
  { value: "extrato_conta", label: "Extrato Bancário" },
  { value: "extrato_ir", label: "Extrato de Imposto de Renda" },
];

const STATES = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

const PAGE_SIZE = 20;

// Projeção explícita (minimização de PII — R-2 Fase 1): a lista e o painel de
// detalhe desta tela só renderizam estes campos. Documentos (CPF/RG) aparecem
// aqui porque a tela os exibe; dados bancários/PIX e filiação NÃO são buscados.
// R-2 Fase 2B: a leitura passa a vir da view `clients_decrypted` (decifra
// CPF/RG respeitando a RLS is_recepcao_or_socio), nunca das colunas de texto.
const CLIENT_LIST_COLUMNS =
  "id, full_name, cpf, rg, email, phone, address, city, state, zip_code, notes, status, created_at";

// Mantém o tipo alinhado à projeção acima — evita ler no cliente uma coluna
// que não veio no payload.
interface Client {
  id: string;
  full_name: string;              // nome completo / razão social
  cpf: string | null;
  rg: string | null;
  email: string | null;
  phone: string | null;           // celular
  address: string | null;         // logradouro
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
  width: "100%", padding: "10px 14px", borderRadius: 12,
  background: "#0a0a12", border: "1px solid rgba(201,168,76,0.2)", color: "#f5f5f5",
  fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box",
  boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
  transition: "border-color 0.3s ease, box-shadow 0.3s ease, transform 0.15s ease",
};
const selectStyle: React.CSSProperties = {
  ...inputStyle,
  color: "#c9a84c",
  cursor: "pointer",
  appearance: "none" as const,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23c9a84c' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 12px center",
  paddingRight: "36px",
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 10, color: "var(--text3)", marginBottom: 4,
  textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600,
};
const secTitle: React.CSSProperties = {
  gridColumn: "1 / -1", fontSize: 11, fontWeight: 700, color: "var(--gold, #c9a84c)",
  textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 10, marginBottom: -2,
  borderBottom: "1px solid var(--border)", paddingBottom: 4,
  animation: "fadeSlideDown 0.3s ease",
};

const ALLOWED_ROLES = ["socio", "lider_recepcao", "recepcionista"];

export default function Clients() {
  const { user } = useAuth();
  const { workspace } = useMyWorkspace();
  const navigate = useNavigate();
  const roleCode = workspace?.role_template?.code ?? "";
  const hasAccess = ALLOWED_ROLES.includes(roleCode);

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [docName, setDocName] = useState("");
  const [docType, setDocType] = useState("outro");
  const [docNotes, setDocNotes] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [search, setSearch] = useState("");
  // R-2 Fase 2B: quando a busca é um CPF (com/sem máscara), resolvemos por
  // índice cego via RPC (igualdade exata). null = busca não é CPF (usa texto).
  const [cpfMatchIds, setCpfMatchIds] = useState<string[] | null>(null);
  const [statusFilter, setStatusFilter] = useState("todos");
  const [stateFilter, setStateFilter] = useState("todos");
  const [page, setPage] = useState(1);
  const [taskCounts, setTaskCounts] = useState<Record<string, number>>({});
  const [processCounts, setProcessCounts] = useState<Record<string, number>>({});
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState("");
  const [hasPix, setHasPix] = useState(false);

  // Document attachments for client creation
  const [docRgFrente, setDocRgFrente] = useState<File | null>(null);
  const [docRgVerso, setDocRgVerso] = useState<File | null>(null);
  const [docComprovante, setDocComprovante] = useState<File | null>(null);
  const [docIR, setDocIR] = useState<File | null>(null);
  const [docExtratoBancario, setDocExtratoBancario] = useState<File | null>(null);

  const EMPTY_FORM = {
    tipo_pessoa: "fisica", status: "ativo",
    full_name: "", fantasy_name: "", cpf: "", cnpj: "", rg: "", rg_issuer: "", rg_uf: "BA",
    ie: "", im: "", birth_date: "", foundation_date: "", gender: "masculino", marital_status: "solteiro",
    nationality: "BRASILEIRA", natural_city: "", natural_uf: "BA", mother_name: "", father_name: "",
    profession: "", pis_nit: "", legal_rep_name: "", legal_rep_cpf: "",
    email: "", phone: "", phone_commercial: "", phone_home: "",
    zip_code: "", address: "", address_number: "", address_complement: "", neighborhood: "",
    city: "", state: "BA", country: "BRASIL",
    bank_name: "", bank_agency: "", bank_account: "", bank_account_type: "corrente", pix_key: "", pix_key_type: "cpf",
    client_origin: "indicacao", gov_br_profile: "ouro", notes: "",
  };

  const toUpper = (v: string) => v.toUpperCase();

  function formatCPF(value: string): string {
    const d = value.replace(/\D/g, "").slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
    return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  }

  function formatRG(value: string): string {
    const d = value.replace(/\D/g, "").slice(0, 9);
    if (d.length <= 2) return d;
    if (d.length <= 5) return `${d.slice(0,2)}.${d.slice(2)}`;
    if (d.length <= 8) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`;
    return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}-${d.slice(8)}`;
  }

  function formatCEP(value: string): string {
    const d = value.replace(/\D/g, "").slice(0, 8);
    if (d.length <= 5) return d;
    return `${d.slice(0,5)}-${d.slice(5)}`;
  }

  function formatPhone(value: string): string {
    const d = value.replace(/\D/g, "").slice(0, 11);
    if (d.length <= 2) return d.length > 0 ? `(${d}` : "";
    if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
    return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  }

  function formatPixKey(value: string, type: string): string {
    const digits = value.replace(/\D/g, "");
    if (type === "cpf") {
      return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, (_, a, b, c, d) => d ? `${a}.${b}.${c}-${d}` : digits.length > 6 ? `${a}.${b}.${c}` : digits.length > 3 ? `${a}.${b}` : a).slice(0, 14);
    }
    if (type === "cnpj") {
      return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, (_, a, b, c, d, e) => e ? `${a}.${b}.${c}/${d}-${e}` : digits.length > 9 ? `${a}.${b}.${c}/${d}` : digits.length > 6 ? `${a}.${b}.${c}` : digits.length > 3 ? `${a}.${b}` : digits.length > 2 ? `${a}.${b}` : a).slice(0, 18);
    }
    if (type === "telefone") {
      return digits.replace(/(\d{2})(\d{5})(\d{0,4})/, (_, a, b, c) => c ? `(${a}) ${b}-${c}` : digits.length > 2 ? `(${a}) ${b}` : digits.length > 0 ? `(${a}` : "").slice(0, 15);
    }
    return value;
  }
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => { fetchClients(); fetchCounts(); }, []);

  async function fetchAddressByCep(cep: string) {
    const cleanCep = cep.replace(/\D/g, "");
    if (cleanCep.length !== 8) return;
    setCepLoading(true);
    setCepError("");
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await res.json();
      if (data.erro) {
        setCepError("CEP não encontrado");
      } else {
        setForm(prev => ({
          ...prev,
          address: (data.logradouro || prev.address).toUpperCase(),
          neighborhood: (data.bairro || prev.neighborhood).toUpperCase(),
          city: (data.localidade || prev.city).toUpperCase(),
          state: data.uf || prev.state,
          address_complement: (data.complemento || prev.address_complement).toUpperCase(),
        }));
      }
    } catch {
      setCepError("Erro ao buscar CEP");
    } finally {
      setCepLoading(false);
    }
  }

  async function fetchClients() {
    setLoading(true);
    // R-2 Fase 2B: lê da view decifrada, não das colunas de texto sensível.
    // (cast: a view ainda não está nos tipos gerados do supabase.)
    const { data, error } = await (supabase as any)
      .from("clients_decrypted").select(CLIENT_LIST_COLUMNS).order("created_at", { ascending: false });
    if (error) toast.error("Erro ao carregar clientes");
    else setClients((data as unknown as Client[]) || []);
    setLoading(false);
  }

  async function fetchCounts() {
    const { data: tasks } = await supabase.from("agent_tasks").select("client_name");
    const { data: processes } = await supabase.from("processes").select("client_name");
    const tc: Record<string, number> = {};
    const pc: Record<string, number> = {};
    tasks?.forEach(t => { if (t.client_name) tc[t.client_name] = (tc[t.client_name] || 0) + 1; });
    processes?.forEach(p => { if (p.client_name) pc[p.client_name] = (pc[p.client_name] || 0) + 1; });
    setTaskCounts(tc);
    setProcessCounts(pc);
  }

  async function fetchDocuments(clientId: string) {
    const { data, error } = await supabase.from("client_documents").select("*").eq("client_id", clientId).order("created_at", { ascending: false });
    if (error) toast.error("Erro ao carregar documentos");
    else setDocuments(data || []);
  }

  async function handleCreateClient(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    // Validate required documents
    if (!docRgFrente) { toast.error("Anexe o RG (frente)"); return; }
    if (!docRgVerso) { toast.error("Anexe o RG (verso)"); return; }
    if (!docComprovante) { toast.error("Anexe o Comprovante de Residência"); return; }

    const payload: Record<string, unknown> = { created_by: user.id };
    for (const [k, v] of Object.entries(form)) payload[k] = v === "" ? null : v;
    const { data: inserted, error } = await supabase.from("clients").insert(payload as any).select("id").single();
    if (error || !inserted) { toast.error("Erro ao criar cliente: " + (error?.message || "sem retorno")); return; }

    const clientId = (inserted as unknown as { id: string }).id;

    // Upload documents
    const docsToUpload: { file: File; type: string; name: string }[] = [
      { file: docRgFrente, type: "rg", name: "RG Frente" },
      { file: docRgVerso, type: "rg", name: "RG Verso" },
      { file: docComprovante, type: "comprovante_residencia", name: "Comprovante de Residência" },
    ];
    if (docIR) docsToUpload.push({ file: docIR, type: "extrato_ir", name: "Extrato Imposto de Renda" });
    if (docExtratoBancario) docsToUpload.push({ file: docExtratoBancario, type: "extrato_conta", name: "Extrato Bancário" });

    for (const doc of docsToUpload) {
      const filePath = `${clientId}/${Date.now()}_${doc.file.name}`;
      const { error: upErr } = await supabase.storage.from("client-documents").upload(filePath, doc.file);
      if (upErr) { toast.error(`Erro ao enviar ${doc.name}: ${upErr.message}`); continue; }
      await supabase.from("client_documents").insert({
        client_id: clientId, client_name: form.full_name,
        document_type: doc.type, document_name: doc.name,
        file_path: filePath, file_size: doc.file.size, mime_type: doc.file.type,
        notes: null, uploaded_by: user.id,
      } as any);
    }

    toast.success("Cliente cadastrado com sucesso!");
    setForm(EMPTY_FORM);
    setDocRgFrente(null); setDocRgVerso(null); setDocComprovante(null);
    setDocIR(null); setDocExtratoBancario(null);
    setShowForm(false);
    fetchClients();
  }

  function handleAddFiles(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return;
    const newFiles = Array.from(e.target.files);
    setPendingFiles(prev => [...prev, ...newFiles]);
    e.target.value = "";
  }

  function removePendingFile(index: number) {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  }

  const ALLOWED_MIME_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg', 'image/png', 'image/webp',
    'text/plain', 'text/csv'
  ];
  const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

  async function handleUploadAllFiles() {
    if (!pendingFiles.length || !selectedClient || !user) return;
    setUploading(true);
    let successCount = 0;
    for (const file of pendingFiles) {
      if (!file.type || !ALLOWED_MIME_TYPES.includes(file.type)) {
        toast.warning(`Arquivo "${file.name}" ignorado: tipo "${file.type || 'desconhecido'}" não permitido.`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.warning(`Arquivo "${file.name}" ignorado: excede 25 MB (${(file.size / 1024 / 1024).toFixed(1)} MB).`);
        continue;
      }
      const filePath = `${selectedClient.id}/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage.from("client-documents").upload(filePath, file);
      if (uploadErr) { toast.error("Erro no upload: " + uploadErr.message); continue; }
      const { error: dbErr } = await supabase.from("client_documents").insert({
        client_id: selectedClient.id, client_name: selectedClient.full_name,
        document_type: docType, document_name: docName || file.name,
        file_path: filePath, file_size: file.size, mime_type: file.type, notes: docNotes || null, uploaded_by: user.id,
      } as any);
      if (dbErr) { toast.error("Erro ao salvar: " + dbErr.message); continue; }
      successCount++;
    }
    if (successCount > 0) toast.success(`${successCount} arquivo(s) anexado(s)!`);
    setDocName(""); setDocType("outro"); setDocNotes(""); setPendingFiles([]);
    fetchDocuments(selectedClient.id);
    setUploading(false);
  }

  async function handleDeleteDoc(doc: ClientDocument) {
    await supabase.storage.from("client-documents").remove([doc.file_path]);
    const { error } = await supabase.from("client_documents").delete().eq("id", doc.id);
    if (error) { toast.error("Erro ao excluir"); return; }
    toast.success("Documento removido");
    if (selectedClient) fetchDocuments(selectedClient.id);
  }

  // R-2 Fase 2B: detecta entrada de CPF (só dígitos após remover máscara, 11+
  // dígitos) e busca por índice cego via RPC — funciona com e sem máscara.
  // Busca por fragmento de CPF deixou de existir (dado protegido) — esperado.
  useEffect(() => {
    const raw = search.trim();
    const digits = raw.replace(/\D/g, "");
    const isCpf = digits.length >= 11 && /^[\d.\-/\s]+$/.test(raw);
    if (!isCpf) { setCpfMatchIds(null); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase as any).rpc("search_clients_by_cpf", { cpf_input: raw });
      if (cancelled) return;
      setCpfMatchIds(error ? [] : ((data as { id: string }[] | null) ?? []).map(r => r.id));
    })();
    return () => { cancelled = true; };
  }, [search]);

  const filtered = useMemo(() => {
    let result = clients;
    if (cpfMatchIds !== null) {
      // Busca por CPF (índice cego): mostra só os IDs que a RPC devolveu.
      const ids = new Set(cpfMatchIds);
      result = result.filter(c => ids.has(c.id));
    } else if (search) {
      const s = search.toLowerCase();
      result = result.filter(c =>
        c.full_name.toLowerCase().includes(s) ||
        (c.email && c.email.toLowerCase().includes(s)) ||
        (c.phone && c.phone.includes(s)) ||
        (c.city && c.city.toLowerCase().includes(s))
      );
    }
    if (statusFilter !== "todos") result = result.filter(c => c.status === statusFilter);
    if (stateFilter !== "todos") result = result.filter(c => c.state === stateFilter);
    return result;
  }, [clients, search, cpfMatchIds, statusFilter, stateFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [search, statusFilter, stateFilter]);

  const uniqueStates = useMemo(() => {
    const states = new Set(clients.map(c => c.state).filter(Boolean));
    return Array.from(states).sort();
  }, [clients]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    clients.forEach(c => { counts[c.status] = (counts[c.status] || 0) + 1; });
    return counts;
  }, [clients]);

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
          Apenas Kailane, Taís, Yasmin e o sócio podem acessar esta área.
        </p>
        <button className="btn-voltar" onClick={() => navigate("/sistema")} style={{
          padding: "10px 20px", borderRadius: 8, border: "1px solid var(--border)",
          background: "var(--bg2)", color: "var(--text2)", cursor: "pointer", fontSize: 13,
        }}>← Voltar ao Sistema</button>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg)", color: "var(--text1)",
      fontFamily: "'Roboto', sans-serif", padding: 20,
    }}>
      <style>{`
        @keyframes fadeSlideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .clients-form input:focus,
        .clients-form textarea:focus {
          border-color: rgba(201,168,76,0.6) !important;
          box-shadow: 0 0 0 3px rgba(201,168,76,0.12), 0 2px 8px rgba(0,0,0,0.4) !important;
          transform: translateY(-1px);
        }
        .clients-form select:focus {
          border-color: rgba(201,168,76,0.6) !important;
          box-shadow: 0 0 0 3px rgba(201,168,76,0.12), 0 2px 8px rgba(0,0,0,0.4) !important;
        }
        .clients-form input:hover,
        .clients-form select:hover,
        .clients-form textarea:hover {
          border-color: rgba(201,168,76,0.4) !important;
        }
        .client-card {
          transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
          animation: fadeIn 0.3s ease;
        }
        .client-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(201,168,76,0.4);
          filter: brightness(1.05);
        }
      `}</style>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <button className="btn-voltar" onClick={() => navigate("/sistema")} style={{
          padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)",
          background: "var(--bg2)", color: "var(--text2)", cursor: "pointer", fontSize: 13,
          fontFamily: "'DM Sans', sans-serif",
        }}>← Voltar</button>
        <h1 style={{ fontFamily: "'Roboto', sans-serif", fontSize: 24, fontWeight: 600, color: "var(--gold, #c9a84c)", margin: 0 }}>
          Gestão de Clientes
        </h1>
        <span style={{ fontSize: 12, color: "var(--text3)", background: "var(--bg2)", padding: "4px 10px", borderRadius: 6 }}>
          {clients.length} total
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowForm(!showForm)} style={{
          padding: "10px 20px", borderRadius: 10, border: "none", cursor: "pointer",
          background: "linear-gradient(135deg, #c9a84c, #e8c96a)", color: "#0a0a12",
          fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
          transition: "transform 0.2s ease, box-shadow 0.2s ease",
          boxShadow: "0 4px 12px rgba(201,168,76,0.3)",
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 6px 20px rgba(201,168,76,0.5)"; }}
        onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(201,168,76,0.3)"; }}
        >
          {showForm ? " Fechar" : "+ Novo Cliente"}
        </button>
      </div>

      {/* New Client Form */}
      {showForm && (
        <form onSubmit={handleCreateClient} className="clients-form" style={{
          background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12,
          padding: 24, marginBottom: 20,
          animation: "fadeSlideDown 0.4s cubic-bezier(0.22, 1, 0.36, 1)",
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text1)", marginBottom: 16 }}>Cadastrar Novo Cliente</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>

            {/* Classificação */}
            <div style={secTitle}>Classificação</div>
            <div>
              <label style={labelStyle}>Tipo de Pessoa *</label>
              <select style={selectStyle} value={form.tipo_pessoa} onChange={e => setForm({...form, tipo_pessoa: e.target.value})}>
                <option value="fisica">Pessoa Física</option>
                <option value="juridica">Pessoa Jurídica</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Situação</label>
              <select style={selectStyle} value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
                <option value="prospecto">Prospecto</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Perfil do GOV.BR</label>
              <select style={selectStyle} value={form.gov_br_profile} onChange={e => setForm({...form, gov_br_profile: e.target.value})} required>
                <option value="ouro">Ouro</option>
                <option value="prata">Prata</option>
                <option value="bronze">Bronze</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Origem / Captação</label>
              <select style={selectStyle} value={["indicacao","ressaque","whatsapp","marketing","site"].includes(form.client_origin) ? form.client_origin : "outro"} onChange={e => setForm({...form, client_origin: e.target.value})} required>
                <option value="indicacao">Indicação</option>
                <option value="ressaque">Ressaque</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="marketing">Marketing / Anúncio</option>
                <option value="site">Site</option>
                <option value="outro">Outro</option>
              </select>
              {!["indicacao","ressaque","whatsapp","marketing","site"].includes(form.client_origin) || form.client_origin === "outro" ? (
                <input style={{...inputStyle, marginTop: 6}} value={form.client_origin === "outro" ? "" : form.client_origin} onChange={e => setForm({...form, client_origin: e.target.value})} placeholder="Informe a origem..." />
              ) : null}
            </div>

            {/* Identificação */}
            <div style={secTitle}>{form.tipo_pessoa === "juridica" ? "Dados da Empresa" : "Dados Pessoais"}</div>
            <div>
              <label style={labelStyle}>{form.tipo_pessoa === "juridica" ? "Razão Social *" : "Nome Completo *"}</label>
              <input required style={inputStyle} value={form.full_name} onChange={e => setForm({...form, full_name: toUpper(e.target.value)})} />
            </div>

            {form.tipo_pessoa === "juridica" ? (
              <>
                <div><label style={labelStyle}>Nome Fantasia</label><input required style={inputStyle} value={form.fantasy_name} onChange={e => setForm({...form, fantasy_name: toUpper(e.target.value)})} /></div>
                <div><label style={labelStyle}>CNPJ</label><input required style={inputStyle} value={form.cnpj} onChange={e => setForm({...form, cnpj: e.target.value})} placeholder="00.000.000/0000-00" /></div>
                <div><label style={labelStyle}>Inscrição Estadual</label><input required style={inputStyle} value={form.ie} onChange={e => setForm({...form, ie: e.target.value})} /></div>
                <div><label style={labelStyle}>Inscrição Municipal</label><input required style={inputStyle} value={form.im} onChange={e => setForm({...form, im: e.target.value})} /></div>
                <div><label style={labelStyle}>Data de Fundação</label><input required type="date" style={inputStyle} value={form.foundation_date} onChange={e => setForm({...form, foundation_date: e.target.value})} /></div>
                <div><label style={labelStyle}>Representante Legal</label><input required style={inputStyle} value={form.legal_rep_name} onChange={e => setForm({...form, legal_rep_name: toUpper(e.target.value)})} /></div>
                <div><label style={labelStyle}>CPF do Representante</label><input required style={inputStyle} value={form.legal_rep_cpf} onChange={e => setForm({...form, legal_rep_cpf: formatCPF(e.target.value)})} placeholder="000.000.000-00" maxLength={14} /></div>
              </>
            ) : (
              <>
                <div><label style={labelStyle}>CPF</label><input required style={inputStyle} value={form.cpf} onChange={e => setForm({...form, cpf: formatCPF(e.target.value)})} placeholder="000.000.000-00" maxLength={14} /></div>
                <div><label style={labelStyle}>RG</label><input required style={inputStyle} value={form.rg} onChange={e => setForm({...form, rg: formatRG(e.target.value)})} placeholder="00.000.000-0" maxLength={12} /></div>
                <div><label style={labelStyle}>Órgão Emissor</label><input style={inputStyle} value={form.rg_issuer} onChange={e => setForm({...form, rg_issuer: toUpper(e.target.value)})} placeholder="SSP" /></div>
                <div>
                  <label style={labelStyle}>UF do RG</label>
                  <select style={selectStyle} value={form.rg_uf} onChange={e => setForm({...form, rg_uf: e.target.value})} required>
                    {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div><label style={labelStyle}>Data de Nascimento</label><input required type="date" style={inputStyle} value={form.birth_date} onChange={e => setForm({...form, birth_date: e.target.value})} /></div>
                <div>
                  <label style={labelStyle}>Sexo</label>
                  <select style={selectStyle} value={["masculino","feminino"].includes(form.gender) ? form.gender : "outro"} onChange={e => setForm({...form, gender: e.target.value})} required>
                    <option value="masculino">Masculino</option>
                    <option value="feminino">Feminino</option>
                    <option value="outro">Outro</option>
                  </select>
                  {!["masculino","feminino"].includes(form.gender) || form.gender === "outro" ? (
                    <input style={{...inputStyle, marginTop: 6}} value={form.gender === "outro" ? "" : form.gender} onChange={e => setForm({...form, gender: e.target.value})} placeholder="Informe..." />
                  ) : null}
                </div>
                <div>
                  <label style={labelStyle}>Estado Civil</label>
                  <select style={selectStyle} value={form.marital_status} onChange={e => setForm({...form, marital_status: e.target.value})} required>
                    <option value="solteiro">Solteiro(a)</option>
                    <option value="casado">Casado(a)</option>
                    <option value="divorciado">Divorciado(a)</option>
                    <option value="viuvo">Viúvo(a)</option>
                    <option value="uniao_estavel">União Estável</option>
                  </select>
                </div>
                <div><label style={labelStyle}>Nacionalidade</label><input required style={inputStyle} value={form.nationality} onChange={e => setForm({...form, nationality: toUpper(e.target.value)})} /></div>
                <div><label style={labelStyle}>Naturalidade (Cidade)</label><input required style={inputStyle} value={form.natural_city} onChange={e => setForm({...form, natural_city: toUpper(e.target.value)})} /></div>
                <div>
                  <label style={labelStyle}>Naturalidade (UF)</label>
                  <select style={selectStyle} value={form.natural_uf} onChange={e => setForm({...form, natural_uf: e.target.value})} required>
                    {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div><label style={labelStyle}>Profissão</label><input required style={inputStyle} value={form.profession} onChange={e => setForm({...form, profession: toUpper(e.target.value)})} /></div>
                <div><label style={labelStyle}>Nome da Mãe</label><input style={inputStyle} value={form.mother_name} onChange={e => setForm({...form, mother_name: toUpper(e.target.value)})} /></div>
                <div><label style={labelStyle}>Nome do Pai</label><input style={inputStyle} value={form.father_name} onChange={e => setForm({...form, father_name: toUpper(e.target.value)})} /></div>
                <div><label style={labelStyle}>PIS / NIT</label><input style={inputStyle} value={form.pis_nit} onChange={e => setForm({...form, pis_nit: toUpper(e.target.value)})} /></div>
              </>
            )}

            {/* Contato */}
            <div style={secTitle}>Contato</div>
            <div><label style={labelStyle}>Email</label><input required type="email" style={inputStyle} value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></div>
            <div><label style={labelStyle}>Celular</label><input required style={inputStyle} value={form.phone} onChange={e => setForm({...form, phone: formatPhone(e.target.value)})} placeholder="(71) 99999-9999" maxLength={15} /></div>
            <div><label style={labelStyle}>Telefone Comercial</label><input style={inputStyle} value={form.phone_commercial} onChange={e => setForm({...form, phone_commercial: formatPhone(e.target.value)})} placeholder="(71) 99999-9999" maxLength={15} /></div>
            <div><label style={labelStyle}>Telefone Residencial</label><input style={inputStyle} value={form.phone_home} onChange={e => setForm({...form, phone_home: formatPhone(e.target.value)})} placeholder="(71) 99999-9999" maxLength={15} /></div>

            {/* Endereço */}
            <div style={secTitle}>Endereço</div>
            <div>
              <label style={labelStyle}>CEP {cepLoading && <span style={{ color: "#3b82f6", fontWeight: 400 }}>buscando...</span>}</label>
              <input required style={{...inputStyle, borderColor: cepError ? "#ef4444" : undefined}} value={form.zip_code} onChange={e => {
                const formatted = formatCEP(e.target.value);
                setForm({...form, zip_code: formatted});
                setCepError("");
                const clean = formatted.replace(/\D/g, "");
                if (clean.length === 8) fetchAddressByCep(clean);
              }} placeholder="00000-000" maxLength={9} />
              {cepError && <span style={{ fontSize: 10, color: "#ef4444", marginTop: 2, display: "block" }}>{cepError} — preencha manualmente</span>}
            </div>
            <div><label style={labelStyle}>Logradouro</label><input required style={inputStyle} value={form.address} onChange={e => setForm({...form, address: toUpper(e.target.value)})} /></div>
            <div><label style={labelStyle}>Número</label><input required style={inputStyle} value={form.address_number} onChange={e => setForm({...form, address_number: e.target.value})} /></div>
            <div><label style={labelStyle}>Complemento</label><input required style={inputStyle} value={form.address_complement} onChange={e => setForm({...form, address_complement: toUpper(e.target.value)})} /></div>
            <div><label style={labelStyle}>Bairro</label><input required style={inputStyle} value={form.neighborhood} onChange={e => setForm({...form, neighborhood: toUpper(e.target.value)})} /></div>
            <div><label style={labelStyle}>Cidade</label><input required style={inputStyle} value={form.city} onChange={e => setForm({...form, city: toUpper(e.target.value)})} /></div>
            <div>
              <label style={labelStyle}>Estado</label>
              <select style={selectStyle} value={form.state} onChange={e => setForm({...form, state: e.target.value})} required>
                {STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div><label style={labelStyle}>País</label><input required style={inputStyle} value={form.country} onChange={e => setForm({...form, country: toUpper(e.target.value)})} /></div>

            {/* Dados Bancários / PIX */}
            <div style={secTitle}>Dados Bancários / PIX</div>
            <div><label style={labelStyle}>Banco</label><input required style={inputStyle} value={form.bank_name} onChange={e => setForm({...form, bank_name: toUpper(e.target.value)})} /></div>
            <div><label style={labelStyle}>Agência</label><input required style={inputStyle} value={form.bank_agency} onChange={e => setForm({...form, bank_agency: e.target.value})} /></div>
            <div><label style={labelStyle}>Conta</label><input required style={inputStyle} value={form.bank_account} onChange={e => setForm({...form, bank_account: e.target.value})} /></div>
            <div>
              <label style={labelStyle}>Tipo de Conta</label>
              <select style={selectStyle} value={form.bank_account_type} onChange={e => setForm({...form, bank_account_type: e.target.value})} required>
                <option value="corrente">Corrente</option>
                <option value="poupanca">Poupança</option>
              </select>
            </div>
            <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 16, marginTop: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Possui PIX?</span>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: hasPix ? "#c9a84c" : "var(--text3)" }}>
                <input type="radio" name="hasPix" checked={hasPix} onChange={() => setHasPix(true)} style={{ accentColor: "#c9a84c" }} /> Sim
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: !hasPix ? "#c9a84c" : "var(--text3)" }}>
                <input type="radio" name="hasPix" checked={!hasPix} onChange={() => { setHasPix(false); setForm({...form, pix_key: "", pix_key_type: "cpf"}); }} style={{ accentColor: "#c9a84c" }} /> Não
              </label>
            </div>
            {hasPix && (
              <>
                <div>
                  <label style={labelStyle}>Tipo da Chave PIX</label>
                  <select style={selectStyle} value={form.pix_key_type} onChange={e => setForm({...form, pix_key_type: e.target.value, pix_key: ""})} required>
                    <option value="cpf">CPF</option>
                    <option value="cnpj">CNPJ</option>
                    <option value="email">Email</option>
                    <option value="telefone">Telefone</option>
                    <option value="aleatoria">Aleatória</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Chave PIX</label>
                  <input
                    style={inputStyle}
                    value={form.pix_key}
                    onChange={e => setForm({...form, pix_key: formatPixKey(e.target.value, form.pix_key_type)})}
                    placeholder={form.pix_key_type === "cpf" ? "000.000.000-00" : form.pix_key_type === "cnpj" ? "00.000.000/0001-00" : form.pix_key_type === "telefone" ? "(00) 00000-0000" : form.pix_key_type === "email" ? "email@exemplo.com" : "Chave aleatória"}
                    required
                  />
                </div>
              </>
            )}
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>Observações</label>
            <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
          </div>

          {/* Document Attachments */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginTop: 16 }}>
            <div style={secTitle}>Documentos Obrigatórios</div>
            <div>
              <label style={labelStyle}>RG — Frente *</label>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={e => setDocRgFrente(e.target.files?.[0] || null)}
                style={{ ...inputStyle, padding: "8px 10px", fontSize: 11 }}
              />
              {docRgFrente && <span style={{ fontSize: 10, color: "var(--gold, #c9a84c)", marginTop: 2, display: "block" }}>{docRgFrente.name}</span>}
            </div>
            <div>
              <label style={labelStyle}>RG — Verso *</label>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={e => setDocRgVerso(e.target.files?.[0] || null)}
                style={{ ...inputStyle, padding: "8px 10px", fontSize: 11 }}
              />
              {docRgVerso && <span style={{ fontSize: 10, color: "var(--gold, #c9a84c)", marginTop: 2, display: "block" }}>{docRgVerso.name}</span>}
            </div>
            <div>
              <label style={labelStyle}>Comprovante de Residência *</label>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={e => setDocComprovante(e.target.files?.[0] || null)}
                style={{ ...inputStyle, padding: "8px 10px", fontSize: 11 }}
              />
              {docComprovante && <span style={{ fontSize: 10, color: "var(--gold, #c9a84c)", marginTop: 2, display: "block" }}>{docComprovante.name}</span>}
            </div>

            <div style={secTitle}>Documentos Opcionais</div>
            <div>
              <label style={labelStyle}>Extrato de Imposto de Renda</label>
              <input
                type="file"
                accept="image/*,.pdf,.xls,.xlsx"
                onChange={e => setDocIR(e.target.files?.[0] || null)}
                style={{ ...inputStyle, padding: "8px 10px", fontSize: 11 }}
              />
              {docIR && <span style={{ fontSize: 10, color: "var(--gold, #c9a84c)", marginTop: 2, display: "block" }}>{docIR.name}</span>}
            </div>
            <div>
              <label style={labelStyle}>Extrato Bancário</label>
              <input
                type="file"
                accept="image/*,.pdf,.xls,.xlsx"
                onChange={e => setDocExtratoBancario(e.target.files?.[0] || null)}
                style={{ ...inputStyle, padding: "8px 10px", fontSize: 11 }}
              />
              {docExtratoBancario && <span style={{ fontSize: 10, color: "var(--gold, #c9a84c)", marginTop: 2, display: "block" }}>{docExtratoBancario.name}</span>}
            </div>
          </div>

          <button type="submit" style={{
            marginTop: 16, padding: "10px 24px", borderRadius: 10, border: "none", cursor: "pointer",
            background: "linear-gradient(135deg, #c9a84c, #e8c96a)", color: "#0a0a12",
            fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
            transition: "transform 0.2s ease, box-shadow 0.2s ease",
            boxShadow: "0 4px 12px rgba(201,168,76,0.3)",
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 6px 20px rgba(201,168,76,0.5)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(201,168,76,0.3)"; }}
          >Cadastrar Cliente</button>
        </form>
      )}

      {/* Search + Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input
          style={{ ...inputStyle, maxWidth: 320, flex: "1 1 200px" }}
          placeholder=" Buscar nome, CPF, email, telefone, cidade..."
          value={search} onChange={e => setSearch(e.target.value)}
        />
        <select style={{ ...selectStyle, maxWidth: 160 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="todos">Todos os status</option>
          {Object.entries(statusCounts).map(([s, c]) => (
            <option key={s} value={s}>{s} ({c})</option>
          ))}
        </select>
        <select style={{ ...selectStyle, maxWidth: 120 }} value={stateFilter} onChange={e => setStateFilter(e.target.value)}>
          <option value="todos">Todos UF</option>
          {uniqueStates.map(s => <option key={s} value={s!}>{s}</option>)}
        </select>
        <span style={{ fontSize: 11, color: "var(--text3)" }}>
          {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        {/* Client list */}
        <div style={{ flex: "1 1 350px", minWidth: 300 }}>
          {loading ? <HexagonLoader variant="inline" /> :
            paginated.map(client => (
              <div
                key={client.id}
                className="client-card"
                onClick={() => { setSelectedClient(client); fetchDocuments(client.id); }}
                style={{
                  padding: 14, borderRadius: 10, marginBottom: 8, cursor: "pointer",
                  background: selectedClient?.id === client.id ? "rgba(201,168,76,0.25)" : "linear-gradient(135deg, #c9a84c, #e8c96a)",
                  border: selectedClient?.id === client.id ? "2px solid #c9a84c" : "1px solid rgba(201,168,76,0.4)",
                  boxShadow: "0 2px 8px rgba(201,168,76,0.15)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#0a0a12" }}>{client.full_name}</div>
                  <button onClick={(e) => { e.stopPropagation(); navigate(`/clientes/${client.id}`); }} style={{
                    padding: "3px 10px", borderRadius: 6, border: "1px solid rgba(10,10,18,0.2)",
                    background: "rgba(10,10,18,0.1)", color: "#0a0a12", cursor: "pointer", fontSize: 10,
                    fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
                  }}>Ver detalhes →</button>
                </div>
                <div style={{ display: "flex", gap: 12, fontSize: 11, color: "rgba(10,10,18,0.7)", flexWrap: "wrap", alignItems: "center" }}>
                  {client.cpf && <span style={{ fontWeight: 500 }}>CPF: {client.cpf}</span>}
                  {client.phone && <span style={{ fontWeight: 500 }}> {client.phone}</span>}
                  {client.city && <span style={{ fontWeight: 500 }}> {client.city}/{client.state}</span>}
                  {(taskCounts[client.full_name] || 0) > 0 && (
                    <span style={{ padding: "1px 7px", borderRadius: 4, fontSize: 9, background: "rgba(10,10,18,0.15)", color: "#0a0a12", fontWeight: 600 }}>
                       {taskCounts[client.full_name]} tarefa{taskCounts[client.full_name] > 1 ? "s" : ""}
                    </span>
                  )}
                  {(processCounts[client.full_name] || 0) > 0 && (
                    <span style={{ padding: "1px 7px", borderRadius: 4, fontSize: 9, background: "rgba(10,10,18,0.12)", color: "#0a0a12", fontWeight: 600 }}>
                      ️ {processCounts[client.full_name]} processo{processCounts[client.full_name] > 1 ? "s" : ""}
                    </span>
                  )}
                  <span style={{
                    padding: "1px 8px", borderRadius: 4, fontSize: 9, textTransform: "uppercase", fontWeight: 700,
                    background: client.status === "ativo" ? "rgba(10,10,18,0.12)" : client.status === "em_analise" ? "rgba(10,10,18,0.18)" : "rgba(239,68,68,0.25)",
                    color: client.status === "ativo" ? "#0a0a12" : client.status === "em_analise" ? "#0a0a12" : "#7f1d1d",
                  }}>{client.status}</span>
                </div>
              </div>
            ))
          }

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{
                  padding: "6px 14px", borderRadius: 6, border: "1px solid var(--border)",
                  background: "var(--bg2)", color: page === 1 ? "var(--text3)" : "var(--text1)",
                  cursor: page === 1 ? "default" : "pointer", fontSize: 12, fontFamily: "'DM Sans', sans-serif",
                  opacity: page === 1 ? 0.5 : 1,
                }}
              >← Anterior</button>

              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 7) {
                  pageNum = i + 1;
                } else if (page <= 4) {
                  pageNum = i + 1;
                } else if (page >= totalPages - 3) {
                  pageNum = totalPages - 6 + i;
                } else {
                  pageNum = page - 3 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    style={{
                      padding: "6px 12px", borderRadius: 6, fontSize: 12,
                      border: pageNum === page ? "1px solid rgba(201,168,76,0.5)" : "1px solid var(--border)",
                      background: pageNum === page ? "rgba(201,168,76,0.15)" : "var(--bg2)",
                      color: pageNum === page ? "#c9a84c" : "var(--text2)",
                      cursor: "pointer", fontWeight: pageNum === page ? 700 : 400,
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >{pageNum}</button>
                );
              })}

              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={{
                  padding: "6px 14px", borderRadius: 6, border: "1px solid var(--border)",
                  background: "var(--bg2)", color: page === totalPages ? "var(--text3)" : "var(--text1)",
                  cursor: page === totalPages ? "default" : "pointer", fontSize: 12, fontFamily: "'DM Sans', sans-serif",
                  opacity: page === totalPages ? 0.5 : 1,
                }}
              >Próxima →</button>

              <span style={{ fontSize: 11, color: "var(--text3)", marginLeft: 8 }}>
                Pág. {page}/{totalPages}
              </span>
            </div>
          )}
        </div>

        {/* Client Detail + Documents */}
        {selectedClient && (
          <div style={{ flex: "1 1 400px", minWidth: 350 }}>
            <div style={{
              background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12,
              padding: 20, marginBottom: 16,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text1)" }}>
                  {selectedClient.full_name}
                </div>
                <button onClick={() => setSelectedClient(null)} style={{
                  width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border)",
                  background: "var(--bg)", color: "var(--text2)", cursor: "pointer",
                  fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={e => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.4)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "var(--text2)"; e.currentTarget.style.borderColor = "var(--border)"; }}
                title="Fechar detalhes"
                >✕</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
                {selectedClient.cpf && <div><span style={{ color: "var(--text3)" }}>CPF:</span> <span style={{ color: "var(--text1)" }}>{selectedClient.cpf}</span></div>}
                {selectedClient.rg && <div><span style={{ color: "var(--text3)" }}>RG:</span> <span style={{ color: "var(--text1)" }}>{selectedClient.rg}</span></div>}
                {selectedClient.email && <div><span style={{ color: "var(--text3)" }}>Email:</span> <span style={{ color: "var(--text1)" }}>{selectedClient.email}</span></div>}
                {selectedClient.phone && <div><span style={{ color: "var(--text3)" }}>Tel:</span> <span style={{ color: "var(--text1)" }}>{selectedClient.phone}</span></div>}
                {selectedClient.address && <div style={{ gridColumn: "1/-1" }}><span style={{ color: "var(--text3)" }}>Endereço:</span> <span style={{ color: "var(--text1)" }}>{selectedClient.address}, {selectedClient.city}/{selectedClient.state} - {selectedClient.zip_code}</span></div>}
                {selectedClient.notes && <div style={{ gridColumn: "1/-1" }}><span style={{ color: "var(--text3)" }}>Notas:</span> <span style={{ color: "var(--text2)" }}>{selectedClient.notes}</span></div>}
              </div>
            </div>

            {/* Upload Document */}
            <div style={{
              background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12,
              padding: 20, marginBottom: 16,
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text1)", marginBottom: 12 }}> Anexar Documento</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={labelStyle}>Tipo do Documento</label>
                  <select style={selectStyle} value={docType} onChange={e => setDocType(e.target.value)}>
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
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <label style={{
                  display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 20px",
                  borderRadius: 8, cursor: uploading ? "wait" : "pointer",
                  background: "linear-gradient(135deg, #c9a84c, #e8c96a)", color: "#0a0a12",
                  fontSize: 13, fontWeight: 600,
                  opacity: uploading ? 0.6 : 1, transition: "filter 0.2s ease",
                }}>
                  + Adicionar Arquivo(s)
                  <input type="file" hidden multiple onChange={handleAddFiles} disabled={uploading} accept="image/*,.pdf,.doc,.docx" />
                </label>
                {pendingFiles.length > 0 && (
                  <button
                    onClick={handleUploadAllFiles}
                    disabled={uploading}
                    style={{
                      padding: "10px 20px", borderRadius: 8, border: "none", cursor: uploading ? "wait" : "pointer",
                      background: "linear-gradient(135deg, #4f8ef7, #60a5fa)", color: "#fff",
                      fontSize: 13, fontWeight: 600, opacity: uploading ? 0.6 : 1,
                    }}
                  >
                    {uploading ? "Enviando..." : `⬆ Enviar ${pendingFiles.length} arquivo(s)`}
                  </button>
                )}
              </div>
              {pendingFiles.length > 0 && (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                  {pendingFiles.map((file, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
                      background: "rgba(201,168,76,0.08)", borderRadius: 6, border: "1px solid rgba(201,168,76,0.2)",
                    }}>
                      <span style={{ flex: 1, fontSize: 11, color: "var(--text1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        📄 {file.name} <span style={{ color: "var(--text3)" }}>({(file.size / 1024).toFixed(0)} KB)</span>
                      </span>
                      <button onClick={() => removePendingFile(i)} style={{
                        padding: "2px 6px", borderRadius: 4, border: "1px solid rgba(239,68,68,0.3)",
                        background: "rgba(239,68,68,0.1)", color: "#ef4444", cursor: "pointer", fontSize: 10,
                      }}>✕</button>
                    </div>
                  ))}
                  <label style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: 36, height: 36, borderRadius: 8, cursor: "pointer", marginTop: 4,
                    border: "2px dashed rgba(201,168,76,0.4)", background: "rgba(201,168,76,0.05)",
                    color: "#c9a84c", fontSize: 20, fontWeight: 700, transition: "all 0.2s ease",
                  }}>
                    +
                    <input type="file" hidden multiple onChange={handleAddFiles} accept="image/*,.pdf,.doc,.docx" />
                  </label>
                </div>
              )}
            </div>

            {/* Documents list */}
            <div style={{
              background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12,
              padding: 20,
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text1)", marginBottom: 12 }}>
                 Documentos ({documents.length})
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
                      <div style={{ fontSize: 20 }}></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {doc.document_name}
                        </div>
                        <div style={{ fontSize: 10, color: "var(--text3)" }}>
                          {typeLabel} · {doc.file_size ? `${(doc.file_size / 1024).toFixed(0)} KB` : ""} · {new Date(doc.created_at).toLocaleDateString("pt-BR")}
                        </div>
                        {doc.notes && <div style={{ fontSize: 10, color: "var(--text2)", marginTop: 2 }}>{doc.notes}</div>}
                      </div>
                      <label style={{
                        padding: "4px 8px", borderRadius: 4, border: "1px solid rgba(201,168,76,0.3)",
                        background: "rgba(201,168,76,0.1)", color: "#c9a84c", cursor: "pointer",
                        fontSize: 10, fontFamily: "'DM Sans', sans-serif", marginRight: 4,
                      }}>
                        Substituir
                        <input type="file" hidden accept="image/*,.pdf,.xls,.xlsx" onChange={async (ev) => {
                          const file = ev.target.files?.[0];
                          if (!file || !user || !selectedClient) return;
                          const filePath = `${selectedClient.id}/${Date.now()}_${file.name}`;
                          const { error: upErr } = await supabase.storage.from("client-documents").upload(filePath, file);
                          if (upErr) { toast.error("Erro ao enviar: " + upErr.message); return; }
                          // Remove old file from storage
                          await supabase.storage.from("client-documents").remove([doc.file_path]);
                          // Update record
                          const { error: dbErr } = await supabase.from("client_documents").update({
                            file_path: filePath, file_size: file.size, mime_type: file.type,
                            document_name: doc.document_name,
                          } as any).eq("id", doc.id);
                          if (dbErr) { toast.error("Erro ao atualizar: " + dbErr.message); return; }
                          toast.success("Documento substituído!");
                          fetchDocuments(selectedClient.id);
                          ev.target.value = "";
                        }} />
                      </label>
                      <button onClick={() => handleDeleteDoc(doc)} style={{
                        padding: "4px 8px", borderRadius: 4, border: "1px solid rgba(239,68,68,0.3)",
                        background: "rgba(239,68,68,0.1)", color: "#ef4444", cursor: "pointer",
                        fontSize: 10, fontFamily: "'DM Sans', sans-serif",
                      }}>Excluir</button>
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
