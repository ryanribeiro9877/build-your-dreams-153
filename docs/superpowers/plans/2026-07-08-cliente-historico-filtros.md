# CLIENTE-HISTORICO-FILTROS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consumir no front as RPCs `client_timeline` (histórico unificado do cliente — card 3.8) e `search_clients` (filtros avançados na lista — card 3.9), com filtros salvos via RPCs já existentes.

**Architecture:** Card 3.8 troca a fonte da aba Histórico para a timeline unificada, com chips de filtro por tipo (client-side) e navegação por `ref_id` para a aba dona do item. Card 3.9 migra a lista de `clients_decrypted`+filtro-client-side para `search_clients(p_filtros)`, montando o jsonb só com chaves preenchidas, e adiciona filtros salvos por usuário.

**Tech Stack:** React 18 + TypeScript + Vite, Supabase JS (RPC), React Router v6, sonner (toasts). Estilos escopados em `.cli-root` (`src/styles/clientes.css`).

## Global Constraints

- Responder/UX em pt-BR. Texto de UI em português.
- **Não** criar/alterar migrations nem as RPCs `client_timeline`, `search_clients`, `client_save_filter`, `get_my_client_saved_filters`, `client_delete_saved_filter` (todas já aplicadas e validadas no banco `tsltxvswzdnlmvljpryh`). **Não** rodar `db push`.
- RPCs não estão nos tipos gerados do Supabase → usar o cast já praticado: `(supabase as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: T | null; error: { code?: string; message?: string } | null }> }).rpc(...)`.
- **CPF:** `search_clients` faz match EXATO por índice cego. UI deve avisar que exige o CPF completo (não é parcial).
- **Booleanos indiretos** (`ativo`, `gov`, `tem_pendencia`, `docs_completos`, `tem_processo`, `tem_audiencia`): chave ausente = ignora; `true` = tem; `false` = **não tem**. Expor via seletor tri-estado.
- **Gate `42501`** (usuário sem papel recepção/sócio): tratar com mensagem clara; nunca mostrar lista/histórico vazio silencioso.
- Sem framework de teste no projeto (ver CLAUDE.md). Verificação por `npm run lint`, `npm run build` e checagem no preview.
- Empty-states honestos — nunca dado fabricado.
- Roles com acesso: `["socio", "lider_recepcao", "recepcionista"]` (`ALLOWED_ROLES` em `shared.tsx`).

---

### Task 1: Card 3.8 — Aba Histórico consumindo `client_timeline`

**Files:**
- Create: `src/components/clients/tabs/historicoTab.tsx`
- Modify: `src/components/clients/tabs/chatTabs.tsx` (remover `HistoricoTab` e a `interface SessionRow`)
- Modify: `src/pages/ClientDetails.tsx:17` (importar `HistoricoTab` do novo arquivo)

**Interfaces:**
- Consumes: `client_timeline(p_client_id uuid)` → linhas `{ event_type, event_at, title, ref_id, extra }` (ordenadas `event_at desc`); helpers de `../shared`: `EmptyState`, `TabLoading`, `formatDateBR`, `DOCUMENT_TYPE_LABELS`, tipo `ClientFull`.
- Produces: `export function HistoricoTab({ client }: { client: ClientFull })`.

- [ ] **Step 1: Criar `historicoTab.tsx` com o componente completo**

Create `src/components/clients/tabs/historicoTab.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  type ClientFull, EmptyState, TabLoading, formatDateBR, DOCUMENT_TYPE_LABELS,
} from "../shared";

interface TimelineEvent {
  event_type: string;
  event_at: string | null;
  title: string;
  ref_id: string | null;
  extra: Record<string, unknown> | null;
}

// Metadados por tipo de evento. `tab` = aba do ClientDetails que "dona" o item
// (navegação por ref_id via ?tab=). `null` = evento informativo (sem link).
const EVENT_META: Record<string, { icon: string; label: string; cls: string; tab: string | null }> = {
  conversa:      { icon: "✦", label: "Conversa",              cls: "n",  tab: null },
  tarefa:        { icon: "◷", label: "Tarefa",                cls: "n",  tab: "tarefas" },
  pendencia:     { icon: "⚑", label: "Pendência",             cls: "p",  tab: "pendencias" },
  aprovacao:     { icon: "✓", label: "Aprovação",             cls: "ok", tab: "tarefas" },
  documento:     { icon: "▤", label: "Documento",             cls: "n",  tab: "documentos" },
  alteracao_doc: { icon: "•", label: "Alteração de documento", cls: "n", tab: "documentos" },
  processo:      { icon: "⚖", label: "Processo",              cls: "n",  tab: "processos" },
  audiencia:     { icon: "⚖", label: "Audiência",             cls: "p",  tab: "processos" },
};

function metaFor(type: string) {
  return EVENT_META[type] ?? { icon: "•", label: type, cls: "n", tab: null };
}

// Linha secundária derivada do `extra` (metadados por tipo).
function secondaryLine(ev: TimelineEvent): string {
  const x = ev.extra ?? {};
  const parts: string[] = [];
  const push = (v: unknown) => { if (v !== null && v !== undefined && v !== "") parts.push(String(v)); };
  switch (ev.event_type) {
    case "processo":
      push(x.status);
      if (x.advogado) parts.push(`Resp. ${x.advogado}`);
      if (x.proxima_audiencia) parts.push(`Próx. audiência ${formatDateBR(String(x.proxima_audiencia))}`);
      break;
    case "audiencia":
      push(x.status);
      break;
    case "tarefa":
    case "pendencia":
      push(x.status);
      push(x.prioridade);
      push(x.pendencia_tipo);
      if (x.data_fatal) parts.push(`Vence ${formatDateBR(String(x.data_fatal))}`);
      break;
    case "documento": {
      const tipo = x.tipo ? (DOCUMENT_TYPE_LABELS[String(x.tipo)] ?? String(x.tipo)) : null;
      push(tipo);
      push(x.status);
      push(x.origem);
      break;
    }
    case "conversa":
      if (x.mensagens != null) parts.push(`${x.mensagens} mensagens`);
      push(x.status);
      break;
    case "aprovacao":
      parts.push("Validada");
      break;
  }
  return parts.join(" · ");
}

export function HistoricoTab({ client }: { client: ClientFull }) {
  const [, setSearchParams] = useSearchParams();
  const [events, setEvents] = useState<TimelineEvent[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [active, setActive] = useState<string>("todos");

  useEffect(() => {
    let cancelled = false;
    setEvents(null); setDenied(false);
    (async () => {
      const { data, error } = await (supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: TimelineEvent[] | null; error: { code?: string } | null }>;
      }).rpc("client_timeline", { p_client_id: client.id });
      if (cancelled) return;
      if (error) { setDenied(error.code === "42501"); setEvents([]); return; }
      setEvents((data as TimelineEvent[]) ?? []);
    })();
    return () => { cancelled = true; };
  }, [client.id]);

  const goToTab = (tab: string) => setSearchParams(prev => {
    const next = new URLSearchParams(prev);
    next.set("tab", tab);
    return next;
  });

  if (events === null) return <TabLoading />;
  if (denied) {
    return <EmptyState icon="🔒" title="Acesso restrito" hint="Apenas recepção ou sócio podem ver o histórico do cliente." />;
  }
  if (events.length === 0) {
    return <EmptyState icon="✦" title="Nenhum evento no histórico" hint="Conversas, tarefas, pendências, documentos, processos e audiências do cliente aparecem aqui." />;
  }

  // Contagem por tipo (para os chips) preservando a ordem de aparição.
  const counts: Record<string, number> = {};
  events.forEach(e => { counts[e.event_type] = (counts[e.event_type] || 0) + 1; });
  const typesPresent = Object.keys(counts);

  const shown = active === "todos" ? events : events.filter(e => e.event_type === active);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* chips de filtro por tipo */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button className={`cli-chip ${active === "todos" ? "ok" : "n"}`} style={{ cursor: "pointer" }}
          onClick={() => setActive("todos")}>Todos · {events.length}</button>
        {typesPresent.map(t => {
          const m = metaFor(t);
          return (
            <button key={t} className={`cli-chip ${active === t ? "ok" : "n"}`} style={{ cursor: "pointer" }}
              onClick={() => setActive(t)}>{m.icon} {m.label} · {counts[t]}</button>
          );
        })}
      </div>

      {/* lista cronológica */}
      <div className="cli-card lift">
        <div className="cli-sec-title">Histórico · {shown.length}</div>
        {shown.map((ev, i) => {
          const m = metaFor(ev.event_type);
          const sub = secondaryLine(ev);
          const linkable = m.tab !== null;
          return (
            <div key={`${ev.event_type}-${ev.ref_id ?? "x"}-${i}`} className="cli-row"
              style={linkable ? { cursor: "pointer" } : undefined}
              onClick={linkable ? () => goToTab(m.tab!) : undefined}
              role={linkable ? "button" : undefined}
              title={linkable ? `Abrir aba ${m.label}` : undefined}>
              <div className="dot">{m.icon}</div>
              <div className="body">
                <div className="t">{ev.title}</div>
                <div className="s">
                  {m.label}
                  {sub ? ` · ${sub}` : ""}
                  {` · ${formatDateBR(ev.event_at)}`}
                </div>
              </div>
              {linkable && <span className="go" style={{ marginLeft: "auto" }}>→</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Remover a `HistoricoTab` antiga de `chatTabs.tsx`**

Em `src/components/clients/tabs/chatTabs.tsx`, apagar o bloco `/* ---------- Histórico (chat_sessions do cliente) ---------- */` inteiro: a `interface SessionRow` (linhas ~75-78) e toda a função `export function HistoricoTab(...)` (linhas ~80-119). Manter `useClientSessionIds`, `PecasTab` e `AudiosTab` intactos.

- [ ] **Step 3: Atualizar o import em `ClientDetails.tsx`**

Em `src/pages/ClientDetails.tsx:17`, trocar:

```tsx
import { PecasTab, HistoricoTab, AudiosTab } from "@/components/clients/tabs/chatTabs";
```

por:

```tsx
import { PecasTab, AudiosTab } from "@/components/clients/tabs/chatTabs";
import { HistoricoTab } from "@/components/clients/tabs/historicoTab";
```

- [ ] **Step 4: Lint + build**

Run: `npm run lint`
Expected: sem erros novos nos arquivos tocados.

Run: `npm run build`
Expected: build OK (sem erros de tipo/import).

- [ ] **Step 5: Verificar no preview (aba Histórico)**

Iniciar o dev server (preview_start / `npm run dev` porta 8080), logar como recepção, abrir um cliente com processo/tarefa/documento e a aba "Histórico". Conferir: eventos listados em ordem desc; chips por tipo filtram; clicar num evento `processo` troca para a aba Processos (`?tab=processos`). Cliente sem eventos → empty-state honesto.

- [ ] **Step 6: Commit**

```bash
git add src/components/clients/tabs/historicoTab.tsx src/components/clients/tabs/chatTabs.tsx src/pages/ClientDetails.tsx
git commit -m "feat(clientes): aba Histórico consome client_timeline (card 3.8)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Card 3.9 — Lista migrada para `search_clients` com filtros avançados

**Files:**
- Modify: `src/components/clients/shared.tsx` (adicionar `SearchClientRow`, `STATUS_OPTIONS`, `ORIGEM_OPTIONS`, `TIPO_PESSOA_OPTIONS`)
- Create: `src/components/clients/ClientFiltersPanel.tsx` (painel de controles + tipos de filtro)
- Modify: `src/pages/Clients.tsx` (usar `search_clients`, montar `p_filtros`, tratar `42501`)

**Interfaces:**
- Consumes: `search_clients(p_filtros jsonb)` → `{ id, full_name, status, client_origin, city, state, gov_br_profile, created_at }` (ordenado por `full_name`); `useTaskTypes()` de `@/hooks/useUserTasks` → `{ types: TaskTypeOption[] }` (`TaskTypeOption` tem `id`, `display_name`); `profiles (user_id, full_name, display_name)`; `DOCUMENT_TYPE_OPTIONS`, `STATES` de `../shared`.
- Produces: tipo `ClientFilters` e `EMPTY_FILTERS`, componente `ClientFiltersPanel`, função `buildFiltros(f: ClientFilters): Record<string, unknown>` (exportados de `ClientFiltersPanel.tsx`); tipo `SearchClientRow` (exportado de `shared.tsx`).

- [ ] **Step 1: Adicionar tipos/constantes em `shared.tsx`**

Em `src/components/clients/shared.tsx`, após a interface `ClientListRow`, adicionar:

```tsx
// Card 3.9 — linha retornada por search_clients (note: sem tipo_pessoa).
export interface SearchClientRow {
  id: string;
  full_name: string;
  status: string;
  client_origin: string | null;
  city: string | null;
  state: string | null;
  gov_br_profile: string | null;
  created_at: string;
}

// Opções de dropdown reutilizadas nos filtros (3.9). Espelham o cadastro.
export const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "ativo", label: "Ativo" },
  { value: "inativo", label: "Inativo" },
  { value: "prospecto", label: "Prospecto" },
  { value: "em_analise", label: "Em análise" },
];

export const ORIGEM_OPTIONS: { value: string; label: string }[] = [
  { value: "indicacao", label: "Indicação" },
  { value: "ressaque", label: "Ressaque" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "marketing", label: "Marketing" },
  { value: "site", label: "Site" },
  { value: "outro", label: "Outro" },
];

export const TIPO_PESSOA_OPTIONS: { value: string; label: string }[] = [
  { value: "fisica", label: "Pessoa física" },
  { value: "juridica", label: "Pessoa jurídica" },
];
```

- [ ] **Step 2: Criar `ClientFiltersPanel.tsx` (estado, buildFiltros e UI dos controles)**

Create `src/components/clients/ClientFiltersPanel.tsx`:

```tsx
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
```

- [ ] **Step 3: Reescrever `Clients.tsx` para usar `search_clients`**

Replace o conteúdo de `src/pages/Clients.tsx` por:

```tsx
import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useMyWorkspace } from "@/hooks/useMyWorkspace";
import { toast } from "sonner";
import { HexagonLoader } from "@/components/HexagonLoader";
import {
  type SearchClientRow, ALLOWED_ROLES, RestrictedAccess,
  StatusBadge, EmptyState, formatDateBR,
} from "@/components/clients/shared";
import {
  ClientFiltersPanel, type ClientFilters, EMPTY_FILTERS, buildFiltros,
} from "@/components/clients/ClientFiltersPanel";

const PAGE_SIZE = 20;

export default function Clients() {
  const { workspace } = useMyWorkspace();
  const navigate = useNavigate();
  const hasAccess = ALLOWED_ROLES.includes(workspace?.role_template?.code ?? "");

  const [clients, setClients] = useState<SearchClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [filters, setFilters] = useState<ClientFilters>(EMPTY_FILTERS);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [page, setPage] = useState(1);

  const fetchClients = useCallback(async (f: ClientFilters) => {
    setLoading(true);
    const { data, error } = await (supabase as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: SearchClientRow[] | null; error: { code?: string } | null }>;
    }).rpc("search_clients", { p_filtros: buildFiltros(f) });
    if (error) {
      if (error.code === "42501") { setDenied(true); setClients([]); }
      else toast.error("Erro ao buscar clientes");
    } else {
      setDenied(false);
      setClients((data as SearchClientRow[]) ?? []);
    }
    setLoading(false);
  }, []);

  // debounce dos filtros → 1 chamada de RPC
  useEffect(() => {
    const h = setTimeout(() => { void fetchClients(filters); }, 300);
    return () => clearTimeout(h);
  }, [filters, fetchClients]);

  useEffect(() => { setPage(1); }, [filters]);

  const patch = (p: Partial<ClientFilters>) => setFilters(prev => ({ ...prev, ...p }));

  const totalPages = Math.ceil(clients.length / PAGE_SIZE);
  const paginated = useMemo(() => clients.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [clients, page]);

  if (workspace && !hasAccess) return <RestrictedAccess />;

  return (
    <div className="cli-root">
      <div className="cli-wrap">
        <div className="cli-top">
          <button className="cli-back" onClick={() => navigate("/sistema")}>← Voltar</button>
          <span className="cli-title">Gestão de Clientes</span>
          <span className="cli-count">{clients.length} resultado{clients.length !== 1 ? "s" : ""}</span>
          <span className="cli-spacer" />
          <button className="cli-btn ghost sm" onClick={() => setShowAdvanced(s => !s)}>
            {showAdvanced ? "Ocultar filtros" : "Filtros avançados"}
          </button>
          <button className="cli-btn" onClick={() => navigate("/clientes/novo")}>+ Novo Cliente</button>
        </div>

        {/* filtros básicos sempre visíveis */}
        <div className="cli-toolbar">
          <input className="cli-input" style={{ maxWidth: 320, flex: "1 1 220px" }}
            placeholder="Buscar por nome…" value={filters.nome}
            onChange={e => patch({ nome: e.target.value })} />
          <button className="cli-btn ghost sm" onClick={() => setFilters(EMPTY_FILTERS)}>Limpar filtros</button>
        </div>

        {showAdvanced && <ClientFiltersPanel filters={filters} onChange={patch} />}

        {denied ? (
          <EmptyState icon="🔒" title="Acesso restrito" hint="Apenas recepção ou sócio podem buscar clientes." />
        ) : loading ? <HexagonLoader variant="inline" /> : clients.length === 0 ? (
          <EmptyState icon="⌕" title="Nenhum cliente encontrado" hint="Ajuste a busca ou os filtros, ou cadastre um novo cliente." />
        ) : (
          <div className="cli-table">
            <div className="cli-thead">
              <div>Nome</div><div>Cidade/UF</div><div>Cadastro</div><div>Status</div>
            </div>
            {paginated.map(client => (
              <div key={client.id} className="cli-trow" onClick={() => navigate(`/clientes/${client.id}`)}>
                <div className="name">{client.full_name}</div>
                <div className="muted">{client.city ? `${client.city}${client.state ? "/" + client.state : ""}` : "—"}</div>
                <div className="muted">{formatDateBR(client.created_at)}</div>
                <div><StatusBadge status={client.status} /></div>
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="cli-pager">
            <button className="cli-pg" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Anterior</button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 7) pageNum = i + 1;
              else if (page <= 4) pageNum = i + 1;
              else if (page >= totalPages - 3) pageNum = totalPages - 6 + i;
              else pageNum = page - 3 + i;
              return (
                <button key={pageNum} className={`cli-pg${pageNum === page ? " active" : ""}`} onClick={() => setPage(pageNum)}>
                  {pageNum}
                </button>
              );
            })}
            <button className="cli-pg" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Próxima →</button>
            <span className="cli-pageinfo">Pág. {page}/{totalPages}</span>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Lint + build**

Run: `npm run lint`
Expected: sem erros novos.

Run: `npm run build`
Expected: build OK.

- [ ] **Step 5: Verificar no preview (lista + filtros)**

Logado como recepção: a lista carrega via `search_clients`. Testar um filtro direto (`status=ativo` → ~33) e um indireto (`tem_processo=Sim` → ~24). CPF completo retorna o cliente; CPF parcial não retorna. "Limpar filtros" reseta. Paginação funciona sobre o resultado.

- [ ] **Step 6: Commit**

```bash
git add src/components/clients/shared.tsx src/components/clients/ClientFiltersPanel.tsx src/pages/Clients.tsx
git commit -m "feat(clientes): lista com filtros avançados via search_clients (card 3.9)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Card 3.9 — Filtros salvos (RPCs já existentes)

**Files:**
- Create: `src/hooks/useClientSavedFilters.ts`
- Modify: `src/pages/Clients.tsx` (barra de filtros salvos: salvar/aplicar/excluir)

**Interfaces:**
- Consumes: RPCs `get_my_client_saved_filters()` → `SETOF client_saved_filters` (`{ id, user_id, name, filter, created_at, updated_at }`), `client_save_filter(p_name text, p_filter jsonb)` → linha inserida, `client_delete_saved_filter(p_id uuid)` → void; tipo `ClientFilters`, `EMPTY_FILTERS` de `ClientFiltersPanel`.
- Produces: `useClientSavedFilters()` → `{ savedFilters: ClientSavedFilter[]; available: boolean; save(name, filter); remove(id); refresh() }`; tipo `ClientSavedFilter`.

- [ ] **Step 1: Criar o hook `useClientSavedFilters.ts`**

Create `src/hooks/useClientSavedFilters.ts`:

```tsx
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ClientFilters } from "@/components/clients/ClientFiltersPanel";

export interface ClientSavedFilter {
  id: string;
  name: string;
  filter: Partial<ClientFilters>;
  created_at: string;
}

type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
const rpc = () => (supabase as unknown as { rpc: Rpc }).rpc;

// Erros que indicam "função ainda não existe" (salvaguarda de degradação).
function isMissingFn(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42883" || err.code === "PGRST202"
    || /function .* does not exist|could not find the function/i.test(err.message ?? "");
}

export function useClientSavedFilters() {
  const [savedFilters, setSavedFilters] = useState<ClientSavedFilter[]>([]);
  const [available, setAvailable] = useState(true);

  const refresh = useCallback(async () => {
    const { data, error } = await rpc()("get_my_client_saved_filters");
    if (error) { if (isMissingFn(error)) setAvailable(false); return; }
    setAvailable(true);
    setSavedFilters((data as ClientSavedFilter[]) ?? []);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const save = useCallback(async (name: string, filter: Partial<ClientFilters>) => {
    const { error } = await rpc()("client_save_filter", { p_name: name, p_filter: filter });
    if (error) throw error;
    await refresh();
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    const { error } = await rpc()("client_delete_saved_filter", { p_id: id });
    if (error) throw error;
    await refresh();
  }, [refresh]);

  return { savedFilters, available, save, remove, refresh };
}
```

- [ ] **Step 2: Ligar a UI de filtros salvos em `Clients.tsx`**

Em `src/pages/Clients.tsx`, adicionar o import:

```tsx
import { useClientSavedFilters } from "@/hooks/useClientSavedFilters";
```

Dentro do componente, após o estado existente:

```tsx
  const { savedFilters, available: savedAvailable, save, remove } = useClientSavedFilters();

  async function handleSaveFilter() {
    const name = window.prompt("Nome do filtro salvo:");
    if (!name || !name.trim()) return;
    try { await save(name.trim(), filters); toast.success("Filtro salvo"); }
    catch { toast.error("Não foi possível salvar o filtro"); }
  }

  function applySaved(id: string) {
    const sf = savedFilters.find(s => s.id === id);
    if (!sf) return;
    setFilters({ ...EMPTY_FILTERS, ...sf.filter });
  }

  async function handleRemoveSaved(id: string) {
    try { await remove(id); toast.success("Filtro removido"); }
    catch { toast.error("Não foi possível remover o filtro"); }
  }
```

Adicionar a barra de filtros salvos logo abaixo da `cli-toolbar` (antes do `ClientFiltersPanel`), renderizada só quando `savedAvailable`:

```tsx
        {savedAvailable && (
          <div className="cli-toolbar" style={{ gap: 8 }}>
            <select className="cli-select" style={{ maxWidth: 240 }} defaultValue=""
              onChange={e => { if (e.target.value) { applySaved(e.target.value); e.target.value = ""; } }}>
              <option value="">Filtros salvos…</option>
              {savedFilters.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button className="cli-btn ghost sm" onClick={() => void handleSaveFilter()}>Salvar filtro atual</button>
            {savedFilters.length > 0 && (
              <select className="cli-select" style={{ maxWidth: 200 }} defaultValue=""
                onChange={e => { if (e.target.value) { void handleRemoveSaved(e.target.value); e.target.value = ""; } }}>
                <option value="">Excluir salvo…</option>
                {savedFilters.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
          </div>
        )}
```

- [ ] **Step 3: Lint + build**

Run: `npm run lint`
Expected: sem erros novos.

Run: `npm run build`
Expected: build OK.

- [ ] **Step 4: Verificar no preview (filtros salvos)**

Logado como recepção: montar um filtro (ex.: `status=ativo` + `tem_processo=Sim`), "Salvar filtro atual" → nomear → aparece no dropdown "Filtros salvos". Recarregar a página, escolher o filtro salvo → os controles voltam e a lista refiltra. "Excluir salvo" remove. Como as RPCs já existem no banco, a barra aparece de imediato.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useClientSavedFilters.ts src/pages/Clients.tsx
git commit -m "feat(clientes): filtros salvos por usuário na lista (card 3.9)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- 3.8 aba Histórico via `client_timeline` → Task 1. Chips por tipo → Task 1 Step 1. Link por `ref_id` (aba dona) → Task 1 (conversa informativa, decisão registrada). Empty-state honesto + 42501 → Task 1. Abas sem fonte inalteradas → não tocadas.
- 3.9 lista via `search_clients` + montagem de `p_filtros` só com chaves preenchidas → Task 2. Todos os controles (diretos, indiretos, CPF exato, datas, tri-estado) → Task 2 Steps 1-2. 42501 → Task 2 Step 3.
- Filtros salvos (RPCs existentes) + degradação graciosa → Task 3.

**Placeholder scan:** sem TBD/TODO; todo passo com código real e comandos com resultado esperado.

**Type consistency:** `ClientFilters`/`EMPTY_FILTERS`/`buildFiltros` definidos em Task 2 e consumidos em Task 3; `SearchClientRow` definido em Task 2 Step 1 e usado em Task 2 Step 3; `TaskTypeOption.display_name`/`.id` conforme `useUserTasks.ts`; RPC casts uniformes com o padrão do repositório.

## Verificação final (após as 3 tasks)
- `npm run lint` e `npm run build` limpos.
- Preview logado como recepção: lista filtra por critério direto e indireto; histórico de cliente com processo mostra o evento `processo`; CPF exato funciona, parcial não; filtros salvos salvam/aplicam/excluem.
