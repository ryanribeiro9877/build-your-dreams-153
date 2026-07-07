import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  type ClientFormValues, EMPTY_FORM, STATES,
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
  // CPF-UNICO: aviso em tempo real de "CPF já cadastrado no sistema".
  const [cpfDuplicate, setCpfDuplicate] = useState(false);

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

  // CPF-UNICO (Passo 2): ao completar um CPF (11 dígitos), consulta o índice
  // cego via RPC `search_clients_by_cpf`. Se houver um cliente diferente do
  // atual (na edição, exclui o próprio id), marca duplicata → mensagem vermelha
  // e bloqueia o salvar. Debounce leve; só dispara com CPF completo.
  useEffect(() => {
    const digits = form.cpf.replace(/\D/g, "");
    if (digits.length !== 11) { setCpfDuplicate(false); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data, error } = await (supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: { id: string }[] | null; error: unknown }>;
      }).rpc("search_clients_by_cpf", { cpf_input: form.cpf });
      if (cancelled) return;
      if (error) { setCpfDuplicate(false); return; }
      const matches = ((data as { id: string }[] | null) ?? []).filter(r => r.id !== clientId);
      setCpfDuplicate(matches.length > 0);
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [form.cpf, clientId]);

  async function handleCreate() {
    if (!user) return;
    if (!docRgFrente) { toast.error("Anexe o RG (frente)"); return; }
    if (!docRgVerso) { toast.error("Anexe o RG (verso)"); return; }
    if (!docComprovante) { toast.error("Anexe o Comprovante de Residência"); return; }

    setSaving(true);
    // R-2 Fase 2C: escrita pela via CIFRADA. Em vez de inserir na tabela (que
    // gravaria a PII em texto puro), chamamos a RPC save_client, que cifra a
    // PII server-side em *_enc/cpf_bidx e NUNCA toca as colunas de texto.
    // created_by é fixado server-side (auth.uid()).
    const payload: Record<string, unknown> = {};
    for (const k of FORM_COLUMNS) payload[k] = form[k] === "" ? null : form[k];
    const { data: newId, error } = await (supabase as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: string | null; error: { code?: string; message?: string } | null }>;
    }).rpc("save_client", { p_id: null, p_data: payload });
    if (error || !newId) {
      // Passo 3: unicidade real é o índice `clients_cpf_bidx_uniq`. Se o insert
      // bater nele (corrida/importação/bypass), o Postgres devolve 23505 →
      // mesma mensagem vermelha em vez de um erro genérico.
      if (error?.code === "23505") {
        setCpfDuplicate(true);
        toast.error("CPF já cadastrado no sistema.");
      } else {
        toast.error("Erro ao criar cliente: " + (error?.message || "sem retorno"));
      }
      setSaving(false);
      return;
    }

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
    // R-2 Fase 2C: edição pela via CIFRADA (RPC save_client) — a PII é recifrada
    // server-side em *_enc/cpf_bidx a partir do valor decifrado que o form
    // devolve; as colunas de texto puro nunca são tocadas.
    const payload: Record<string, unknown> = {};
    for (const k of FORM_COLUMNS) payload[k] = form[k] === "" ? null : form[k];
    const { error } = await (supabase as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: string | null; error: { code?: string; message?: string } | null }>;
    }).rpc("save_client", { p_id: clientId, p_data: payload });
    if (error) {
      // Passo 3: mesma defesa do índice único no caminho de edição.
      if (error.code === "23505") {
        setCpfDuplicate(true);
        toast.error("CPF já cadastrado no sistema.");
      } else {
        toast.error("Erro ao salvar: " + (error.message || "sem retorno"));
      }
      setSaving(false);
      return;
    }
    toast.success("Cliente atualizado!");
    navigate(`/clientes/${clientId}`);
  }

  // Validação condicional do PIX: com "Possui PIX? = Sim", tipo + valor da
  // chave são obrigatórios (Gap B). Além da obrigatoriedade, confere o formato
  // conforme o tipo. Retorna a mensagem de erro, ou null se estiver ok.
  // Não altera o armazenamento (R-2): o valor segue pela via cifrada normal.
  function validatePix(): string | null {
    if (!hasPix) return null;
    if (!form.pix_key_type) return "Selecione o tipo da chave PIX";
    const value = form.pix_key.trim();
    if (!value) return "Informe a chave PIX";
    const digits = value.replace(/\D/g, "");
    switch (form.pix_key_type) {
      case "cpf":
        if (digits.length !== 11) return "Chave PIX (CPF) inválida — informe 11 dígitos";
        break;
      case "cnpj":
        if (digits.length !== 14) return "Chave PIX (CNPJ) inválida — informe 14 dígitos";
        break;
      case "telefone":
        if (digits.length < 10 || digits.length > 11) return "Chave PIX (telefone) inválida — informe DDD + número";
        break;
      case "email":
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Chave PIX (email) inválida";
        break;
      // "aleatoria": qualquer valor não vazio já foi aceito acima.
    }
    return null;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving || cpfDuplicate) return;
    const pixError = validatePix();
    if (pixError) { toast.error(pixError); return; }
    if (mode === "create") void handleCreate();
    else void handleUpdate();
  }

  const isPJ = form.tipo_pessoa === "juridica";

  return (
    <form onSubmit={handleSubmit} className="cli-form-card">
      <div className="cli-formgrid">
        {/* Classificação */}
        <div className="cli-formsec">Classificação</div>
        <div>
          <label className="cli-label">Tipo de Pessoa *</label>
          <select className="cli-select" value={form.tipo_pessoa} onChange={e => setForm({...form, tipo_pessoa: e.target.value})}>
            <option value="fisica">Pessoa Física</option>
            <option value="juridica">Pessoa Jurídica</option>
          </select>
        </div>
        <div>
          <label className="cli-label">Situação</label>
          <select className="cli-select" value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
            <option value="prospecto">Prospecto</option>
          </select>
        </div>
        <div>
          <label className="cli-label">Perfil do GOV.BR</label>
          <select className="cli-select" value={form.gov_br_profile} onChange={e => setForm({...form, gov_br_profile: e.target.value})} required>
            <option value="ouro">Ouro</option>
            <option value="prata">Prata</option>
            <option value="bronze">Bronze</option>
          </select>
        </div>
        <div>
          <label className="cli-label">Origem / Captação</label>
          <select className="cli-select" value={["indicacao","ressaque","whatsapp","marketing","site"].includes(form.client_origin) ? form.client_origin : "outro"} onChange={e => setForm({...form, client_origin: e.target.value})} required>
            <option value="indicacao">Indicação</option>
            <option value="ressaque">Ressaque</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="marketing">Marketing / Anúncio</option>
            <option value="site">Site</option>
            <option value="outro">Outro</option>
          </select>
          {!["indicacao","ressaque","whatsapp","marketing","site"].includes(form.client_origin) || form.client_origin === "outro" ? (
            <input className="cli-input" style={{ marginTop: 6 }} value={form.client_origin === "outro" ? "" : form.client_origin} onChange={e => setForm({...form, client_origin: e.target.value})} placeholder="Informe a origem..." />
          ) : null}
        </div>

        {/* Identificação */}
        <div className="cli-formsec">{isPJ ? "Dados da Empresa" : "Dados Pessoais"}</div>
        <div>
          <label className="cli-label">{isPJ ? "Razão Social *" : "Nome Completo *"}</label>
          <input required className="cli-input" value={form.full_name} onChange={e => setForm({...form, full_name: toUpper(e.target.value)})} />
        </div>

        {isPJ ? (
          <>
            <div><label className="cli-label">Nome Fantasia</label><input className="cli-input" value={form.fantasy_name} onChange={e => setForm({...form, fantasy_name: toUpper(e.target.value)})} /></div>
            <div><label className="cli-label">CNPJ</label><input className="cli-input" value={form.cnpj} onChange={e => setForm({...form, cnpj: e.target.value})} placeholder="00.000.000/0000-00" /></div>
            <div><label className="cli-label">Inscrição Estadual</label><input className="cli-input" value={form.ie} onChange={e => setForm({...form, ie: e.target.value})} /></div>
            <div><label className="cli-label">Inscrição Municipal</label><input className="cli-input" value={form.im} onChange={e => setForm({...form, im: e.target.value})} /></div>
            <div><label className="cli-label">Data de Fundação</label><input type="date" className="cli-input" value={form.foundation_date} onChange={e => setForm({...form, foundation_date: e.target.value})} /></div>
            <div><label className="cli-label">Representante Legal</label><input className="cli-input" value={form.legal_rep_name} onChange={e => setForm({...form, legal_rep_name: toUpper(e.target.value)})} /></div>
            <div><label className="cli-label">CPF do Representante</label><input className="cli-input" value={form.legal_rep_cpf} onChange={e => setForm({...form, legal_rep_cpf: formatCPF(e.target.value)})} placeholder="000.000.000-00" maxLength={14} /></div>
          </>
        ) : (
          <>
            <div>
              <label className="cli-label">CPF</label>
              <input className="cli-input" style={cpfDuplicate ? { borderColor: "#B4442E" } : undefined} value={form.cpf} onChange={e => setForm({...form, cpf: formatCPF(e.target.value)})} placeholder="000.000.000-00" maxLength={14} />
              {cpfDuplicate && <span className="cli-cep-error">CPF já cadastrado no sistema.</span>}
            </div>
            <div><label className="cli-label">RG</label><input className="cli-input" value={form.rg} onChange={e => setForm({...form, rg: formatRG(e.target.value)})} placeholder="00.000.000-0" maxLength={12} /></div>
            <div><label className="cli-label">Órgão Emissor</label><input className="cli-input" value={form.rg_issuer} onChange={e => setForm({...form, rg_issuer: toUpper(e.target.value)})} placeholder="SSP" /></div>
            <div>
              <label className="cli-label">UF do RG</label>
              <select className="cli-select" value={form.rg_uf} onChange={e => setForm({...form, rg_uf: e.target.value})}>
                {STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div><label className="cli-label">Data de Nascimento</label><input type="date" className="cli-input" value={form.birth_date} onChange={e => setForm({...form, birth_date: e.target.value})} /></div>
            <div>
              <label className="cli-label">Sexo</label>
              <select className="cli-select" value={["masculino","feminino"].includes(form.gender) ? form.gender : "outro"} onChange={e => setForm({...form, gender: e.target.value})}>
                <option value="masculino">Masculino</option>
                <option value="feminino">Feminino</option>
                <option value="outro">Outro</option>
              </select>
              {!["masculino","feminino"].includes(form.gender) || form.gender === "outro" ? (
                <input className="cli-input" style={{ marginTop: 6 }} value={form.gender === "outro" ? "" : form.gender} onChange={e => setForm({...form, gender: e.target.value})} placeholder="Informe..." />
              ) : null}
            </div>
            <div>
              <label className="cli-label">Estado Civil</label>
              <select className="cli-select" value={form.marital_status} onChange={e => setForm({...form, marital_status: e.target.value})}>
                <option value="solteiro">Solteiro(a)</option>
                <option value="casado">Casado(a)</option>
                <option value="divorciado">Divorciado(a)</option>
                <option value="viuvo">Viúvo(a)</option>
                <option value="uniao_estavel">União Estável</option>
              </select>
            </div>
            <div><label className="cli-label">Nacionalidade</label><input className="cli-input" value={form.nationality} onChange={e => setForm({...form, nationality: toUpper(e.target.value)})} /></div>
            <div><label className="cli-label">Naturalidade (Cidade)</label><input className="cli-input" value={form.natural_city} onChange={e => setForm({...form, natural_city: toUpper(e.target.value)})} /></div>
            <div>
              <label className="cli-label">Naturalidade (UF)</label>
              <select className="cli-select" value={form.natural_uf} onChange={e => setForm({...form, natural_uf: e.target.value})}>
                {STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div><label className="cli-label">Profissão</label><input className="cli-input" value={form.profession} onChange={e => setForm({...form, profession: toUpper(e.target.value)})} /></div>
            <div><label className="cli-label">Nome da Mãe</label><input className="cli-input" value={form.mother_name} onChange={e => setForm({...form, mother_name: toUpper(e.target.value)})} /></div>
            <div><label className="cli-label">Nome do Pai</label><input className="cli-input" value={form.father_name} onChange={e => setForm({...form, father_name: toUpper(e.target.value)})} /></div>
            <div><label className="cli-label">PIS / NIT</label><input className="cli-input" value={form.pis_nit} onChange={e => setForm({...form, pis_nit: toUpper(e.target.value)})} /></div>
          </>
        )}

        {/* Contato */}
        <div className="cli-formsec">Contato</div>
        <div><label className="cli-label">Email</label><input type="email" className="cli-input" value={form.email} onChange={e => setForm({...form, email: e.target.value})} /></div>
        <div>
          <label className="cli-label">Celular</label>
          <input className="cli-input" value={form.phone} onChange={e => setForm({...form, phone: formatPhone(e.target.value)})} placeholder="(71) 99999-9999" maxLength={15} />
          <label className="cli-wa-check"><input type="checkbox" checked={form.phone_is_whatsapp} onChange={e => setForm({...form, phone_is_whatsapp: e.target.checked})} /> WhatsApp</label>
        </div>
        <div>
          <label className="cli-label">Telefone Comercial</label>
          <input className="cli-input" value={form.phone_commercial} onChange={e => setForm({...form, phone_commercial: formatPhone(e.target.value)})} placeholder="(71) 99999-9999" maxLength={15} />
          <label className="cli-wa-check"><input type="checkbox" checked={form.phone_commercial_is_whatsapp} onChange={e => setForm({...form, phone_commercial_is_whatsapp: e.target.checked})} /> WhatsApp</label>
        </div>
        <div>
          <label className="cli-label">Telefone Residencial</label>
          <input className="cli-input" value={form.phone_home} onChange={e => setForm({...form, phone_home: formatPhone(e.target.value)})} placeholder="(71) 99999-9999" maxLength={15} />
          <label className="cli-wa-check"><input type="checkbox" checked={form.phone_home_is_whatsapp} onChange={e => setForm({...form, phone_home_is_whatsapp: e.target.checked})} /> WhatsApp</label>
        </div>

        {/* Endereço */}
        <div className="cli-formsec">Endereço</div>
        <div>
          <label className="cli-label">CEP {cepLoading && <span className="cli-cep-hint">buscando...</span>}</label>
          <input className="cli-input" style={cepError ? { borderColor: "#B4442E" } : undefined} value={form.zip_code} onChange={e => {
            const formatted = formatCEP(e.target.value);
            setForm({...form, zip_code: formatted});
            setCepError("");
            const clean = formatted.replace(/\D/g, "");
            if (clean.length === 8) void fetchAddressByCep(clean);
          }} placeholder="00000-000" maxLength={9} />
          {cepError && <span className="cli-cep-error">{cepError} — preencha manualmente</span>}
        </div>
        <div><label className="cli-label">Logradouro</label><input className="cli-input" value={form.address} onChange={e => setForm({...form, address: toUpper(e.target.value)})} /></div>
        <div><label className="cli-label">Número</label><input className="cli-input" value={form.address_number} onChange={e => setForm({...form, address_number: e.target.value})} /></div>
        <div><label className="cli-label">Complemento</label><input className="cli-input" value={form.address_complement} onChange={e => setForm({...form, address_complement: toUpper(e.target.value)})} /></div>
        <div><label className="cli-label">Bairro</label><input className="cli-input" value={form.neighborhood} onChange={e => setForm({...form, neighborhood: toUpper(e.target.value)})} /></div>
        <div><label className="cli-label">Cidade</label><input className="cli-input" value={form.city} onChange={e => setForm({...form, city: toUpper(e.target.value)})} /></div>
        <div>
          <label className="cli-label">Estado</label>
          <select className="cli-select" value={form.state} onChange={e => setForm({...form, state: e.target.value})}>
            {STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div><label className="cli-label">País</label><input className="cli-input" value={form.country} onChange={e => setForm({...form, country: toUpper(e.target.value)})} /></div>

        {/* Dados Bancários / PIX */}
        <div className="cli-formsec">Dados Bancários / PIX</div>
        <div><label className="cli-label">Banco</label><input className="cli-input" value={form.bank_name} onChange={e => setForm({...form, bank_name: toUpper(e.target.value)})} /></div>
        <div><label className="cli-label">Agência</label><input className="cli-input" value={form.bank_agency} onChange={e => setForm({...form, bank_agency: e.target.value})} /></div>
        <div><label className="cli-label">Conta</label><input className="cli-input" value={form.bank_account} onChange={e => setForm({...form, bank_account: e.target.value})} /></div>
        <div>
          <label className="cli-label">Tipo de Conta</label>
          <select className="cli-select" value={form.bank_account_type} onChange={e => setForm({...form, bank_account_type: e.target.value})}>
            <option value="corrente">Corrente</option>
            <option value="poupanca">Poupança</option>
          </select>
        </div>
        <div className="cli-pixrow">
          <span className="lbl">Possui PIX?</span>
          <label><input type="radio" name="hasPix" checked={hasPix} onChange={() => setHasPix(true)} /> Sim</label>
          <label><input type="radio" name="hasPix" checked={!hasPix} onChange={() => { setHasPix(false); setForm({...form, pix_key: "", pix_key_type: "cpf"}); }} /> Não</label>
        </div>
        {hasPix && (
          <>
            <div>
              <label className="cli-label">Tipo da Chave PIX</label>
              <select className="cli-select" value={form.pix_key_type} onChange={e => setForm({...form, pix_key_type: e.target.value, pix_key: ""})}>
                <option value="cpf">CPF</option>
                <option value="cnpj">CNPJ</option>
                <option value="email">Email</option>
                <option value="telefone">Telefone</option>
                <option value="aleatoria">Aleatória</option>
              </select>
            </div>
            <div>
              <label className="cli-label">Chave PIX</label>
              <input
                className="cli-input"
                value={form.pix_key}
                onChange={e => setForm({...form, pix_key: formatPixKey(e.target.value, form.pix_key_type)})}
                placeholder={form.pix_key_type === "cpf" ? "000.000.000-00" : form.pix_key_type === "cnpj" ? "00.000.000/0001-00" : form.pix_key_type === "telefone" ? "(00) 00000-0000" : form.pix_key_type === "email" ? "email@exemplo.com" : "Chave aleatória"}
              />
            </div>
          </>
        )}

        {/* Observações */}
        <div className="cli-formsec">Observações</div>
        <div style={{ gridColumn: "1 / -1" }}>
          <textarea className="cli-textarea" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
        </div>

        {/* Documentos — apenas no cadastro */}
        {mode === "create" && (
          <>
            <div className="cli-formsec">Documentos Obrigatórios</div>
            <div>
              <label className="cli-label">RG — Frente *</label>
              <input type="file" accept="image/*,.pdf" className="cli-input file" onChange={e => setDocRgFrente(e.target.files?.[0] || null)} />
              {docRgFrente && <span className="cli-filename">{docRgFrente.name}</span>}
            </div>
            <div>
              <label className="cli-label">RG — Verso *</label>
              <input type="file" accept="image/*,.pdf" className="cli-input file" onChange={e => setDocRgVerso(e.target.files?.[0] || null)} />
              {docRgVerso && <span className="cli-filename">{docRgVerso.name}</span>}
            </div>
            <div>
              <label className="cli-label">Comprovante de Residência *</label>
              <input type="file" accept="image/*,.pdf" className="cli-input file" onChange={e => setDocComprovante(e.target.files?.[0] || null)} />
              {docComprovante && <span className="cli-filename">{docComprovante.name}</span>}
            </div>

            <div className="cli-formsec">Documentos Opcionais</div>
            <div>
              <label className="cli-label">Extrato de Imposto de Renda</label>
              <input type="file" accept="image/*,.pdf,.xls,.xlsx" className="cli-input file" onChange={e => setDocIR(e.target.files?.[0] || null)} />
              {docIR && <span className="cli-filename">{docIR.name}</span>}
            </div>
            <div>
              <label className="cli-label">Extrato Bancário</label>
              <input type="file" accept="image/*,.pdf,.xls,.xlsx" className="cli-input file" onChange={e => setDocExtratoBancario(e.target.files?.[0] || null)} />
              {docExtratoBancario && <span className="cli-filename">{docExtratoBancario.name}</span>}
            </div>
          </>
        )}
      </div>

      <div className="cli-form-actions">
        <button type="submit" className="cli-btn" disabled={saving || cpfDuplicate}>
          {saving ? "Salvando…" : mode === "create" ? "Cadastrar Cliente" : "Salvar Alterações"}
        </button>
        <button type="button" className="cli-btn ghost" disabled={saving} onClick={() => navigate(mode === "edit" && clientId ? `/clientes/${clientId}` : "/clientes")}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
