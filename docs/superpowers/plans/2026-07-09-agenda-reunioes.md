# Agenda de Reuniões (Trilha B) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o módulo Agenda de Reuniões (cards 5.1/5.2/5.3): tabela nova `meetings` com RLS, CRUD + tela, capacidade/horários/status configuráveis, e ações da recepção (edição, status, vínculo ao cadastro, criar tarefa, gancho Google).

**Architecture:** Greenfield. Tabelas novas (`meetings`, `meeting_history`, `meeting_settings`, `holidays`) criadas por migration **aditiva** via `apply_migration` (nunca `db push`). Regras de capacidade e máquina de estados vivem no banco (trigger + RPCs `SECURITY DEFINER`), garantindo o aceite independentemente do front. Frontend em React (página standalone estilo `Clients.tsx`, hook `useMeetings` sobre `useSupabaseQuery`). Utilitário de horário comercial criado como **canônico** (SQL + `src/lib/businessHours.ts`) para o card 4.5 reusar.

**Tech Stack:** Supabase Postgres (SQL/plpgsql, RLS), Supabase MCP (`apply_migration`, `execute_sql`, `generate_typescript_types`), React + TypeScript, react-router-dom (lazy routes), Vitest, lucide-react, sonner.

## Global Constraints

- **Projeto Supabase:** `tsltxvswzdnlmvljpryh` (usar em toda chamada MCP).
- **Migrations:** apenas **aditivas** via `apply_migration`. **NUNCA `db push`** (dispara `drop_plaintext_pii` do R-2). Cada migration aplicada no banco DEVE ter um arquivo idêntico em `supabase/migrations/` com **o mesmo nome/timestamp** usado no `apply_migration` (o `name` do `apply_migration` vira a versão em `schema_migrations`) — para não duplicar o registro.
- **Papéis (RLS):** enum `public.app_role` + `public.has_role(uid, 'x'::app_role)`. Acesso ao módulo = `admin, director, manager, lawyer, receptionist` (+ `tech`).
- **Papéis (UI menu):** usar `hasRole(...)` do `useAuth` espelhando o helper de RLS. Gate da página: orientado por RLS (estado "denied" ao receber `42501`), como em `src/pages/Clients.tsx`.
- **Nomenclatura:** tabelas/colunas em **inglês**; rótulos na tela em **PT-BR**.
- **Sem Node local:** build e Vitest rodam no **CI (Vercel)** a cada commit. Lógica de banco é verificada via `execute_sql`. Commitar somente código íntegro.
- **Números do Rodrigo (default de `meeting_settings`):** capacidade **2**/slot; janelas **08:00–11:00** e **13:00–16:00**; duração **15min**; expediente 08:00–17:00, seg–sex, exceto feriado.
- **Status (máquina de estados):** `agendado`, `confirmado`, `reagendado`, `cancelado`, `nao_compareceu`, `realizado`. Terminais: `cancelado`, `nao_compareceu`, `realizado`.
- **Após cada migration que altera schema:** regenerar `src/integrations/supabase/types.ts` via `generate_typescript_types` (MCP).
- **task_type do vínculo (5.3):** `agendar_atendimento` (já existe). NÃO alterar `create_user_task` (admin-only).

---

# FASE 5.1 — Schema + CRUD + tela

### Task 1: Migration base — enum, tabelas `meetings`/`meeting_history`, RLS, helper

**Files:**
- Create (repo): `supabase/migrations/20260709120000_agenda_meetings_base.sql`
- Apply (MCP): `apply_migration` name `20260709120000_agenda_meetings_base`

**Interfaces:**
- Produces (banco): tabela `public.meetings`, tabela `public.meeting_history`, enum `public.meeting_status`, função `public.can_access_meetings(uuid) → boolean`.

- [ ] **Step 1: Escrever o arquivo de migration no repo**

Criar `supabase/migrations/20260709120000_agenda_meetings_base.sql` com exatamente:

```sql
-- Agenda de Reuniões (Trilha B) — Fase 5.1: enum + tabelas base + RLS.
-- Aditiva. NÃO usar db push.

-- 1. Enum de status da reunião
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'meeting_status') THEN
    CREATE TYPE public.meeting_status AS ENUM (
      'agendado', 'confirmado', 'reagendado', 'cancelado', 'nao_compareceu', 'realizado'
    );
  END IF;
END$$;

-- 2. Helper de acesso ao módulo (papéis: recepção, advogado, gestores, admin, tech)
CREATE OR REPLACE FUNCTION public.can_access_meetings(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
      OR public.has_role(_user_id, 'director'::public.app_role)
      OR public.has_role(_user_id, 'manager'::public.app_role)
      OR public.has_role(_user_id, 'lawyer'::public.app_role)
      OR public.has_role(_user_id, 'receptionist'::public.app_role)
      OR public.has_role(_user_id, 'tech'::public.app_role)
$$;

-- 3. Tabela principal
CREATE TABLE public.meetings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name           text NOT NULL,
  phone                 text,
  scheduled_date        date NOT NULL,
  start_time            time NOT NULL,
  type                  text,
  lawyer_user_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  receptionist_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  summary               text,
  notes                 text,
  status                public.meeting_status NOT NULL DEFAULT 'agendado',
  task_id               uuid REFERENCES public.user_tasks(id) ON DELETE SET NULL,
  google_event_id       text,
  created_by            uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_meetings_date_time ON public.meetings(scheduled_date, start_time);
CREATE INDEX idx_meetings_client ON public.meetings(client_id);
CREATE INDEX idx_meetings_status ON public.meetings(status);
CREATE INDEX idx_meetings_lawyer ON public.meetings(lawyer_user_id);

CREATE TRIGGER update_meetings_updated_at
  BEFORE UPDATE ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Histórico (append-only)
CREATE TABLE public.meeting_history (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id     uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  event_type     text NOT NULL,           -- created | status_changed | rescheduled | task_created
  from_value     text,
  to_value       text,
  actor_user_id  uuid DEFAULT auth.uid(),
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_meeting_history_meeting ON public.meeting_history(meeting_id, created_at);

-- 5. Trigger: registra criação no histórico
CREATE OR REPLACE FUNCTION public.log_meeting_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.meeting_history (meeting_id, event_type, to_value, actor_user_id)
  VALUES (NEW.id, 'created', NEW.status::text, NEW.created_by);
  RETURN NEW;
END$$;

CREATE TRIGGER trg_meeting_created
  AFTER INSERT ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION public.log_meeting_created();

-- 6. RLS
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY meetings_select ON public.meetings FOR SELECT TO authenticated
  USING (public.can_access_meetings(auth.uid()));
CREATE POLICY meetings_insert ON public.meetings FOR INSERT TO authenticated
  WITH CHECK (public.can_access_meetings(auth.uid()) AND created_by = auth.uid());
CREATE POLICY meetings_update ON public.meetings FOR UPDATE TO authenticated
  USING (public.can_access_meetings(auth.uid()))
  WITH CHECK (public.can_access_meetings(auth.uid()));
CREATE POLICY meetings_delete ON public.meetings FOR DELETE TO authenticated
  USING (public.can_access_meetings(auth.uid()));

CREATE POLICY meeting_history_select ON public.meeting_history FOR SELECT TO authenticated
  USING (public.can_access_meetings(auth.uid()));
-- INSERT no histórico só via funções SECURITY DEFINER (sem policy de INSERT p/ authenticated).
```

- [ ] **Step 2: Aplicar a migration via MCP**

Chamar `apply_migration` com `project_id="tsltxvswzdnlmvljpryh"`, `name="20260709120000_agenda_meetings_base"` e o `query` = conteúdo exato do arquivo acima.

- [ ] **Step 3: Verificar tabela, RLS e helper**

Rodar via `execute_sql` (project `tsltxvswzdnlmvljpryh`):

```sql
select
  (select count(*) from information_schema.tables where table_schema='public' and table_name in ('meetings','meeting_history')) as tabelas,
  (select relrowsecurity from pg_class where oid='public.meetings'::regclass) as rls_on,
  (select count(*) from pg_type where typname='meeting_status') as enum_ok,
  (select count(*) from pg_policies where schemaname='public' and tablename='meetings') as policies_meetings;
```
Expected: `tabelas=2`, `rls_on=true`, `enum_ok=1`, `policies_meetings=4`.

- [ ] **Step 4: Verificar que não houve duplicação em schema_migrations**

```sql
select version, count(*) from supabase_migrations.schema_migrations
where version like '20260709120000%' group by version;
```
Expected: uma única linha, `count=1`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260709120000_agenda_meetings_base.sql
git commit -m "feat(agenda): tabelas meetings/meeting_history + RLS (card 5.1)"
```

---

### Task 2: Regenerar tipos TypeScript do Supabase

**Files:**
- Modify: `src/integrations/supabase/types.ts`

**Interfaces:**
- Produces: tipos de tabela/RPC atualizados para `meetings`/`meeting_history` (consumidos por `useMeetings`).

- [ ] **Step 1: Gerar os tipos via MCP**

Chamar `generate_typescript_types` com `project_id="tsltxvswzdnlmvljpryh"`.

- [ ] **Step 2: Substituir o conteúdo de `src/integrations/supabase/types.ts`**

Escrever a saída (campo `types`) integralmente no arquivo.

- [ ] **Step 3: Sanity check de que `meetings` aparece**

Run: `grep -c "meetings:" src/integrations/supabase/types.ts`
Expected: >= 1

- [ ] **Step 4: Commit**

```bash
git add src/integrations/supabase/types.ts
git commit -m "chore(agenda): regenerar tipos supabase (meetings)"
```

---

### Task 3: Hook `useMeetings` (list/create/update/delete)

**Files:**
- Create: `src/hooks/useMeetings.ts`

**Interfaces:**
- Consumes: `useSupabaseQuery` (de `src/hooks/useSupabaseQuery.ts`), `supabase` client.
- Produces:
  - `Meeting` (interface, campos = colunas de `meetings`).
  - `useMeetingsByDate(dateISO: string) → { meetings: Meeting[]; loading; error; refresh }`.
  - `createMeeting(input: MeetingInput) → Promise<string>` (retorna id).
  - `updateMeeting(id: string, patch: Partial<MeetingInput>) → Promise<void>`.
  - `deleteMeeting(id: string) → Promise<void>`.
  - `MeetingInput` = `{ client_id?: string|null; client_name: string; phone?: string|null; scheduled_date: string; start_time: string; type?: string|null; lawyer_user_id?: string|null; receptionist_user_id?: string|null; summary?: string|null; notes?: string|null }`.

- [ ] **Step 1: Escrever o hook**

Criar `src/hooks/useMeetings.ts`:

```ts
import { supabase } from "@/integrations/supabase/client";
import { useSupabaseQuery } from "@/hooks/useSupabaseQuery";

export type MeetingStatus =
  | "agendado" | "confirmado" | "reagendado"
  | "cancelado" | "nao_compareceu" | "realizado";

export interface Meeting {
  id: string;
  client_id: string | null;
  client_name: string;
  phone: string | null;
  scheduled_date: string;   // YYYY-MM-DD
  start_time: string;       // HH:MM:SS
  type: string | null;
  lawyer_user_id: string | null;
  receptionist_user_id: string | null;
  summary: string | null;
  notes: string | null;
  status: MeetingStatus;
  task_id: string | null;
  google_event_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface MeetingInput {
  client_id?: string | null;
  client_name: string;
  phone?: string | null;
  scheduled_date: string;
  start_time: string;
  type?: string | null;
  lawyer_user_id?: string | null;
  receptionist_user_id?: string | null;
  summary?: string | null;
  notes?: string | null;
}

// Lista as reuniões de um dia (ordenadas por horário).
export function useMeetingsByDate(dateISO: string) {
  const { data, loading, error, refetch } = useSupabaseQuery<Meeting[]>({
    queryKey: `meetings-${dateISO}`,
    enabled: !!dateISO,
    fetcher: async () => {
      const { data, error } = await supabase
        .from("meetings")
        .select("*")
        .eq("scheduled_date", dateISO)
        .order("start_time", { ascending: true });
      if (error) throw error;
      return (data as unknown as Meeting[]) ?? [];
    },
    realtime: { table: "meetings", filter: `scheduled_date=eq.${dateISO}` },
  });
  return { meetings: data ?? [], loading, error, refresh: refetch };
}

export async function createMeeting(input: MeetingInput): Promise<string> {
  const { data, error } = await supabase
    .from("meetings")
    .insert(input as never)
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function updateMeeting(id: string, patch: Partial<MeetingInput>): Promise<void> {
  const { error } = await supabase.from("meetings").update(patch as never).eq("id", id);
  if (error) throw error;
}

export async function deleteMeeting(id: string): Promise<void> {
  const { error } = await supabase.from("meetings").delete().eq("id", id);
  if (error) throw error;
}
```

- [ ] **Step 2: Verificar tipagem (lint local não roda; conferir imports)**

Run: `grep -n "useSupabaseQuery" src/hooks/useMeetings.ts`
Expected: import presente. (Build TS será validado no CI ao commitar.)

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useMeetings.ts
git commit -m "feat(agenda): hook useMeetings (CRUD por data)"
```

---

### Task 4: Rota `/agenda` + item de menu "Agenda"

**Files:**
- Modify: `src/App.tsx` (adicionar lazy import + `<Route>`)
- Modify: `src/components/JurisCloudOS.tsx:1646` (adicionar item em `MENU_ITEMS`)
- Create: `src/pages/Agenda.tsx` (placeholder navegável nesta task)

**Interfaces:**
- Consumes: `useAuth().hasRole`, `useMeetingsByDate` (Task 3).
- Produces: rota `/agenda` renderizando `<Agenda/>`; item de menu visível a quem tem acesso.

- [ ] **Step 1: Criar placeholder de página `src/pages/Agenda.tsx`**

```tsx
export default function Agenda() {
  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600 }}>Agenda de Reuniões</h1>
      <p style={{ opacity: 0.7 }}>Módulo em construção.</p>
    </div>
  );
}
```

- [ ] **Step 2: Registrar o lazy import + rota em `src/App.tsx`**

Adicionar junto aos demais lazy imports (após a linha do `ImportarDados`, ~L92):

```tsx
const Agenda = lazyWithRetry(() => import("./pages/Agenda.tsx"));
```

Adicionar a rota junto às rotas `/sistema/*` (após a linha `/clientes/:id/editar`, ~L185):

```tsx
<Route path="/agenda" element={<ProtectedRoute><Agenda /></ProtectedRoute>} />
```

- [ ] **Step 3: Adicionar o item de menu em `src/components/JurisCloudOS.tsx`**

No array `MENU_ITEMS` (~L1646), logo após o item `clientes`, inserir:

```tsx
{ id: "agenda", label: "Agenda", icon: CalendarDays, color: ACCENT, action: () => navigate("/agenda"), show: hasRole("admin") || hasRole("director") || hasRole("manager") || hasRole("lawyer") || hasRole("receptionist") || hasRole("tech") },
```

Garantir que `CalendarDays` está importado de `lucide-react` no topo do arquivo (adicionar ao import existente se ausente).

- [ ] **Step 4: Verificar imports**

Run: `grep -n "CalendarDays" src/components/JurisCloudOS.tsx`
Expected: aparece no import e no item de menu.
Run: `grep -n "path=\"/agenda\"" src/App.tsx`
Expected: 1 linha.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/JurisCloudOS.tsx src/pages/Agenda.tsx
git commit -m "feat(agenda): rota /agenda + item de menu (card 5.1)"
```

---

### Task 5: Página Agenda — visão do dia (lista) + gate por RLS

**Files:**
- Modify: `src/pages/Agenda.tsx`

**Interfaces:**
- Consumes: `useMeetingsByDate` (Task 3), `HexagonLoader`, `RestrictedAccess` (de `@/components/clients/shared`).
- Produces: `<Agenda/>` com navegação de data e tabela de reuniões do dia; estado "denied" quando RLS bloqueia.

- [ ] **Step 1: Implementar a página com lista do dia**

Substituir `src/pages/Agenda.tsx` por:

```tsx
import { useState } from "react";
import { useMeetingsByDate, type MeetingStatus } from "@/hooks/useMeetings";
import { HexagonLoader } from "@/components/HexagonLoader";
import { RestrictedAccess } from "@/components/clients/shared";

const STATUS_LABEL: Record<MeetingStatus, string> = {
  agendado: "Agendado", confirmado: "Confirmado", reagendado: "Reagendado",
  cancelado: "Cancelado", nao_compareceu: "Não compareceu", realizado: "Realizado",
};

function todayISO(): string {
  return new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, timezone local
}

export default function Agenda() {
  const [dateISO, setDateISO] = useState<string>(todayISO());
  const { meetings, loading, error } = useMeetingsByDate(dateISO);

  // RLS bloqueado → Postgres devolve 42501 (traduzido para string de erro).
  if (error && /permission|42501|denied/i.test(error)) return <RestrictedAccess />;

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Agenda de Reuniões</h1>
        <input
          type="date"
          value={dateISO}
          onChange={(e) => setDateISO(e.target.value)}
          aria-label="Data da agenda"
          style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border, #ccc)" }}
        />
      </div>

      {loading ? (
        <HexagonLoader />
      ) : meetings.length === 0 ? (
        <p style={{ opacity: 0.7 }}>Nenhuma reunião para esta data.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border,#ddd)" }}>
              <th style={{ padding: 8 }}>Horário</th>
              <th style={{ padding: 8 }}>Cliente</th>
              <th style={{ padding: 8 }}>Tipo</th>
              <th style={{ padding: 8 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {meetings.map((m) => (
              <tr key={m.id} style={{ borderBottom: "1px solid var(--border,#eee)" }}>
                <td style={{ padding: 8 }}>{m.start_time?.slice(0, 5)}</td>
                <td style={{ padding: 8 }}>{m.client_name}</td>
                <td style={{ padding: 8 }}>{m.type ?? "—"}</td>
                <td style={{ padding: 8 }}>{STATUS_LABEL[m.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar**

Run: `grep -n "useMeetingsByDate" src/pages/Agenda.tsx`
Expected: import + uso.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Agenda.tsx
git commit -m "feat(agenda): visão do dia com lista de reuniões (card 5.1)"
```

---

### Task 6: `MeetingFormDialog` — criar/editar (sem seletor de slot ainda)

**Files:**
- Create: `src/components/agenda/MeetingFormDialog.tsx`
- Modify: `src/pages/Agenda.tsx` (botão "Nova reunião" + abrir dialog + refresh)

**Interfaces:**
- Consumes: `createMeeting`, `updateMeeting`, `type Meeting`, `type MeetingInput` (Task 3); `Dialog` de `@/components/ui/dialog`; `toast` de `sonner`.
- Produces: `MeetingFormDialog` (props: `open`, `onOpenChange`, `defaultDate?`, `meeting?`, `onSaved`).

- [ ] **Step 1: Criar o dialog**

Criar `src/components/agenda/MeetingFormDialog.tsx`:

```tsx
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { createMeeting, updateMeeting, type Meeting, type MeetingInput } from "@/hooks/useMeetings";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultDate: string;              // YYYY-MM-DD
  meeting?: Meeting | null;         // presente = edição
  onSaved: () => void;
}

const EMPTY = (date: string): MeetingInput => ({
  client_name: "", phone: "", scheduled_date: date, start_time: "08:00",
  type: "", summary: "", notes: "",
});

export function MeetingFormDialog({ open, onOpenChange, defaultDate, meeting, onSaved }: Props) {
  const [form, setForm] = useState<MeetingInput>(EMPTY(defaultDate));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (meeting) {
      setForm({
        client_id: meeting.client_id, client_name: meeting.client_name, phone: meeting.phone,
        scheduled_date: meeting.scheduled_date, start_time: meeting.start_time?.slice(0, 5),
        type: meeting.type, lawyer_user_id: meeting.lawyer_user_id,
        receptionist_user_id: meeting.receptionist_user_id, summary: meeting.summary, notes: meeting.notes,
      });
    } else {
      setForm(EMPTY(defaultDate));
    }
  }, [meeting, defaultDate, open]);

  const patch = (p: Partial<MeetingInput>) => setForm((prev) => ({ ...prev, ...p }));

  async function handleSave() {
    if (!form.client_name.trim()) { toast.error("Informe o nome do cliente"); return; }
    setSaving(true);
    try {
      if (meeting) await updateMeeting(meeting.id, form);
      else await createMeeting(form);
      toast.success(meeting ? "Reunião atualizada" : "Reunião criada");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{meeting ? "Editar reunião" : "Nova reunião"}</DialogTitle></DialogHeader>
        <div style={{ display: "grid", gap: 12 }}>
          <div><Label>Cliente *</Label>
            <Input value={form.client_name} onChange={(e) => patch({ client_name: e.target.value })} /></div>
          <div><Label>Telefone</Label>
            <Input value={form.phone ?? ""} onChange={(e) => patch({ phone: e.target.value })} /></div>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}><Label>Data</Label>
              <Input type="date" value={form.scheduled_date} onChange={(e) => patch({ scheduled_date: e.target.value })} /></div>
            <div style={{ flex: 1 }}><Label>Horário</Label>
              <Input type="time" value={form.start_time} onChange={(e) => patch({ start_time: e.target.value })} /></div>
          </div>
          <div><Label>Tipo de atendimento</Label>
            <Input value={form.type ?? ""} onChange={(e) => patch({ type: e.target.value })} /></div>
          <div><Label>Resumo</Label>
            <Input value={form.summary ?? ""} onChange={(e) => patch({ summary: e.target.value })} /></div>
          <div><Label>Observações</Label>
            <Input value={form.notes ?? ""} onChange={(e) => patch({ notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Ligar o dialog na página**

Em `src/pages/Agenda.tsx`: importar `useMeetingsByDate` já traz `refresh`. Adicionar `import { MeetingFormDialog } from "@/components/agenda/MeetingFormDialog";` e `import { Button } from "@/components/ui/button";`. Trocar a desestruturação para incluir `refresh`, adicionar estado `const [formOpen, setFormOpen] = useState(false);`, um botão "Nova reunião" ao lado do input de data:

```tsx
<Button onClick={() => setFormOpen(true)}>Nova reunião</Button>
```

e antes de fechar o `</div>` raiz:

```tsx
<MeetingFormDialog open={formOpen} onOpenChange={setFormOpen} defaultDate={dateISO} onSaved={refresh} />
```

- [ ] **Step 3: Verificar**

Run: `grep -n "MeetingFormDialog" src/pages/Agenda.tsx`
Expected: import + uso.

- [ ] **Step 4: Commit**

```bash
git add src/components/agenda/MeetingFormDialog.tsx src/pages/Agenda.tsx
git commit -m "feat(agenda): criar/editar reunião via MeetingFormDialog (card 5.1)"
```

---

# FASE 5.2 — Capacidade + horários configuráveis + status

### Task 7: Migration — `meeting_settings` + `holidays` (default do Rodrigo) + RLS

**Files:**
- Create (repo): `supabase/migrations/20260709130000_agenda_settings_holidays.sql`
- Apply (MCP): `apply_migration` name `20260709130000_agenda_settings_holidays`

**Interfaces:**
- Produces: `public.meeting_settings` (linha única) e `public.holidays`.

- [ ] **Step 1: Escrever o arquivo**

```sql
-- Fase 5.2: settings de agenda (default Rodrigo) + feriados. Aditiva.

CREATE TABLE public.meeting_settings (
  id                integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- singleton
  capacity_per_slot integer NOT NULL DEFAULT 2 CHECK (capacity_per_slot > 0),
  slot_minutes      integer NOT NULL DEFAULT 15 CHECK (slot_minutes > 0),
  windows           jsonb   NOT NULL DEFAULT '[["08:00","11:00"],["13:00","16:00"]]'::jsonb,
  office_open       time    NOT NULL DEFAULT '08:00',
  office_close      time    NOT NULL DEFAULT '17:00',
  workdays          integer[] NOT NULL DEFAULT '{1,2,3,4,5}',  -- 1=segunda ... 7=domingo (ISODOW)
  updated_by        uuid REFERENCES auth.users(id),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.meeting_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE public.holidays (
  holiday_date date PRIMARY KEY,
  description  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.meeting_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY meeting_settings_select ON public.meeting_settings FOR SELECT TO authenticated
  USING (public.can_access_meetings(auth.uid()));
CREATE POLICY meeting_settings_update ON public.meeting_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY holidays_select ON public.holidays FOR SELECT TO authenticated
  USING (public.can_access_meetings(auth.uid()));
CREATE POLICY holidays_write ON public.holidays FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
```

- [ ] **Step 2: Aplicar via `apply_migration`** (mesmos moldes da Task 1, `name="20260709130000_agenda_settings_holidays"`).

- [ ] **Step 3: Verificar o default do Rodrigo**

```sql
select capacity_per_slot, slot_minutes, windows, workdays from public.meeting_settings where id=1;
```
Expected: `capacity_per_slot=2`, `slot_minutes=15`, `windows=[["08:00","11:00"],["13:00","16:00"]]`, `workdays={1,2,3,4,5}`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260709130000_agenda_settings_holidays.sql
git commit -m "feat(agenda): meeting_settings + holidays com default do Rodrigo (card 5.2)"
```

---

### Task 8: Migration — utilitário de horário canônico + `available_meeting_slots`

**Files:**
- Create (repo): `supabase/migrations/20260709140000_agenda_business_hours.sql`
- Apply (MCP): `apply_migration` name `20260709140000_agenda_business_hours`

**Interfaces:**
- Produces (banco, CANÔNICO p/ card 4.5):
  - `public.is_business_day(date) → boolean`
  - `public.generate_meeting_slots(date) → setof time`
  - `public.available_meeting_slots(p_date date) → table(slot time, remaining integer)`

- [ ] **Step 1: Escrever o arquivo**

```sql
-- Fase 5.2: utilitário canônico de horário comercial + slots disponíveis. Aditiva.
-- Compartilhado com o card 4.5 (Trilha A) — importar, não duplicar.

CREATE OR REPLACE FUNCTION public.is_business_day(d date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXTRACT(ISODOW FROM d)::int = ANY (
           (SELECT workdays FROM public.meeting_settings WHERE id = 1)
         )
     AND NOT EXISTS (SELECT 1 FROM public.holidays h WHERE h.holiday_date = d);
$$;

-- Gera os horários (slots) de um dia a partir das janelas + duração das settings.
CREATE OR REPLACE FUNCTION public.generate_meeting_slots(d date)
RETURNS setof time LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s        public.meeting_settings%rowtype;
  win      jsonb;
  win_start time;
  win_end   time;
  cur       time;
BEGIN
  SELECT * INTO s FROM public.meeting_settings WHERE id = 1;
  IF NOT public.is_business_day(d) THEN
    RETURN;  -- dia não-comercial: nenhum slot
  END IF;
  FOR win IN SELECT * FROM jsonb_array_elements(s.windows) LOOP
    win_start := (win->>0)::time;
    win_end   := (win->>1)::time;
    cur := win_start;
    WHILE cur < win_end LOOP
      RETURN NEXT cur;
      cur := cur + make_interval(mins => s.slot_minutes);
    END LOOP;
  END LOOP;
END$$;

-- Slots com vaga: capacidade menos reservas ATIVAS. Slot cheio não é retornado.
CREATE OR REPLACE FUNCTION public.available_meeting_slots(p_date date)
RETURNS TABLE(slot time, remaining integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH cap AS (SELECT capacity_per_slot FROM public.meeting_settings WHERE id = 1),
  slots AS (SELECT public.generate_meeting_slots(p_date) AS slot),
  booked AS (
    SELECT start_time, count(*) AS n
    FROM public.meetings
    WHERE scheduled_date = p_date
      AND status IN ('agendado','confirmado','reagendado')
    GROUP BY start_time
  )
  SELECT s.slot,
         (SELECT capacity_per_slot FROM cap) - COALESCE(b.n, 0) AS remaining
  FROM slots s
  LEFT JOIN booked b ON b.start_time = s.slot
  WHERE (SELECT capacity_per_slot FROM cap) - COALESCE(b.n, 0) > 0
  ORDER BY s.slot;
$$;

GRANT EXECUTE ON FUNCTION public.available_meeting_slots(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_business_day(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_meeting_slots(date) TO authenticated;
```

- [ ] **Step 2: Aplicar via `apply_migration`** (`name="20260709140000_agenda_business_hours"`).

- [ ] **Step 3: Verificar geração de slots num dia útil**

```sql
-- Escolher uma quarta-feira qualquer (ISODOW=3):
select count(*) as total_slots from public.generate_meeting_slots(date '2026-07-15');
select public.is_business_day(date '2026-07-15') as util,
       public.is_business_day(date '2026-07-19') as domingo;
```
Expected: `total_slots = 24` (08:00–10:45 → 12 slots; 13:00–15:45 → 12 slots), `util=true`, `domingo=false`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260709140000_agenda_business_hours.sql
git commit -m "feat(agenda): util canônico de horário + available_meeting_slots (card 5.2)"
```

---

### Task 9: Migration — trigger de capacidade + máquina de estados (status/reschedule)

**Files:**
- Create (repo): `supabase/migrations/20260709150000_agenda_capacity_state_machine.sql`
- Apply (MCP): `apply_migration` name `20260709150000_agenda_capacity_state_machine`

**Interfaces:**
- Produces (banco):
  - Trigger `enforce_meeting_capacity` em `public.meetings`.
  - `public.update_meeting_status(p_meeting_id uuid, p_new_status public.meeting_status, p_notes text) → void`
  - `public.reschedule_meeting(p_meeting_id uuid, p_new_date date, p_new_time time, p_notes text) → void`

- [ ] **Step 1: Escrever o arquivo**

```sql
-- Fase 5.2: capacidade (máx. 2/slot) + máquina de estados. Aditiva.

-- 1. Trigger de capacidade (blindagem independente do front)
CREATE OR REPLACE FUNCTION public.enforce_meeting_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cap integer;
  v_count integer;
BEGIN
  -- Só reservas ATIVAS ocupam o slot.
  IF NEW.status NOT IN ('agendado','confirmado','reagendado') THEN
    RETURN NEW;
  END IF;
  SELECT capacity_per_slot INTO v_cap FROM public.meeting_settings WHERE id = 1;
  SELECT count(*) INTO v_count
  FROM public.meetings
  WHERE scheduled_date = NEW.scheduled_date
    AND start_time = NEW.start_time
    AND status IN ('agendado','confirmado','reagendado')
    AND id <> NEW.id;
  IF v_count >= v_cap THEN
    RAISE EXCEPTION 'meeting_slot_full: capacidade % excedida em % %', v_cap, NEW.scheduled_date, NEW.start_time
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END$$;

CREATE TRIGGER trg_enforce_meeting_capacity
  BEFORE INSERT OR UPDATE OF scheduled_date, start_time, status ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_meeting_capacity();

-- 2. Validador da máquina de estados
CREATE OR REPLACE FUNCTION public.meeting_status_transition_allowed(_from public.meeting_status, _to public.meeting_status)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _from IN ('cancelado','nao_compareceu','realizado') THEN false  -- terminais
    WHEN _from = 'agendado'   AND _to IN ('confirmado','reagendado','cancelado','nao_compareceu','realizado') THEN true
    WHEN _from = 'confirmado' AND _to IN ('reagendado','cancelado','nao_compareceu','realizado') THEN true
    WHEN _from = 'reagendado' AND _to IN ('confirmado','cancelado','nao_compareceu','realizado') THEN true
    ELSE false
  END;
$$;

-- 3. RPC: mudar status (valida transição + registra histórico)
CREATE OR REPLACE FUNCTION public.update_meeting_status(
  p_meeting_id uuid, p_new_status public.meeting_status, p_notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old public.meeting_status;
BEGIN
  IF NOT public.can_access_meetings(auth.uid()) THEN
    RAISE EXCEPTION 'sem permissão' USING ERRCODE = '42501';
  END IF;
  SELECT status INTO v_old FROM public.meetings WHERE id = p_meeting_id FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'reunião não encontrada'; END IF;
  IF NOT public.meeting_status_transition_allowed(v_old, p_new_status) THEN
    RAISE EXCEPTION 'transição de status inválida: % -> %', v_old, p_new_status;
  END IF;
  UPDATE public.meetings SET status = p_new_status WHERE id = p_meeting_id;
  INSERT INTO public.meeting_history (meeting_id, event_type, from_value, to_value, actor_user_id, notes)
  VALUES (p_meeting_id, 'status_changed', v_old::text, p_new_status::text, auth.uid(), p_notes);
END$$;

-- 4. RPC: reagendar (muda data/hora, status 'reagendado', respeita a trigger de capacidade)
CREATE OR REPLACE FUNCTION public.reschedule_meeting(
  p_meeting_id uuid, p_new_date date, p_new_time time, p_notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old_date date;
  v_old_time time;
  v_status public.meeting_status;
BEGIN
  IF NOT public.can_access_meetings(auth.uid()) THEN
    RAISE EXCEPTION 'sem permissão' USING ERRCODE = '42501';
  END IF;
  SELECT scheduled_date, start_time, status INTO v_old_date, v_old_time, v_status
  FROM public.meetings WHERE id = p_meeting_id FOR UPDATE;
  IF v_old_date IS NULL THEN RAISE EXCEPTION 'reunião não encontrada'; END IF;
  IF v_status IN ('cancelado','nao_compareceu','realizado') THEN
    RAISE EXCEPTION 'reunião em estado terminal não pode ser reagendada';
  END IF;
  UPDATE public.meetings
    SET scheduled_date = p_new_date, start_time = p_new_time, status = 'reagendado'
    WHERE id = p_meeting_id;
  INSERT INTO public.meeting_history (meeting_id, event_type, from_value, to_value, actor_user_id, notes)
  VALUES (p_meeting_id, 'rescheduled',
          v_old_date::text || ' ' || v_old_time::text,
          p_new_date::text || ' ' || p_new_time::text, auth.uid(), p_notes);
END$$;

GRANT EXECUTE ON FUNCTION public.update_meeting_status(uuid, public.meeting_status, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_meeting(uuid, date, time, text) TO authenticated;
```

- [ ] **Step 2: Aplicar via `apply_migration`** (`name="20260709150000_agenda_capacity_state_machine"`).

- [ ] **Step 3: Verificar capacidade (máx. 2) e transição inválida via SQL**

```sql
-- Insere 2 reuniões no mesmo slot (deve permitir), a 3ª deve falhar.
DO $$
DECLARE e text;
BEGIN
  INSERT INTO public.meetings (client_name, scheduled_date, start_time, created_by)
    VALUES ('T1', date '2026-07-15', time '09:00', '00000000-0000-0000-0000-000000000000');
  INSERT INTO public.meetings (client_name, scheduled_date, start_time, created_by)
    VALUES ('T2', date '2026-07-15', time '09:00', '00000000-0000-0000-0000-000000000000');
  BEGIN
    INSERT INTO public.meetings (client_name, scheduled_date, start_time, created_by)
      VALUES ('T3', date '2026-07-15', time '09:00', '00000000-0000-0000-0000-000000000000');
    RAISE NOTICE 'ERRO: 3a inserção não deveria passar';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK: capacidade bloqueou a 3a';
  END;
  -- limpeza
  DELETE FROM public.meetings WHERE scheduled_date = date '2026-07-15' AND client_name IN ('T1','T2','T3');
END$$;
```
Expected: NOTICE "OK: capacidade bloqueou a 3a"; nenhuma linha remanescente. Confirmar com:
```sql
select count(*) from public.meetings where scheduled_date = date '2026-07-15';
```
Expected: `0`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260709150000_agenda_capacity_state_machine.sql
git commit -m "feat(agenda): trigger de capacidade + máquina de estados (card 5.2)"
```

---

### Task 10: Util de horário no front (`businessHours.ts`) + testes Vitest

**Files:**
- Create: `src/lib/businessHours.ts`
- Create: `src/lib/__tests__/businessHours.test.ts`

**Interfaces:**
- Produces:
  - `generateSlots(windows: [string,string][], slotMinutes: number) → string[]` (HH:MM).
  - `isWorkday(dateISO: string, workdays: number[]) → boolean` (ISO dow 1..7).

- [ ] **Step 1: Escrever o teste (falha primeiro)**

Criar `src/lib/__tests__/businessHours.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generateSlots, isWorkday } from "../businessHours";

describe("generateSlots", () => {
  it("gera 24 slots de 15min nas janelas do Rodrigo", () => {
    const slots = generateSlots([["08:00", "11:00"], ["13:00", "16:00"]], 15);
    expect(slots.length).toBe(24);
    expect(slots[0]).toBe("08:00");
    expect(slots[slots.length - 1]).toBe("15:45");
    expect(slots).not.toContain("11:00"); // fim exclusivo
  });
});

describe("isWorkday", () => {
  it("quarta é dia útil, domingo não", () => {
    expect(isWorkday("2026-07-15", [1, 2, 3, 4, 5])).toBe(true);  // quarta
    expect(isWorkday("2026-07-19", [1, 2, 3, 4, 5])).toBe(false); // domingo
  });
});
```

- [ ] **Step 2: Rodar (falha — módulo não existe). Sem Node local: pular execução e confiar no CI.**

Run (no CI): `npx vitest run src/lib/__tests__/businessHours.test.ts`
Expected: FAIL "Cannot find module '../businessHours'".

- [ ] **Step 3: Implementar `src/lib/businessHours.ts`**

```ts
// Utilitário de horário comercial (front). Espelha a lógica canônica do SQL
// (is_business_day / generate_meeting_slots). A verdade de disponibilidade vem
// da RPC available_meeting_slots; estas funções servem para render otimista.

/** Gera horários "HH:MM" a partir de janelas [inicio,fim) e duração em minutos. */
export function generateSlots(windows: [string, string][], slotMinutes: number): string[] {
  const out: string[] = [];
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const fmt = (min: number) =>
    `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
  for (const [start, end] of windows) {
    for (let cur = toMin(start); cur < toMin(end); cur += slotMinutes) out.push(fmt(cur));
  }
  return out;
}

/** ISO day-of-week (1=segunda ... 7=domingo) presente em workdays? */
export function isWorkday(dateISO: string, workdays: number[]): boolean {
  const d = new Date(`${dateISO}T00:00:00`);
  const jsDow = d.getDay();            // 0=domingo..6=sábado
  const isoDow = jsDow === 0 ? 7 : jsDow;
  return workdays.includes(isoDow);
}
```

- [ ] **Step 4: Rodar no CI ao commitar; verificar localmente a presença**

Run: `grep -n "export function generateSlots" src/lib/businessHours.ts`
Expected: 1 linha.

- [ ] **Step 5: Commit**

```bash
git add src/lib/businessHours.ts src/lib/__tests__/businessHours.test.ts
git commit -m "feat(agenda): businessHours util + testes (card 5.2)"
```

---

### Task 11: Seletor de slots disponíveis no form + hook de slots

**Files:**
- Modify: `src/hooks/useMeetings.ts` (adicionar `useAvailableSlots`)
- Modify: `src/components/agenda/MeetingFormDialog.tsx` (trocar `<Input type="time">` por `<select>` de slots disponíveis)

**Interfaces:**
- Consumes: RPC `available_meeting_slots` (Task 8).
- Produces: `useAvailableSlots(dateISO: string, currentTime?: string) → { slots: string[]; loading }` (HH:MM; inclui `currentTime` na edição para não sumir o slot já ocupado pela própria reunião).

- [ ] **Step 1: Adicionar `useAvailableSlots` em `src/hooks/useMeetings.ts`**

Ao final do arquivo:

```ts
interface SlotRow { slot: string; remaining: number }

export function useAvailableSlots(dateISO: string, currentTime?: string) {
  const { data, loading } = useSupabaseQuery<string[]>({
    queryKey: `meeting-slots-${dateISO}-${currentTime ?? ""}`,
    enabled: !!dateISO,
    fetcher: async () => {
      const { data, error } = await supabase.rpc("available_meeting_slots", { p_date: dateISO });
      if (error) throw error;
      const slots = ((data as unknown as SlotRow[]) ?? []).map((r) => r.slot.slice(0, 5));
      // Na edição, garantir que o horário atual da reunião apareça mesmo se o slot estiver cheio.
      if (currentTime && !slots.includes(currentTime)) slots.push(currentTime);
      return slots.sort();
    },
  });
  return { slots: data ?? [], loading };
}
```

- [ ] **Step 2: Usar o seletor no form**

Em `src/components/agenda/MeetingFormDialog.tsx`: importar `useAvailableSlots` e substituir o campo de horário por um `<select>`:

```tsx
// dentro do componente, após useState:
const { slots } = useAvailableSlots(form.scheduled_date, meeting?.start_time?.slice(0, 5));
```

```tsx
<div style={{ flex: 1 }}><Label>Horário</Label>
  <select
    value={form.start_time}
    onChange={(e) => patch({ start_time: e.target.value })}
    style={{ width: "100%", padding: "8px", borderRadius: 8, border: "1px solid var(--border,#ccc)" }}
  >
    {slots.length === 0 && <option value="">Sem horários livres</option>}
    {slots.map((s) => <option key={s} value={s}>{s}</option>)}
  </select>
</div>
```

- [ ] **Step 3: Verificar**

Run: `grep -n "useAvailableSlots" src/hooks/useMeetings.ts src/components/agenda/MeetingFormDialog.tsx`
Expected: definição + uso.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useMeetings.ts src/components/agenda/MeetingFormDialog.tsx
git commit -m "feat(agenda): seletor de slots disponíveis no form (card 5.2)"
```

---

### Task 12: `MeetingSettingsDialog` (admin) — capacidade/janelas/duração/feriados

**Files:**
- Create: `src/components/agenda/MeetingSettingsDialog.tsx`
- Modify: `src/pages/Agenda.tsx` (botão "Configurações" visível só a admin via `useAuth().hasRole("admin")`)

**Interfaces:**
- Consumes: tabela `meeting_settings` (SELECT/UPDATE via RLS admin), `useAuth`.
- Produces: `MeetingSettingsDialog` (props `open`, `onOpenChange`).

- [ ] **Step 1: Criar o dialog**

Criar `src/components/agenda/MeetingSettingsDialog.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props { open: boolean; onOpenChange: (v: boolean) => void }

export function MeetingSettingsDialog({ open, onOpenChange }: Props) {
  const [capacity, setCapacity] = useState(2);
  const [slotMinutes, setSlotMinutes] = useState(15);
  const [windows, setWindows] = useState('[["08:00","11:00"],["13:00","16:00"]]');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const { data } = await supabase.from("meeting_settings").select("*").eq("id", 1).single();
      const s = data as unknown as { capacity_per_slot: number; slot_minutes: number; windows: unknown } | null;
      if (s) {
        setCapacity(s.capacity_per_slot);
        setSlotMinutes(s.slot_minutes);
        setWindows(JSON.stringify(s.windows));
      }
    })();
  }, [open]);

  async function handleSave() {
    let parsed: unknown;
    try { parsed = JSON.parse(windows); } catch { toast.error("Janelas em JSON inválido"); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("meeting_settings")
        .update({ capacity_per_slot: capacity, slot_minutes: slotMinutes, windows: parsed as never })
        .eq("id", 1);
      if (error) throw error;
      toast.success("Configurações salvas");
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível salvar (apenas admin)");
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Configurações da agenda</DialogTitle></DialogHeader>
        <div style={{ display: "grid", gap: 12 }}>
          <div><Label>Capacidade por horário</Label>
            <Input type="number" min={1} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} /></div>
          <div><Label>Duração do atendimento (min)</Label>
            <Input type="number" min={1} value={slotMinutes} onChange={(e) => setSlotMinutes(Number(e.target.value))} /></div>
          <div><Label>Janelas (JSON)</Label>
            <Input value={windows} onChange={(e) => setWindows(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Ligar na página (só admin)**

Em `src/pages/Agenda.tsx`: `import { useAuth } from "@/hooks/useAuth";`, `import { MeetingSettingsDialog } from "@/components/agenda/MeetingSettingsDialog";`. Adicionar `const { hasRole } = useAuth();`, estado `const [settingsOpen, setSettingsOpen] = useState(false);`. No cabeçalho, quando `hasRole("admin")`, renderizar `<Button variant="outline" onClick={() => setSettingsOpen(true)}>Configurações</Button>` e, no fim, `<MeetingSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />`.

- [ ] **Step 3: Verificar**

Run: `grep -n "MeetingSettingsDialog" src/pages/Agenda.tsx`
Expected: import + uso.

- [ ] **Step 4: Commit**

```bash
git add src/components/agenda/MeetingSettingsDialog.tsx src/pages/Agenda.tsx
git commit -m "feat(agenda): configurações da agenda (admin) (card 5.2)"
```

---

# FASE 5.3 — Edição/ações + vínculo cliente + criar tarefa + gancho Google

### Task 13: Migration — RPC `create_meeting_task`

**Files:**
- Create (repo): `supabase/migrations/20260709160000_agenda_create_meeting_task.sql`
- Apply (MCP): `apply_migration` name `20260709160000_agenda_create_meeting_task`

**Interfaces:**
- Consumes: task_type `agendar_atendimento`, tabela `user_tasks`.
- Produces: `public.create_meeting_task(p_meeting_id uuid) → uuid` (id da tarefa criada; idempotente).

- [ ] **Step 1: Escrever o arquivo**

```sql
-- Fase 5.3: cria tarefa (agendar_atendimento) vinculada à reunião. Aditiva.
-- NÃO altera create_user_task (admin-only). Insert direto sob SECURITY DEFINER,
-- liberado para quem tem acesso ao módulo (recepção/advogado/gestor/admin).

CREATE OR REPLACE FUNCTION public.create_meeting_task(p_meeting_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_meeting   public.meetings%rowtype;
  v_task_type uuid;
  v_assignee  uuid;
  v_task_id   uuid;
BEGIN
  IF NOT public.can_access_meetings(auth.uid()) THEN
    RAISE EXCEPTION 'sem permissão' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_meeting FROM public.meetings WHERE id = p_meeting_id FOR UPDATE;
  IF v_meeting.id IS NULL THEN RAISE EXCEPTION 'reunião não encontrada'; END IF;

  -- Idempotência: se já existe tarefa vinculada, retorna a existente.
  IF v_meeting.task_id IS NOT NULL THEN RETURN v_meeting.task_id; END IF;

  SELECT id INTO v_task_type FROM public.task_types WHERE code = 'agendar_atendimento';
  IF v_task_type IS NULL THEN RAISE EXCEPTION 'task_type agendar_atendimento ausente'; END IF;

  v_assignee := COALESCE(v_meeting.lawyer_user_id, auth.uid());

  INSERT INTO public.user_tasks (
    task_type_id, title, description,
    assigner_user_id, assignee_user_id,
    client_id, status, priority, payload
  ) VALUES (
    v_task_type,
    'Atendimento — ' || v_meeting.client_name,
    'Reunião em ' || v_meeting.scheduled_date::text || ' ' || v_meeting.start_time::text,
    auth.uid(), v_assignee,
    v_meeting.client_id, 'assigned', 'medium',
    jsonb_build_object('meeting_id', p_meeting_id)
  ) RETURNING id INTO v_task_id;

  UPDATE public.meetings SET task_id = v_task_id WHERE id = p_meeting_id;

  INSERT INTO public.meeting_history (meeting_id, event_type, to_value, actor_user_id)
  VALUES (p_meeting_id, 'task_created', v_task_id::text, auth.uid());

  RETURN v_task_id;
END$$;

GRANT EXECUTE ON FUNCTION public.create_meeting_task(uuid) TO authenticated;
```

- [ ] **Step 2: Aplicar via `apply_migration`** (`name="20260709160000_agenda_create_meeting_task"`).

- [ ] **Step 3: Verificar assinatura e grant**

```sql
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='create_meeting_task';
```
Expected: uma linha, `args = p_meeting_id uuid`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260709160000_agenda_create_meeting_task.sql
git commit -m "feat(agenda): RPC create_meeting_task vinculada à reunião (card 5.3)"
```

---

### Task 14: Ações da recepção + botões de vínculo (status, cadastro, tarefa, Google)

**Files:**
- Modify: `src/hooks/useMeetings.ts` (adicionar `setMeetingStatus`, `rescheduleMeeting`, `createMeetingTask`)
- Create: `src/components/agenda/MeetingRowActions.tsx`
- Modify: `src/pages/Agenda.tsx` (coluna de ações + abrir edição)

**Interfaces:**
- Consumes: RPCs `update_meeting_status`, `reschedule_meeting`, `create_meeting_task` (Tasks 9 e 13); `useNavigate`.
- Produces:
  - `setMeetingStatus(id, status, notes?) → Promise<void>`
  - `rescheduleMeeting(id, dateISO, timeHHMM, notes?) → Promise<void>`
  - `createMeetingTask(id) → Promise<string>`
  - `MeetingRowActions` (props `meeting`, `onChanged`, `onEdit`).

- [ ] **Step 1: Adicionar as funções em `src/hooks/useMeetings.ts`**

```ts
export async function setMeetingStatus(id: string, status: MeetingStatus, notes?: string): Promise<void> {
  const { error } = await supabase.rpc("update_meeting_status", {
    p_meeting_id: id, p_new_status: status, p_notes: notes ?? null,
  });
  if (error) throw error;
}

export async function rescheduleMeeting(id: string, dateISO: string, timeHHMM: string, notes?: string): Promise<void> {
  const { error } = await supabase.rpc("reschedule_meeting", {
    p_meeting_id: id, p_new_date: dateISO, p_new_time: timeHHMM, p_notes: notes ?? null,
  });
  if (error) throw error;
}

export async function createMeetingTask(id: string): Promise<string> {
  const { data, error } = await supabase.rpc("create_meeting_task", { p_meeting_id: id });
  if (error) throw error;
  return data as unknown as string;
}
```

- [ ] **Step 2: Criar `src/components/agenda/MeetingRowActions.tsx`**

```tsx
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, UserRound, ListTodo, CalendarSync } from "lucide-react";
import {
  setMeetingStatus, createMeetingTask, type Meeting, type MeetingStatus,
} from "@/hooks/useMeetings";

const TERMINAL: MeetingStatus[] = ["cancelado", "nao_compareceu", "realizado"];

export function MeetingRowActions({ meeting, onChanged, onEdit }: {
  meeting: Meeting; onChanged: () => void; onEdit: (m: Meeting) => void;
}) {
  const navigate = useNavigate();
  const isTerminal = TERMINAL.includes(meeting.status);

  async function changeStatus(s: MeetingStatus) {
    try { await setMeetingStatus(meeting.id, s); toast.success("Status atualizado"); onChanged(); }
    catch (e) { toast.error((e as Error).message); }
  }
  async function makeTask() {
    try { await createMeetingTask(meeting.id); toast.success("Tarefa criada"); onChanged(); }
    catch (e) { toast.error((e as Error).message); }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Ações"><MoreHorizontal size={16} /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onEdit(meeting)}>Editar / reagendar</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={isTerminal} onSelect={() => changeStatus("confirmado")}>Confirmar</DropdownMenuItem>
        <DropdownMenuItem disabled={isTerminal} onSelect={() => changeStatus("realizado")}>Marcar realizada</DropdownMenuItem>
        <DropdownMenuItem disabled={isTerminal} onSelect={() => changeStatus("nao_compareceu")}>Não compareceu</DropdownMenuItem>
        <DropdownMenuItem disabled={isTerminal} onSelect={() => changeStatus("cancelado")}>Cancelar (desistência)</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!meeting.client_id} onSelect={() => navigate(`/clientes/${meeting.client_id}`)}>
          <UserRound size={14} style={{ marginRight: 8 }} /> Abrir cadastro
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!!meeting.task_id} onSelect={makeTask}>
          <ListTodo size={14} style={{ marginRight: 8 }} /> {meeting.task_id ? "Tarefa criada" : "Criar tarefa"}
        </DropdownMenuItem>
        <DropdownMenuItem disabled title="Em breve — integração Google (Trilha D)">
          <CalendarSync size={14} style={{ marginRight: 8 }} /> Sincronizar Google
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 3: Ligar na tabela da página**

Em `src/pages/Agenda.tsx`: importar `MeetingRowActions` e `type Meeting`. Adicionar estado `const [editing, setEditing] = useState<Meeting | null>(null);`. Adicionar `<th>Ações</th>` no cabeçalho e, em cada linha, uma célula:

```tsx
<td style={{ padding: 8 }}>
  <MeetingRowActions
    meeting={m}
    onChanged={refresh}
    onEdit={(mm) => { setEditing(mm); setFormOpen(true); }}
  />
</td>
```

Passar `meeting={editing}` ao `MeetingFormDialog` e limpar `editing` ao fechar: no `onOpenChange`, quando `false`, `setEditing(null)`. Ajustar o dialog para `meeting={editing}`.

- [ ] **Step 4: Verificar**

Run: `grep -n "MeetingRowActions" src/pages/Agenda.tsx src/components/agenda/MeetingRowActions.tsx`
Expected: definição + uso.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useMeetings.ts src/components/agenda/MeetingRowActions.tsx src/pages/Agenda.tsx
git commit -m "feat(agenda): ações da recepção + vínculo cadastro/tarefa + gancho Google (card 5.3)"
```

---

### Task 15: `MeetingReminderCard` — lembrete no chat (reuso do padrão 4.3)

**Files:**
- Create: `src/components/chat/MeetingReminderCard.tsx`
- Create: `src/components/chat/__tests__/MeetingReminderCard.test.tsx`

**Interfaces:**
- Consumes: `ActionCard` de `src/components/chat/ActionCard.tsx` (inspecionar props reais antes de implementar).
- Produces: `MeetingReminderCard` (props: `clientName: string`, `dateLabel: string`, `timeLabel: string`, `onOpen?: () => void`).

- [ ] **Step 1: Ler a interface real do ActionCard**

Run: `grep -n "interface\|Props\|export" src/components/chat/ActionCard.tsx | head -30`
Registrar as props aceitas (título, subtítulo/descrição, ação) para reusar sem inventar API.

- [ ] **Step 2: Escrever o teste (falha primeiro)**

Criar `src/components/chat/__tests__/MeetingReminderCard.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MeetingReminderCard } from "../MeetingReminderCard";

describe("MeetingReminderCard", () => {
  it("mostra cliente, data e horário da reunião", () => {
    render(<MeetingReminderCard clientName="Maria" dateLabel="15/07/2026" timeLabel="09:00" />);
    expect(screen.getByText(/Maria/)).toBeInTheDocument();
    expect(screen.getByText(/15\/07\/2026/)).toBeInTheDocument();
    expect(screen.getByText(/09:00/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Implementar `src/components/chat/MeetingReminderCard.tsx`**

Reusar `ActionCard` conforme a API observada no Step 1 (exemplo — ajustar aos props reais):

```tsx
import { ActionCard } from "@/components/chat/ActionCard";

interface Props {
  clientName: string;
  dateLabel: string;
  timeLabel: string;
  onOpen?: () => void;
}

export function MeetingReminderCard({ clientName, dateLabel, timeLabel, onOpen }: Props) {
  return (
    <ActionCard
      title="Lembrete de reunião"
      description={`${clientName} — ${dateLabel} às ${timeLabel}`}
      onAction={onOpen}
      actionLabel="Abrir agenda"
    />
  );
}
```

> Se as props reais do `ActionCard` diferirem (Step 1), ajustar os nomes (`title/description/onAction/actionLabel`) para os corretos — não introduzir props inexistentes.

- [ ] **Step 4: Rodar no CI ao commitar**

Run (no CI): `npx vitest run src/components/chat/__tests__/MeetingReminderCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/MeetingReminderCard.tsx src/components/chat/__tests__/MeetingReminderCard.test.tsx
git commit -m "feat(agenda): MeetingReminderCard reusando ActionCard (padrão 4.3)"
```

---

### Task 16: Verificação end-to-end (banco) + limpeza dos dados de teste

**Files:** (nenhum arquivo; verificação via `execute_sql`)

- [ ] **Step 1: Fluxo completo em SQL (criar → confirmar → realizar; capacidade; slots)**

```sql
-- slots disponíveis num dia útil (deve começar em 08:00:00)
select slot, remaining from public.available_meeting_slots(date '2026-07-15') limit 3;
```
Expected: primeira linha `08:00:00 | 2`.

```sql
-- transição inválida deve falhar (realizado -> confirmado)
DO $$
DECLARE v uuid;
BEGIN
  INSERT INTO public.meetings (client_name, scheduled_date, start_time, created_by, status)
    VALUES ('E2E', date '2026-07-16', time '08:00', '00000000-0000-0000-0000-000000000000', 'realizado')
    RETURNING id INTO v;
  BEGIN
    PERFORM public.meeting_status_transition_allowed('realizado','confirmado');
    IF public.meeting_status_transition_allowed('realizado','confirmado') THEN
      RAISE NOTICE 'ERRO: terminal permitiu transição';
    ELSE
      RAISE NOTICE 'OK: terminal bloqueou transição';
    END IF;
  END;
  DELETE FROM public.meetings WHERE id = v;
END$$;
```
Expected: NOTICE "OK: terminal bloqueou transição".

- [ ] **Step 2: Confirmar ausência de lixo de teste**

```sql
select count(*) from public.meetings where client_name in ('T1','T2','T3','E2E');
```
Expected: `0`.

- [ ] **Step 3: Rodar os advisors de segurança (RLS) no projeto**

Chamar `get_advisors` (type security) e confirmar que não há aviso novo de RLS desabilitado nas tabelas `meetings`/`meeting_history`/`meeting_settings`/`holidays`.

- [ ] **Step 4: Commit (marcador de verificação, se houver ajustes)**

Se algum ajuste de migration for necessário, criar nova migration aditiva `20260709170000_agenda_fix_*.sql` (nunca editar migration já aplicada) e commitar.

---

## Self-Review

**1. Spec coverage:**
- §1 Modelo de dados → Tasks 1, 7 (tabelas/enum/RLS/histórico/settings/holidays). ✓
- §2 Util horário canônico → Tasks 8 (SQL) e 10 (front). ✓
- §3 Regras servidor (slots/capacidade/estados/create_meeting_task) → Tasks 8, 9, 13. ✓
- §4 RLS → Tasks 1, 7 (policies + helper). ✓
- §5 Frontend (menu/rota/página/form/slots/settings/ações/reminder) → Tasks 4, 5, 6, 11, 12, 14, 15. ✓
- §6 Faseamento → seções FASE 5.1/5.2/5.3. ✓
- §7 Disciplina de migration → Global Constraints + cada task de migration (apply_migration + arquivo mesmo nome + check schema_migrations). ✓
- Aceite 1..5 → Tasks 1/5/6 (1), 7/8/9/11 (2), 9/14 (3), 13/14 (4), 14 (5). ✓

**2. Placeholder scan:** Sem "TBD/TODO/etc.". Único ponto de ajuste condicional é o Task 15 Step 3 (adequar aos props reais do `ActionCard`), com Step 1 dedicado a lê-los antes — não é placeholder, é verificação de interface externa.

**3. Type consistency:** `Meeting`/`MeetingInput`/`MeetingStatus` definidos na Task 3 e reusados nas Tasks 5/6/11/14. RPCs SQL (`update_meeting_status`, `reschedule_meeting`, `create_meeting_task`, `available_meeting_slots`) têm assinatura idêntica no SQL (Tasks 8/9/13) e no wrapper TS (Tasks 11/14). `can_access_meetings` usado em todas as policies. ✓

---

## Execution Handoff

Plano completo e salvo. Escolha o modo de execução na próxima mensagem.
