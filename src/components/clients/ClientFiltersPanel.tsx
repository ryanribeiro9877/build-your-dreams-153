import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTaskTypes } from "@/hooks/useUserTasks";
import {
  STATES, STATUS_OPTIONS, ORIGEM_OPTIONS, TIPO_PESSOA_OPTIONS, DOCUMENT_TYPE_OPTIONS,
} from "./shared";

// "" = não filtra; "sim" = true; "nao" = false (semântica tri-estado do RPC).
export type Tri = "" | "sim" | "nao";

export interface ClientFilters {
  nome: string; cpf: string; email: string; telefone: string; cidade: string;
  uf: string; status: string; origem: string; tipo_pessoa: string;
  responsavel_id: string; task_type_id: string; tem_documento_tipo: string;
  criado_de: string; criado_ate: string;
  ativo: Tri; gov: Tri; tem_pendencia: Tri; docs_completos: Tri;
  tem_processo: Tri; tem_audiencia: Tri;
}

export const EMPTY_FILTERS: ClientFilters = {
  nome: "", cpf: "", email: "", telefone: "", cidade: "",
  uf: "", status: "", origem: "", tipo_pessoa: "",
  responsavel_id: "", task_type_id: "", tem_documento_tipo: "",
  criado_de: "", criado_ate: "",
  ativo: "", gov: "", tem_pendencia: "", docs_completos: "",
  tem_processo: "", tem_audiencia: "",
};

const TRI = (v: Tri): boolean | undefined => v === "sim" ? true : v === "nao" ? false : undefined;

// Monta o jsonb só com as chaves preenchidas (o RPC ignora as ausentes).
export function buildFiltros(f: ClientFilters): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  const s = (k: string, v: string) => { if (v.trim() !== "") p[k] = v.trim(); };
  s("nome", f.nome); s("cpf", f.cpf); s("email", f.email); s("telefone", f.telefone);
  s("cidade", f.cidade); s("uf", f.uf); s("status", f.status); s("origem", f.origem);
  s("tipo_pessoa", f.tipo_pessoa); s("responsavel_id", f.responsavel_id);
  s("task_type_id", f.task_type_id); s("tem_documento_tipo", f.tem_documento_tipo);
  if (f.criado_de) p.criado_de = `${f.criado_de}T00:00:00`;
  if (f.criado_ate) p.criado_ate = `${f.criado_ate}T23:59:59.999`;
  const b = (k: string, v: Tri) => { const t = TRI(v); if (t !== undefined) p[k] = t; };
  b("ativo", f.ativo); b("gov", f.gov); b("tem_pendencia", f.tem_pendencia);
  b("docs_completos", f.docs_completos); b("tem_processo", f.tem_processo);
  b("tem_audiencia", f.tem_audiencia);
  return p;
}

interface Member { user_id: string; full_name: string; }

function TriSelect({ label, value, onChange }: { label: string; value: Tri; onChange: (v: Tri) => void }) {
  return (
    <div>
      <label className="cli-label">{label}</label>
      <select className="cli-select" value={value} onChange={e => onChange(e.target.value as Tri)}>
        <option value="">Qualquer</option>
        <option value="sim">Sim</option>
        <option value="nao">Não</option>
      </select>
    </div>
  );
}

export function ClientFiltersPanel({ filters, onChange }: {
  filters: ClientFilters;
  onChange: (patch: Partial<ClientFilters>) => void;
}) {
  const { types } = useTaskTypes();
  const [members, setMembers] = useState<Member[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name, display_name");
      if (cancelled) return;
      setMembers(((data as Array<{ user_id: string; full_name: string | null; display_name: string | null }> | null) ?? [])
        .filter(m => !!m.user_id)
        .map(m => ({ user_id: m.user_id, full_name: m.full_name || m.display_name || m.user_id }))
        .sort((a, b) => a.full_name.localeCompare(b.full_name, "pt-BR")));
    })();
    return () => { cancelled = true; };
  }, []);

  const set = (k: keyof ClientFilters) => (e: { target: { value: string } }) => onChange({ [k]: e.target.value } as Partial<ClientFilters>);

  return (
    <div className="cli-card lift" style={{ padding: 18, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <div style={{ flex: "1 1 180px" }}>
          <label className="cli-label">Nome</label>
          <input className="cli-input" value={filters.nome} onChange={set("nome")} placeholder="Nome do cliente" />
        </div>
        <div style={{ flex: "1 1 160px" }}>
          <label className="cli-label">CPF (exato)</label>
          <input className="cli-input" value={filters.cpf} onChange={set("cpf")} placeholder="CPF completo" />
          <div style={{ fontSize: 11, color: "var(--cli-muted)", marginTop: 4 }}>Busca exata — informe o CPF completo (não é parcial).</div>
        </div>
        <div style={{ flex: "1 1 160px" }}>
          <label className="cli-label">E-mail</label>
          <input className="cli-input" value={filters.email} onChange={set("email")} />
        </div>
        <div style={{ flex: "1 1 140px" }}>
          <label className="cli-label">Telefone</label>
          <input className="cli-input" value={filters.telefone} onChange={set("telefone")} />
        </div>
        <div style={{ flex: "1 1 140px" }}>
          <label className="cli-label">Cidade</label>
          <input className="cli-input" value={filters.cidade} onChange={set("cidade")} />
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <div style={{ flex: "0 1 110px" }}>
          <label className="cli-label">UF</label>
          <select className="cli-select" value={filters.uf} onChange={set("uf")}>
            <option value="">Todos</option>
            {STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ flex: "0 1 150px" }}>
          <label className="cli-label">Status</label>
          <select className="cli-select" value={filters.status} onChange={set("status")}>
            <option value="">Todos</option>
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div style={{ flex: "0 1 150px" }}>
          <label className="cli-label">Origem</label>
          <select className="cli-select" value={filters.origem} onChange={set("origem")}>
            <option value="">Todas</option>
            {ORIGEM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div style={{ flex: "0 1 160px" }}>
          <label className="cli-label">Tipo de pessoa</label>
          <select className="cli-select" value={filters.tipo_pessoa} onChange={set("tipo_pessoa")}>
            <option value="">Todos</option>
            {TIPO_PESSOA_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div style={{ flex: "1 1 200px" }}>
          <label className="cli-label">Responsável</label>
          <select className="cli-select" value={filters.responsavel_id} onChange={set("responsavel_id")}>
            <option value="">Todos</option>
            {members.map(m => <option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}
          </select>
        </div>
        <div style={{ flex: "1 1 200px" }}>
          <label className="cli-label">Tipo de ação</label>
          <select className="cli-select" value={filters.task_type_id} onChange={set("task_type_id")}>
            <option value="">Todos</option>
            {types.map(t => <option key={t.id} value={t.id}>{t.display_name}</option>)}
          </select>
        </div>
        <div style={{ flex: "1 1 200px" }}>
          <label className="cli-label">Tipo de documento</label>
          <select className="cli-select" value={filters.tem_documento_tipo} onChange={set("tem_documento_tipo")}>
            <option value="">Qualquer</option>
            {DOCUMENT_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <div style={{ flex: "0 1 170px" }}>
          <label className="cli-label">Cadastrado de</label>
          <input className="cli-input" type="date" value={filters.criado_de} onChange={set("criado_de")} />
        </div>
        <div style={{ flex: "0 1 170px" }}>
          <label className="cli-label">até</label>
          <input className="cli-input" type="date" value={filters.criado_ate} onChange={set("criado_ate")} />
        </div>
        <TriSelect label="Ativo" value={filters.ativo} onChange={v => onChange({ ativo: v })} />
        <TriSelect label="Gov.br" value={filters.gov} onChange={v => onChange({ gov: v })} />
        <TriSelect label="Tem pendência" value={filters.tem_pendencia} onChange={v => onChange({ tem_pendencia: v })} />
        <TriSelect label="Docs completos" value={filters.docs_completos} onChange={v => onChange({ docs_completos: v })} />
        <TriSelect label="Tem processo" value={filters.tem_processo} onChange={v => onChange({ tem_processo: v })} />
        <TriSelect label="Tem audiência" value={filters.tem_audiencia} onChange={v => onChange({ tem_audiencia: v })} />
      </div>
    </div>
  );
}
