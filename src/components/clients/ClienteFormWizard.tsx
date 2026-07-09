import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  type ClientFormValues, EMPTY_FORM, STATES, maskValue, formatDateBR,
  toUpper, formatCPF, formatCNPJ, formatRG, formatCEP, formatPhone, formatPixKey,
  isValidCPF, isValidCNPJ, isValidEmail,
} from "./shared";
import { fetchMunicipios } from "@/lib/ibge";
import {
  CLIENT_DOC_SLOTS, type ClientDocSlot, uploadClientDocuments, uploadSignedDocument,
} from "@/lib/clientDocuments";
import { runCooperadoOnboarding, type CooperadoOnboardingResult } from "@/lib/cooperadoOnboarding";
import { REVISAO_ANTES_ASSINATURA } from "@/lib/cooperadoDocs";

/* ============================================================
   CADASTRO-MODELO-A — ClienteFormWizard (fonte única)
   Wizard de 5 etapas + revisão, espelho do cadastro manual.
   Consumido por:
     - a página "+ Novo Cliente" (Clients.tsx / ClientNew), e
     - o chat (render inline quando o agente dispara o cadastro).
   Campos, máscaras e validações vêm de ./shared (nunca recriar).
   Gravação: RPC save_client (SECURITY DEFINER) — mesma via cifrada
   do cadastro manual; PII sensível cifrada em *_enc server-side.
============================================================ */

const FORM_COLUMNS = Object.keys(EMPTY_FORM) as (keyof ClientFormValues)[];

// Opção do wizard: "não possui chave PIX" (§6). Não é um pix_key_type real —
// no payload vira pix_key_type/pix_key = null.
const PIX_NONE = "sem_chave";

// Valor gravado quando um telefone OPCIONAL é marcado como "não possui" (ponto 2).
// É explícito (não vazio) para NÃO virar [A PREENCHER] no documento/revisão —
// [A PREENCHER] é só para obrigatório realmente ausente.
const NAO_POSSUI = "não possui";

const STEPS = [
  { key: "classificacao", label: "Classificação" },
  { key: "pessoais", label: "Dados pessoais" },
  { key: "contato", label: "Contato" },
  { key: "endereco", label: "Endereço" },
  { key: "bancario", label: "Bancário / PIX" },
] as const;

interface Props {
  mode: "create" | "edit";
  clientId?: string;
  initialValues?: ClientFormValues;
  /** disparado após gravar (create). O chat usa para seguir à fase de documentos. */
  onSaved?: (clientId: string, clientName: string) => void;
  onCancel?: () => void;
  /** "page": já está dentro de .cli-root. "chat": embrulhamos em .cli-root. */
  variant?: "page" | "chat";
}

export default function ClienteFormWizard({
  mode, clientId, initialValues, onSaved, onCancel, variant = "page",
}: Props) {
  const { user } = useAuth();

  const [form, setForm] = useState<ClientFormValues>(initialValues ?? EMPTY_FORM);
  const [step, setStep] = useState(0);          // 0..4
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [cpfDuplicate, setCpfDuplicate] = useState(false);

  // PIX: se o cliente não tem chave, começa em "não possui".
  const [pixMode, setPixMode] = useState<string>(
    initialValues && !initialValues.pix_key ? PIX_NONE : (initialValues?.pix_key_type || "cpf"),
  );

  // Telefones opcionais marcados "não possui" (ponto 2).
  const [phoneCommNone, setPhoneCommNone] = useState(initialValues?.phone_commercial === NAO_POSSUI);
  const [phoneHomeNone, setPhoneHomeNone] = useState(initialValues?.phone_home === NAO_POSSUI);

  // Ref do card no chat para scrollIntoView (ponto 1).
  const cardRef = useRef<HTMLDivElement>(null);

  const patch = (p: Partial<ClientFormValues>) => setForm(prev => ({ ...prev, ...p }));
  const isPJ = form.tipo_pessoa === "juridica";

  /* ---------- CEP (ViaCEP) — mapeamento correto (§5) ---------- */
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState("");

  async function fetchAddressByCep(cleanCep: string) {
    if (cleanCep.length !== 8) return;
    setCepLoading(true);
    setCepError("");
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await res.json();
      if (data.erro) { setCepError("CEP não encontrado"); return; }
      const uf = data.uf || form.state;
      // Mapeamento EXATO (§5): logradouro→address, bairro→neighborhood,
      // localidade→city, uf→state. Número e complemento ficam com o usuário
      // (ViaCEP não os retorna) — NÃO deslocar campos.
      setForm(prev => ({
        ...prev,
        address: (data.logradouro || prev.address || "").toUpperCase(),
        neighborhood: (data.bairro || prev.neighborhood || "").toUpperCase(),
        state: uf,
        city: (data.localidade || "").toUpperCase(),
      }));
      // carrega os municípios da UF resolvida para o select de cidade
      if (uf) void loadMunicipios(uf);
    } catch {
      setCepError("Erro ao buscar CEP");
    } finally {
      setCepLoading(false);
    }
  }

  /* ---------- IBGE: municípios por UF (§4) ---------- */
  const [cityOptions, setCityOptions] = useState<string[]>([]);
  const [naturalCityOptions, setNaturalCityOptions] = useState<string[]>([]);

  async function loadMunicipios(uf: string) {
    const list = await fetchMunicipios(uf);
    setCityOptions(list);
  }
  async function loadNaturalMunicipios(uf: string) {
    const list = await fetchMunicipios(uf);
    setNaturalCityOptions(list);
  }

  // Carrega municípios das UFs iniciais (edição / defaults) uma vez.
  const bootRef = useRef(false);
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    if (form.state) void loadMunicipios(form.state);
    if (!isPJ && form.natural_uf) void loadNaturalMunicipios(form.natural_uf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ponto 1: no chat, trazer o card para a área visível ao montar e a cada etapa
  // (o card tem altura limitada ao viewport; o scroll de página não é exigido).
  useEffect(() => {
    if (variant === "chat") cardRef.current?.scrollIntoView({ block: "nearest" });
  }, [variant, step, reviewing]);

  // Garante que um valor já salvo apareça no select mesmo antes de o IBGE responder.
  const cityChoices = useMemo(() => {
    const s = new Set(cityOptions);
    if (form.city && !s.has(form.city)) return [form.city, ...cityOptions];
    return cityOptions;
  }, [cityOptions, form.city]);
  const naturalCityChoices = useMemo(() => {
    const s = new Set(naturalCityOptions);
    if (form.natural_city && !s.has(form.natural_city)) return [form.natural_city, ...naturalCityOptions];
    return naturalCityOptions;
  }, [naturalCityOptions, form.natural_city]);

  /* ---------- CPF único (índice cego) — mesmo comportamento do cadastro manual ---------- */
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

  /* ---------- Validação por etapa (bloqueia o avanço) ---------- */
  function validateStep(i: number): string | null {
    if (i === 0) {
      if (!form.client_origin.trim()) return "Informe a origem / captação";
      if (!form.gov_br_profile) return "Selecione o perfil do GOV.BR";
      return null;
    }
    if (i === 1) {
      if (!form.full_name.trim()) return isPJ ? "Informe a Razão Social" : "Informe o nome completo";
      if (isPJ) {
        if (form.cnpj && !isValidCNPJ(form.cnpj)) return "CNPJ inválido (dígitos verificadores)";
        if (form.legal_rep_cpf && !isValidCPF(form.legal_rep_cpf)) return "CPF do representante inválido";
        return null;
      }
      // PF — formato sempre; obrigatoriedade dos doc-críticos só no cadastro (§9).
      // Na edição não travamos registros legados que ainda não têm esses campos.
      if (form.cpf && !isValidCPF(form.cpf)) return "CPF inválido (dígitos verificadores)";
      if (mode === "create") {
        if (!form.rg.trim()) return "Informe o RG";
        if (!form.birth_date) return "Informe a data de nascimento";
        if (!form.nationality.trim()) return "Informe a nacionalidade";
        if (!form.marital_status) return "Informe o estado civil";
      }
      return null;
    }
    if (i === 2) {
      if (form.email && !isValidEmail(form.email)) return "E-mail inválido";
      return null;
    }
    if (i === 4) {
      if (pixMode !== PIX_NONE) {
        const value = form.pix_key.trim();
        if (value) {
          const digits = value.replace(/\D/g, "");
          if (pixMode === "cpf" && digits.length !== 11) return "Chave PIX (CPF) inválida";
          if (pixMode === "cnpj" && digits.length !== 14) return "Chave PIX (CNPJ) inválida";
          if (pixMode === "telefone" && (digits.length < 10 || digits.length > 11)) return "Chave PIX (telefone) inválida";
          if (pixMode === "email" && !isValidEmail(value)) return "Chave PIX (e-mail) inválida";
        }
      }
      return null;
    }
    return null;
  }

  function goNext() {
    const err = validateStep(step);
    if (err) { toast.error(err); return; }
    if (step < STEPS.length - 1) setStep(step + 1);
    else setReviewing(true);
  }
  function goBack() {
    if (reviewing) { setReviewing(false); return; }
    if (step > 0) setStep(step - 1);
    else onCancel?.();
  }

  /* ---------- Gravação (save_client — via cifrada) ---------- */
  async function handleConfirm() {
    if (saving || cpfDuplicate) return;
    // revalida todas as etapas antes de gravar
    for (let i = 0; i < STEPS.length; i++) {
      const err = validateStep(i);
      if (err) { toast.error(`${STEPS[i].label}: ${err}`); setReviewing(false); setStep(i); return; }
    }
    setSaving(true);
    const payload: Record<string, unknown> = {};
    for (const k of FORM_COLUMNS) payload[k] = form[k] === "" ? null : form[k];
    // §6: "não possui chave PIX" → tipo e chave nulos.
    if (pixMode === PIX_NONE) { payload.pix_key = null; payload.pix_key_type = null; }
    else { payload.pix_key_type = pixMode; }

    const { data: newId, error } = await (supabase as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: string | null; error: { code?: string; message?: string } | null }>;
    }).rpc("save_client", { p_id: mode === "edit" ? clientId : null, p_data: payload });

    if (error || (mode === "create" && !newId)) {
      if (error?.code === "23505") {
        setCpfDuplicate(true);
        toast.error("CPF já cadastrado no sistema.");
        setReviewing(false); setStep(1);
      } else {
        toast.error("Erro ao salvar: " + (error?.message || "sem retorno"));
      }
      setSaving(false);
      return;
    }

    const id = mode === "edit" ? (clientId as string) : (newId as string);
    setSaving(false);
    if (mode === "edit") { toast.success("Cliente atualizado!"); onSaved?.(id, form.full_name); return; }
    toast.success("Cliente cadastrado!");
    setSavedId(id);
    onSaved?.(id, form.full_name);
  }

  /* ---------- Fase de documentos (pós-cadastro, create) ---------- */
  if (savedId && mode === "create") {
    const inner = <ClientDocumentsPhase clientId={savedId} clientName={form.full_name} userId={user?.id ?? ""} onDone={onCancel} />;
    return variant === "chat" ? <div className="cli-root">{inner}</div> : inner;
  }

  /* ---------- Render ---------- */
  const stepBody = reviewing ? renderReview() : (
    step === 0 ? renderClassificacao()
      : step === 1 ? renderPessoais()
        : step === 2 ? renderContato()
          : step === 3 ? renderEndereco()
            : renderBancario()
  );

  const currentIndex = reviewing ? STEPS.length : step;

  const card = (
    <div className="cli-form-card cli-wizard" ref={cardRef}>
      {/* progresso */}
      <div className="cli-steps" role="list">
        {STEPS.map((s, i) => (
          <div key={s.key} role="listitem"
            className={`cli-step${i === step && !reviewing ? " active" : ""}${i < currentIndex ? " done" : ""}`}>
            <span className="n">{i + 1}</span>
            <span className="t">{s.label}</span>
          </div>
        ))}
        <div className={`cli-step${reviewing ? " active" : ""}`} role="listitem">
          <span className="n">✓</span><span className="t">Revisão</span>
        </div>
      </div>

      <div className="cli-formgrid">{stepBody}</div>

      <div className="cli-form-actions">
        {(step > 0 || reviewing || onCancel) && (
          <button type="button" className="cli-btn ghost" disabled={saving} onClick={goBack}>
            {reviewing || step > 0 ? "← Voltar" : "Cancelar"}
          </button>
        )}
        {reviewing ? (
          <button type="button" className="cli-btn" disabled={saving || cpfDuplicate} onClick={() => void handleConfirm()}>
            {saving ? "Gravando…" : mode === "edit" ? "Salvar alterações" : "Confirmar cadastro"}
          </button>
        ) : (
          <button type="button" className="cli-btn" onClick={goNext}>
            {step === STEPS.length - 1 ? "Revisar e cadastrar →" : "Próximo →"}
          </button>
        )}
      </div>
    </div>
  );

  return variant === "chat" ? <div className="cli-root cli-wizard-chat">{card}</div> : card;

  /* ---------- Sub-renders ---------- */
  function renderClassificacao() {
    const originIsPreset = ["indicacao","ressaque","whatsapp","marketing","site"].includes(form.client_origin);
    return (
      <>
        <div className="cli-formsec">Classificação</div>
        <div>
          <label className="cli-label">Tipo de Pessoa *</label>
          <select className="cli-select" value={form.tipo_pessoa} onChange={e => patch({ tipo_pessoa: e.target.value })}>
            <option value="fisica">Pessoa Física</option>
            <option value="juridica">Pessoa Jurídica</option>
          </select>
        </div>
        <div>
          <label className="cli-label">Origem / Captação *</label>
          <select className="cli-select" value={originIsPreset ? form.client_origin : "outro"} onChange={e => patch({ client_origin: e.target.value })}>
            <option value="indicacao">Indicação</option>
            <option value="ressaque">Ressaque</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="marketing">Marketing / Anúncio</option>
            <option value="site">Site</option>
            <option value="outro">Outro</option>
          </select>
          {!originIsPreset && (
            <input className="cli-input" style={{ marginTop: 6 }} value={form.client_origin === "outro" ? "" : form.client_origin}
              onChange={e => patch({ client_origin: e.target.value })} placeholder="Informe a origem..." />
          )}
        </div>
        <div>
          <label className="cli-label">Perfil do GOV.BR *</label>
          <select className="cli-select" value={form.gov_br_profile} onChange={e => patch({ gov_br_profile: e.target.value })}>
            <option value="ouro">Ouro</option>
            <option value="prata">Prata</option>
            <option value="bronze">Bronze</option>
          </select>
        </div>
        <div>
          <label className="cli-label">Situação</label>
          <select className="cli-select" value={form.status} onChange={e => patch({ status: e.target.value })}>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
            <option value="prospecto">Prospecto</option>
          </select>
        </div>
      </>
    );
  }

  function renderPessoais() {
    if (isPJ) {
      return (
        <>
          <div className="cli-formsec">Dados da Empresa</div>
          <div><label className="cli-label">Razão Social *</label><input className="cli-input" value={form.full_name} onChange={e => patch({ full_name: toUpper(e.target.value) })} /></div>
          <div><label className="cli-label">Nome Fantasia</label><input className="cli-input" value={form.fantasy_name} onChange={e => patch({ fantasy_name: toUpper(e.target.value) })} /></div>
          <div><label className="cli-label">CNPJ</label><input className="cli-input" value={form.cnpj} onChange={e => patch({ cnpj: formatCNPJ(e.target.value) })} placeholder="00.000.000/0000-00" maxLength={18} /></div>
          <div><label className="cli-label">Inscrição Estadual</label><input className="cli-input" value={form.ie} onChange={e => patch({ ie: e.target.value })} /></div>
          <div><label className="cli-label">Inscrição Municipal</label><input className="cli-input" value={form.im} onChange={e => patch({ im: e.target.value })} /></div>
          <div><label className="cli-label">Data de Fundação</label><input type="date" className="cli-input" value={form.foundation_date} onChange={e => patch({ foundation_date: e.target.value })} /></div>
          <div><label className="cli-label">Representante Legal</label><input className="cli-input" value={form.legal_rep_name} onChange={e => patch({ legal_rep_name: toUpper(e.target.value) })} /></div>
          <div><label className="cli-label">CPF do Representante</label><input className="cli-input" value={form.legal_rep_cpf} onChange={e => patch({ legal_rep_cpf: formatCPF(e.target.value) })} placeholder="000.000.000-00" maxLength={14} /></div>
        </>
      );
    }
    return (
      <>
        <div className="cli-formsec">Dados Pessoais</div>
        <div><label className="cli-label">Nome Completo *</label><input className="cli-input" value={form.full_name} onChange={e => patch({ full_name: toUpper(e.target.value) })} /></div>
        <div>
          <label className="cli-label">CPF</label>
          <input className="cli-input" style={cpfDuplicate ? { borderColor: "#B4442E" } : undefined} value={form.cpf} onChange={e => patch({ cpf: formatCPF(e.target.value) })} placeholder="000.000.000-00" maxLength={14} />
          {cpfDuplicate && <span className="cli-cep-error">CPF já cadastrado no sistema.</span>}
        </div>
        <div><label className="cli-label">Data de Nascimento *</label><input type="date" className="cli-input" value={form.birth_date} onChange={e => patch({ birth_date: e.target.value })} /></div>
        <div><label className="cli-label">RG *</label><input className="cli-input" value={form.rg} onChange={e => patch({ rg: formatRG(e.target.value) })} placeholder="00.000.000-0" maxLength={12} /></div>
        <div><label className="cli-label">Órgão Emissor</label><input className="cli-input" value={form.rg_issuer} onChange={e => patch({ rg_issuer: toUpper(e.target.value) })} placeholder="SSP" /></div>
        <div>
          <label className="cli-label">UF do RG</label>
          <select className="cli-select" value={form.rg_uf} onChange={e => patch({ rg_uf: e.target.value })}>
            {STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="cli-label">Sexo</label>
          <select className="cli-select" value={["masculino","feminino"].includes(form.gender) ? form.gender : "outro"} onChange={e => patch({ gender: e.target.value })}>
            <option value="masculino">Masculino</option>
            <option value="feminino">Feminino</option>
            <option value="outro">Outro</option>
          </select>
          {!["masculino","feminino"].includes(form.gender) && (
            <input className="cli-input" style={{ marginTop: 6 }} value={form.gender === "outro" ? "" : form.gender} onChange={e => patch({ gender: e.target.value })} placeholder="Informe..." />
          )}
        </div>
        <div>
          <label className="cli-label">Estado Civil *</label>
          <select className="cli-select" value={form.marital_status} onChange={e => patch({ marital_status: e.target.value })}>
            <option value="solteiro">Solteiro(a)</option>
            <option value="casado">Casado(a)</option>
            <option value="divorciado">Divorciado(a)</option>
            <option value="viuvo">Viúvo(a)</option>
            <option value="uniao_estavel">União Estável</option>
          </select>
        </div>
        <div><label className="cli-label">Nacionalidade *</label><input className="cli-input" value={form.nationality} onChange={e => patch({ nationality: toUpper(e.target.value) })} /></div>
        <div><label className="cli-label">Profissão</label><input className="cli-input" value={form.profession} onChange={e => patch({ profession: toUpper(e.target.value) })} /></div>
        <div>
          <label className="cli-label">Naturalidade (UF)</label>
          <select className="cli-select" value={form.natural_uf} onChange={e => { patch({ natural_uf: e.target.value, natural_city: "" }); void loadNaturalMunicipios(e.target.value); }}>
            {STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="cli-label">Naturalidade (Cidade)</label>
          <select className="cli-select" value={form.natural_city} onChange={e => patch({ natural_city: e.target.value })}>
            <option value="">— selecione —</option>
            {naturalCityChoices.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div><label className="cli-label">Nome da Mãe</label><input className="cli-input" value={form.mother_name} onChange={e => patch({ mother_name: toUpper(e.target.value) })} /></div>
        <div><label className="cli-label">Nome do Pai</label><input className="cli-input" value={form.father_name} onChange={e => patch({ father_name: toUpper(e.target.value) })} /></div>
        <div><label className="cli-label">PIS / NIT</label><input className="cli-input" value={form.pis_nit} onChange={e => patch({ pis_nit: e.target.value })} /></div>
      </>
    );
  }

  function renderContato() {
    return (
      <>
        <div className="cli-formsec">Contato</div>
        <div><label className="cli-label">E-mail</label><input type="email" className="cli-input" value={form.email} onChange={e => patch({ email: e.target.value })} placeholder="email@exemplo.com" /></div>
        <div>
          <label className="cli-label">Celular</label>
          <input className="cli-input" value={form.phone} onChange={e => patch({ phone: formatPhone(e.target.value) })} placeholder="(71) 99999-9999" maxLength={15} />
          <label className="cli-wa-check"><input type="checkbox" checked={form.phone_is_whatsapp} onChange={e => patch({ phone_is_whatsapp: e.target.checked })} /> WhatsApp</label>
        </div>
        <div>
          <label className="cli-label">Telefone Comercial</label>
          <input className="cli-input" value={phoneCommNone ? "" : form.phone_commercial} disabled={phoneCommNone}
            onChange={e => patch({ phone_commercial: formatPhone(e.target.value) })} placeholder={phoneCommNone ? "não possui" : "(71) 3333-3333"} maxLength={15} />
          <label className="cli-wa-check">
            <input type="checkbox" checked={phoneCommNone}
              onChange={e => { setPhoneCommNone(e.target.checked); patch({ phone_commercial: e.target.checked ? NAO_POSSUI : "", phone_commercial_is_whatsapp: false }); }} /> não possui
          </label>
          {!phoneCommNone && (
            <label className="cli-wa-check"><input type="checkbox" checked={form.phone_commercial_is_whatsapp} onChange={e => patch({ phone_commercial_is_whatsapp: e.target.checked })} /> WhatsApp</label>
          )}
        </div>
        <div>
          <label className="cli-label">Telefone Residencial</label>
          <input className="cli-input" value={phoneHomeNone ? "" : form.phone_home} disabled={phoneHomeNone}
            onChange={e => patch({ phone_home: formatPhone(e.target.value) })} placeholder={phoneHomeNone ? "não possui" : "(71) 3333-3333"} maxLength={15} />
          <label className="cli-wa-check">
            <input type="checkbox" checked={phoneHomeNone}
              onChange={e => { setPhoneHomeNone(e.target.checked); patch({ phone_home: e.target.checked ? NAO_POSSUI : "", phone_home_is_whatsapp: false }); }} /> não possui
          </label>
          {!phoneHomeNone && (
            <label className="cli-wa-check"><input type="checkbox" checked={form.phone_home_is_whatsapp} onChange={e => patch({ phone_home_is_whatsapp: e.target.checked })} /> WhatsApp</label>
          )}
        </div>
      </>
    );
  }

  function renderEndereco() {
    return (
      <>
        <div className="cli-formsec">Endereço</div>
        <div>
          <label className="cli-label">CEP {cepLoading && <span className="cli-cep-hint">buscando...</span>}</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="cli-input" style={cepError ? { borderColor: "#B4442E" } : undefined} value={form.zip_code}
              onChange={e => {
                const f = formatCEP(e.target.value);
                patch({ zip_code: f });
                setCepError("");
                const clean = f.replace(/\D/g, "");
                if (clean.length === 8) void fetchAddressByCep(clean);
              }} placeholder="00000-000" maxLength={9} />
            <button type="button" className="cli-btn ghost sm" disabled={cepLoading}
              onClick={() => void fetchAddressByCep(form.zip_code.replace(/\D/g, ""))}>Buscar</button>
          </div>
          {cepError && <span className="cli-cep-error">{cepError} — preencha manualmente</span>}
        </div>
        <div><label className="cli-label">País</label><input className="cli-input" value={form.country} onChange={e => patch({ country: toUpper(e.target.value) })} /></div>
        <div><label className="cli-label">Logradouro</label><input className="cli-input" value={form.address} onChange={e => patch({ address: toUpper(e.target.value) })} /></div>
        <div><label className="cli-label">Número</label><input className="cli-input" value={form.address_number} onChange={e => patch({ address_number: e.target.value })} /></div>
        <div><label className="cli-label">Complemento</label><input className="cli-input" value={form.address_complement} onChange={e => patch({ address_complement: toUpper(e.target.value) })} placeholder="Apto, bloco…" /></div>
        <div><label className="cli-label">Bairro</label><input className="cli-input" value={form.neighborhood} onChange={e => patch({ neighborhood: toUpper(e.target.value) })} /></div>
        <div>
          <label className="cli-label">Estado (UF)</label>
          <select className="cli-select" value={form.state} onChange={e => { patch({ state: e.target.value, city: "" }); void loadMunicipios(e.target.value); }}>
            {STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="cli-label">Cidade</label>
          <select className="cli-select" value={form.city} onChange={e => patch({ city: e.target.value })}>
            <option value="">— selecione —</option>
            {cityChoices.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </>
    );
  }

  function renderBancario() {
    const pixDisabled = pixMode === PIX_NONE;
    return (
      <>
        <div className="cli-formsec">Dados Bancários / PIX</div>
        <div><label className="cli-label">Banco</label><input className="cli-input" value={form.bank_name} onChange={e => patch({ bank_name: toUpper(e.target.value) })} /></div>
        <div>
          <label className="cli-label">Tipo de Conta</label>
          <select className="cli-select" value={form.bank_account_type} onChange={e => patch({ bank_account_type: e.target.value })}>
            <option value="corrente">Corrente</option>
            <option value="poupanca">Poupança</option>
          </select>
        </div>
        <div><label className="cli-label">Agência</label><input className="cli-input" value={form.bank_agency} onChange={e => patch({ bank_agency: e.target.value })} /></div>
        <div><label className="cli-label">Conta</label><input className="cli-input" value={form.bank_account} onChange={e => patch({ bank_account: e.target.value })} /></div>
        <div>
          <label className="cli-label">Tipo da Chave PIX</label>
          <select className="cli-select" value={pixMode} onChange={e => { setPixMode(e.target.value); patch({ pix_key: "" }); }}>
            <option value="cpf">CPF</option>
            <option value="cnpj">CNPJ</option>
            <option value="email">E-mail</option>
            <option value="telefone">Telefone</option>
            <option value="aleatoria">Aleatória</option>
            <option value={PIX_NONE}>Não possui chave PIX</option>
          </select>
        </div>
        <div>
          <label className="cli-label">Chave PIX</label>
          <input className="cli-input" disabled={pixDisabled} value={pixDisabled ? "" : form.pix_key}
            onChange={e => patch({ pix_key: formatPixKey(e.target.value, pixMode) })}
            placeholder={pixDisabled ? "—" : pixMode === "cpf" ? "000.000.000-00" : pixMode === "cnpj" ? "00.000.000/0001-00" : pixMode === "telefone" ? "(00) 00000-0000" : pixMode === "email" ? "email@exemplo.com" : "Chave aleatória"} />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label className="cli-label">Observações</label>
          <textarea className="cli-textarea" value={form.notes} onChange={e => patch({ notes: e.target.value })} />
        </div>
      </>
    );
  }

  function renderReview() {
    const rows: { label: string; value: string; sensitive?: boolean }[] = [];
    const add = (label: string, value: string, sensitive = false) => rows.push({ label, value, sensitive });
    add("Tipo de pessoa", isPJ ? "Pessoa Jurídica" : "Pessoa Física");
    add("Origem / Captação", form.client_origin);
    add("Perfil GOV.BR", form.gov_br_profile);
    add("Situação", form.status);
    if (isPJ) {
      add("Razão Social", form.full_name);
      add("Nome Fantasia", form.fantasy_name);
      add("CNPJ", form.cnpj, true);
      add("Inscrição Estadual", form.ie, true);
      add("Inscrição Municipal", form.im, true);
      add("Data de Fundação", form.foundation_date ? formatDateBR(form.foundation_date) : "");
      add("Representante Legal", form.legal_rep_name);
      add("CPF do Representante", form.legal_rep_cpf, true);
    } else {
      add("Nome Completo", form.full_name);
      add("CPF", form.cpf, true);
      add("Data de Nascimento", form.birth_date ? formatDateBR(form.birth_date) : "");
      add("RG", form.rg, true);
      add("Órgão Emissor / UF", [form.rg_issuer, form.rg_uf].filter(Boolean).join(" / "));
      add("Sexo", form.gender);
      add("Estado Civil", form.marital_status);
      add("Nacionalidade", form.nationality);
      add("Profissão", form.profession);
      add("Naturalidade", [form.natural_city, form.natural_uf].filter(Boolean).join(" / "));
      add("Nome da Mãe", form.mother_name);
      add("Nome do Pai", form.father_name);
      add("PIS / NIT", form.pis_nit, true);
    }
    add("E-mail", form.email);
    add("Celular", form.phone + (form.phone_is_whatsapp ? " (WhatsApp)" : ""));
    // Opcionais: "não possui" (marcado) ou "—" (vazio) — nunca [A PREENCHER].
    const optPhone = (v: string, wa: boolean) =>
      v === NAO_POSSUI ? "não possui" : v ? v + (wa ? " (WhatsApp)" : "") : "—";
    add("Tel. Comercial", optPhone(form.phone_commercial, form.phone_commercial_is_whatsapp));
    add("Tel. Residencial", optPhone(form.phone_home, form.phone_home_is_whatsapp));
    add("CEP", form.zip_code);
    add("Endereço", [form.address, form.address_number, form.address_complement].filter(Boolean).join(", "));
    add("Bairro", form.neighborhood);
    add("Cidade / UF", [form.city, form.state].filter(Boolean).join(" / "));
    add("País", form.country);
    add("Banco", form.bank_name);
    add("Agência", form.bank_agency, true);
    add("Conta", [form.bank_account, form.bank_account_type].filter(Boolean).join(" · "), true);
    add("PIX", pixMode === PIX_NONE ? "Não possui" : `${pixMode}: ${form.pix_key}`, pixMode !== PIX_NONE && !!form.pix_key);
    if (form.notes) add("Observações", form.notes);

    return (
      <>
        <div className="cli-formsec">Revisão — confira antes de gravar</div>
        <div className="cli-review" style={{ gridColumn: "1 / -1" }}>
          {rows.map((r, i) => {
            const empty = !r.value || r.value.trim() === "";
            const shown = empty ? "[A PREENCHER]" : (r.sensitive ? maskValue(r.value, 2) : r.value);
            return (
              <div className="cli-review-row" key={i}>
                <span className="k">{r.label}</span>
                <span className={`v${empty ? " empty" : ""}`}>{shown}</span>
              </div>
            );
          })}
        </div>
        <div className="cli-review-note" style={{ gridColumn: "1 / -1" }}>
          Campos vazios saem como <strong>[A PREENCHER]</strong> nos documentos. Dados sensíveis (CPF/RG/bancário/PIX)
          aparecem mascarados aqui e são gravados <strong>cifrados</strong>.
        </div>
      </>
    );
  }
}

/* ============================================================
   Fase de documentos (pós-cadastro) — §7·B
   Uploads (RG frente/verso + comprovante + opcionais) reusando o
   helper de gravação, e geração dos documentos do cooperado
   (COOP-DOCS-2) via runCooperadoOnboarding, com preview + [REVISAR].
   Não bloqueia o cadastro (regra de gating do Rodrigo).
============================================================ */

const DOC_STATE_LABEL: Record<string, string> = {
  ausente: "A enviar", pendente: "Pendente de assinatura",
  recebido: "Recebido", validado: "Validado", rejeitado: "Rejeitado",
};

async function openSignedDoc(filePath: string) {
  const { data, error } = await supabase.storage.from("client-documents").createSignedUrl(filePath, 60);
  if (error || !data?.signedUrl) { toast.error("Não foi possível abrir o documento"); return; }
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

function ClientDocumentsPhase({ clientId, clientName, userId, onDone }: {
  clientId: string; clientName: string; userId: string; onDone?: () => void;
}) {
  const [files, setFiles] = useState<Partial<Record<ClientDocSlot, File>>>({});
  const [uploading, setUploading] = useState(false);
  const [sentSlots, setSentSlots] = useState<Set<ClientDocSlot>>(new Set());   // ponto 5
  const [signedSent, setSignedSent] = useState<Set<string>>(new Set());        // ponto 6 (por documentType)
  const [signedBusy, setSignedBusy] = useState<string | null>(null);
  const [genLoading, setGenLoading] = useState(true);
  const [res, setRes] = useState<CooperadoOnboardingResult | null>(null);

  // Geração dos 4 documentos (COOP-DOCS-2) + checklist, assim que a fase abre.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId) { setGenLoading(false); return; }
      const r = await runCooperadoOnboarding(clientId, userId);
      if (!cancelled) { setRes(r); setGenLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [clientId, userId]);

  async function reloadChecklist() {
    if (!userId) return;
    const r = await runCooperadoOnboarding(clientId, userId);
    setRes(r);
  }

  async function handleUpload() {
    const anySelected = Object.values(files).some(Boolean);
    if (!anySelected) { toast.error("Selecione ao menos um documento"); return; }
    setUploading(true);
    const results = await uploadClientDocuments(clientId, clientName, userId, files);
    setUploading(false);
    const failed = results.filter(r => !r.ok);
    const ok = results.filter(r => r.ok);
    if (ok.length) {
      toast.success(`${ok.length} documento(s) enviado(s)`);
      setSentSlots(prev => { const n = new Set(prev); ok.forEach(r => n.add(r.slot)); return n; });
    }
    if (failed.length) toast.error(`Falha em ${failed.length} documento(s)`);
    setFiles({});
    await reloadChecklist();
  }

  // Ponto 6: anexar o documento GERADO já assinado (mesmo document_type do gerado,
  // status 'recebido') — move o item do checklist de "pendente de assinatura" p/ "recebido".
  async function handleSigned(documentType: string, label: string, file: File) {
    setSignedBusy(documentType);
    const r = await uploadSignedDocument(clientId, clientName, userId, documentType, label, file);
    setSignedBusy(null);
    if (r.ok) {
      setSignedSent(prev => new Set(prev).add(documentType));
      toast.success(`${label}: assinado recebido`);
      await reloadChecklist();
    } else {
      toast.error(`Falha ao anexar ${label}: ${r.error ?? ""}`);
    }
  }

  const okGenerated = (res?.generated ?? []).filter(g => g.ok);
  const failedGenerated = (res?.generated ?? []).filter(g => !g.ok);
  const anyMissing = (res?.generated ?? []).some(g => (g.missing?.length ?? 0) > 0);

  return (
    <div className="cli-form-card cli-wizard">
      <div className="cli-formsec">✓ Cadastro concluído</div>
      {clientName && (
        <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: "var(--cli-ink)" }}>
          Cliente: {clientName}
        </div>
      )}

      {/* Uploads dos documentos do cliente (não bloqueiam — geram pendência) */}
      <div className="cli-doc-panel">
        <div className="cli-doc-title">Documentos do cliente</div>
        <div className="cli-doc-grid">
          {CLIENT_DOC_SLOTS.map(({ slot, label, required }) => {
            const sent = sentSlots.has(slot);
            return (
              <div key={slot}>
                <label className="cli-label">{label}{required ? " *" : ""}</label>
                <input type="file" accept="image/*,.pdf,.xls,.xlsx" className="cli-input file" disabled={sent}
                  onChange={e => setFiles(prev => ({ ...prev, [slot]: e.target.files?.[0] || undefined }))} />
                {sent ? <span className="cli-doc-hint">✓ enviado</span>
                  : files[slot] && <span className="cli-filename">{files[slot]?.name}</span>}
              </div>
            );
          })}
        </div>
        <div className="cli-form-actions">
          {(() => {
            const pending = CLIENT_DOC_SLOTS.some(({ slot }) => files[slot] && !sentSlots.has(slot));
            const allSent = sentSlots.size >= CLIENT_DOC_SLOTS.filter(s => s.required).length && !pending;
            return (
              <button type="button" className="cli-btn" disabled={uploading || !pending} onClick={() => void handleUpload()}>
                {uploading ? "Enviando…" : pending ? "Enviar documentos" : allSent ? "Enviado ✓" : "Enviado"}
              </button>
            );
          })()}
          <span className="cli-doc-hint">O envio não bloqueia o cadastro — o que faltar fica como pendência.</span>
        </div>
      </div>

      {/* Documentos gerados (COOP-DOCS-2) + checklist */}
      <div className="cli-doc-panel">
        <div className="cli-doc-title">Documentos gerados (pendentes de revisão)</div>
        {genLoading ? (
          <div className="cli-doc-hint">Gerando procuração, contrato, hipossuficiência e termo de cooperado…</div>
        ) : (
          <>
            {okGenerated.length > 0 ? (
              <div className="cli-doc-gen-list">
                {okGenerated.map(g => (
                  <div key={g.documentType} className="cli-doc-gen-item">
                    <button type="button" className="cli-doc-chip"
                      title="Baixar para revisão" onClick={() => g.filePath && void openSignedDoc(g.filePath)}>
                      ⬇ {g.label}{(g.missing?.length ?? 0) > 0 ? " ⚠" : ""}
                    </button>
                    {signedSent.has(g.documentType) ? (
                      <span className="cli-doc-hint">✓ assinado recebido</span>
                    ) : (
                      <label className="cli-doc-signed">
                        <span>Anexar assinado</span>
                        <input type="file" accept="image/*,.pdf" disabled={signedBusy === g.documentType}
                          onChange={e => { const f = e.target.files?.[0]; if (f) void handleSigned(g.documentType, g.label, f); }} />
                      </label>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="cli-doc-hint">Nenhum documento gerado automaticamente.</div>
            )}
            {failedGenerated.length > 0 && (
              <div className="cli-doc-hint">Não gerado: {failedGenerated.map(g => g.label).join(", ")} — complete manualmente.</div>
            )}
            {(okGenerated.length > 0 || anyMissing) && (
              <div className="cli-review-note">
                <strong>[REVISAR]</strong> {REVISAO_ANTES_ASSINATURA}
                {anyMissing ? " Campos sem dado saíram como [A PREENCHER] — complete antes de enviar." : ""}
              </div>
            )}
          </>
        )}
      </div>

      {/* Checklist do conjunto obrigatório */}
      {res && res.checklist.length > 0 && (
        <div className="cli-doc-panel">
          <div className="cli-doc-title">Conjunto obrigatório</div>
          <div className="cli-doc-check">
            {res.checklist.map(row => (
              <div className="cli-doc-check-row" key={row.document_type}>
                <span className={`dot s-${row.status}`} />
                <span className="lbl">{row.document_type}</span>
                <span className="st">{DOC_STATE_LABEL[row.status] ?? row.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {onDone && (
        <div className="cli-form-actions">
          <button type="button" className="cli-btn" onClick={() => onDone()}>Concluir</button>
        </div>
      )}
    </div>
  );
}
