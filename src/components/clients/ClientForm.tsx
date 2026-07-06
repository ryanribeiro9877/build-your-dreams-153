import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  type ClientFormValues, EMPTY_FORM, STATES,
  inputStyle, selectStyle, labelStyle, secTitle, goldButtonStyle,
  toUpper, formatCPF, formatRG, formatCEP, formatPhone, formatPixKey,
} from "./shared";

interface ClientFormProps {
  mode: "create" | "edit";
  clientId?: string;
  initialValues?: ClientFormValues;
}

// Campos do formulário que mapeiam 1:1 para colunas de `clients`.
// Projeção explícita no UPDATE (R-2 — nada de select/update em "*").
const FORM_COLUMNS = Object.keys(EMPTY_FORM) as (keyof ClientFormValues)[];

export default function ClientForm({ mode, clientId, initialValues }: ClientFormProps) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState<ClientFormValues>(initialValues ?? EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState("");
  const [hasPix, setHasPix] = useState(!!(initialValues?.pix_key));

  // Documentos obrigatórios — só no cadastro. Na edição, documentos são
  // gerenciados na aba "Documentos" do detalhe.
  const [docRgFrente, setDocRgFrente] = useState<File | null>(null);
  const [docRgVerso, setDocRgVerso] = useState<File | null>(null);
  const [docComprovante, setDocComprovante] = useState<File | null>(null);
  const [docIR, setDocIR] = useState<File | null>(null);
  const [docExtratoBancario, setDocExtratoBancario] = useState<File | null>(null);

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

  async function handleCreate() {
    if (!user) return;
    if (!docRgFrente) { toast.error("Anexe o RG (frente)"); return; }
    if (!docRgVerso) { toast.error("Anexe o RG (verso)"); return; }
    if (!docComprovante) { toast.error("Anexe o Comprovante de Residência"); return; }

    setSaving(true);
    const payload: Record<string, unknown> = { created_by: user.id };
    for (const k of FORM_COLUMNS) payload[k] = form[k] === "" ? null : form[k];
    const { data: inserted, error } = await supabase.from("clients").insert(payload as never).select("id").single();
    if (error || !inserted) {
      toast.error("Erro ao criar cliente: " + (error?.message || "sem retorno"));
      setSaving(false);
      return;
    }
    const newId = (inserted as unknown as { id: string }).id;

    const docsToUpload: { file: File; type: string; name: string }[] = [
      { file: docRgFrente, type: "rg", name: "RG Frente" },
      { file: docRgVerso, type: "rg", name: "RG Verso" },
      { file: docComprovante, type: "comprovante_residencia", name: "Comprovante de Residência" },
    ];
    if (docIR) docsToUpload.push({ file: docIR, type: "extrato_ir", name: "Extrato Imposto de Renda" });
    if (docExtratoBancario) docsToUpload.push({ file: docExtratoBancario, type: "extrato_conta", name: "Extrato Bancário" });

    for (const doc of docsToUpload) {
      const filePath = `${newId}/${Date.now()}_${doc.file.name}`;
      const { error: upErr } = await supabase.storage.from("client-documents").upload(filePath, doc.file);
      if (upErr) { toast.error(`Erro ao enviar ${doc.name}: ${upErr.message}`); continue; }
      await supabase.from("client_documents").insert({
        client_id: newId, client_name: form.full_name,
        document_type: doc.type, document_name: doc.name,
        file_path: filePath, file_size: doc.file.size, mime_type: doc.file.type,
        notes: null, uploaded_by: user.id,
      } as never);
    }

    toast.success("Cliente cadastrado com sucesso!");
    navigate(`/clientes/${newId}`);
  }

  async function handleUpdate() {
    if (!clientId) return;
    setSaving(true);
    // Projeção explícita das colunas editáveis (R-2 — sem "*").
    const payload: Record<string, unknown> = {};
    for (const k of FORM_COLUMNS) payload[k] = form[k] === "" ? null : form[k];
    const { error } = await supabase.from("clients").update(payload as never).eq("id", clientId);
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      setSaving(false);
      return;
    }
    toast.success("Cliente atualizado!");
    navigate(`/clientes/${clientId}`);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (mode === "create") void handleCreate();
    else void handleUpdate();
  }

  const isPJ = form.tipo_pessoa === "juridica";

  return (
    <form onSubmit={handleSubmit} className="clients-form" style={{
      background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, padding: 24,
    }}>
      <style>{`
        .clients-form input:focus, .clients-form textarea:focus {
          border-color: rgba(201,168,76,0.6) !important;
          box-shadow: 0 0 0 3px rgba(201,168,76,0.12), 0 2px 8px rgba(0,0,0,0.4) !important;
          transform: translateY(-1px);
        }
        .clients-form select:focus {
          border-color: rgba(201,168,76,0.6) !important;
          box-shadow: 0 0 0 3px rgba(201,168,76,0.12), 0 2px 8px rgba(0,0,0,0.4) !important;
        }
        .clients-form input:hover, .clients-form select:hover, .clients-form textarea:hover {
          border-color: rgba(201,168,76,0.4) !important;
        }
      `}</style>

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
        <div style={secTitle}>{isPJ ? "Dados da Empresa" : "Dados Pessoais"}</div>
        <div>
          <label style={labelStyle}>{isPJ ? "Razão Social *" : "Nome Completo *"}</label>
          <input required style={inputStyle} value={form.full_name} onChange={e => setForm({...form, full_name: toUpper(e.target.value)})} />
        </div>

        {isPJ ? (
          <>
            <div><label style={labelStyle}>Nome Fantasia</label><input style={inputStyle} value={form.fantasy_name} onChange={e => setForm({...form, fantasy_name: toUpper(e.target.value)})} /></div>
            <div><label style={labelStyle}>CNPJ</label><input style={inputStyle} value={form.cnpj} onChange={e => setForm({...form, cnpj: e.target.value})} placeholder="00.000.000/0000-00" /></div>
            <div><label style={labelStyle}>Inscrição Estadual</label><input style={inputStyle} value={form.ie} onChange={e => setForm({...form, ie: e.target.value})} /></div>
            <div><label style={labelStyle}>Inscrição Municipal</label><input style={inputStyle} value={form.im} onChange={e => setForm({...form, im: e.target.value})} /></div>
            <div><label style={labelStyle}>Data de Fundação</label><input type="date" style={inputStyle} value={form.foundation_date} onChange={e => setForm({...form, foundation_date: e.target.value})} /></div>
            <div><label style={labelStyle}>Representante Legal</label><input style={inputStyle} value={form.legal_rep_name} onChange={e => setForm({...form, legal_rep_name: toUpper(e.target.value)})} /></div>
            <div><label style={labelStyle}>CPF do Representante</label><input style={inputStyle} value={form.legal_rep_cpf} onChange={e => setForm({...form, legal_rep_cpf: formatCPF(e.target.value)})} placeholder="000.000.000-00" maxLength={14} /></div>
          </>
        ) : (
          <>
            <div><label style={labelStyle}>CPF</label><input style={inputStyle} value={form.cpf} onChange={e => setForm({...form, cpf: formatCPF(e.target.value)})} placeholder="000.000.000-00" maxLength={14} /></div>
            <div><label style={labelStyle}>RG</label><input style={inputStyle} value={form.rg} onChange={e => setForm({...form, rg: formatRG(e.target.value)})} placeholder="00.000.000-0" maxLength={12} /></div>
            <div><label style={labelStyle}>Órgão Emissor</label><input style={inputStyle} value={form.rg_issuer} onChange={e => setForm({...form, rg_issuer: toUpper(e.target.value)})} placeholder="SSP" /></div>
            <div>
              <label style={labelStyle}>UF do RG</label>
              <select style={selectStyle} value={form.rg_uf} onChange={e => setForm({...form, rg_uf: e.target.value})}>
                {STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div><label style={labelStyle}>Data de Nascimento</label><input type="date" style={inputStyle} value={form.birth_date} onChange={e => setForm({...form, birth_date: e.target.value})} /></div>
            <div>
              <label style={labelStyle}>Sexo</label>
              <select style={selectStyle} value={["masculino","feminino"].includes(form.gender) ? form.gender : "outro"} onChange={e => setForm({...form, gender: e.target.value})}>
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
              <select style={selectStyle} value={form.marital_status} onChange={e => setForm({...form, marital_status: e.target.value})}>
                <option value="solteiro">Solteiro(a)</option>
                <option value="casado">Casado(a)</option>
                <option value="divorciado">Divorciado(a)</option>
                <option value="viuvo">Viúvo(a)</option>
                <option value="uniao_estavel">União Estável</option>
              </select>
            </div>
            <div><label style={labelStyle}>Nacionalidade</label><input style={inputStyle} value={form.nationality} onChange={e => setForm({...form, nationality: toUpper(e.target.value)})} /></div>
            <div><label style={labelStyle}>Naturalidade (Cidade)</label><input style={inputStyle} value={form.natural_city} onChange={e => setForm({...form, natural_city: toUpper(e.target.value)})} /></div>
            <div>
              <label style={labelStyle}>Naturalidade (UF)</label>
              <select style={selectStyle} value={form.natural_uf} onChange={e => setForm({...form, natural_uf: e.target.value})}>
                {STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div><label style={labelStyle}>Profissão</label><input style={inputStyle} value={form.profession} onChange={e => setForm({...form, profession: toUpper(e.target.value)})} /></div>
            <div><label style={labelStyle}>Nome da Mãe</label><input style={inputStyle} value={form.mother_name} onChange={e => setForm({...form, mother_name: toUpper(e.target.value)})} /></div>
            <div><label style={labelStyle}>Nome do Pai</label><input style={inputStyle} value={form.father_name} onChange={e => setForm({...form, father_name: toUpper(e.target.value)})} /></div>
            <div><label style={labelStyle}>PIS / NIT</label><input style={inputStyle} value={form.pis_nit} onChange={e => setForm({...form, pis_nit: toUpper(e.target.value)})} /></div>
          </>
        )}

        {/* Contato */}
        <div style={secTitle}>Contato</div>
        <div><label style={labelStyle}>Email</label><input type="email" style={inputStyle} value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></div>
        <div><label style={labelStyle}>Celular</label><input style={inputStyle} value={form.phone} onChange={e => setForm({...form, phone: formatPhone(e.target.value)})} placeholder="(71) 99999-9999" maxLength={15} /></div>
        <div><label style={labelStyle}>Telefone Comercial</label><input style={inputStyle} value={form.phone_commercial} onChange={e => setForm({...form, phone_commercial: formatPhone(e.target.value)})} placeholder="(71) 99999-9999" maxLength={15} /></div>
        <div><label style={labelStyle}>Telefone Residencial</label><input style={inputStyle} value={form.phone_home} onChange={e => setForm({...form, phone_home: formatPhone(e.target.value)})} placeholder="(71) 99999-9999" maxLength={15} /></div>

        {/* Endereço */}
        <div style={secTitle}>Endereço</div>
        <div>
          <label style={labelStyle}>CEP {cepLoading && <span style={{ color: "#3b82f6", fontWeight: 400 }}>buscando...</span>}</label>
          <input style={{...inputStyle, borderColor: cepError ? "#ef4444" : undefined}} value={form.zip_code} onChange={e => {
            const formatted = formatCEP(e.target.value);
            setForm({...form, zip_code: formatted});
            setCepError("");
            const clean = formatted.replace(/\D/g, "");
            if (clean.length === 8) void fetchAddressByCep(clean);
          }} placeholder="00000-000" maxLength={9} />
          {cepError && <span style={{ fontSize: 10, color: "#ef4444", marginTop: 2, display: "block" }}>{cepError} — preencha manualmente</span>}
        </div>
        <div><label style={labelStyle}>Logradouro</label><input style={inputStyle} value={form.address} onChange={e => setForm({...form, address: toUpper(e.target.value)})} /></div>
        <div><label style={labelStyle}>Número</label><input style={inputStyle} value={form.address_number} onChange={e => setForm({...form, address_number: e.target.value})} /></div>
        <div><label style={labelStyle}>Complemento</label><input style={inputStyle} value={form.address_complement} onChange={e => setForm({...form, address_complement: toUpper(e.target.value)})} /></div>
        <div><label style={labelStyle}>Bairro</label><input style={inputStyle} value={form.neighborhood} onChange={e => setForm({...form, neighborhood: toUpper(e.target.value)})} /></div>
        <div><label style={labelStyle}>Cidade</label><input style={inputStyle} value={form.city} onChange={e => setForm({...form, city: toUpper(e.target.value)})} /></div>
        <div>
          <label style={labelStyle}>Estado</label>
          <select style={selectStyle} value={form.state} onChange={e => setForm({...form, state: e.target.value})}>
            {STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div><label style={labelStyle}>País</label><input style={inputStyle} value={form.country} onChange={e => setForm({...form, country: toUpper(e.target.value)})} /></div>

        {/* Dados Bancários / PIX */}
        <div style={secTitle}>Dados Bancários / PIX</div>
        <div><label style={labelStyle}>Banco</label><input style={inputStyle} value={form.bank_name} onChange={e => setForm({...form, bank_name: toUpper(e.target.value)})} /></div>
        <div><label style={labelStyle}>Agência</label><input style={inputStyle} value={form.bank_agency} onChange={e => setForm({...form, bank_agency: e.target.value})} /></div>
        <div><label style={labelStyle}>Conta</label><input style={inputStyle} value={form.bank_account} onChange={e => setForm({...form, bank_account: e.target.value})} /></div>
        <div>
          <label style={labelStyle}>Tipo de Conta</label>
          <select style={selectStyle} value={form.bank_account_type} onChange={e => setForm({...form, bank_account_type: e.target.value})}>
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
              <select style={selectStyle} value={form.pix_key_type} onChange={e => setForm({...form, pix_key_type: e.target.value, pix_key: ""})}>
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
              />
            </div>
          </>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={labelStyle}>Observações</label>
        <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
      </div>

      {/* Documentos — apenas no cadastro */}
      {mode === "create" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginTop: 16 }}>
          <div style={secTitle}>Documentos Obrigatórios</div>
          <div>
            <label style={labelStyle}>RG — Frente *</label>
            <input type="file" accept="image/*,.pdf" onChange={e => setDocRgFrente(e.target.files?.[0] || null)} style={{ ...inputStyle, padding: "8px 10px", fontSize: 11 }} />
            {docRgFrente && <span style={{ fontSize: 10, color: "var(--gold, #c9a84c)", marginTop: 2, display: "block" }}>{docRgFrente.name}</span>}
          </div>
          <div>
            <label style={labelStyle}>RG — Verso *</label>
            <input type="file" accept="image/*,.pdf" onChange={e => setDocRgVerso(e.target.files?.[0] || null)} style={{ ...inputStyle, padding: "8px 10px", fontSize: 11 }} />
            {docRgVerso && <span style={{ fontSize: 10, color: "var(--gold, #c9a84c)", marginTop: 2, display: "block" }}>{docRgVerso.name}</span>}
          </div>
          <div>
            <label style={labelStyle}>Comprovante de Residência *</label>
            <input type="file" accept="image/*,.pdf" onChange={e => setDocComprovante(e.target.files?.[0] || null)} style={{ ...inputStyle, padding: "8px 10px", fontSize: 11 }} />
            {docComprovante && <span style={{ fontSize: 10, color: "var(--gold, #c9a84c)", marginTop: 2, display: "block" }}>{docComprovante.name}</span>}
          </div>

          <div style={secTitle}>Documentos Opcionais</div>
          <div>
            <label style={labelStyle}>Extrato de Imposto de Renda</label>
            <input type="file" accept="image/*,.pdf,.xls,.xlsx" onChange={e => setDocIR(e.target.files?.[0] || null)} style={{ ...inputStyle, padding: "8px 10px", fontSize: 11 }} />
            {docIR && <span style={{ fontSize: 10, color: "var(--gold, #c9a84c)", marginTop: 2, display: "block" }}>{docIR.name}</span>}
          </div>
          <div>
            <label style={labelStyle}>Extrato Bancário</label>
            <input type="file" accept="image/*,.pdf,.xls,.xlsx" onChange={e => setDocExtratoBancario(e.target.files?.[0] || null)} style={{ ...inputStyle, padding: "8px 10px", fontSize: 11 }} />
            {docExtratoBancario && <span style={{ fontSize: 10, color: "var(--gold, #c9a84c)", marginTop: 2, display: "block" }}>{docExtratoBancario.name}</span>}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button type="submit" disabled={saving} style={{ ...goldButtonStyle, opacity: saving ? 0.6 : 1, cursor: saving ? "wait" : "pointer" }}>
          {saving ? "Salvando…" : mode === "create" ? "Cadastrar Cliente" : "Salvar Alterações"}
        </button>
        <button type="button" className="btn-voltar" disabled={saving} onClick={() => navigate(mode === "edit" && clientId ? `/clientes/${clientId}` : "/clientes")} style={{
          padding: "10px 20px", borderRadius: 10, border: "1px solid var(--border)",
          background: "var(--bg)", color: "var(--text2)", cursor: "pointer",
          fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
        }}>Cancelar</button>
      </div>
    </form>
  );
}
