# Ciclo da Agenda de Reuniões pelo chat — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir agendar/confirmar/realizar/reagendar/cancelar/não-comparecimento de reuniões (`meetings`) pelo chat, via cartões editáveis determinísticos, reusando as RPCs de produção.

**Architecture:** Espelha o fast-path determinístico do `tarefa_confirm` (4.1): detector determinístico (sempre-ligado) → 1 chamada LLM sem tools extrai rascunho → resolve cliente/reunião sob JWT (CPF mascarado) → insere `chat_messages` com `metadata.kind` próprio → o front renderiza cartão editável → no Confirmar chama `create_meeting`/`update_meeting` client-side (RLS/regra-4 de prod valem). Flag `AGENDA_CHAT_ENABLED` controla só cartão-vs-mensagem-estática.

**Tech Stack:** Supabase Edge Functions (Deno/TypeScript), React 18 + TypeScript (Vite), Supabase JS v2, Vitest + RTL (front), `deno test` (edge). Postgres RPCs já em produção.

## Global Constraints

- **Sem DDL executado / sem `db push`.** As RPCs de prod já existem. As migrations da Fase A são `CREATE OR REPLACE` fiéis ao def **já aplicado** em prod — versionamento, não aplicação.
- **Idioma:** UI e mensagens ao usuário em pt-BR.
- **PII:** CPF nunca em claro em `chat_messages.metadata`, logs ou no rascunho do LLM. Mascarar (`***.***.***-NN`) no edge imediatamente após `agent_consultar_cliente`.
- **Fuso:** reunião usa `scheduled_date` (date) + `start_time` (time) SEPARADOS → **sem conversão de fuso**. Ancorar "hoje/amanhã" com `nowLocalWall(new Date(), "America/Bahia")`. NUNCA usar `localWallTimeToUtcISO` para reunião. O LLM devolve hora local de parede; nunca offset/"Z".
- **Capacidade/expediente/estados:** garantidos pela RPC de prod. Nunca cravar capacidade no código (lê de `business_hours_config`; efetivo hoje = 1).
- **Permissão (regra 4):** recepção-only via `meetings_can_create()` na RPC. O detector também barra advogado de cara (UX), mas a RPC é a barreira final.
- **Ambiente local:** sem Node; testes/build rodam no CI (Vercel + job `edge`). Comandos de teste abaixo são a referência; a verificação vinculante é o CI verde.
- **Deploy do edge:** manual do Ryan (CI `edge` verde + redeploy do `chat-orchestrator`).
- **Branch:** trabalhar em worktree isolado (memória: o dir primário é compartilhado por sessões paralelas que trocam branch). A Fase A vai em branch/PR próprio.

---

## File Structure

**Fase A (migrations-espelho — branch/PR próprio):**
- Create: `supabase/migrations/20260710130000_agenda_prod_mirror_recepcao_r3.sql` — espelha o estado de prod: `meetings_can_create()`, `create_meeting`/`update_meeting` com gate recepção-only, policy de leitura R3.

**Edge (`supabase/functions/chat-orchestrator/`):**
- Create: `meetingDraft.ts` — extração/normalização do rascunho de reunião + parser verbo→ação. Sem conversão de fuso.
- Create: `meetingDraft.test.ts` — testes unit (Deno).
- Create: `agendaDetect.ts` — detectores determinísticos (`isAgendarAtendimentoRequest`, `isReuniaoAcaoRequest`) + guarda de falso-positivo (peça).
- Create: `agendaDetect.test.ts` — testes unit (Deno).
- Modify: `index.ts` — checagem de papel (recepção); 2 blocos fast-path + curto-circuito sempre-ligado; resolver de reunião; flag `AGENDA_CHAT_ENABLED`; export de `nowLocalWall` já existe em `taskDraft.ts`.
- Modify: `tools/registry.ts`, `tools/handlers.ts` — remover `agendar_reuniao`.
- Modify: `tools/toolSchemas.test.ts` — remover referência a `agendar_reuniao` se houver.

**Front (`src/`):**
- Create: `components/chat/ReuniaoConfirmCard.tsx` — cartão de agendar (editável).
- Create: `components/chat/ReuniaoAcaoCard.tsx` — cartão de ciclo/reagendar.
- Create: `components/chat/__tests__/ReuniaoConfirmCard.test.tsx`, `ReuniaoAcaoCard.test.tsx`.
- Modify: `components/juris-cloud/types.ts` — tipos `ReuniaoDraft`, `ReuniaoAcaoPayload`, campos em `JcChatMessage`.
- Modify: `components/JurisCloudOS.tsx` — mapear `metadata.reuniao_draft`/`reuniao_acao` → `msg`; incluir novos `kind` no patch de run.
- Modify: `components/juris-cloud/JurisChatPanel.tsx` — render dos 2 cards por `kind`.
- Reuse: `hooks/useMeetings.ts` (`createMeeting`, `updateMeeting`, `getAvailableSlots`), `hooks/useAssignableUsers.ts`, `lib/meetings.ts` (`MEETING_TYPE_OPTIONS`, `MEETING_STATUS_LABELS`).

---

## Fase A — Correção 0: migrations-espelho de prod (branch/PR próprio)

> Tarefa separada, autorizada pelo dono. Fecha a divergência repo↔prod (regra-4/R3) sem `db push`.

### Task A1: Auditar deltas repo↔prod e escrever a migration-espelho

**Files:**
- Create: `supabase/migrations/20260710130000_agenda_prod_mirror_recepcao_r3.sql`

**Interfaces:**
- Produces: função `public.meetings_can_create()`; `create_meeting`/`update_meeting` com gate recepção-only; policy `"meetings read"` R3. (Já existem em prod — este arquivo é o espelho versionado.)

- [ ] **Step 1: Auditar (só leitura) todos os objetos de `meetings` em prod vs repo**

Rodar via Supabase MCP `execute_sql` (project `tsltxvswzdnlmvljpryh`) e conferir que os únicos deltas são os 3 abaixo (função nova + 2 gates + policy). Se aparecer objeto prod-only adicional (trigger, índice, outra policy, colunas), incluir no arquivo.

```sql
-- funções meetings-related
SELECT p.proname, pg_get_function_identity_arguments(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname LIKE 'meeting%' ORDER BY 1;
-- policies
SELECT polname, pg_get_expr(polqual,polrelid) FROM pg_policy WHERE polrelid='public.meetings'::regclass;
SELECT polname, pg_get_expr(polqual,polrelid) FROM pg_policy WHERE polrelid='public.meeting_audit_log'::regclass;
```

- [ ] **Step 2: Escrever a migration-espelho (fiel ao def de prod já capturado)**

```sql
-- Espelho versionado do estado JÁ APLICADO em produção (Agenda criada por outra
-- sessão via MCP, sem arquivo). NÃO rodar db push: prod já tem tudo isto.
-- Fecha a divergência repo↔prod: sem este arquivo, um replay das migrations 5.1/5.2
-- reverteria recepção-only (regra 4) e a visão-própria do advogado (R3).
BEGIN;

-- 1. Gate de ESCRITA recepção-only (prod-only até aqui). Difere de meetings_can_access
--    (que inclui adv_%): advogado NÃO cria/edita reunião.
CREATE OR REPLACE FUNCTION public.meetings_can_create()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.role_templates rt ON rt.id = p.role_template_id
      WHERE p.user_id = auth.uid()
        AND rt.code IN ('socio','lider_recepcao','recepcionista','estagiaria_recepcao')
    )
    OR public.is_master_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin');
$$;
REVOKE ALL ON FUNCTION public.meetings_can_create() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.meetings_can_create() TO authenticated;

-- 2. create_meeting: gate recepção-only (troca meetings_can_access -> meetings_can_create).
--    Corpo idêntico ao de prod (capacidade/janela/estado inalterados).
CREATE OR REPLACE FUNCTION public.create_meeting(
  p_scheduled_date DATE, p_start_time TIME, p_client_id UUID DEFAULT NULL,
  p_client_name TEXT DEFAULT NULL, p_phone TEXT DEFAULT NULL, p_end_time TIME DEFAULT NULL,
  p_type TEXT DEFAULT NULL, p_lawyer_user_id UUID DEFAULT NULL, p_receptionist_user_id UUID DEFAULT NULL,
  p_summary TEXT DEFAULT NULL, p_notes TEXT DEFAULT NULL,
  p_status public.meeting_status DEFAULT 'scheduled')
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid(); v_id UUID; v_slot int; v_cap int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'create_meeting: não autenticado'; END IF;
  IF NOT public.meetings_can_create() THEN RAISE EXCEPTION 'create_meeting: sem permissão (apenas recepção)'; END IF;
  IF p_scheduled_date IS NULL OR p_start_time IS NULL THEN RAISE EXCEPTION 'create_meeting: data e horário são obrigatórios'; END IF;
  SELECT COALESCE(slot_minutes,15), COALESCE(max_parallel,2) INTO v_slot, v_cap FROM public.business_hours_config WHERE id = true;
  v_slot := COALESCE(v_slot,15); v_cap := COALESCE(v_cap,2);
  IF COALESCE(p_status,'scheduled') IN ('scheduled','confirmed','rescheduled') THEN
    IF NOT public.meeting_slot_is_valid(p_scheduled_date, p_start_time) THEN
      RAISE EXCEPTION 'create_meeting: horário fora do expediente (dia útil/janela/feriado)'; END IF;
    IF (SELECT count(*) FROM public.meetings m WHERE m.scheduled_date = p_scheduled_date AND m.start_time = p_start_time
          AND m.status IN ('scheduled','confirmed','rescheduled')) >= v_cap THEN
      RAISE EXCEPTION 'create_meeting: slot cheio (capacidade % atingida)', v_cap; END IF;
  END IF;
  INSERT INTO public.meetings (client_id, client_name, phone, scheduled_date, start_time, end_time, type,
    lawyer_user_id, receptionist_user_id, summary, status, notes, created_by)
  VALUES (p_client_id, NULLIF(btrim(COALESCE(p_client_name,'')),''), NULLIF(btrim(COALESCE(p_phone,'')),''),
    p_scheduled_date, p_start_time, COALESCE(p_end_time, (p_start_time + (v_slot || ' minutes')::interval)::time),
    NULLIF(btrim(COALESCE(p_type,'')),''), p_lawyer_user_id, p_receptionist_user_id,
    NULLIF(btrim(COALESCE(p_summary,'')),''), COALESCE(p_status,'scheduled'),
    NULLIF(btrim(COALESCE(p_notes,'')),''), v_uid)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

-- 3. update_meeting: gate recepção-only. Corpo idêntico ao de prod (máquina de estados inalterada).
CREATE OR REPLACE FUNCTION public.update_meeting(
  p_id UUID, p_scheduled_date DATE, p_start_time TIME, p_end_time TIME, p_type TEXT,
  p_lawyer_user_id UUID, p_receptionist_user_id UUID, p_client_id UUID, p_client_name TEXT,
  p_phone TEXT, p_summary TEXT, p_notes TEXT, p_status public.meeting_status)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid(); v_slot int; v_cap int; v_old public.meeting_status;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'update_meeting: não autenticado'; END IF;
  IF NOT public.meetings_can_create() THEN RAISE EXCEPTION 'update_meeting: sem permissão (apenas recepção)'; END IF;
  IF p_scheduled_date IS NULL OR p_start_time IS NULL THEN RAISE EXCEPTION 'update_meeting: data e horário são obrigatórios'; END IF;
  SELECT status INTO v_old FROM public.meetings WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'update_meeting: reunião não encontrada'; END IF;
  IF p_status IS DISTINCT FROM v_old AND v_old IN ('canceled','no_show','done') THEN
    RAISE EXCEPTION 'update_meeting: "%" é estado final e não pode ser alterado', v_old; END IF;
  SELECT COALESCE(slot_minutes,15), COALESCE(max_parallel,2) INTO v_slot, v_cap FROM public.business_hours_config WHERE id = true;
  v_slot := COALESCE(v_slot,15); v_cap := COALESCE(v_cap,2);
  IF COALESCE(p_status, v_old) IN ('scheduled','confirmed','rescheduled') THEN
    IF NOT public.meeting_slot_is_valid(p_scheduled_date, p_start_time) THEN
      RAISE EXCEPTION 'update_meeting: horário fora do expediente (dia útil/janela/feriado)'; END IF;
    IF (SELECT count(*) FROM public.meetings m WHERE m.scheduled_date = p_scheduled_date AND m.start_time = p_start_time
          AND m.id <> p_id AND m.status IN ('scheduled','confirmed','rescheduled')) >= v_cap THEN
      RAISE EXCEPTION 'update_meeting: slot cheio (capacidade % atingida)', v_cap; END IF;
  END IF;
  UPDATE public.meetings SET
    scheduled_date=p_scheduled_date, start_time=p_start_time,
    end_time=COALESCE(p_end_time, (p_start_time + (v_slot || ' minutes')::interval)::time),
    type=NULLIF(btrim(COALESCE(p_type,'')),''), lawyer_user_id=p_lawyer_user_id,
    receptionist_user_id=p_receptionist_user_id, client_id=p_client_id,
    client_name=NULLIF(btrim(COALESCE(p_client_name,'')),''), phone=NULLIF(btrim(COALESCE(p_phone,'')),''),
    summary=NULLIF(btrim(COALESCE(p_summary,'')),''), notes=NULLIF(btrim(COALESCE(p_notes,'')),''),
    status=COALESCE(p_status, status), updated_at=now()
  WHERE id = p_id;
END; $$;

-- 4. Policy de leitura R3: recepção vê tudo; advogado vê só a própria agenda.
DROP POLICY IF EXISTS "meetings read" ON public.meetings;
CREATE POLICY "meetings read" ON public.meetings FOR SELECT TO authenticated
  USING (public.meetings_can_create() OR (lawyer_user_id = auth.uid()));

COMMIT;
```

- [ ] **Step 3: Verificar equivalência com prod (só leitura)**

Após escrever, comparar cada corpo do arquivo com `pg_get_functiondef(...)` de prod (mesma normalização de espaços). Devem ser equivalentes. Confirmar a policy: `meetings_can_create() OR (lawyer_user_id = auth.uid())`.

- [ ] **Step 4: Commit (sem db push)**

```bash
git add supabase/migrations/20260710130000_agenda_prod_mirror_recepcao_r3.sql
git commit -m "chore(agenda): espelha em migration o estado de prod (recepcao-only + R3) sem db push"
```

---

## Fase B — Detector sempre-ligado + permissão (edge). Entrega valor com a feature OFF.

### Task B1: `agendaDetect.ts` — detectores determinísticos + guarda de peça

**Files:**
- Create: `supabase/functions/chat-orchestrator/agendaDetect.ts`
- Test: `supabase/functions/chat-orchestrator/agendaDetect.test.ts`

**Interfaces:**
- Produces:
  - `isAgendarAtendimentoRequest(msg: string): boolean`
  - `isReuniaoAcaoRequest(msg: string): boolean`
  - `looksLikePecaRequest(msg: string): boolean` (guarda de falso-positivo)

- [ ] **Step 1: Escrever o teste (falha primeiro)**

```ts
// agendaDetect.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isAgendarAtendimentoRequest, isReuniaoAcaoRequest, looksLikePecaRequest } from "./agendaDetect.ts";

Deno.test("agendar: reconhece pedidos de agendamento", () => {
  for (const m of [
    "agenda um atendimento pro cliente João amanhã 10h",
    "agendar reunião com a Maria sexta 14h",
    "marca uma reunião pra terça de manhã",
  ]) assertEquals(isAgendarAtendimentoRequest(m), true, m);
});

Deno.test("agendar: NÃO captura pedido de peça", () => {
  for (const m of [
    "faz uma petição inicial de aposentadoria",
    "redige a contestação do processo",
    "preciso de um recurso inominado",
  ]) assertEquals(isAgendarAtendimentoRequest(m), false, m);
});

Deno.test("acao: reconhece ciclo/reagendar", () => {
  for (const m of [
    "confirma a reunião das 10h do João amanhã",
    "marca como realizada a reunião da Maria",
    "cancela a reunião de amanhã",
    "o cliente não compareceu",
    "reagenda pra 14h",
  ]) assertEquals(isReuniaoAcaoRequest(m), true, m);
});

Deno.test("guarda de peça", () => {
  assertEquals(looksLikePecaRequest("faz uma petição inicial"), true);
  assertEquals(looksLikePecaRequest("agenda reunião amanhã"), false);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `deno test supabase/functions/chat-orchestrator/agendaDetect.test.ts`
Expected: FAIL (módulo/símbolos inexistentes).

- [ ] **Step 3: Implementar**

```ts
// agendaDetect.ts
// Detectores DETERMINÍSTICOS (regex; sem LLM) para curto-circuitar o roteamento
// ANTES do classificador. Conservadores: na dúvida NÃO capturam (deixam seguir o
// fluxo normal) para não sequestrar pedido de peça. A guarda looksLikePecaRequest
// vence em ambiguidade.
const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Termos de PEÇA (redação jurídica) — se presentes, NUNCA é agendamento.
const PECA = /\b(peticao|inicial|contestacao|recurso|apelacao|agravo|parecer|contrato|procuracao|manifestacao|embargos|impugnacao|defesa|contrarrazoes|razoes)\b/;
export function looksLikePecaRequest(msg: string): boolean {
  return PECA.test(norm(msg));
}

// AGENDAR: verbo de marcar + objeto reunião/atendimento/consulta.
const AGENDA_OBJ = /\b(reuniao|reunioes|atendimento|consulta|agenda)\b/;
const AGENDA_VERB = /\b(agenda|agendar|agende|marca|marcar|marque|remarca(?!r)|marcar uma)\b/;
export function isAgendarAtendimentoRequest(msg: string): boolean {
  const n = norm(msg);
  if (looksLikePecaRequest(msg)) return false;
  return AGENDA_VERB.test(n) && AGENDA_OBJ.test(n);
}

// AÇÃO/CICLO: verbo de flip de status ou reagendar, referindo reunião/atendimento
// (ou pronome — "confirma a das 10h", "o cliente não compareceu").
const ACAO_VERB = /\b(confirma(r)?|confirme|realizad[ao]|realizar|compareceu|nao compareceu|faltou|no.?show|cancela(r)?|cancele|reagenda(r)?|remarca(r)?|remarque)\b/;
export function isReuniaoAcaoRequest(msg: string): boolean {
  const n = norm(msg);
  if (looksLikePecaRequest(msg)) return false;
  if (!ACAO_VERB.test(n)) return false;
  // exige contexto de reunião OU um horário/pronome típico do ciclo
  return AGENDA_OBJ.test(n) || /\b(as \d{1,2}h|\d{1,2}:\d{2}|amanha|hoje|reuniao)\b/.test(n);
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `deno test supabase/functions/chat-orchestrator/agendaDetect.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/chat-orchestrator/agendaDetect.ts supabase/functions/chat-orchestrator/agendaDetect.test.ts
git commit -m "feat(agenda-chat): detectores deterministicos de agendamento/ciclo (fase 0)"
```

### Task B2: Checagem de papel (recepção) no edge

**Files:**
- Modify: `supabase/functions/chat-orchestrator/index.ts`

**Interfaces:**
- Produces: `async function userCanCreateMeetings(admin: SupabaseClient, userId: string): Promise<boolean>` (helper local em `index.ts`, junto dos outros helpers).

- [ ] **Step 1: Implementar o helper (espelha o predicado de `meetings_can_create`)**

Adicionar perto dos demais helpers de `index.ts`:

```ts
// Espelha o predicado de meetings_can_create() para decidir, ANTES de montar o
// cartão, se o usuário pode agendar/alterar reunião. A RPC continua sendo a
// barreira final; aqui é só UX (barrar advogado de cara). Usa o client admin
// (service-role) filtrando por userId — leitura de profiles/role_templates.
const RECEPCAO_CODES = new Set(["socio","lider_recepcao","recepcionista","estagiaria_recepcao"]);
async function userCanCreateMeetings(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data: prof } = await admin.from("profiles")
    .select("role_template_id, role_templates(code)").eq("user_id", userId).maybeSingle();
  const code = (prof as { role_templates?: { code?: string } } | null)?.role_templates?.code ?? null;
  if (code && RECEPCAO_CODES.has(code)) return true;
  // admin / master_admin
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (isAdmin === true) return true;
  const { data: isMaster } = await admin.rpc("is_master_admin", { _user_id: userId });
  return isMaster === true;
}
```

> Nota de implementação: confirmar as assinaturas de `has_role`/`is_master_admin` no schema (nomes dos params). Se diferirem, ajustar. Alternativa robusta: `SELECT public.meetings_can_create()` sob o JWT do usuário — mas exige GRANT; a via `admin` acima não depende disso.

- [ ] **Step 2: Commit (parcial — helper sem uso ainda, compila)**

```bash
git add supabase/functions/chat-orchestrator/index.ts
git commit -m "feat(agenda-chat): helper userCanCreateMeetings (checagem de papel no edge)"
```

### Task B3: Curto-circuito sempre-ligado + flag no `index.ts`

**Files:**
- Modify: `supabase/functions/chat-orchestrator/index.ts`

**Interfaces:**
- Consumes: `isAgendarAtendimentoRequest`, `isReuniaoAcaoRequest` (Task B1); `userCanCreateMeetings` (Task B2); `nextSeq`, `admin`, `userId`, `agent`, `body`, `json`, `errResp` (existentes).
- Produces: constante `AGENDA_CHAT_ENABLED`; blocos fast-path (o comportamento completo do cartão entra nas Fases D/E; aqui entram os passos 1–3 do detector: fora-de-permissão e flag-OFF).

- [ ] **Step 1: Declarar a flag (perto de `TAREFA_CHAT_ENABLED`, ~linha 130)**

```ts
// Ciclo da Agenda pelo chat. O DETECTOR é sempre-ligado (curto-circuita o
// roteamento p/ nunca virar peça). Esta flag controla só cartão vs. msg estática.
const AGENDA_CHAT_ENABLED = (Deno.env.get("AGENDA_CHAT_ENABLED") ?? "false") === "true";
```

- [ ] **Step 2: Importar os detectores (topo do arquivo, junto dos demais imports)**

```ts
import { isAgendarAtendimentoRequest, isReuniaoAcaoRequest } from "./agendaDetect.ts";
```

- [ ] **Step 3: Inserir o bloco fast-path ANTES do `tarefa_confirm` (após `cadastro_form`, ~linha 2957)**

Este bloco cobre os passos 1–3 do detector (Fase 0). O passo 4 (cartão) é preenchido nas Fases D/E — por ora, autorizado+flag-ON cai numa mensagem estática temporária que as Fases D/E substituem.

```ts
// ─── AGENDA-CHAT (Fase 0): detector sempre-ligado, curto-circuita roteamento ──
{
  const isAgendar = isAgendarAtendimentoRequest(body.message);
  const isAcao = !isAgendar && isReuniaoAcaoRequest(body.message);
  if (isAgendar || isAcao) {
    const kindPath = isAgendar ? "reuniao_confirm" : "reuniao_acao";
    const { data: agRun, error: agErr } = await admin.from("orchestration_runs").insert({
      session_id: body.sessionId, user_id: userId, user_message_id: userMsgId,
      original_message: body.message, status: "done", entry_agent_id: agent.id,
      intent_category: "ACAO_COM_TOOL", route_path: "fast",
      chain: [{ level: 0, path: kindPath, intent: "ACAO_COM_TOOL", agent: agent.name }],
    }).select("id").single();
    if (agErr || !agRun) return errResp(500, "db_error", `Falha ao criar run: ${agErr?.message}`);
    const agRunId = (agRun as { id: string }).id;

    // Passo 2: sem permissão (advogado/não-recepção) → mensagem de permissão, sem cartão.
    if (!(await userCanCreateMeetings(admin, userId))) {
      const seq = await nextSeq(admin, body.sessionId);
      await admin.from("chat_messages").insert({
        session_id: body.sessionId, user_id: userId, role: "assistant", agent_id: agent.id,
        content: "Agendamentos e alterações de reunião são feitos pela recepção — você não tem permissão para isso. Posso registrar uma solicitação para a recepção, se quiser.",
        sequence_number: seq, metadata: { kind: "final", intent: "ACAO_COM_TOOL", agent_name: agent.name },
      });
      await admin.rpc("increment_session_counters", { p_session_id: body.sessionId, p_tokens_in: 0, p_tokens_out: 0, p_cost: 0 }).then(() => {}, () => {});
      return json(202, { runId: agRunId, sessionId: body.sessionId, status: "done", path: kindPath, intent: "ACAO_COM_TOOL" });
    }

    // Passo 3: autorizado + flag OFF → mensagem estática (sem cartão, sem peça).
    if (!AGENDA_CHAT_ENABLED) {
      const seq = await nextSeq(admin, body.sessionId);
      await admin.from("chat_messages").insert({
        session_id: body.sessionId, user_id: userId, role: "assistant", agent_id: agent.id,
        content: "Para marcar ou alterar uma reunião, abra a Agenda de Reuniões.",
        sequence_number: seq, metadata: { kind: "final", intent: "ACAO_COM_TOOL", agent_name: agent.name },
      });
      await admin.rpc("increment_session_counters", { p_session_id: body.sessionId, p_tokens_in: 0, p_tokens_out: 0, p_cost: 0 }).then(() => {}, () => {});
      return json(202, { runId: agRunId, sessionId: body.sessionId, status: "done", path: kindPath, intent: "ACAO_COM_TOOL" });
    }

    // Passo 4 (flag ON): cartão — preenchido nas Fases D (agendar) e E (ação).
    // Placeholder até D/E: mensagem estática temporária.
    const seq = await nextSeq(admin, body.sessionId);
    await admin.from("chat_messages").insert({
      session_id: body.sessionId, user_id: userId, role: "assistant", agent_id: agent.id,
      content: "Fluxo de cartão em construção.", sequence_number: seq,
      metadata: { kind: "final", intent: "ACAO_COM_TOOL", agent_name: agent.name },
    });
    return json(202, { runId: agRunId, sessionId: body.sessionId, status: "done", path: kindPath, intent: "ACAO_COM_TOOL" });
  }
}
```

- [ ] **Step 4: Verificar (CI edge + smoke local se Deno disponível)**

Run: `deno check supabase/functions/chat-orchestrator/index.ts`
Expected: sem erros de tipo. (Verificação vinculante: CI `edge` verde.)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/chat-orchestrator/index.ts
git commit -m "feat(agenda-chat): fase 0 — detector sempre-ligado + permissao de cara (flag OFF: msg estatica)"
```

---

## Fase C — `meetingDraft.ts` (extração de rascunho + parser de ação)

### Task C1: Módulo `meetingDraft.ts`

**Files:**
- Create: `supabase/functions/chat-orchestrator/meetingDraft.ts`
- Test: `supabase/functions/chat-orchestrator/meetingDraft.test.ts`

**Interfaces:**
- Produces:
  - `interface MeetingDraft { scheduled_date: string|null; start_time: string|null; type: string|null; client_query: string|null; lawyer_hint: string|null; phone: string|null; display: string|null; }`
  - `normalizeMeetingDraft(raw: unknown): MeetingDraft`
  - `buildMeetingDraftPrompt(message: string, nowLocal: string, tz: string): string`
  - `type ReuniaoAcao = "confirmed"|"done"|"canceled"|"no_show"|"reschedule"|null`
  - `parseReuniaoAcao(message: string): ReuniaoAcao`
  - `buildAcaoPrompt(message: string, nowLocal: string, tz: string): string`

- [ ] **Step 1: Escrever o teste (falha primeiro)**

```ts
// meetingDraft.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeMeetingDraft, parseReuniaoAcao } from "./meetingDraft.ts";

Deno.test("normalize: campos ausentes viram null", () => {
  const d = normalizeMeetingDraft({});
  assertEquals(d.scheduled_date, null);
  assertEquals(d.start_time, null);
});

Deno.test("normalize: aceita date/time válidos; rejeita formato/overflow", () => {
  assertEquals(normalizeMeetingDraft({ scheduled_date: "2026-07-11", start_time: "10:00" }).scheduled_date, "2026-07-11");
  assertEquals(normalizeMeetingDraft({ scheduled_date: "2026-07-11", start_time: "10:00" }).start_time, "10:00");
  assertEquals(normalizeMeetingDraft({ scheduled_date: "2026-13-40" }).scheduled_date, null); // mês/dia inválidos
  assertEquals(normalizeMeetingDraft({ start_time: "25:00" }).start_time, null);
  assertEquals(normalizeMeetingDraft({ start_time: "10:00:00" }).start_time, "10:00"); // trunca p/ HH:MM
});

Deno.test("parseReuniaoAcao: verbo -> status", () => {
  assertEquals(parseReuniaoAcao("confirma a reunião das 10h"), "confirmed");
  assertEquals(parseReuniaoAcao("marca como realizada"), "done");
  assertEquals(parseReuniaoAcao("cancela a reunião"), "canceled");
  assertEquals(parseReuniaoAcao("o cliente não compareceu"), "no_show");
  assertEquals(parseReuniaoAcao("reagenda pra 14h"), "reschedule");
  assertEquals(parseReuniaoAcao("bom dia"), null);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `deno test supabase/functions/chat-orchestrator/meetingDraft.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

```ts
// meetingDraft.ts
// Rascunho de reunião p/ o cartão de agendar + parser do ciclo. Espelha o
// taskDraft.ts, MAS sem conversão de fuso: create_meeting recebe date+time
// separados. normalizeMeetingDraft NUNCA inventa (ausente/ambíguo -> null).
const s = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const norm = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export interface MeetingDraft {
  scheduled_date: string | null; // "AAAA-MM-DD" (local)
  start_time: string | null;     // "HH:MM" (local, de parede)
  type: string | null;
  client_query: string | null;
  lawyer_hint: string | null;
  phone: string | null;
  display: string | null;
}

function validDate(v: string | null): string | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const [, y, mo, d] = m; const Y = +y, Mo = +mo, D = +d;
  const dt = new Date(Date.UTC(Y, Mo - 1, D));
  if (dt.getUTCFullYear() !== Y || dt.getUTCMonth() !== Mo - 1 || dt.getUTCDate() !== D) return null;
  return `${y}-${mo}-${d}`;
}
function validTime(v: string | null): string | null {
  if (!v) return null;
  const m = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(v.trim());
  if (!m) return null;
  const H = +m[1], Mi = +m[2];
  if (H > 23 || Mi > 59) return null;
  return `${m[1]}:${m[2]}`;
}

export function normalizeMeetingDraft(raw: unknown): MeetingDraft {
  const o = (raw && typeof raw === "object") ? raw as Record<string, unknown> : {};
  return {
    scheduled_date: validDate(s(o.scheduled_date)),
    start_time: validTime(s(o.start_time)),
    type: s(o.type),
    client_query: s(o.client_query),
    lawyer_hint: s(o.lawyer_hint),
    phone: s(o.phone),
    display: s(o.display),
  };
}

export function buildMeetingDraftPrompt(message: string, nowLocal: string, tz: string): string {
  return [
    `Você extrai um RASCUNHO de agendamento de reunião a partir de um pedido em linguagem natural.`,
    `Agora é ${nowLocal} no fuso ${tz} (horário LOCAL de parede). Responda SOMENTE um JSON com as chaves:`,
    `scheduled_date ("AAAA-MM-DD", resolvendo "hoje"/"amanhã"/dia da semana contra o "agora" acima; null se não houver),`,
    `start_time ("HH:MM" LOCAL de parede, ex.: "10:00"; SEM fuso, SEM "Z"; null se não houver),`,
    `type (tipo do atendimento, ou null), client_query (nome/termo do cliente citado, ou null),`,
    `lawyer_hint (nome do advogado citado, ou null), phone (telefone citado, ou null),`,
    `display (texto curto já resolvido, ex.: "11/07 10:00").`,
    `IMPORTANTE: NÃO converta fusos e NÃO use "Z"/offset. NUNCA invente; campo não claro = null. Só o JSON.`,
    `Pedido: """${message}"""`,
  ].join("\n");
}

export type ReuniaoAcao = "confirmed" | "done" | "canceled" | "no_show" | "reschedule" | null;

// Mapa determinístico verbo->ação. Ordem importa: "não compareceu" antes de "compareceu".
export function parseReuniaoAcao(message: string): ReuniaoAcao {
  const n = norm(message);
  if (/\b(nao compareceu|faltou|no.?show|nao veio)\b/.test(n)) return "no_show";
  if (/\b(realizad[ao]|realizar|compareceu|foi atendid[ao]|aconteceu)\b/.test(n)) return "done";
  if (/\b(cancela|cancelar|cancele|cancelad[ao])\b/.test(n)) return "canceled";
  if (/\b(reagenda|reagendar|remarca|remarcar|remarque)\b/.test(n)) return "reschedule";
  if (/\b(confirma|confirmar|confirme|confirmad[ao])\b/.test(n)) return "confirmed";
  return null;
}

export function buildAcaoPrompt(message: string, nowLocal: string, tz: string): string {
  return [
    `Extraia a REFERÊNCIA da reunião citada. Agora é ${nowLocal} (${tz}, hora local). Responda SOMENTE JSON com:`,
    `client_query (nome do cliente citado, ou null),`,
    `date_local ("AAAA-MM-DD" resolvendo hoje/amanhã/dia-da-semana, ou null),`,
    `time_local ("HH:MM" local, ou null),`,
    `new_date_local ("AAAA-MM-DD" só se for reagendamento, ou null),`,
    `new_time_local ("HH:MM" só se for reagendamento, ou null).`,
    `NÃO converta fusos, NÃO use "Z". NUNCA invente; não claro = null. Só o JSON.`,
    `Pedido: """${message}"""`,
  ].join("\n");
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `deno test supabase/functions/chat-orchestrator/meetingDraft.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/chat-orchestrator/meetingDraft.ts supabase/functions/chat-orchestrator/meetingDraft.test.ts
git commit -m "feat(agenda-chat): meetingDraft — rascunho de reuniao (sem fuso) + parser de acao"
```

---

## Fase D — Fast-path Agendar (`reuniao_confirm`)

### Task D1: Bloco de agendar no `index.ts` (substitui o placeholder da Task B3)

**Files:**
- Modify: `supabase/functions/chat-orchestrator/index.ts`

**Interfaces:**
- Consumes: `normalizeMeetingDraft`, `buildMeetingDraftPrompt` (C1); `nowLocalWall` (de `taskDraft.ts`, já importado); `callLLM`, `createClient`, `supabaseUrl`, `anonKey`, `token` (existentes, ver `tarefa_confirm`).
- Produces: mensagem `metadata.kind="reuniao_confirm"` com `reuniao_draft` (mesmo shape que o front consome).

- [ ] **Step 1: Implementar o ramo `isAgendar` (dentro do passo 4 da Task B3)**

Substituir o placeholder de agendar por:

```ts
if (isAgendar) {
  const TZ = "America/Bahia";
  let draft = normalizeMeetingDraft(null);
  try {
    const llm = await callLLM(admin, {
      model: agent.model, systemPrompt: null, history: [],
      userMessage: buildMeetingDraftPrompt(body.message, nowLocalWall(new Date(), TZ), TZ),
      temperature: 0, top_p: null, maxTokens: 400, jsonMode: true,
    });
    draft = normalizeMeetingDraft(JSON.parse(llm.content));
  } catch (_e) { draft = normalizeMeetingDraft(null); }

  // Resolve cliente sob JWT (CPF em claro -> mascara já). Lógica 0/1/N.
  let clientResolved: { id: string; name: string; cpf_masked: string | null; status: string | null } | null = null;
  let clientCandidates: { id: string; name: string; cpf_masked: string | null; status: string | null }[] = [];
  if (draft.client_query) {
    const jwtClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const maskCpf = (v: unknown): string | null => { const d = String(v ?? "").replace(/\D/g, ""); return d.length >= 2 ? `***.***.***-${d.slice(-2)}` : null; };
    const { data: cli } = await jwtClient.rpc("agent_consultar_cliente", { p_busca: draft.client_query });
    const rows = (cli as { id: string; full_name: string; cpf: string; status: string }[] | null) ?? [];
    const mapped = rows.slice(0, 10).map((r) => ({ id: r.id, name: r.full_name, cpf_masked: maskCpf(r.cpf), status: r.status ?? null }));
    if (mapped.length === 1) clientResolved = mapped[0];
    else if (mapped.length > 1) clientCandidates = mapped;
  }

  const seq = await nextSeq(admin, body.sessionId);
  await admin.from("chat_messages").insert({
    session_id: body.sessionId, user_id: userId, role: "assistant", agent_id: agent.id,
    content: "Preparei o agendamento. Revise, ajuste o que precisar e confirme:", sequence_number: seq,
    metadata: { kind: "reuniao_confirm", intent: "ACAO_COM_TOOL", agent_name: agent.name,
      reuniao_draft: {
        scheduled_date: draft.scheduled_date, start_time: draft.start_time, type: draft.type,
        display: draft.display, lawyer_hint: draft.lawyer_hint, phone: draft.phone,
        client_query: draft.client_query, client_resolved: clientResolved, client_candidates: clientCandidates,
      } },
  });
  await admin.rpc("increment_session_counters", { p_session_id: body.sessionId, p_tokens_in: 0, p_tokens_out: 0, p_cost: 0 }).then(() => {}, () => {});
  return json(202, { runId: agRunId, sessionId: body.sessionId, status: "done", path: "reuniao_confirm", intent: "ACAO_COM_TOOL" });
}
```

- [ ] **Step 2: `deno check` no index.ts** — Expected: sem erros. (CI `edge` é vinculante.)

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/chat-orchestrator/index.ts
git commit -m "feat(agenda-chat): fast-path agendar (reuniao_confirm) — rascunho + resolve cliente"
```

### Task D2: Tipos do front

**Files:**
- Modify: `src/components/juris-cloud/types.ts`

**Interfaces:**
- Produces: `ReuniaoDraft`, `ReuniaoClienteRef`, e campos `reuniaoDraft?`/`reuniaoAcao?` em `JcChatMessage`.

- [ ] **Step 1: Adicionar os tipos**

```ts
export interface ReuniaoClienteRef { id: string; name: string; cpf_masked: string | null; status: string | null; }
export interface ReuniaoDraft {
  scheduled_date: string | null; start_time: string | null; type: string | null; display: string | null;
  lawyer_hint: string | null; phone: string | null; client_query: string | null;
  client_resolved: ReuniaoClienteRef | null; client_candidates: ReuniaoClienteRef[];
}
export interface ReuniaoAcaoCandidate { id: string; scheduled_date: string; start_time: string; client_name: string | null; status: string; type: string | null; }
export interface ReuniaoAcaoPayload {
  action: "confirmed" | "done" | "canceled" | "no_show" | "reschedule";
  candidates: ReuniaoAcaoCandidate[]; // 1 = direto; >1 = escolher
  new_date_local: string | null; new_time_local: string | null; // só reschedule
}
```

E no tipo `JcChatMessage` (mesmo arquivo), adicionar:

```ts
  reuniaoDraft?: ReuniaoDraft;
  reuniaoAcao?: ReuniaoAcaoPayload;
```

- [ ] **Step 2: Commit**

```bash
git add src/components/juris-cloud/types.ts
git commit -m "feat(agenda-chat): tipos ReuniaoDraft/ReuniaoAcaoPayload no chat"
```

### Task D3: Mapear metadata → msg em `JurisCloudOS.tsx`

**Files:**
- Modify: `src/components/JurisCloudOS.tsx` (linhas ~929-936, ~996-1002 e ~1048)

**Interfaces:**
- Consumes: `metadata.reuniao_draft`, `metadata.reuniao_acao`.

- [ ] **Step 1: Nos DOIS mapeamentos de mensagem, adicionar após `tarefaDraft: r.metadata?.tarefa_draft,`**

```ts
          reuniaoDraft: r.metadata?.reuniao_draft,
          reuniaoAcao: r.metadata?.reuniao_acao,
```

- [ ] **Step 2: Incluir os novos kinds no gatilho de fim-de-run (~linha 1048)**

Trocar a condição que hoje lista `... || k === "tarefa_confirm"` por incluir também:

```ts
      if (k === "final" || k === "error" || k === "action_proposal" || k === "action_done" || k === "cancelled" || k === "cadastro_form" || k === "task_alert" || k === "tarefa_confirm" || k === "reuniao_confirm" || k === "reuniao_acao") { patchRunState(sid, null); loadSessionsRef.current?.(); }
```

- [ ] **Step 3: Commit**

```bash
git add src/components/JurisCloudOS.tsx
git commit -m "feat(agenda-chat): mapeia reuniao_draft/reuniao_acao -> msg no chat"
```

### Task D4: `ReuniaoConfirmCard.tsx`

**Files:**
- Create: `src/components/chat/ReuniaoConfirmCard.tsx`
- Test: `src/components/chat/__tests__/ReuniaoConfirmCard.test.tsx`

**Interfaces:**
- Consumes: `ReuniaoDraft` (D2); `createMeeting`, `getAvailableSlots` (`useMeetings.ts`); `useAssignableUsers`; `MEETING_TYPE_OPTIONS` (`lib/meetings.ts`).
- Produces: componente `ReuniaoConfirmCard({ draft }: { draft: ReuniaoDraft })`.

- [ ] **Step 1: Escrever o teste (falha primeiro)**

```tsx
// __tests__/ReuniaoConfirmCard.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { ReuniaoConfirmCard } from "../ReuniaoConfirmCard";

const createMeeting = vi.fn();
const getAvailableSlots = vi.fn();
vi.mock("@/hooks/useMeetings", () => ({ createMeeting: (...a: unknown[]) => createMeeting(...a), getAvailableSlots: (...a: unknown[]) => getAvailableSlots(...a) }));
vi.mock("@/hooks/useAssignableUsers", () => ({ useAssignableUsers: () => ({ users: [] }) }));

const baseDraft = { scheduled_date: "2026-07-11", start_time: "10:00", type: null, display: "11/07 10:00", lawyer_hint: null, phone: null, client_query: "João", client_resolved: { id: "c1", name: "João", cpf_masked: "***.***.***-12", status: "ativo" }, client_candidates: [] };

beforeEach(() => { createMeeting.mockReset(); getAvailableSlots.mockReset(); getAvailableSlots.mockResolvedValue(["10:00","10:15","14:00"]); });

describe("ReuniaoConfirmCard", () => {
  it("confirma e chama createMeeting com o cliente resolvido", async () => {
    createMeeting.mockResolvedValue("m1");
    render(<ReuniaoConfirmCard draft={baseDraft as never} />);
    await waitFor(() => expect(getAvailableSlots).toHaveBeenCalledWith("2026-07-11"));
    fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));
    await waitFor(() => expect(createMeeting).toHaveBeenCalledWith(expect.objectContaining({ p_scheduled_date: "2026-07-11", p_start_time: "10:00", p_client_id: "c1", p_status: "scheduled" })));
  });

  it("slot cheio -> mostra sugestão de horários livres", async () => {
    createMeeting.mockRejectedValue({ message: "create_meeting: slot cheio (capacidade 1 atingida)" });
    render(<ReuniaoConfirmCard draft={baseDraft as never} />);
    fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));
    await waitFor(() => expect(screen.getByText(/horário está cheio/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/components/chat/__tests__/ReuniaoConfirmCard.test.tsx`
Expected: FAIL (componente inexistente). (Local sem Node: roda no CI.)

- [ ] **Step 3: Implementar o componente**

Espelhar a estrutura visual de `src/components/chat/TarefaConfirmCard.tsx` (classes `action-card*`, botões Confirmar/Corrigir, estado `created`). Diferenças: campos data (`<input type="date">`), horário (`<select>` de slots via `getAvailableSlots`, re-busca ao trocar data), tipo (`<select>` de `MEETING_TYPE_OPTIONS`), cliente (resolvido/ambíguo/aberto — idêntico ao Tarefa), advogado opcional (`useAssignableUsers`), telefone opcional. Lógica completa:

```tsx
import { useEffect, useState } from "react";
import { Check, Pencil, CalendarPlus, AlertCircle } from "lucide-react";
import { createMeeting, getAvailableSlots } from "@/hooks/useMeetings";
import { useAssignableUsers } from "@/hooks/useAssignableUsers";
import { MEETING_TYPE_OPTIONS } from "@/lib/meetings";
import type { ReuniaoDraft } from "@/components/juris-cloud/types";
import { toast } from "sonner";

function friendlyError(msg: string): string {
  if (/slot cheio \(capacidade/i.test(msg)) return "Esse horário está cheio.";
  if (/fora do expediente/i.test(msg)) return "Fora do expediente (dia útil, janela ou feriado). Escolha outro horário.";
  if (/apenas recep/i.test(msg)) return "Só a recepção pode agendar reuniões.";
  if (/estado final/i.test(msg)) return "Essa reunião já foi finalizada e não pode mudar.";
  return msg;
}

export function ReuniaoConfirmCard({ draft }: { draft: ReuniaoDraft }) {
  const [date, setDate] = useState(draft.scheduled_date ?? "");
  const [slots, setSlots] = useState<string[]>([]);
  const [time, setTime] = useState(draft.start_time ?? "");
  const [type, setType] = useState(draft.type ?? "");
  const [clientId, setClientId] = useState<string | null>(draft.client_resolved?.id ?? null);
  const [lawyer, setLawyer] = useState("");
  const [phone, setPhone] = useState(draft.phone ?? "");
  const [suggest, setSuggest] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(false);
  const { users } = useAssignableUsers();

  useEffect(() => {
    if (!date) { setSlots([]); return; }
    getAvailableSlots(date).then(setSlots).catch(() => setSlots([]));
  }, [date]);

  const canConfirm = !!date && !!time && !busy;

  const confirm = async () => {
    if (!canConfirm || created) return;
    setBusy(true); setSuggest(null);
    try {
      await createMeeting({
        p_scheduled_date: date, p_start_time: time,
        p_client_id: clientId ?? undefined,
        p_client_name: !clientId && draft.client_query ? draft.client_query : undefined,
        p_type: type || undefined, p_lawyer_user_id: lawyer || undefined,
        p_phone: phone || undefined, p_status: "scheduled",
      });
      setCreated(true); toast.success("Atendimento agendado.");
    } catch (e) {
      const raw = (e as { message?: string })?.message ?? "";
      toast.error(friendlyError(raw));
      if (/slot cheio \(capacidade/i.test(raw)) {
        try { setSuggest(await getAvailableSlots(date)); } catch { /* ignore */ }
      }
    } finally { setBusy(false); }
  };

  if (created) return (<div className="action-card--done"><Check size={15} style={{ color: "#FACC15" }} /> Atendimento agendado.</div>);

  return (
    <div className="action-card">
      <div className="action-card__head"><CalendarPlus size={15} aria-hidden="true" /> Confirmar atendimento</div>
      <div className="action-card__fields">
        <label style={{ fontSize: 12, color: "var(--text2)" }}>Data {draft.display && <span>(sugerido: {draft.display})</span>}</label>
        <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setTime(""); }} style={{ padding: "6px 8px", borderRadius: 6 }} />

        <label style={{ fontSize: 12, color: "var(--text2)" }}>Horário</label>
        <select value={time} onChange={(e) => setTime(e.target.value)} style={{ padding: "6px 8px", borderRadius: 6 }}>
          <option value="">Selecione…</option>
          {slots.map((s) => <option key={s} value={s}>{s}</option>)}
          {time && !slots.includes(time) && <option value={time}>{time}</option>}
        </select>

        <label style={{ fontSize: 12, color: "var(--text2)" }}>Tipo</label>
        <select value={type} onChange={(e) => setType(e.target.value)} style={{ padding: "6px 8px", borderRadius: 6 }}>
          <option value="">(sem tipo)</option>
          {MEETING_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        {draft.client_candidates.length > 1 ? (
          <>
            <label style={{ fontSize: 12, color: "#EAB308" }}><AlertCircle size={12} style={{ verticalAlign: "middle" }} /> Cliente ambíguo — escolha</label>
            <select value={clientId ?? ""} onChange={(e) => setClientId(e.target.value || null)} style={{ padding: "6px 8px", borderRadius: 6 }}>
              <option value="">Sem cliente</option>
              {draft.client_candidates.map((c) => <option key={c.id} value={c.id}>{[c.name, c.cpf_masked, c.status].filter(Boolean).join(" · ")}</option>)}
            </select>
          </>
        ) : draft.client_resolved ? (
          <div className="action-card__row"><span className="action-card__label">Cliente</span>
            <span className="action-card__value">{[draft.client_resolved.name, draft.client_resolved.cpf_masked].filter(Boolean).join(" · ")}</span></div>
        ) : draft.client_query ? (
          <div className="action-card__row"><span className="action-card__label">Cliente</span>
            <span className="action-card__value" style={{ color: "#EAB308" }}>"{draft.client_query}" — em aberto</span></div>
        ) : null}

        <label style={{ fontSize: 12, color: "var(--text2)" }}>Advogado <span style={{ color: "var(--text3, #8a8a99)" }}>(opcional)</span></label>
        <select value={lawyer} onChange={(e) => setLawyer(e.target.value)} style={{ padding: "6px 8px", borderRadius: 6 }}>
          <option value="">(nenhum)</option>
          {users.map((u) => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}
        </select>

        {suggest && (<div style={{ fontSize: 12, color: "#EAB308" }}>Horários livres em {date}: {suggest.length ? suggest.join(", ") : "nenhum"}.</div>)}
      </div>
      <div className="action-card__actions">
        <button type="button" className="action-card__btn action-card__btn--primary" disabled={!canConfirm} onClick={confirm}><Check size={15} aria-hidden="true" /> Confirmar</button>
        <button type="button" className="action-card__btn action-card__btn--ghost" disabled={busy} onClick={() => toast.message("Ajuste os campos e confirme quando estiver certo.")}><Pencil size={14} aria-hidden="true" /> Corrigir</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/components/chat/__tests__/ReuniaoConfirmCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/ReuniaoConfirmCard.tsx src/components/chat/__tests__/ReuniaoConfirmCard.test.tsx
git commit -m "feat(agenda-chat): ReuniaoConfirmCard (agendar) com slots e traducao de erro"
```

### Task D5: Render do `reuniao_confirm` em `JurisChatPanel.tsx`

**Files:**
- Modify: `src/components/juris-cloud/JurisChatPanel.tsx` (após o bloco `tarefa_confirm`, ~linha 86)

- [ ] **Step 1: Adicionar o import e o ramo de render**

```tsx
import { ReuniaoConfirmCard } from "@/components/chat/ReuniaoConfirmCard";
```

```tsx
  if (msg.kind === "reuniao_confirm" && msg.reuniaoDraft) {
    return <ReuniaoConfirmCard key={msg.id} draft={msg.reuniaoDraft} />;
  }
```

- [ ] **Step 2: Commit**

```bash
git add src/components/juris-cloud/JurisChatPanel.tsx
git commit -m "feat(agenda-chat): renderiza ReuniaoConfirmCard no chat"
```

---

## Fase E — Fast-path Ciclo/Reagendar (`reuniao_acao`)

### Task E1: Resolver de reunião + bloco `isAcao` no `index.ts`

**Files:**
- Modify: `supabase/functions/chat-orchestrator/index.ts`

**Interfaces:**
- Consumes: `parseReuniaoAcao`, `buildAcaoPrompt` (C1); `nowLocalWall`; `callLLM`; JWT client (como no D1).
- Produces: mensagem `metadata.kind="reuniao_acao"` com `reuniao_acao` (shape de `ReuniaoAcaoPayload` + candidatos). Quando 0 candidatos → `metadata.kind="final"` com "não achei…".

- [ ] **Step 1: Implementar o ramo `isAcao` (substitui o placeholder de ação da Task B3)**

```ts
if (isAcao) {
  const TZ = "America/Bahia";
  const action = parseReuniaoAcao(body.message); // confirmed|done|canceled|no_show|reschedule|null
  let ref: { client_query: string|null; date_local: string|null; time_local: string|null; new_date_local: string|null; new_time_local: string|null } =
    { client_query: null, date_local: null, time_local: null, new_date_local: null, new_time_local: null };
  try {
    const llm = await callLLM(admin, { model: agent.model, systemPrompt: null, history: [],
      userMessage: buildAcaoPrompt(body.message, nowLocalWall(new Date(), TZ), TZ),
      temperature: 0, top_p: null, maxTokens: 300, jsonMode: true });
    const p = JSON.parse(llm.content) as Record<string, unknown>;
    const sOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    ref = { client_query: sOrNull(p.client_query), date_local: sOrNull(p.date_local), time_local: sOrNull(p.time_local),
            new_date_local: sOrNull(p.new_date_local), new_time_local: sOrNull(p.new_time_local) };
  } catch (_e) { /* ref fica vazio */ }

  // Resolver de reunião sob JWT (RLS de leitura vale). Filtra por data/hora/cliente.
  const jwtClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  let q = jwtClient.from("meetings").select("id, scheduled_date, start_time, client_name, status, type").limit(11);
  if (ref.date_local) q = q.eq("scheduled_date", ref.date_local);
  if (ref.time_local) q = q.eq("start_time", ref.time_local.length === 5 ? `${ref.time_local}:00` : ref.time_local);
  if (ref.client_query) q = q.ilike("client_name", `%${ref.client_query}%`);
  // Para flips não-terminais, candidatas ativas fazem mais sentido.
  if (action && action !== "done") q = q.in("status", ["scheduled","confirmed","rescheduled"]);
  const { data: rows } = await q;
  const cands = ((rows as { id: string; scheduled_date: string; start_time: string; client_name: string|null; status: string; type: string|null }[] | null) ?? [])
    .slice(0, 10).map((r) => ({ id: r.id, scheduled_date: r.scheduled_date, start_time: (r.start_time || "").slice(0,5), client_name: r.client_name, status: r.status, type: r.type }));

  const seq = await nextSeq(admin, body.sessionId);
  if (!action || cands.length === 0) {
    await admin.from("chat_messages").insert({ session_id: body.sessionId, user_id: userId, role: "assistant", agent_id: agent.id,
      content: cands.length === 0 ? "Não achei uma reunião com esses dados. Confira o cliente/dia/horário e tente de novo." : "Não entendi qual ação fazer com a reunião.",
      sequence_number: seq, metadata: { kind: "final", intent: "ACAO_COM_TOOL", agent_name: agent.name } });
    await admin.rpc("increment_session_counters", { p_session_id: body.sessionId, p_tokens_in: 0, p_tokens_out: 0, p_cost: 0 }).then(() => {}, () => {});
    return json(202, { runId: agRunId, sessionId: body.sessionId, status: "done", path: "reuniao_acao", intent: "ACAO_COM_TOOL" });
  }
  await admin.from("chat_messages").insert({ session_id: body.sessionId, user_id: userId, role: "assistant", agent_id: agent.id,
    content: cands.length === 1 ? "Confirme a ação na reunião abaixo:" : "Achei mais de uma reunião. Escolha qual:",
    sequence_number: seq, metadata: { kind: "reuniao_acao", intent: "ACAO_COM_TOOL", agent_name: agent.name,
      reuniao_acao: { action, candidates: cands, new_date_local: ref.new_date_local, new_time_local: ref.new_time_local } } });
  await admin.rpc("increment_session_counters", { p_session_id: body.sessionId, p_tokens_in: 0, p_tokens_out: 0, p_cost: 0 }).then(() => {}, () => {});
  return json(202, { runId: agRunId, sessionId: body.sessionId, status: "done", path: "reuniao_acao", intent: "ACAO_COM_TOOL" });
}
```

- [ ] **Step 2: `deno check` no index.ts** — Expected: sem erros. (CI `edge` vinculante.)

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/chat-orchestrator/index.ts
git commit -m "feat(agenda-chat): fast-path ciclo/reagendar (reuniao_acao) — resolver 0/1/N"
```

### Task E2: `ReuniaoAcaoCard.tsx`

**Files:**
- Create: `src/components/chat/ReuniaoAcaoCard.tsx`
- Test: `src/components/chat/__tests__/ReuniaoAcaoCard.test.tsx`

**Interfaces:**
- Consumes: `ReuniaoAcaoPayload` (D2); `updateMeeting`, `getAvailableSlots` (`useMeetings.ts`); `supabase` (`@/integrations/supabase/client`) para buscar a linha atual; `MEETING_STATUS_LABELS` (`lib/meetings.ts`).
- Produces: componente `ReuniaoAcaoCard({ payload }: { payload: ReuniaoAcaoPayload })`.

- [ ] **Step 1: Escrever o teste (falha primeiro)**

```tsx
// __tests__/ReuniaoAcaoCard.test.tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { ReuniaoAcaoCard } from "../ReuniaoAcaoCard";

const updateMeeting = vi.fn();
const getAvailableSlots = vi.fn();
const single = vi.fn();
vi.mock("@/hooks/useMeetings", () => ({ updateMeeting: (...a: unknown[]) => updateMeeting(...a), getAvailableSlots: (...a: unknown[]) => getAvailableSlots(...a) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: single }) }) }) } }));

const oneCand = { action: "confirmed" as const, candidates: [{ id: "m1", scheduled_date: "2026-07-11", start_time: "10:00", client_name: "João", status: "scheduled", type: null }], new_date_local: null, new_time_local: null };

beforeEach(() => { updateMeeting.mockReset(); getAvailableSlots.mockReset().mockResolvedValue(["14:00"]); single.mockReset().mockResolvedValue({ data: { id: "m1", scheduled_date: "2026-07-11", start_time: "10:00:00", end_time: "10:15:00", type: null, lawyer_user_id: null, receptionist_user_id: null, client_id: "c1", client_name: "João", phone: null, summary: null, notes: null, status: "scheduled" }, error: null }); });

describe("ReuniaoAcaoCard", () => {
  it("confirma 1 candidata -> updateMeeting com status alvo", async () => {
    updateMeeting.mockResolvedValue(undefined);
    render(<ReuniaoAcaoCard payload={oneCand as never} />);
    fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));
    await waitFor(() => expect(updateMeeting).toHaveBeenCalledWith(expect.objectContaining({ p_id: "m1", p_status: "confirmed", p_scheduled_date: "2026-07-11" })));
  });

  it("estado final -> mensagem amigável", async () => {
    updateMeeting.mockRejectedValue({ message: 'update_meeting: "done" é estado final e não pode ser alterado' });
    render(<ReuniaoAcaoCard payload={oneCand as never} />);
    fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));
    await waitFor(() => expect(screen.getByText(/já foi finalizada/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/components/chat/__tests__/ReuniaoAcaoCard.test.tsx`
Expected: FAIL (componente inexistente).

- [ ] **Step 3: Implementar**

```tsx
import { useEffect, useState } from "react";
import { Check, X, CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { updateMeeting, getAvailableSlots } from "@/hooks/useMeetings";
import { MEETING_STATUS_LABELS } from "@/lib/meetings";
import type { ReuniaoAcaoPayload } from "@/components/juris-cloud/types";
import { toast } from "sonner";

const ACTION_LABEL: Record<string, string> = { confirmed: "Confirmar", done: "Marcar como realizada", canceled: "Cancelar", no_show: "Registrar não-comparecimento", reschedule: "Reagendar" };
function friendlyError(msg: string): string {
  if (/slot cheio \(capacidade/i.test(msg)) return "Esse horário está cheio.";
  if (/fora do expediente/i.test(msg)) return "Fora do expediente (dia útil, janela ou feriado).";
  if (/apenas recep/i.test(msg)) return "Só a recepção pode alterar reuniões.";
  if (/estado final/i.test(msg)) return "Essa reunião já foi finalizada e não pode mudar.";
  return msg;
}

export function ReuniaoAcaoCard({ payload }: { payload: ReuniaoAcaoPayload }) {
  const multi = payload.candidates.length > 1;
  const [selId, setSelId] = useState(payload.candidates[0]?.id ?? "");
  const sel = payload.candidates.find((c) => c.id === selId) ?? payload.candidates[0];
  const isReschedule = payload.action === "reschedule";
  const [date, setDate] = useState(payload.new_date_local ?? sel?.scheduled_date ?? "");
  const [slots, setSlots] = useState<string[]>([]);
  const [time, setTime] = useState(payload.new_time_local ?? "");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => { if (isReschedule && date) getAvailableSlots(date).then(setSlots).catch(() => setSlots([])); }, [date, isReschedule]);

  const confirm = async () => {
    if (busy || done || !sel) return;
    if (isReschedule && (!date || !time)) { toast.message("Escolha a nova data e horário."); return; }
    setBusy(true);
    try {
      const { data: row, error } = await supabase.from("meetings").select("*").eq("id", sel.id).maybeSingle();
      if (error || !row) throw new Error("Reunião não encontrada.");
      const r = row as Record<string, unknown>;
      await updateMeeting({
        p_id: sel.id,
        p_scheduled_date: isReschedule ? date : (r.scheduled_date as string),
        p_start_time: isReschedule ? time : (r.start_time as string),
        p_end_time: isReschedule ? null : (r.end_time as string | null),
        p_type: (r.type as string | null) ?? null,
        p_lawyer_user_id: (r.lawyer_user_id as string | null) ?? null,
        p_receptionist_user_id: (r.receptionist_user_id as string | null) ?? null,
        p_client_id: (r.client_id as string | null) ?? null,
        p_client_name: (r.client_name as string | null) ?? null,
        p_phone: (r.phone as string | null) ?? null,
        p_summary: (r.summary as string | null) ?? null,
        p_notes: (r.notes as string | null) ?? null,
        p_status: isReschedule ? "rescheduled" : payload.action,
      });
      setDone(true); toast.success("Reunião atualizada.");
    } catch (e) { toast.error(friendlyError((e as { message?: string })?.message ?? "")); }
    finally { setBusy(false); }
  };

  if (done) return (<div className="action-card--done"><Check size={15} style={{ color: "#FACC15" }} /> Reunião atualizada.</div>);

  return (
    <div className="action-card">
      <div className="action-card__head"><CalendarClock size={15} aria-hidden="true" /> {ACTION_LABEL[payload.action]}</div>
      <div className="action-card__fields">
        {multi ? (
          <>
            <label style={{ fontSize: 12, color: "#EAB308" }}>Qual reunião?</label>
            <select value={selId} onChange={(e) => setSelId(e.target.value)} style={{ padding: "6px 8px", borderRadius: 6 }}>
              {payload.candidates.map((c) => <option key={c.id} value={c.id}>{[c.scheduled_date, c.start_time, c.client_name, MEETING_STATUS_LABELS[c.status as keyof typeof MEETING_STATUS_LABELS] ?? c.status].filter(Boolean).join(" · ")}</option>)}
            </select>
          </>
        ) : sel ? (
          <div className="action-card__row"><span className="action-card__label">Reunião</span>
            <span className="action-card__value">{[sel.scheduled_date, sel.start_time, sel.client_name].filter(Boolean).join(" · ")}</span></div>
        ) : null}

        {isReschedule && (
          <>
            <label style={{ fontSize: 12, color: "var(--text2)" }}>Nova data</label>
            <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setTime(""); }} style={{ padding: "6px 8px", borderRadius: 6 }} />
            <label style={{ fontSize: 12, color: "var(--text2)" }}>Novo horário</label>
            <select value={time} onChange={(e) => setTime(e.target.value)} style={{ padding: "6px 8px", borderRadius: 6 }}>
              <option value="">Selecione…</option>
              {slots.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </>
        )}
      </div>
      <div className="action-card__actions">
        <button type="button" className="action-card__btn action-card__btn--primary" disabled={busy || !sel} onClick={confirm}><Check size={15} aria-hidden="true" /> Confirmar</button>
        <button type="button" className="action-card__btn action-card__btn--ghost" disabled={busy} onClick={() => toast.message("Sem alterações.")}><X size={14} aria-hidden="true" /> Fechar</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/components/chat/__tests__/ReuniaoAcaoCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/ReuniaoAcaoCard.tsx src/components/chat/__tests__/ReuniaoAcaoCard.test.tsx
git commit -m "feat(agenda-chat): ReuniaoAcaoCard (ciclo/reagendar) com update overwrite"
```

### Task E3: Render do `reuniao_acao` em `JurisChatPanel.tsx`

**Files:**
- Modify: `src/components/juris-cloud/JurisChatPanel.tsx`

- [ ] **Step 1: Import + ramo de render (após o `reuniao_confirm`)**

```tsx
import { ReuniaoAcaoCard } from "@/components/chat/ReuniaoAcaoCard";
```

```tsx
  if (msg.kind === "reuniao_acao" && msg.reuniaoAcao) {
    return <ReuniaoAcaoCard key={msg.id} payload={msg.reuniaoAcao} />;
  }
```

- [ ] **Step 2: Commit**

```bash
git add src/components/juris-cloud/JurisChatPanel.tsx
git commit -m "feat(agenda-chat): renderiza ReuniaoAcaoCard no chat"
```

---

## Fase F — Retirar `agendar_reuniao` do registry

### Task F1: Remover a tool e ajustar testes

**Files:**
- Modify: `supabase/functions/chat-orchestrator/tools/registry.ts` (bloco `agendar_reuniao:` ~linhas 138-147)
- Modify: `supabase/functions/chat-orchestrator/tools/handlers.ts` (case `"agendar_reuniao"` ~linhas 144-152)
- Modify: `supabase/functions/chat-orchestrator/tools/toolSchemas.test.ts` (se referenciar)

- [ ] **Step 1: Remover o bloco `agendar_reuniao` de `registry.ts`** (a chave inteira em `TOOLS`).

- [ ] **Step 2: Remover o `case "agendar_reuniao": { … }` de `handlers.ts`.**

- [ ] **Step 3: Ajustar `toolSchemas.test.ts`** — se listar `agendar_reuniao`, remover; garantir que o teste de contrato passe sem ela.

- [ ] **Step 4: Verificar**

Run: `deno test supabase/functions/chat-orchestrator/tools/toolSchemas.test.ts`
Expected: PASS.

- [ ] **Step 5: (opcional, DB) limpar `allowed_tools`** — se algum agente listar `agendar_reuniao` em `agents.allowed_tools`, removê-la via `UPDATE` (sem crash mesmo se ficar: `toolsFor` ignora nome desconhecido). Confirmar antes:

```sql
SELECT id, name, allowed_tools FROM public.agents WHERE allowed_tools @> '["agendar_reuniao"]'::jsonb;
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/chat-orchestrator/tools/registry.ts supabase/functions/chat-orchestrator/tools/handlers.ts supabase/functions/chat-orchestrator/tools/toolSchemas.test.ts
git commit -m "refactor(agenda-chat): retira agendar_reuniao do registry (aposenta pendencia-reuniao)"
```

---

## Verificação final (antes do PR)

- [ ] CI `edge` verde (deno check/test do chat-orchestrator).
- [ ] CI front verde (vitest + build).
- [ ] Smoke manual em preview com `AGENDA_CHAT_ENABLED=off`: aceite #0a/#0b/#0c.
- [ ] Smoke manual com `AGENDA_CHAT_ENABLED=on`: aceites #1–#7.
- [ ] `git grep -n "agendar_reuniao"` só retorna docs/plans (nenhum código vivo).
- [ ] Deploy do edge = manual do Ryan (fora deste plano).

## Rastreabilidade spec → tasks

- Fase 0 (detector sempre-ligado, permissão, misroute) → B1, B2, B3. Aceite #0a/b/c, #5.
- Agendar (reuniao_confirm) → C1, D1–D5. Aceite #1, #6.
- Ciclo/reagendar (reuniao_acao) → C1, E1–E3. Aceite #2, #3, #4.
- Sem fuso (date+time) → C1 (Global Constraints). PII mascarada → D1, E1.
- Retirar agendar_reuniao → F1.
- Divergência repo↔prod (Correção 0) → A1.
