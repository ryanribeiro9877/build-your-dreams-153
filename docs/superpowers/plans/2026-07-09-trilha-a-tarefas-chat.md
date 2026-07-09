# TRILHA A — Sistema de Tarefas no Chat (cards 4.1–4.5) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir criar, atribuir (a usuário ou departamento), assumir, concluir, reagendar e alertar tarefas — inclusive criando-as por linguagem natural no chat via um cartão de confirmação editável — reusando o backend de tarefas que já existe.

**Architecture:** O backend (`user_tasks` + RPCs) já existe. Adicionamos 4 funções SQL (`create_department_task`, `claim_user_task`, `reschedule_user_task`, `enqueue_task_chat_alert`), 1 guard de trigger, 1 config de horário comercial e 1 cron de alerta. No FE, expomos as ações nas telas de tarefa existentes, criamos um cartão de alerta genérico no chat (`TaskAlertCard`, reusável por Reuniões/Trilha B) e um cartão de confirmação editável (`TarefaConfirmCard`) alimentado por um rascunho do LLM. A escrita da tarefa pelo chat é **desacoplada do motor agêntico** — mesmo padrão do cadastro (`metadata.kind`), com `CHAT_TOOLS_ENABLED` permanecendo OFF e uma flag dedicada `TAREFA_CHAT_ENABLED`.

**Tech Stack:** React + TypeScript (Vite), Supabase (Postgres 17 + RLS + pg_cron + Realtime), Edge Functions (Deno) para o `chat-orchestrator`. UI sem framework de componentes (CSS classes próprias, `lucide-react`, `sonner`).

## Global Constraints

- **`CHAT_TOOLS_ENABLED` permanece OFF.** A escrita do card 4.1 é 100% desacoplada do tool-calling; usa `metadata.kind: "tarefa_confirm"` + confirmação humana + `create_user_task` chamado pelo FE.
- **Flag dedicada `TAREFA_CHAT_ENABLED`** (edge, `Deno.env`, default `"true"`, reversível). Espelho FE opcional `VITE_TAREFA_CHAT_ENABLED`.
- **NUNCA rodar `supabase db push`** (dispara `drop_plaintext_pii`). Adições de função/tabela vão via `apply_migration` (MCP Supabase). Toda função é `CREATE OR REPLACE` idempotente; toda tabela usa `CREATE TABLE IF NOT EXISTS`. Não duplicar/renomear migrations já aplicadas.
- **Deploy do edge `chat-orchestrator` é MANUAL do Ryan.** Nenhuma tarefa deste plano faz deploy do edge. Antes de tocar no `chat-orchestrator` (Phase 6), confirmar que o CI `edge` está verde.
- **Ambiente local sem Node/gh.** Não há como rodar `npm`/`vitest`/`build` localmente. Testes de FE/edge rodam no CI (Vercel). Verificação de SQL é feita via `execute_sql` (MCP). git/gh via PowerShell.
- **Fuso do escritório:** `America/Bahia` (usado pelo trigger de e-mail existente). Prazos relativos ("amanhã 10h") são resolvidos contra `now()` nesse fuso e **exibidos já resolvidos** para conferência.
- **Princípios inegociáveis:** humano no comando (cartão + confirmação obrigatória, nunca auto-executar); zero alucinação (campo não resolvido vem **em aberto**, não chutado); rastreabilidade (tudo em `task_audit_log`); honestidade (flag nomeada; nenhuma flag mentindo).
- **Status é enum inglês** `user_task_status = {draft, assigned, in_progress, awaiting_external, awaiting_validation, blocked, completed, cancelled}`. "Concluída" = `completed`. NÃO usar `'concluida'`.
- **Auditoria automática:** o trigger `trg_user_tasks_audit` (`kanban_audit_user_task`) já grava em `task_audit_log` toda mudança de `status`, `assignee_user_id`, `deadline_at`, `priority`, `title`. Portanto *claim* (muda assignee) e *reschedule* (muda deadline) geram audit sozinhos; só adicionamos linhas extras para justificativa.

## Decisões de projeto assumidas (confirmar antes de executar)

1. **Superfície do alerta no chat (4.3/4.4):** cartão em `chat_messages` com `metadata.kind: "task_alert"` (renderizado como `TaskAlertCard` com botões), entregue por uma função `enqueue_task_chat_alert` que acha/cria a sessão do destinatário. É o que o briefing pede ("no chat via Realtime + card com botões"). O sino/toast global existente (`useRealtimeNotifications`, que escuta a tabela **legada** `agent_tasks`) **não** é a superfície; fica como está.
2. **Config de horário comercial (4.5):** persistida em tabela singleton `business_hours_config` + tabela `holidays`, com RPCs get/set (admin), e um util FE `src/lib/businessHours.ts` que lê a config (com fallback aos defaults do Rodrigo). Compartilhado com o card 5.2 (Reuniões).
3. **`TAREFA_CHAT_ENABLED` default ON** (conforme briefing), reversível por env no edge.
4. **Sem `client_timeline`:** a tabela não existe no banco; o item "atualizar histórico do cliente" do 4.4 fica coberto por `task_audit_log`. Não criar `client_timeline` neste plano.
5. **Tarefa de departamento** = `user_tasks` com `assignee_user_id = NULL` (a coluna já é nullable). Criada por `create_department_task`; "assumida" por `claim_user_task`.

---

## REVISÃO 2026-07-09 (pós-verificação no banco) — SUPERSEDE Tasks 1-3

Verificação empírica no banco revelou um CHECK que muda o design da "tarefa de departamento":

```
user_tasks_check: CHECK ((assignee_user_id IS NOT NULL AND assignee_external_id IS NULL)
                      OR (assignee_user_id IS NULL AND assignee_external_id IS NOT NULL))
```

**Não existe tarefa com ambos NULL.** O padrão real do código (em `advance_user_task`) para "pertence ao papel, mas sem pessoa ainda" é: **atribuir a um placeholder (fallback) + marcar `payload.awaiting_role`**. `get_kanban_board` já expõe `awaiting_role`. Correções:

- **Task 1 (guard do trigger de e-mail): CANCELADA.** O bloqueio real nunca foi o trigger (o `enqueue_email_notification` já retorna cedo quando o e-mail é NULL). Como o placeholder da tarefa de departamento é o próprio criador (`assigner == assignee`), o guard de auto-atribuição do trigger já pula o e-mail. Nada a fazer.
- **Task 2 (`create_department_task`): REVISADA** — placeholder `assignee = auth.uid()` (criador) + `payload.awaiting_role = kanban_stage_owner_role(stage)` + `payload.is_department = true`. SQL abaixo substitui o da Task 2 original.
- **Task 3 (`claim_user_task`): REVISADA** — permite assumir quando `payload->>'awaiting_role' IS NOT NULL` (não "assignee NULL"); seta `assignee = auth.uid()`, remove `awaiting_role`. SQL abaixo.
- **Task 9 (cron):** adicionar `AND (t.payload->>'awaiting_role') IS NULL` ao filtro (não alertar o placeholder de tarefa de departamento ainda não assumida).
- **Task 13 (FE "Assumir"):** detectar tarefa de departamento por `awaiting_role` presente (não por `assignee_user_id === null`, que nunca ocorre).

**SQL revisado da Task 2 (`create_department_task`):**
```sql
CREATE OR REPLACE FUNCTION public.create_department_task(
  p_task_type_id uuid, p_title text, p_description text DEFAULT NULL,
  p_client_id uuid DEFAULT NULL, p_process_id uuid DEFAULT NULL,
  p_priority task_priority DEFAULT 'medium'::task_priority, p_deadline_at timestamptz DEFAULT NULL,
  p_area legal_area DEFAULT NULL, p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid; v_sla int; v_stage org_stage; v_role text; v_task uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'create_department_task: não autenticado'; END IF;
  IF NOT public.is_master_admin(v_uid) THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles p
      JOIN public.role_task_matrix rtm ON rtm.role_template_id=p.role_template_id AND rtm.task_type_id=p_task_type_id
      WHERE p.user_id=v_uid AND rtm.can_assign=true) THEN
      RAISE EXCEPTION 'create_department_task: sem permissão para atribuir';
    END IF;
  END IF;
  SELECT stage, default_sla_hours INTO v_stage, v_sla FROM public.task_types WHERE id=p_task_type_id;
  IF p_deadline_at IS NULL AND v_sla IS NOT NULL THEN p_deadline_at := now() + (v_sla||' hours')::interval; END IF;
  v_role := COALESCE(public.kanban_stage_owner_role(v_stage), 'indefinido');
  INSERT INTO public.user_tasks
    (task_type_id, title, description, assigner_user_id, assignee_user_id,
     process_id, client_id, area, status, priority, deadline_at, payload)
  VALUES
    (p_task_type_id, p_title, p_description, v_uid, v_uid,
     p_process_id, p_client_id, p_area, 'assigned', p_priority, p_deadline_at,
     COALESCE(p_payload,'{}'::jsonb) || jsonb_build_object('awaiting_role', v_role, 'is_department', true))
  RETURNING id INTO v_task;
  RETURN v_task;
END; $function$;
GRANT EXECUTE ON FUNCTION public.create_department_task(uuid,text,text,uuid,uuid,task_priority,timestamptz,legal_area,jsonb) TO authenticated;
```

**SQL revisado da Task 3 (`claim_user_task`):**
```sql
CREATE OR REPLACE FUNCTION public.claim_user_task(p_task_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid; v_task RECORD; v_role uuid; v_new uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'claim_user_task: não autenticado'; END IF;
  SELECT * INTO v_task FROM public.user_tasks WHERE id=p_task_id;
  IF v_task IS NULL THEN RAISE EXCEPTION 'claim_user_task: tarefa não encontrada'; END IF;
  IF (v_task.payload->>'awaiting_role') IS NULL THEN
    RAISE EXCEPTION 'claim_user_task: tarefa não está aguardando responsável';
  END IF;
  IF NOT public.is_master_admin(v_uid) THEN
    SELECT role_template_id INTO v_role FROM public.profiles WHERE user_id=v_uid;
    IF v_role IS NULL OR NOT public.is_role_eligible_for_task(v_task.task_type_id, v_role) THEN
      RAISE EXCEPTION 'claim_user_task: seu cargo não é elegível a esta tarefa';
    END IF;
  END IF;
  UPDATE public.user_tasks
    SET assignee_user_id = v_uid, payload = payload - 'awaiting_role',
        status = CASE WHEN status='assigned' THEN 'in_progress'::user_task_status ELSE status END,
        updated_at = now()
    WHERE id=p_task_id AND (payload->>'awaiting_role') IS NOT NULL
    RETURNING assignee_user_id INTO v_new;
  IF v_new IS NULL THEN RAISE EXCEPTION 'claim_user_task: já foi assumida por outra pessoa'; END IF;
  RETURN v_new;
END; $function$;
GRANT EXECUTE ON FUNCTION public.claim_user_task(uuid) TO authenticated;
```

---

# FASE 1 — Backend do card 4.2 (atribuição a usuário e a departamento)

### Task 1: Guard no trigger de e-mail para tarefa sem responsável

**Files:**
- Aplicar via `apply_migration` (MCP), name: `fix_notify_email_null_assignee`.

**Interfaces:**
- Produces: `trg_user_tasks_notify_email()` que NÃO tenta notificar quando `assignee_user_id IS NULL`.

**Contexto (verificado):** `email_notifications.recipient_user_id` é `NOT NULL`. O CASO 1 do trigger (`AFTER INSERT ... status IN ('assigned','in_progress')`) chama `enqueue_email_notification(NEW.assignee_user_id, ...)`. Numa tarefa de departamento (`assignee_user_id = NULL`) isso quebraria o INSERT. Além disso `NEW.assigner_user_id = NEW.assignee_user_id` com NULL retorna NULL (não `true`), então a guarda de auto-atribuição atual não protege.

- [ ] **Step 1: Ler a função atual para editar cirurgicamente**

Rodar (MCP `execute_sql`, project `tsltxvswzdnlmvljpryh`):
```sql
SELECT pg_get_functiondef(p.oid) FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace AND n.nspname='public'
WHERE p.proname='trg_user_tasks_notify_email';
```
Copiar o corpo exato retornado.

- [ ] **Step 2: Aplicar a versão com guard**

Reaplicar a MESMA função (corpo copiado), alterando APENAS a condição do CASO 1 de:
```sql
IF TG_OP = 'INSERT' AND NEW.status IN ('assigned', 'in_progress') THEN
```
para:
```sql
IF TG_OP = 'INSERT' AND NEW.status IN ('assigned', 'in_progress')
   AND NEW.assignee_user_id IS NOT NULL THEN
```
Aplicar via `apply_migration` (`CREATE OR REPLACE FUNCTION ...` com o corpo inteiro). Não alterar mais nada.

- [ ] **Step 3: Verificar que não notifica sem responsável**

Rodar (MCP `execute_sql`), dentro de uma transação de teste que faz rollback:
```sql
BEGIN;
-- pega um task_type e um assigner válido quaisquer só para o INSERT direto
SELECT count(*) AS before FROM email_notifications;
INSERT INTO user_tasks (task_type_id, title, assigner_user_id, assignee_user_id, status, priority, payload, situacao, is_pendencia)
SELECT (SELECT id FROM task_types WHERE is_active LIMIT 1), 'TESTE dept', (SELECT user_id FROM profiles LIMIT 1), NULL, 'assigned', 'medium', '{}'::jsonb, 'a_fazer', false;
SELECT count(*) AS after FROM email_notifications;  -- deve ser igual a before
ROLLBACK;
```
Expected: `after == before` e o INSERT não lança exceção. (Se `situacao`/`a_fazer` não existir como valor, usar o default do enum — checar `\d user_tasks`.)

- [ ] **Step 4: Commit (registro da migration no repo, sem `db push`)**

```bash
git add supabase/migrations
git commit -m "fix(tasks): trigger de e-mail ignora tarefa sem responsavel (dept)"
```
Se o time versiona migrations no repo, salvar o SQL aplicado como `supabase/migrations/<timestamp>_fix_notify_email_null_assignee.sql` (mesmo conteúdo aplicado). Se não versiona (COOP-DOCS-1 desync), pular o arquivo e apenas registrar no relatório.

---

### Task 2: `create_department_task` — criar tarefa de departamento (sem dono)

**Files:**
- Aplicar via `apply_migration`, name: `create_department_task`.

**Interfaces:**
- Produces:
  `create_department_task(p_task_type_id uuid, p_title text, p_description text DEFAULT NULL, p_client_id uuid DEFAULT NULL, p_process_id uuid DEFAULT NULL, p_priority task_priority DEFAULT 'medium', p_deadline_at timestamptz DEFAULT NULL, p_area legal_area DEFAULT NULL, p_payload jsonb DEFAULT '{}') RETURNS uuid`
- Consumes (existentes): `is_master_admin`, `role_task_matrix`, `task_types.default_sla_hours`.

**Regra:** mesma permissão de `create_user_task` (master OU `role_task_matrix.can_assign` para o tipo), mas insere `assignee_user_id = NULL` e `status = 'assigned'`. A tarefa fica "do departamento": elegíveis a veem e podem assumir (Task 3).

- [ ] **Step 1: Aplicar a função**

```sql
CREATE OR REPLACE FUNCTION public.create_department_task(
  p_task_type_id uuid,
  p_title text,
  p_description text DEFAULT NULL,
  p_client_id uuid DEFAULT NULL,
  p_process_id uuid DEFAULT NULL,
  p_priority task_priority DEFAULT 'medium'::task_priority,
  p_deadline_at timestamptz DEFAULT NULL,
  p_area legal_area DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_assigner_id uuid;
  v_sla integer;
  v_task_id uuid;
BEGIN
  v_assigner_id := auth.uid();
  IF v_assigner_id IS NULL THEN RAISE EXCEPTION 'create_department_task: não autenticado'; END IF;
  IF NOT public.is_master_admin(v_assigner_id) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.role_task_matrix rtm ON rtm.role_template_id = p.role_template_id AND rtm.task_type_id = p_task_type_id
      WHERE p.user_id = v_assigner_id AND rtm.can_assign = true
    ) THEN
      RAISE EXCEPTION 'create_department_task: sem permissão para atribuir';
    END IF;
  END IF;
  IF p_deadline_at IS NULL THEN
    SELECT default_sla_hours INTO v_sla FROM public.task_types WHERE id = p_task_type_id;
    IF v_sla IS NOT NULL THEN p_deadline_at := now() + (v_sla || ' hours')::interval; END IF;
  END IF;
  INSERT INTO public.user_tasks
    (task_type_id, title, description, assigner_user_id, assignee_user_id, process_id, client_id, area, status, priority, deadline_at, payload)
  VALUES
    (p_task_type_id, p_title, p_description, v_assigner_id, NULL, p_process_id, p_client_id, p_area, 'assigned', p_priority, p_deadline_at, p_payload)
  RETURNING id INTO v_task_id;
  RETURN v_task_id;
END; $function$;

GRANT EXECUTE ON FUNCTION public.create_department_task(uuid,text,text,uuid,uuid,task_priority,timestamptz,legal_area,jsonb) TO authenticated;
```

- [ ] **Step 2: Verificar assinatura registrada**

```sql
SELECT pg_get_function_arguments(oid) FROM pg_proc WHERE proname='create_department_task';
```
Expected: os 9 parâmetros acima com defaults.

- [ ] **Step 3: Commit** (mesma política de migration da Task 1)

```bash
git add supabase/migrations && git commit -m "feat(tasks): create_department_task (tarefa sem dono)"
```

---

### Task 3: `claim_user_task` — elegível assume a tarefa e vira responsável

**Files:**
- Aplicar via `apply_migration`, name: `claim_user_task`.

**Interfaces:**
- Produces: `claim_user_task(p_task_id uuid) RETURNS uuid` (retorna o `assignee_user_id` resultante).
- Consumes: `is_role_eligible_for_task`, `is_master_admin`, `profiles.role_template_id`.

**Regra (briefing):** "primeiro que assumir vira responsável". Só assume se ainda estiver sem dono e o papel do usuário for elegível ao tipo. A troca de `assignee_user_id` é auto-auditada pelo trigger.

- [ ] **Step 1: Aplicar a função**

```sql
CREATE OR REPLACE FUNCTION public.claim_user_task(p_task_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid;
  v_task RECORD;
  v_role uuid;
  v_updated uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'claim_user_task: não autenticado'; END IF;
  SELECT * INTO v_task FROM public.user_tasks WHERE id = p_task_id;
  IF v_task IS NULL THEN RAISE EXCEPTION 'claim_user_task: tarefa não encontrada'; END IF;
  IF v_task.assignee_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'claim_user_task: tarefa já tem responsável';
  END IF;
  IF NOT public.is_master_admin(v_uid) THEN
    SELECT role_template_id INTO v_role FROM public.profiles WHERE user_id = v_uid;
    IF v_role IS NULL OR NOT public.is_role_eligible_for_task(v_task.task_type_id, v_role) THEN
      RAISE EXCEPTION 'claim_user_task: seu cargo não é elegível a esta tarefa';
    END IF;
  END IF;
  -- guarda contra corrida: só grava se ainda estiver nulo
  UPDATE public.user_tasks
    SET assignee_user_id = v_uid,
        status = CASE WHEN status = 'assigned' THEN 'in_progress'::user_task_status ELSE status END,
        updated_at = now()
    WHERE id = p_task_id AND assignee_user_id IS NULL
    RETURNING assignee_user_id INTO v_updated;
  IF v_updated IS NULL THEN RAISE EXCEPTION 'claim_user_task: tarefa já foi assumida por outra pessoa'; END IF;
  RETURN v_updated;
END; $function$;

GRANT EXECUTE ON FUNCTION public.claim_user_task(uuid) TO authenticated;
```

- [ ] **Step 2: Verificar audit da atribuição**

```sql
-- em transação: cria dept-task, seta auth via SET LOCAL request.jwt não é trivial aqui;
-- validação real fica no FE/manual. Só confere que a função existe e é SECURITY DEFINER:
SELECT prosecdef, pg_get_function_result(oid) FROM pg_proc WHERE proname='claim_user_task';
```
Expected: `prosecdef = true`, result `uuid`. (Teste funcional real na Phase 5, tela.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations && git commit -m "feat(tasks): claim_user_task (assumir tarefa de departamento)"
```

---

# FASE 2 — Backend do card 4.4 (conclusão + reagendamento + notificar criador)

### Task 4: `reschedule_user_task` — reagendar com justificativa obrigatória

**Files:**
- Aplicar via `apply_migration`, name: `reschedule_user_task`.

**Interfaces:**
- Produces: `reschedule_user_task(p_task_id uuid, p_new_deadline timestamptz, p_justificativa text) RETURNS timestamptz` (retorna o novo prazo).
- Consumes: `kanban_can_edit_task`, `is_master_admin`, `task_audit_log`.

**Regra (briefing):** exige justificativa e **preserva o prazo original no histórico**. O trigger já loga `deadline_at` (old→new) — o original fica preservado. Adicionamos uma linha explícita de justificativa. Bloqueia se justificativa vazia.

- [ ] **Step 1: Aplicar a função**

```sql
CREATE OR REPLACE FUNCTION public.reschedule_user_task(
  p_task_id uuid,
  p_new_deadline timestamptz,
  p_justificativa text
) RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid;
  v_old timestamptz;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'reschedule_user_task: não autenticado'; END IF;
  IF p_new_deadline IS NULL THEN RAISE EXCEPTION 'reschedule_user_task: novo prazo obrigatório'; END IF;
  IF p_justificativa IS NULL OR length(btrim(p_justificativa)) = 0 THEN
    RAISE EXCEPTION 'reschedule_user_task: justificativa obrigatória';
  END IF;
  IF NOT public.kanban_can_edit_task(p_task_id, v_uid) THEN
    RAISE EXCEPTION 'reschedule_user_task: sem acesso a esta tarefa';
  END IF;
  SELECT deadline_at INTO v_old FROM public.user_tasks WHERE id = p_task_id;
  UPDATE public.user_tasks SET deadline_at = p_new_deadline, updated_at = now() WHERE id = p_task_id;
  -- linha explícita de justificativa (o trigger já logou deadline_at old→new)
  INSERT INTO public.task_audit_log (user_task_id, actor_user_id, field, old_value, new_value)
  VALUES (p_task_id, v_uid, 'reschedule_justificativa',
          COALESCE(v_old::text, 'sem prazo'), btrim(p_justificativa));
  RETURN p_new_deadline;
END; $function$;

GRANT EXECUTE ON FUNCTION public.reschedule_user_task(uuid,timestamptz,text) TO authenticated;
```

- [ ] **Step 2: Verificar que justificativa vazia é bloqueada**

```sql
SELECT public.reschedule_user_task(gen_random_uuid(), now(), '   ');
```
Expected: exceção `justificativa obrigatória` (a ordem das checagens garante que a justificativa é validada antes do acesso à tarefa).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations && git commit -m "feat(tasks): reschedule_user_task com justificativa + preserva prazo original"
```

---

### Task 5: `enqueue_task_chat_alert` — inserir cartão de alerta no chat de um usuário

**Files:**
- Aplicar via `apply_migration`, name: `enqueue_task_chat_alert`.

**Interfaces:**
- Produces:
  `enqueue_task_chat_alert(p_recipient_user_id uuid, p_task_id uuid, p_message text, p_alert_kind text DEFAULT 'task_alert') RETURNS uuid` (retorna o id da `chat_messages` criada).
- Consumes (existentes): `chat_sessions` (acha/cria sessão ativa do destinatário), `chat_messages` (insere com `sequence_number` calculado), `user_tasks` (dados do card).

**Uso:** base compartilhada do card 4.3 (cron de alerta no horário) e do card 4.4 (notificar o criador ao concluir). Grava `metadata.kind = p_alert_kind` e um `payload` que o `TaskAlertCard` (FE) renderiza com botões.

- [ ] **Step 1: Aplicar a função**

```sql
CREATE OR REPLACE FUNCTION public.enqueue_task_chat_alert(
  p_recipient_user_id uuid,
  p_task_id uuid,
  p_message text,
  p_alert_kind text DEFAULT 'task_alert'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_session uuid;
  v_seq integer;
  v_msg_id uuid;
  v_task RECORD;
  v_type_label text;
BEGIN
  IF p_recipient_user_id IS NULL OR p_task_id IS NULL THEN
    RAISE EXCEPTION 'enqueue_task_chat_alert: destinatário e tarefa são obrigatórios';
  END IF;

  SELECT ut.*, tt.display_name AS type_label INTO v_task
  FROM public.user_tasks ut LEFT JOIN public.task_types tt ON tt.id = ut.task_type_id
  WHERE ut.id = p_task_id;
  IF v_task IS NULL THEN RAISE EXCEPTION 'enqueue_task_chat_alert: tarefa não encontrada'; END IF;
  v_type_label := COALESCE(v_task.type_label, '—');

  -- sessão ativa mais recente do destinatário; cria uma se não houver
  SELECT id INTO v_session FROM public.chat_sessions
  WHERE user_id = p_recipient_user_id AND status = 'active'
  ORDER BY last_message_at DESC NULLS LAST LIMIT 1;
  IF v_session IS NULL THEN
    INSERT INTO public.chat_sessions (user_id, title, status)
    VALUES (p_recipient_user_id, 'Alertas', 'active')
    RETURNING id INTO v_session;
  END IF;

  SELECT COALESCE(max(sequence_number), 0) + 1 INTO v_seq
  FROM public.chat_messages WHERE session_id = v_session;

  INSERT INTO public.chat_messages (session_id, user_id, role, content, sequence_number, metadata)
  VALUES (
    v_session, p_recipient_user_id, 'assistant', p_message, v_seq,
    jsonb_build_object(
      'kind', p_alert_kind,
      'agent_name', 'Controlador de Prazos',
      'task_alert', jsonb_build_object(
        'task_id', p_task_id,
        'title', v_task.title,
        'type_label', v_type_label,
        'deadline_at', v_task.deadline_at,
        'client_id', v_task.client_id,
        'status', v_task.status,
        'is_creator_notice', (p_alert_kind = 'task_creator_notice')
      )
    )
  ) RETURNING id INTO v_msg_id;

  UPDATE public.chat_sessions SET last_message_at = now() WHERE id = v_session;
  RETURN v_msg_id;
END; $function$;

GRANT EXECUTE ON FUNCTION public.enqueue_task_chat_alert(uuid,uuid,text,text) TO authenticated;
```

- [ ] **Step 2: Verificar inserção fim-a-fim**

```sql
BEGIN;
SELECT public.enqueue_task_chat_alert(
  (SELECT assigner_user_id FROM user_tasks LIMIT 1),
  (SELECT id FROM user_tasks LIMIT 1),
  'TESTE alerta', 'task_alert');
SELECT metadata->>'kind' AS kind, metadata->'task_alert'->>'title' AS title
FROM chat_messages ORDER BY created_at DESC LIMIT 1;
ROLLBACK;
```
Expected: uma linha com `kind = 'task_alert'` e `title` preenchido.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations && git commit -m "feat(chat): enqueue_task_chat_alert (cartao de alerta de tarefa no chat)"
```

---

### Task 6: Notificar o criador no chat ao concluir a tarefa

**Files:**
- Aplicar via `apply_migration`, name: `notify_creator_on_complete`.

**Interfaces:**
- Produces: trigger `trg_user_tasks_notify_creator_chat` + função `trg_notify_creator_on_complete()`.
- Consumes: `enqueue_task_chat_alert` (Task 5).

**Regra (briefing 4.4):** "criador recebe notificação (chat) com o prazo original visível". Ao virar `completed`, se o criador ≠ concluinte, enfileira um `task_creator_notice` no chat do criador. Não duplica o e-mail (que continua pelo trigger existente).

- [ ] **Step 1: Aplicar função + trigger**

```sql
CREATE OR REPLACE FUNCTION public.trg_notify_creator_on_complete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_prazo text;
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed'
     AND NEW.assigner_user_id IS NOT NULL
     AND NEW.assigner_user_id <> COALESCE(NEW.assignee_user_id, NEW.assigner_user_id) THEN
    v_prazo := CASE WHEN NEW.deadline_at IS NOT NULL
      THEN to_char(NEW.deadline_at AT TIME ZONE 'America/Bahia', 'DD/MM/YYYY HH24:MI')
      ELSE 'sem prazo' END;
    PERFORM public.enqueue_task_chat_alert(
      NEW.assigner_user_id, NEW.id,
      'Tarefa concluída: "' || NEW.title || '" (prazo ' || v_prazo || ').',
      'task_creator_notice');
  END IF;
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS trg_user_tasks_notify_creator_chat ON public.user_tasks;
CREATE TRIGGER trg_user_tasks_notify_creator_chat
AFTER UPDATE OF status ON public.user_tasks
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_creator_on_complete();
```

- [ ] **Step 2: Verificar**

```sql
SELECT tgname FROM pg_trigger WHERE tgname='trg_user_tasks_notify_creator_chat';
```
Expected: 1 linha.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations && git commit -m "feat(tasks): notificar criador no chat ao concluir (prazo original visivel)"
```

---

# FASE 3 — Card 4.5 (horário comercial) — config + util compartilhado

### Task 7: Tabelas de configuração de horário comercial + feriados + RPCs

**Files:**
- Aplicar via `apply_migration`, name: `business_hours_config`.

**Interfaces:**
- Produces:
  - Tabela `business_hours_config` (singleton, id fixo).
  - Tabela `holidays (day date PK, label text)`.
  - `get_business_hours() RETURNS jsonb` (config + feriados; leitura para qualquer autenticado).
  - `set_business_hours(p_config jsonb) RETURNS jsonb` (admin: `is_master_admin`).
- Default (Rodrigo): `open=08:00`, `close=17:00`, `workdays=[1,2,3,4,5]` (seg–sex, ISO), janelas `[["08:00","11:00"],["13:00","16:00"]]`, `tz='America/Bahia'`.

- [ ] **Step 1: Aplicar schema + seed + RPCs**

```sql
CREATE TABLE IF NOT EXISTS public.business_hours_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),           -- singleton
  timezone text NOT NULL DEFAULT 'America/Bahia',
  workdays int[] NOT NULL DEFAULT '{1,2,3,4,5}',             -- ISO dow (1=seg..7=dom)
  open_time time NOT NULL DEFAULT '08:00',
  close_time time NOT NULL DEFAULT '17:00',
  windows jsonb NOT NULL DEFAULT '[["08:00","11:00"],["13:00","16:00"]]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
INSERT INTO public.business_hours_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.holidays (
  day date PRIMARY KEY,
  label text NOT NULL DEFAULT ''
);

ALTER TABLE public.business_hours_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bhc_read ON public.business_hours_config;
CREATE POLICY bhc_read ON public.business_hours_config FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS hol_read ON public.holidays;
CREATE POLICY hol_read ON public.holidays FOR SELECT TO authenticated USING (true);
-- escrita só via RPC (SECURITY DEFINER); sem policy de write direto.

CREATE OR REPLACE FUNCTION public.get_business_hours()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'timezone', c.timezone, 'workdays', to_jsonb(c.workdays),
    'open_time', c.open_time::text, 'close_time', c.close_time::text,
    'windows', c.windows,
    'holidays', COALESCE((SELECT jsonb_agg(h.day ORDER BY h.day) FROM public.holidays h), '[]'::jsonb)
  ) FROM public.business_hours_config c WHERE c.id = true;
$function$;
GRANT EXECUTE ON FUNCTION public.get_business_hours() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_business_hours(p_config jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.is_master_admin(v_uid) THEN
    RAISE EXCEPTION 'set_business_hours: apenas admin';
  END IF;
  UPDATE public.business_hours_config SET
    timezone   = COALESCE(p_config->>'timezone', timezone),
    open_time  = COALESCE((p_config->>'open_time')::time, open_time),
    close_time = COALESCE((p_config->>'close_time')::time, close_time),
    workdays   = COALESCE(
      (SELECT array_agg(x)::int[] FROM jsonb_array_elements_text(p_config->'workdays') AS t(x)),
      workdays),
    windows    = COALESCE(p_config->'windows', windows),
    updated_at = now(), updated_by = v_uid
  WHERE id = true;
  RETURN public.get_business_hours();
END; $function$;
GRANT EXECUTE ON FUNCTION public.set_business_hours(jsonb) TO authenticated;
```

- [ ] **Step 2: Verificar leitura**

```sql
SELECT public.get_business_hours();
```
Expected: JSON com `open_time="08:00:00"`, `close_time="17:00:00"`, `workdays=[1,2,3,4,5]`, `windows=[["08:00","11:00"],["13:00","16:00"]]`, `holidays=[]`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations && git commit -m "feat(agenda): config de horario comercial + feriados + RPCs get/set"
```

---

### Task 8: Util FE `businessHours.ts` (compartilhado com Reuniões/5.2) + testes

**Files:**
- Create: `src/lib/businessHours.ts`
- Test: `src/lib/businessHours.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface BusinessHours { timezone: string; workdays: number[]; open_time: string; close_time: string; windows: [string,string][]; holidays: string[]; }
  export const DEFAULT_BUSINESS_HOURS: BusinessHours;
  export function isWithinBusinessHours(d: Date, cfg?: BusinessHours): boolean;
  export function nextBusinessSlot(d: Date, cfg?: BusinessHours): Date;
  export async function loadBusinessHours(): Promise<BusinessHours>; // RPC get_business_hours c/ fallback default
  ```
- Consumes: `supabase.rpc("get_business_hours")`.

> **Nota de fuso:** para a Trilha A tratamos as horas no fuso local do navegador (escritório único, `America/Bahia`). A config guarda o tz para uso futuro; o util NÃO faz conversão de tz nesta fase (documentar no topo do arquivo). Isso mantém o util testável de forma determinística.

- [ ] **Step 1: Escrever o teste (falha)**

`src/lib/businessHours.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { isWithinBusinessHours, nextBusinessSlot, DEFAULT_BUSINESS_HOURS } from "./businessHours";

const cfg = DEFAULT_BUSINESS_HOURS;

describe("businessHours", () => {
  it("terça 10h está no expediente (janela 08-11)", () => {
    expect(isWithinBusinessHours(new Date(2026, 6, 7, 10, 0), cfg)).toBe(true); // 2026-07-07 = terça
  });
  it("terça 12h (almoço) NÃO está no expediente", () => {
    expect(isWithinBusinessHours(new Date(2026, 6, 7, 12, 0), cfg)).toBe(false);
  });
  it("terça 3h (madrugada) NÃO está no expediente", () => {
    expect(isWithinBusinessHours(new Date(2026, 6, 7, 3, 0), cfg)).toBe(false);
  });
  it("sábado NÃO está no expediente", () => {
    expect(isWithinBusinessHours(new Date(2026, 6, 11, 10, 0), cfg)).toBe(false); // sábado
  });
  it("madrugada de terça → próximo slot é terça 08:00", () => {
    const next = nextBusinessSlot(new Date(2026, 6, 7, 3, 0), cfg);
    expect(next.getHours()).toBe(8);
    expect(next.getDate()).toBe(7);
  });
  it("sexta 18h → próximo slot é segunda 08:00", () => {
    const next = nextBusinessSlot(new Date(2026, 6, 10, 18, 0), cfg); // sexta
    expect(next.getDay()).toBe(1); // segunda
    expect(next.getHours()).toBe(8);
  });
  it("respeita feriado: se terça é feriado, pula para quarta", () => {
    const withHol = { ...cfg, holidays: ["2026-07-07"] };
    const next = nextBusinessSlot(new Date(2026, 6, 7, 9, 0), withHol);
    expect(next.getDate()).toBe(8);
  });
});
```

- [ ] **Step 2: Rodar o teste para vê-lo falhar (CI ou local se houver Node)**

Run: `npx vitest run src/lib/businessHours.test.ts`
Expected: FAIL ("businessHours" não existe). **Local sem Node:** registrar que a verificação será feita no CI da Vercel; anexar o link do job ao concluir.

- [ ] **Step 3: Implementar o util**

`src/lib/businessHours.ts`:
```ts
import { supabase } from "@/integrations/supabase/client";

export interface BusinessHours {
  timezone: string;
  workdays: number[];              // ISO: 1=seg ... 7=dom
  open_time: string;               // "HH:MM"
  close_time: string;              // "HH:MM"
  windows: [string, string][];     // [["08:00","11:00"],["13:00","16:00"]]
  holidays: string[];              // ["YYYY-MM-DD"]
}

// Default do Rodrigo. NB: este util trabalha no fuso local do navegador
// (escritório único, America/Bahia). Não faz conversão de timezone nesta fase.
export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  timezone: "America/Bahia",
  workdays: [1, 2, 3, 4, 5],
  open_time: "08:00",
  close_time: "17:00",
  windows: [["08:00", "11:00"], ["13:00", "16:00"]],
  holidays: [],
};

function isoDow(d: Date): number { const g = d.getDay(); return g === 0 ? 7 : g; } // 1..7
function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function minutes(hhmm: string): number { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; }

function isWorkday(d: Date, cfg: BusinessHours): boolean {
  return cfg.workdays.includes(isoDow(d)) && !cfg.holidays.includes(ymd(d));
}

export function isWithinBusinessHours(d: Date, cfg: BusinessHours = DEFAULT_BUSINESS_HOURS): boolean {
  if (!isWorkday(d, cfg)) return false;
  const cur = d.getHours() * 60 + d.getMinutes();
  return cfg.windows.some(([a, b]) => cur >= minutes(a) && cur < minutes(b));
}

/** Próximo horário útil >= d (início da próxima janela válida). */
export function nextBusinessSlot(d: Date, cfg: BusinessHours = DEFAULT_BUSINESS_HOURS): Date {
  const probe = new Date(d.getTime());
  for (let i = 0; i < 366; i++) {
    if (isWorkday(probe, cfg)) {
      const cur = probe.getHours() * 60 + probe.getMinutes();
      for (const [a, b] of cfg.windows) {
        const start = minutes(a), end = minutes(b);
        if (cur < start) { const r = new Date(probe); r.setHours(Math.floor(start / 60), start % 60, 0, 0); return r; }
        if (cur >= start && cur < end) return new Date(probe); // já dentro
      }
    }
    // vai para o próximo dia às 00:00 e tenta de novo
    probe.setDate(probe.getDate() + 1);
    probe.setHours(0, 0, 0, 0);
  }
  return new Date(d.getTime());
}

export async function loadBusinessHours(): Promise<BusinessHours> {
  try {
    const { data, error } = await supabase.rpc("get_business_hours");
    if (error || !data) return DEFAULT_BUSINESS_HOURS;
    const j = data as Record<string, unknown>;
    return {
      timezone: String(j.timezone ?? DEFAULT_BUSINESS_HOURS.timezone),
      workdays: (j.workdays as number[]) ?? DEFAULT_BUSINESS_HOURS.workdays,
      open_time: String(j.open_time ?? "08:00").slice(0, 5),
      close_time: String(j.close_time ?? "17:00").slice(0, 5),
      windows: (j.windows as [string, string][]) ?? DEFAULT_BUSINESS_HOURS.windows,
      holidays: ((j.holidays as string[]) ?? []).map((s) => String(s).slice(0, 10)),
    };
  } catch { return DEFAULT_BUSINESS_HOURS; }
}
```

- [ ] **Step 4: Rodar o teste para vê-lo passar (CI)**

Run: `npx vitest run src/lib/businessHours.test.ts`
Expected: PASS (7 testes). Local sem Node → confirmar no CI.

- [ ] **Step 5: Commit**

```bash
git add src/lib/businessHours.ts src/lib/businessHours.test.ts
git commit -m "feat(agenda): util businessHours compartilhado + testes"
```

---

# FASE 4 — Card 4.3 (alertas de tarefa no chat, FE) + cron

### Task 9: Cron que dispara alerta no horário da tarefa (respeitando expediente)

**Files:**
- Aplicar via `apply_migration`, name: `notificar_tarefas_no_horario`.

**Interfaces:**
- Produces: `notificar_tarefas_no_horario() RETURNS integer` + job pg_cron `tarefas_no_horario` a cada 5 min.
- Consumes: `enqueue_task_chat_alert` (Task 5); dedup via `task_audit_log` (field `chat_alert_sent`).

**Regra (briefing 4.3 + 4.5):** no horário do prazo, emite o alerta no chat do responsável. "Nada de madrugada": o cron só age dentro do expediente (checa dow/horário no fuso `America/Bahia`); alertas cujo prazo caiu fora do expediente saem no próximo horário útil (naturalmente, pois o cron só dispara no expediente). Dedup: uma vez por tarefa.

- [ ] **Step 1: Aplicar a função de varredura**

```sql
CREATE OR REPLACE FUNCTION public.notificar_tarefas_no_horario()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_count int := 0;
  v_rec RECORD;
  v_now_local timestamp;   -- horário de parede em America/Bahia
  v_dow int;
  v_hm int;
  v_open int; v_close int;
BEGIN
  v_now_local := (now() AT TIME ZONE 'America/Bahia');
  v_dow := EXTRACT(ISODOW FROM v_now_local);            -- 1..7
  v_hm  := EXTRACT(HOUR FROM v_now_local) * 60 + EXTRACT(MINUTE FROM v_now_local);
  SELECT EXTRACT(HOUR FROM open_time)*60+EXTRACT(MINUTE FROM open_time),
         EXTRACT(HOUR FROM close_time)*60+EXTRACT(MINUTE FROM close_time)
    INTO v_open, v_close FROM public.business_hours_config WHERE id = true;

  -- fora do expediente (dia não útil, feriado, ou fora de open..close) → não dispara
  IF NOT (v_dow BETWEEN 1 AND 5) THEN RETURN 0; END IF;
  IF EXISTS (SELECT 1 FROM public.holidays WHERE day = v_now_local::date) THEN RETURN 0; END IF;
  IF v_hm < v_open OR v_hm >= v_close THEN RETURN 0; END IF;

  FOR v_rec IN
    SELECT t.id, t.assignee_user_id
    FROM public.user_tasks t
    WHERE t.assignee_user_id IS NOT NULL
      AND t.deadline_at IS NOT NULL
      AND t.deadline_at <= now()
      AND t.status NOT IN ('completed','cancelled')
      AND NOT EXISTS (
        SELECT 1 FROM public.task_audit_log a
        WHERE a.user_task_id = t.id AND a.field = 'chat_alert_sent'
      )
  LOOP
    PERFORM public.enqueue_task_chat_alert(
      v_rec.assignee_user_id, v_rec.id,
      'Chegou o horário desta tarefa. O que deseja fazer?', 'task_alert');
    INSERT INTO public.task_audit_log (user_task_id, actor_user_id, field, old_value, new_value)
    VALUES (v_rec.id, NULL, 'chat_alert_sent', NULL, now()::text);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END; $function$;
```

- [ ] **Step 2: Agendar o cron (a cada 5 min; a própria função filtra o expediente)**

```sql
SELECT cron.schedule('tarefas_no_horario', '*/5 * * * *',
  'SELECT public.notificar_tarefas_no_horario();');
```

- [ ] **Step 3: Verificar job e execução manual**

```sql
SELECT jobname, schedule FROM cron.job WHERE jobname='tarefas_no_horario';
SELECT public.notificar_tarefas_no_horario();   -- retorna int (0 fora do expediente)
```
Expected: job listado; retorno inteiro sem erro.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations && git commit -m "feat(tasks): cron de alerta de tarefa no horario (respeita expediente)"
```

---

### Task 10: `TaskAlertCard` — cartão de alerta genérico no chat (reusável)

**Files:**
- Create: `src/components/chat/TaskAlertCard.tsx`
- Create: `src/components/chat/RescheduleInline.tsx` (form de reagendamento com justificativa)

**Interfaces:**
- Produces:
  ```ts
  export interface TaskAlertPayload {
    task_id: string; title: string; type_label: string;
    deadline_at: string | null; client_id: string | null;
    status: string; is_creator_notice?: boolean;
  }
  export function TaskAlertCard(props: { payload: TaskAlertPayload }): JSX.Element;
  ```
- Consumes: `updateUserTaskStatus` (`useUserTasks.ts:287`), nova `rescheduleUserTask` (Task 11), `useNavigate` (react-router), `sonner` toast.

**Botões (briefing):** Concluir / Adiar-Reagendar / Abrir cliente / Ver detalhes / Justificar. "Ver detalhes" abre a rota da tarefa; "Abrir cliente" navega ao cliente. Genérico o suficiente para os alertas de reunião (Trilha B) reusarem via um `variant`/props — nesta fase focamos em tarefa.

- [ ] **Step 1: Escrever `RescheduleInline.tsx`**

```tsx
import { useState } from "react";
import { CalendarClock, Check, X } from "lucide-react";
import { rescheduleUserTask } from "@/hooks/useUserTasks";
import { toast } from "sonner";

export function RescheduleInline({ taskId, onDone }: { taskId: string; onDone: () => void }) {
  const [when, setWhen] = useState("");         // datetime-local
  const [justificativa, setJustificativa] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!when) { toast.error("Escolha o novo prazo."); return; }
    if (justificativa.trim().length === 0) { toast.error("Justificativa é obrigatória."); return; }
    setBusy(true);
    try {
      await rescheduleUserTask(taskId, new Date(when).toISOString(), justificativa.trim());
      toast.success("Tarefa reagendada.");
      onDone();
    } catch (e) {
      toast.error((e as { message?: string })?.message ?? "Falha ao reagendar.");
    } finally { setBusy(false); }
  };

  return (
    <div className="action-card__fields" style={{ gap: 8 }}>
      <label style={{ fontSize: 12, color: "var(--text2)" }}>Novo prazo</label>
      <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)}
philosophy        style={{ padding: "6px 8px", borderRadius: 6 }} />
      <label style={{ fontSize: 12, color: "var(--text2)" }}>Justificativa (obrigatória)</label>
      <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)}
        rows={2} placeholder="Por que está sendo reagendada?" style={{ padding: "6px 8px", borderRadius: 6 }} />
      <div className="action-card__actions">
        <button type="button" className="action-card__btn action-card__btn--primary" disabled={busy} onClick={submit}>
          <Check size={14} /> Reagendar
        </button>
        <button type="button" className="action-card__btn action-card__btn--ghost" disabled={busy} onClick={onDone}>
          <X size={14} /> Cancelar
        </button>
      </div>
    </div>
  );
}
```
> ⚠️ Remover o token `philosophy` acima — é um marcador para você conferir que releu o snippet; o `<input>` deve ter apenas `type`, `value`, `onChange`, `style`.

- [ ] **Step 2: Escrever `TaskAlertCard.tsx`**

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlarmClock, Check, CalendarClock, User2, Eye } from "lucide-react";
import { updateUserTaskStatus } from "@/hooks/useUserTasks";
import { RescheduleInline } from "./RescheduleInline";
import { toast } from "sonner";

export interface TaskAlertPayload {
  task_id: string; title: string; type_label: string;
  deadline_at: string | null; client_id: string | null;
  status: string; is_creator_notice?: boolean;
}

function fmt(dt: string | null): string {
  if (!dt) return "sem prazo";
  return new Date(dt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function TaskAlertCard({ payload }: { payload: TaskAlertPayload }) {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"idle" | "reschedule">("idle");
  const [done, setDone] = useState<string | null>(null);

  // Aviso ao criador (tarefa concluída): card informativo, sem ações de execução.
  if (payload.is_creator_notice) {
    return (
      <div className="action-card">
        <div className="action-card__head"><Check size={15} /> Tarefa concluída</div>
        <div className="action-card__desc">
          "{payload.title}" — prazo original {fmt(payload.deadline_at)}.
        </div>
        <div className="action-card__actions">
          <button type="button" className="action-card__btn action-card__btn--ghost"
            onClick={() => nav(`/sistema/tarefas?task=${payload.task_id}`)}>
            <Eye size={14} /> Ver detalhes
          </button>
        </div>
      </div>
    );
  }

  if (done) return <div className="action-card--done"><Check size={15} style={{ color: "#FACC15" }} /> {done}</div>;

  const concluir = async () => {
    setBusy(true);
    try { await updateUserTaskStatus(payload.task_id, "completed"); setDone("Tarefa concluída."); }
    catch (e) { toast.error((e as { message?: string })?.message ?? "Falha ao concluir."); }
    finally { setBusy(false); }
  };

  return (
    <div className="action-card">
      <div className="action-card__head"><AlarmClock size={15} /> Alerta de tarefa</div>
      <div className="action-card__fields">
        <div className="action-card__row"><span className="action-card__label">Tarefa</span><span className="action-card__value">{payload.title}</span></div>
        <div className="action-card__row"><span className="action-card__label">Tipo</span><span className="action-card__value">{payload.type_label}</span></div>
        <div className="action-card__row"><span className="action-card__label">Prazo</span><span className="action-card__value">{fmt(payload.deadline_at)}</span></div>
      </div>
      {mode === "reschedule" ? (
        <RescheduleInline taskId={payload.task_id} onDone={() => { setMode("idle"); setDone("Tarefa reagendada."); }} />
      ) : (
        <div className="action-card__actions" style={{ flexWrap: "wrap" }}>
          <button type="button" className="action-card__btn action-card__btn--primary" disabled={busy} onClick={concluir}>
            <Check size={14} /> Concluir
          </button>
          <button type="button" className="action-card__btn action-card__btn--ghost" disabled={busy} onClick={() => setMode("reschedule")}>
            <CalendarClock size={14} /> Adiar / Reagendar
          </button>
          {payload.client_id && (
            <button type="button" className="action-card__btn action-card__btn--ghost"
              onClick={() => nav(`/sistema/clientes/${payload.client_id}`)}>
              <User2 size={14} /> Abrir cliente
            </button>
          )}
          <button type="button" className="action-card__btn action-card__btn--ghost"
            onClick={() => nav(`/sistema/tarefas?task=${payload.task_id}`)}>
            <Eye size={14} /> Ver detalhes
          </button>
        </div>
      )}
    </div>
  );
}
```
> Confirmar a rota real do cliente e da tarefa lendo `src/App.tsx` (ou o arquivo de rotas) antes de finalizar — ajustar `/sistema/clientes/:id` e `/sistema/tarefas` para as rotas existentes (ex.: `MyInbox`/`TeamDashboard`).

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/TaskAlertCard.tsx src/components/chat/RescheduleInline.tsx
git commit -m "feat(chat): TaskAlertCard + reagendamento inline (generico p/ tarefas e reunioes)"
```

---

### Task 11: Helper FE `rescheduleUserTask` + tipos e wiring do `kind: task_alert`

**Files:**
- Modify: `src/hooks/useUserTasks.ts` (adicionar helper no fim)
- Modify: `src/components/juris-cloud/types.ts:57` (union `kind`) e `:45-66` (campo `taskAlert`)
- Modify: `src/components/juris-cloud/JurisChatPanel.tsx` (render do novo kind + mapping)
- Modify: `src/pages/ChatWithAgent.tsx` (mapping do novo kind, se essa tela também deve exibir alertas)
- Modify: `src/pages/JurisCloudOS.tsx` (reducer `applyRow` — mapear `metadata.task_alert` → `msg.taskAlert` e encerrar "pensando" em `task_alert`)

**Interfaces:**
- Produces: `rescheduleUserTask(taskId, newDeadlineISO, justificativa): Promise<void>`; `JcChatMessage.kind` inclui `"task_alert" | "tarefa_confirm"`; `JcChatMessage.taskAlert?: TaskAlertPayload`.

- [ ] **Step 1: Adicionar `rescheduleUserTask` em `useUserTasks.ts`**

Após `updateUserTaskStatus` (linha 298), acrescentar:
```ts
export async function rescheduleUserTask(
  taskId: string,
  newDeadlineISO: string,
  justificativa: string,
): Promise<void> {
  const { error } = await supabase.rpc("reschedule_user_task", {
    p_task_id: taskId,
    p_new_deadline: newDeadlineISO,
    p_justificativa: justificativa,
  });
  if (error) throw error;
}

export async function claimUserTask(taskId: string): Promise<string> {
  const { data, error } = await supabase.rpc("claim_user_task", { p_task_id: taskId });
  if (error) throw error;
  return data as unknown as string;
}

export interface CreateDepartmentTaskInput {
  task_type_id: string; title: string; description?: string;
  client_id?: string; process_id?: string; priority?: TaskPriority;
  deadline_at?: string; area?: LegalArea; payload?: Record<string, unknown>;
}
export async function createDepartmentTask(input: CreateDepartmentTaskInput): Promise<string> {
  const { data, error } = await supabase.rpc("create_department_task", {
    p_task_type_id: input.task_type_id, p_title: input.title,
    p_description: input.description ?? null, p_client_id: input.client_id ?? null,
    p_process_id: input.process_id ?? null, p_priority: input.priority ?? "medium",
    p_deadline_at: input.deadline_at ?? null, p_area: input.area ?? null,
    p_payload: (input.payload ?? {}) as unknown as Json,
  });
  if (error) throw error;
  return data as unknown as string;
}
```
> As RPCs novas não estarão nos tipos gerados (`supabase/types`). Se o TS reclamar do nome, seguir o padrão de cast já usado em `useAssignableUsers.ts:46` (`supabase as unknown as { rpc: ... }`). Opcionalmente rodar `generate_typescript_types` (MCP) depois e commitar os tipos.

- [ ] **Step 2: Estender o tipo `JcChatMessage`**

Em `src/components/juris-cloud/types.ts`:
- Importar o tipo do payload no topo:
  ```ts
  import type { TaskAlertPayload } from "@/components/chat/TaskAlertCard";
  ```
- Trocar a linha 57 por:
  ```ts
  kind?: "stage" | "final" | "error" | "action_proposal" | "cadastro_form" | "task_alert" | "tarefa_confirm";
  ```
- Adicionar ao interface (perto de `proposal?`):
  ```ts
  /** Presente quando kind === 'task_alert' (vem de metadata.task_alert). */
  taskAlert?: TaskAlertPayload;
  ```

- [ ] **Step 3: Renderizar `TaskAlertCard` no `JurisChatPanel`**

Em `MessageBubble` (após o bloco `action_proposal`, ~linha 74), adicionar:
```tsx
if (msg.kind === "task_alert" && msg.taskAlert) {
  return <TaskAlertCard key={msg.id} payload={msg.taskAlert} />;
}
```
E importar no topo:
```tsx
import { TaskAlertCard } from "@/components/chat/TaskAlertCard";
```

- [ ] **Step 4: Mapear `metadata.task_alert` no reducer do `JurisCloudOS`**

Ler `src/pages/JurisCloudOS.tsx` em torno de `applyRow` (~1017) e da lista de kinds que encerram o "pensando" (~1042). Onde `metadata.kind`/`proposal` são lidos da linha de `chat_messages`, acrescentar o mapeamento análogo:
```ts
// dentro do mapeamento de uma linha de chat_messages para JcChatMessage:
taskAlert: (row.metadata as { task_alert?: TaskAlertPayload } | null)?.task_alert,
```
E incluir `"task_alert"` (e `"tarefa_confirm"`) na condição que encerra o indicador de "pensando" (linha ~1042), ao lado de `final|error|action_proposal|action_done|cancelled|cadastro_form`.

- [ ] **Step 5: (Se aplicável) mapear no `ChatWithAgent.tsx`**

Se a tela `/sistema/chat` também deve exibir alertas: no `map` das mensagens (~271), tratar `m.metadata?.kind === "task_alert"` renderizando `<TaskAlertCard payload={m.metadata.task_alert} />`. Caso a decisão seja alertar só no `/sistema`, pular este step e anotar.

- [ ] **Step 6: Verificação (CI build + preview)**

- CI: `npm run build` / typecheck verdes na Vercel.
- Preview (quando servível): inserir um alerta de teste via `enqueue_task_chat_alert` (MCP `execute_sql`) na sessão do usuário logado e confirmar via `preview_snapshot` que o `TaskAlertCard` aparece com os botões. `preview_console_logs` sem erros.
- Local sem Node: registrar link do CI; verificação visual via preview quando disponível.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useUserTasks.ts src/components/juris-cloud/types.ts src/components/juris-cloud/JurisChatPanel.tsx src/pages/JurisCloudOS.tsx src/pages/ChatWithAgent.tsx
git commit -m "feat(chat): render TaskAlertCard (kind task_alert) + helpers reschedule/claim/dept"
```

---

# FASE 5 — Expor 4.2 e 4.4 nas telas de tarefa existentes

### Task 12: Atribuição a departamento na tela de criação/atribuição

**Files:**
- Modify: `src/pages/AssignTask.tsx` (e/ou `src/components/kanban/AddTaskModal.tsx` — ler ambos e escolher o ponto único de criação).

**Interfaces:**
- Consumes: `createUserTask` (existente), `createDepartmentTask` (Task 11), `useTaskTypes`, `useEligibleAssignees`, `useAssignableUsers`.

**Regra (4.2):** um toggle "Atribuir a: [Usuário] / [Departamento]". Em "Departamento", oculta o seletor de responsável e chama `createDepartmentTask`. Em "Usuário", mantém `createUserTask`. Reusar os dropdowns já existentes.

- [ ] **Step 1: Ler o formulário atual**

Ler `src/pages/AssignTask.tsx` inteiro e `src/components/kanban/AddTaskModal.tsx` para achar onde `createUserTask` é chamado e como o responsável é escolhido.

- [ ] **Step 2: Adicionar o toggle + ramo de departamento**

No estado do form, adicionar `const [target, setTarget] = useState<"user"|"dept">("user")`. Renderizar um par de botões/radio "Usuário | Departamento". No submit:
```ts
if (target === "dept") {
  await createDepartmentTask({ task_type_id, title, description, client_id, deadline_at, priority, area });
} else {
  await createUserTask({ task_type_id, assignee_user_id, title, description, client_id, deadline_at, priority, area });
}
```
Quando `target === "dept"`, desabilitar/ocultar o seletor de responsável e exibir uma nota: "Tarefa do departamento — o primeiro elegível que assumir vira responsável."

- [ ] **Step 3: Verificação (preview)**

- Criar uma tarefa de departamento pela UI; confirmar via `execute_sql`:
  ```sql
  SELECT id, assignee_user_id, status FROM user_tasks ORDER BY created_at DESC LIMIT 1;
  ```
  Expected: `assignee_user_id IS NULL`, `status='assigned'`.
- Confirmar via `preview_snapshot` que o seletor de responsável some no modo Departamento.

- [ ] **Step 4: Commit**

```bash
git add src/pages/AssignTask.tsx src/components/kanban/AddTaskModal.tsx
git commit -m "feat(tasks): atribuicao a departamento (tarefa sem dono) na UI"
```

---

### Task 13: Botão "Assumir" nas listas de tarefa de departamento

**Files:**
- Modify: a tela que lista tarefas de equipe/kanban onde aparecem tarefas sem dono — ler `src/pages/TeamDashboard.tsx`, `src/pages/MyInbox.tsx`, `src/pages/KanbanBoard.tsx` e escolher onde tarefas com `assignee_user_id === null` são visíveis.

**Interfaces:**
- Consumes: `claimUserTask` (Task 11), `useTeamTasks`/`useKanbanBoard` (para refetch após assumir).

**Regra (4.2):** onde um card/linha tem `assignee_user_id == null`, mostrar botão "Assumir". Ao clicar → `claimUserTask(id)` → toast + refetch. Se não elegível, a RPC lança e o toast mostra o motivo.

- [ ] **Step 1: Localizar a renderização de tarefas sem dono**

Ler as telas acima; achar o ponto onde `assignee_name`/`assignee_user_id` é exibido (ex.: `useKanbanBoard` expõe `awaiting_role_code` e `assignee_user_id: null`).

- [ ] **Step 2: Adicionar o botão**

```tsx
{task.assignee_user_id === null && (
  <button type="button" onClick={async () => {
    try { await claimUserTask(task.id); toast.success("Você assumiu a tarefa."); refresh(); }
    catch (e) { toast.error((e as { message?: string })?.message ?? "Não foi possível assumir."); }
  }}>Assumir</button>
)}
```

- [ ] **Step 3: Verificação (preview + DB)**

- Como usuário elegível, clicar "Assumir"; confirmar via `execute_sql` que `assignee_user_id` virou o uid e que há linha em `task_audit_log` com `field='assignee_user_id'`.
- Como não elegível, confirmar toast de erro.

- [ ] **Step 4: Commit**

```bash
git add src/pages/TeamDashboard.tsx src/pages/MyInbox.tsx src/pages/KanbanBoard.tsx
git commit -m "feat(tasks): botao Assumir em tarefa de departamento (claim)"
```

---

### Task 14: Concluir + Reagendar (com justificativa) no detalhe/lista de tarefa

**Files:**
- Modify: a tela de detalhe/ação da tarefa (`src/pages/MyInbox.tsx` e/ou detalhe). Reusar `RescheduleInline` (Task 10) para o reagendamento fora do chat também.

**Interfaces:**
- Consumes: `updateUserTaskStatus(id,'completed',notes)`, `rescheduleUserTask`, `RescheduleInline`.

**Regra (4.4):** "Concluir" grava `completed` (o trigger existente gera o e-mail; a Task 6 notifica o criador no chat). "Reagendar" abre `RescheduleInline` (justificativa obrigatória, bloqueada se vazia). O prazo original fica em `task_audit_log`.

- [ ] **Step 1: Adicionar ações**

Onde há ações da tarefa, adicionar botões "Concluir" e "Reagendar" (este último abre `RescheduleInline` num popover/inline). "Concluir" pode abrir um campo opcional de observação → passa como `notes`.

- [ ] **Step 2: Verificação (DB)**

- Concluir uma tarefa cujo criador ≠ concluinte; confirmar:
  ```sql
  SELECT metadata->>'kind' FROM chat_messages
  WHERE user_id = (SELECT assigner_user_id FROM user_tasks WHERE id='<task>')
  ORDER BY created_at DESC LIMIT 1;   -- 'task_creator_notice'
  SELECT status, completed_at FROM user_tasks WHERE id='<task>';  -- completed + timestamp
  ```
- Reagendar sem justificativa → bloqueado (toast). Com justificativa:
  ```sql
  SELECT field, old_value, new_value FROM task_audit_log
  WHERE user_task_id='<task>' AND field IN ('deadline_at','reschedule_justificativa')
  ORDER BY created_at DESC;   -- old_value do deadline preserva o prazo original
  ```

- [ ] **Step 3: Commit**

```bash
git add src/pages/MyInbox.tsx
git commit -m "feat(tasks): concluir + reagendar com justificativa na UI (preserva prazo original)"
```

---

### Task 15: (4.5 FE) Aviso "fora do expediente" + sugestão de próximo horário útil

**Files:**
- Modify: `src/pages/AssignTask.tsx` / `AddTaskModal.tsx` (usar `businessHours`), `src/components/chat/RescheduleInline.tsx`.
- (Opcional) Create: `src/pages/admin/BusinessHoursSettings.tsx` (tela admin lendo/gravando via `get_business_hours`/`set_business_hours`).

**Interfaces:**
- Consumes: `loadBusinessHours`, `isWithinBusinessHours`, `nextBusinessSlot`.

**Regra (4.5):** ao escolher um prazo fora do expediente, avisar e **sugerir o próximo horário útil** (botão "Usar 08:00 de <dia>"). Nunca bloquear (o usuário pode confirmar mesmo assim), mas nada automático de madrugada.

- [ ] **Step 1: Hook de checagem no seletor de prazo**

Ao mudar o `deadline`/`when`:
```ts
const cfg = await loadBusinessHours(); // memoizar em estado no mount
const chosen = new Date(value);
if (!isWithinBusinessHours(chosen, cfg)) {
  const next = nextBusinessSlot(chosen, cfg);
  setHint(`Fora do expediente. Próximo horário útil: ${next.toLocaleString("pt-BR")}`);
  setSuggested(next);
}
```
Renderizar o aviso + botão "Usar sugestão" que seta o valor para `suggested`.

- [ ] **Step 2: (Opcional) Tela admin de configuração**

Formulário simples (open/close/workdays/windows + lista de feriados) gravando via `set_business_hours`. Só visível para admin. Se o tempo apertar, deixar para um follow-up e documentar (a config já tem defaults corretos).

- [ ] **Step 3: Verificação (preview)**

- Escolher prazo às 03:00 → aparece o aviso e a sugestão de 08:00; clicar "Usar sugestão" ajusta o campo.
- Escolher terça 10:00 → sem aviso.

- [ ] **Step 4: Commit**

```bash
git add src/pages/AssignTask.tsx src/components/chat/RescheduleInline.tsx
git commit -m "feat(agenda): aviso fora do expediente + sugestao de proximo horario util"
```

---

# FASE 6 — Card 4.1 (tarefa via chat: cartão de confirmação editável)

> **Precondição:** CI `edge` verde. Toda mudança de edge aqui é **deployada manualmente pelo Ryan** (nenhum step faz deploy). Após o deploy, rodar os steps de verificação.

### Task 16: Flag `TAREFA_CHAT_ENABLED` + detector determinístico de intenção

**Files:**
- Modify: `supabase/functions/chat-orchestrator/index.ts` (perto da linha 129, junto de `CHAT_TOOLS_ENABLED`).
- Modify: `supabase/functions/chat-orchestrator/intentClassifier.ts` (novo detector, ao lado de `isCadastroClienteRequest`).
- Test: `supabase/functions/chat-orchestrator/intentClassifier.test.ts` (se existir suíte; senão criar).

**Interfaces:**
- Produces: `const TAREFA_CHAT_ENABLED` (edge); `export function isTarefaChatRequest(message: string): boolean`.

**Regra (anti-falso-positivo):** verbo de criação/agenda (criar/agendar/marcar/lembrar/anotar) + alvo tarefa/lembrete OU um padrão de ação com prazo ("ligar pro ... amanhã", "enviar ... até sexta"). Conservador para não colidir com cadastro nem consulta.

- [ ] **Step 1: Escrever o teste do detector**

`intentClassifier.test.ts` (Deno test ou vitest — seguir o que o repo usa; abaixo em estilo vitest):
```ts
import { describe, it, expect } from "vitest";
import { isTarefaChatRequest } from "./intentClassifier";

describe("isTarefaChatRequest", () => {
  it("cria tarefa explícita", () => {
    expect(isTarefaChatRequest("cria uma tarefa pra eu ligar pro João amanhã 10h")).toBe(true);
  });
  it("agendar/lembrete", () => {
    expect(isTarefaChatRequest("me lembra de enviar o contrato até sexta")).toBe(true);
    expect(isTarefaChatRequest("agenda uma tarefa de revisão pra segunda")).toBe(true);
  });
  it("NÃO confunde com cadastro de cliente", () => {
    expect(isTarefaChatRequest("cadastrar cliente João da Silva")).toBe(false);
  });
  it("NÃO confunde com consulta", () => {
    expect(isTarefaChatRequest("quais as tarefas do time hoje?")).toBe(false);
    expect(isTarefaChatRequest("mostra as tarefas atrasadas")).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar (CI) — falha**

Run: `npx vitest run supabase/functions/chat-orchestrator/intentClassifier.test.ts`
Expected: FAIL. Local sem Node → CI.

- [ ] **Step 3: Implementar `isTarefaChatRequest`**

Em `intentClassifier.ts`, ao lado de `isCadastroClienteRequest`:
```ts
// TAREFA-CHAT (card 4.1): detecção determinística de "criar tarefa" pelo chat.
// Conservador: exige verbo de criação/agenda + alvo tarefa/lembrete, OU um verbo
// de ação com marcador de prazo. NUNCA dispara em consulta ("quais/mostra ...").
const TAREFA_CONSULTA_RE = /\b(quais|quantas|mostr\w*|list\w*|ver|status|atrasad\w*|do time|da equipe)\b/i;
const TAREFA_ALVO_RE = /\b(tarefa|tarefas|lembrete|lembra(r|-me)?|to-?do|afazer)\b/i;
const TAREFA_VERBO_RE = /\b(cria(r|ndo)?|agend\w*|marc\w*|anot\w*|abr\w*|nova)\b/i;
// verbo de ação + marcador de prazo relativo (ligar amanhã, enviar até sexta)
const TAREFA_ACAO_PRAZO_RE = /\b(lig\w*|envi\w*|protocol\w*|revis\w*|entreg\w*|retorn\w*|cobr\w*)\b.*\b(hoje|amanh[ãa]|depois de amanh[ãa]|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo|semana que vem|[àa]s?\s*\d{1,2}\s*h|\d{1,2}:\d{2}|at[ée]\s)/i;

export function isTarefaChatRequest(message: string): boolean {
  const m = (message || "").trim();
  if (!m) return false;
  if (TAREFA_CONSULTA_RE.test(m)) return false;
  if (TAREFA_ALVO_RE.test(m) && TAREFA_VERBO_RE.test(m)) return true;
  return TAREFA_ACAO_PRAZO_RE.test(m);
}
```

- [ ] **Step 4: Declarar a flag no `index.ts`**

Perto da linha 129:
```ts
// Card 4.1 — escrita de tarefa pelo chat é DESACOPLADA do tool-calling (CHAT_TOOLS OFF).
// Flag dedicada, reversível. Default ON.
const TAREFA_CHAT_ENABLED = (Deno.env.get("TAREFA_CHAT_ENABLED") ?? "true") === "true";
```
E adicionar `isTarefaChatRequest` ao import da linha 40.

- [ ] **Step 5: Rodar (CI) — passa**

Run: `npx vitest run supabase/functions/chat-orchestrator/intentClassifier.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/chat-orchestrator/index.ts supabase/functions/chat-orchestrator/intentClassifier.ts supabase/functions/chat-orchestrator/intentClassifier.test.ts
git commit -m "feat(chat): flag TAREFA_CHAT_ENABLED + detector isTarefaChatRequest (4.1)"
```

---

### Task 17: Rascunho da tarefa via LLM + resolução de prazo/cliente (edge)

**Files:**
- Create: `supabase/functions/chat-orchestrator/taskDraft.ts` (extração via LLM + normalização).
- Test: `supabase/functions/chat-orchestrator/taskDraft.test.ts` (só a parte pura: normalização/merge; a chamada LLM é injetada).

**Interfaces:**
- Produces:
  ```ts
  export interface TaskDraft {
    title: string | null; description: string | null;
    deadline_at: string | null;          // ISO resolvido, ou null se não resolvido
    deadline_display: string | null;      // "amanhã 10:00" já resolvido p/ conferência
    priority: "critical"|"high"|"medium"|"low" | null;
    client_query: string | null;          // termo p/ resolver cliente (não resolve aqui)
    assignee_hint: string | null;          // nome mencionado, ou null (fica em aberto)
  }
  export function buildTaskDraftPrompt(message: string, nowISO: string, tz: string): string;
  export function normalizeDraft(raw: unknown): TaskDraft; // valida JSON do LLM, tudo opcional/aberto
  ```
- Consumes (no index.ts): infra LLM já existente (`resolveKey`, `providerFromModel`, chamada de completions).

**Princípio:** o parse do LLM é **rascunho**. `normalizeDraft` NUNCA inventa: campo ausente/ambíguo → `null` (fica em aberto no cartão). Datas relativas são resolvidas pedindo ao LLM ISO 8601 dado "hoje é <nowISO> (America/Bahia)".

- [ ] **Step 1: Escrever teste da parte pura**

`taskDraft.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { normalizeDraft } from "./taskDraft";

describe("normalizeDraft", () => {
  it("preenche o que veio e deixa o resto null", () => {
    const d = normalizeDraft({ title: "Ligar pro João", deadline_at: "2026-07-10T13:00:00Z", deadline_display: "amanhã 10:00", priority: "high" });
    expect(d.title).toBe("Ligar pro João");
    expect(d.deadline_at).toBe("2026-07-10T13:00:00Z");
    expect(d.client_query).toBeNull();     // não veio → aberto
    expect(d.assignee_hint).toBeNull();
  });
  it("rejeita prioridade inválida (vira null)", () => {
    expect(normalizeDraft({ priority: "urgentíssimo" }).priority).toBeNull();
  });
  it("entrada não-objeto → tudo null", () => {
    const d = normalizeDraft("lixo");
    expect(d.title).toBeNull(); expect(d.deadline_at).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar (CI) — falha**

Run: `npx vitest run supabase/functions/chat-orchestrator/taskDraft.test.ts` → FAIL.

- [ ] **Step 3: Implementar `taskDraft.ts`**

```ts
export interface TaskDraft {
  title: string | null;
  description: string | null;
  deadline_at: string | null;
  deadline_display: string | null;
  priority: "critical" | "high" | "medium" | "low" | null;
  client_query: string | null;
  assignee_hint: string | null;
}

const PRIORITIES = new Set(["critical", "high", "medium", "low"]);
const s = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export function normalizeDraft(raw: unknown): TaskDraft {
  const o = (raw && typeof raw === "object") ? raw as Record<string, unknown> : {};
  const prio = s(o.priority);
  return {
    title: s(o.title),
    description: s(o.description),
    deadline_at: s(o.deadline_at),
    deadline_display: s(o.deadline_display),
    priority: prio && PRIORITIES.has(prio) ? prio as TaskDraft["priority"] : null,
    client_query: s(o.client_query),
    assignee_hint: s(o.assignee_hint),
  };
}

export function buildTaskDraftPrompt(message: string, nowISO: string, tz: string): string {
  return [
    `Você extrai um RASCUNHO de tarefa a partir de um pedido em linguagem natural.`,
    `Hoje é ${nowISO} (fuso ${tz}). Responda SOMENTE um JSON com as chaves:`,
    `title, description, deadline_at (ISO 8601 absoluto, resolvendo datas relativas contra "hoje"; null se não houver),`,
    `deadline_display (texto curto já resolvido, ex.: "10/07 10:00"), priority (critical|high|medium|low ou null),`,
    `client_query (nome/termo do cliente citado, ou null), assignee_hint (nome do responsável citado, ou null).`,
    `NUNCA invente. Se um campo não estiver claro, use null. Não inclua comentários fora do JSON.`,
    `Pedido: """${message}"""`,
  ].join("\n");
}
```

- [ ] **Step 4: Rodar (CI) — passa**; Run `npx vitest run ...taskDraft.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/chat-orchestrator/taskDraft.ts supabase/functions/chat-orchestrator/taskDraft.test.ts
git commit -m "feat(chat): rascunho de tarefa via LLM (extracao, sem alucinacao) (4.1)"
```

---

### Task 18: Branch determinística no `chat-orchestrator` que emite `tarefa_confirm`

**Files:**
- Modify: `supabase/functions/chat-orchestrator/index.ts` — inserir um bloco logo APÓS a branch de cadastro (após a linha 2941), ANTES da continuidade de coleta.

**Interfaces:**
- Consumes: `TAREFA_CHAT_ENABLED`, `isTarefaChatRequest`, `buildTaskDraftPrompt`/`normalizeDraft`, `resolveKey`, chamada LLM não-streaming, `consultar_cliente`/`clientResolver` (para resolver `client_query`), `nextSeq`, `admin.from("chat_messages").insert`.
- Produces: linha `chat_messages` com `metadata.kind: "tarefa_confirm"` + `metadata.tarefa_draft` (draft resolvido + candidatos de cliente).

**Fluxo (espelha o cadastro, linhas 2913-2941):** cria `orchestration_runs` (status done, route "fast"), roda 1 chamada LLM de extração (sem tools), normaliza, resolve `client_query` (via `agent_consultar_cliente`: 0→aberto, 1→resolvido, N→lista de candidatos para desambiguar), monta `tarefa_draft`, insere a mensagem e retorna 202. **Não** chama a cadeia agêntica.

- [ ] **Step 1: Adicionar o bloco (após 2941)**

```ts
// ─── TAREFA-CHAT (4.1): cartão de confirmação editável, desacoplado ───────────
// Sem tool-calling (CHAT_TOOLS OFF). Detecção determinística + 1 chamada LLM de
// EXTRAÇÃO (rascunho). O front renderiza um cartão editável (metadata.kind=
// "tarefa_confirm"); só no CONFIRMAR o FE chama create_user_task. Zero alucinação:
// campos não resolvidos vão null (abertos); cliente ambíguo vira lista p/ escolher.
if (TAREFA_CHAT_ENABLED && isTarefaChatRequest(body.message)) {
  const { data: tRun } = await admin.from("orchestration_runs").insert({
    session_id: body.sessionId, user_id: userId, user_message_id: userMsgId,
    original_message: body.message, status: "done", entry_agent_id: agent.id,
    intent_category: "ACAO_COM_TOOL", route_path: "fast",
    chain: [{ level: 0, path: "tarefa_confirm", intent: "ACAO_COM_TOOL", agent: agent.name }],
  }).select("id").single();
  const tRunId = (tRun as { id: string } | null)?.id ?? null;

  const nowISO = new Date().toISOString();
  let draft = normalizeDraft(null);
  try {
    const raw = await llmExtractJson(agent, key, buildTaskDraftPrompt(body.message, nowISO, "America/Bahia"));
    draft = normalizeDraft(raw);
  } catch (_e) { /* rascunho vazio → cartão todo em aberto (nunca chuta) */ }

  // Resolver cliente citado (não bloqueia; ambíguo → candidatos).
  let clientResolved: { id: string; name: string } | null = null;
  let clientCandidates: { id: string; name: string }[] = [];
  if (draft.client_query) {
    const { data: cli } = await admin.rpc("agent_consultar_cliente", { p_query: draft.client_query });
    const rows = (cli as { id: string; full_name?: string; name?: string }[] | null) ?? [];
    if (rows.length === 1) clientResolved = { id: rows[0].id, name: rows[0].full_name ?? rows[0].name ?? "" };
    else if (rows.length > 1) clientCandidates = rows.slice(0, 5).map(r => ({ id: r.id, name: r.full_name ?? r.name ?? "" }));
  }

  const tSeq = await nextSeq(admin, body.sessionId);
  await admin.from("chat_messages").insert({
    session_id: body.sessionId, user_id: userId, role: "assistant", agent_id: agent.id,
    content: "Preparei um rascunho da tarefa. Revise, ajuste o que precisar e confirme:",
    sequence_number: tSeq,
    metadata: {
      kind: "tarefa_confirm", intent: "ACAO_COM_TOOL", agent_name: agent.name,
      tarefa_draft: {
        title: draft.title, description: draft.description,
        deadline_at: draft.deadline_at, deadline_display: draft.deadline_display,
        priority: draft.priority, assignee_hint: draft.assignee_hint,
        client_query: draft.client_query,
        client_resolved: clientResolved, client_candidates: clientCandidates,
      },
    },
  });
  await admin.rpc("increment_session_counters", { p_session_id: body.sessionId, p_tokens_in: 0, p_tokens_out: 0, p_cost: 0 }).then(() => {}, () => {});
  return json(202, { runId: tRunId, sessionId: body.sessionId, status: "done", path: "tarefa_confirm", intent: "ACAO_COM_TOOL" });
}
```

- [ ] **Step 2: Implementar `llmExtractJson` (helper local no index.ts)**

Adicionar uma função auxiliar que faz UMA chamada de completions não-streaming, `response_format` JSON quando o provedor suportar, e faz `JSON.parse` tolerante. Reusar o mesmo caminho de chamada que o especialista usa (localizar a função de completions já existente no arquivo — ex.: a usada em `CONSULTA`/N3 — e extrair uma variante "single-shot, sem tools"). Assinatura:
```ts
async function llmExtractJson(agent: AgentRow, apiKey: string, prompt: string): Promise<unknown>
```
> Nota ao implementador: NÃO criar um novo cliente HTTP; reusar o wrapper de LLM já presente no `index.ts`. Se a extração falhar/timeout, o catch acima deixa o rascunho vazio (cartão todo em aberto) — comportamento aceitável e seguro.

- [ ] **Step 3: Confirmar `agent_consultar_cliente` (assinatura real)**

```sql
SELECT pg_get_function_arguments(oid), pg_get_function_result(oid)
FROM pg_proc WHERE proname='agent_consultar_cliente';
```
Ajustar o nome do parâmetro (`p_query` vs outro) e os campos retornados no código do Step 1 conforme o resultado.

- [ ] **Step 4: Verificação (após deploy manual do Ryan)**

- Enviar no chat: "cria uma tarefa pra eu ligar pro João amanhã 10h".
- Confirmar via `execute_sql` que a última `chat_messages` tem `metadata->>'kind' = 'tarefa_confirm'` e `metadata->'tarefa_draft'->>'deadline_at'` resolvido para amanhã 10:00 (fuso Bahia), com `title` preenchido.
- Enviar um pedido com cliente ambíguo → `client_candidates` com >1 item.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/chat-orchestrator/index.ts
git commit -m "feat(chat): branch tarefa_confirm no orchestrator (rascunho + resolucao cliente) (4.1)"
```

---

### Task 19: `TarefaConfirmCard` — cartão editável + criação determinística

**Files:**
- Create: `src/components/chat/TarefaConfirmCard.tsx`
- Modify: `src/components/juris-cloud/types.ts` (campo `tarefaDraft?`), `JurisChatPanel.tsx` (render), `JurisCloudOS.tsx` (mapping), `ChatWithAgent.tsx` (se aplicável).

**Interfaces:**
- Produces: `TarefaConfirmCard({ draft }: { draft: TarefaDraft })`.
- Consumes: `useTaskTypes`, `useAssignableUsers`, `useEligibleAssignees`, `createUserTask` (existente). Client: busca simples (reusar padrão de `Clients.tsx`) para trocar/desambiguar cliente.

**Regra (inegociável):** cartão vem pré-preenchido pelo rascunho, **editável**; **confirmação obrigatória**. Campos não resolvidos aparecem **em aberto** (destacados). Só no "Confirmar" chama `createUserTask` uma única vez. "Corrigir/Cancelar" ajusta antes de gravar. Após criar, mostra estado de sucesso (não recria em re-render).

- [ ] **Step 1: Definir o tipo do draft e o mapping (igual ao task_alert da Task 11)**

Em `types.ts`:
```ts
export interface TarefaDraft {
  title: string | null; description: string | null;
  deadline_at: string | null; deadline_display: string | null;
  priority: "critical"|"high"|"medium"|"low" | null;
  assignee_hint: string | null; client_query: string | null;
  client_resolved: { id: string; name: string } | null;
  client_candidates: { id: string; name: string }[];
}
```
Adicionar `tarefaDraft?: TarefaDraft;` ao `JcChatMessage`. No reducer do `JurisCloudOS` mapear `metadata.tarefa_draft` → `msg.tarefaDraft` e encerrar "pensando" em `tarefa_confirm` (já incluído na Task 11 Step 4).

- [ ] **Step 2: Escrever `TarefaConfirmCard.tsx`**

Componente com estado local inicializado do `draft`:
- `taskTypeId` (select via `useTaskTypes`; obrigatório — se o rascunho não sugere tipo, começa vazio/aberto).
- `title` (input, do draft), `description` (textarea).
- `deadline` (datetime-local; se `deadline_at` veio, pré-seleciona; senão aberto). Mostrar `deadline_display` como dica.
- `priority` (select; default "medium" se null).
- `assignee`: dropdown via `useEligibleAssignees(taskTypeId)` (cai para `useAssignableUsers` se o tipo não estiver escolhido). Se `assignee_hint` casar com um nome, pré-selecionar; senão **em aberto**.
- `client`: se `client_resolved` → mostra o nome com opção "trocar"; se `client_candidates.length>1` → select de desambiguação (destaque "escolha o cliente"); se nada → campo de busca opcional.
- Botões: **Confirmar** (desabilitado até `taskTypeId`+`title`+`assignee` presentes), **Corrigir** (mantém aberto), **Cancelar**.
- `onConfirm`: `await createUserTask({...})` uma vez; on success → estado "Tarefa criada." (guardar `createdId`, não re-submeter).

Estrutura de referência (seguir classes `action-card__*` do `ActionCard`/CSS existente):
```tsx
import { useMemo, useState } from "react";
import { Check, Pencil, X, ClipboardList, AlertCircle } from "lucide-react";
import { useTaskTypes, useEligibleAssignees, createUserTask } from "@/hooks/useUserTasks";
import { useAssignableUsers } from "@/hooks/useAssignableUsers";
import type { TarefaDraft } from "@/components/juris-cloud/types";
import { toast } from "sonner";

export function TarefaConfirmCard({ draft }: { draft: TarefaDraft }) {
  const { types } = useTaskTypes();
  const [taskTypeId, setTaskTypeId] = useState<string>("");
  const [title, setTitle] = useState(draft.title ?? "");
  const [description, setDescription] = useState(draft.description ?? "");
  const [deadline, setDeadline] = useState(draft.deadline_at ? toLocalInput(draft.deadline_at) : "");
  const [priority, setPriority] = useState(draft.priority ?? "medium");
  const [clientId, setClientId] = useState<string | null>(draft.client_resolved?.id ?? null);
  const [assignee, setAssignee] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(false);

  const { assignees } = useEligibleAssignees(taskTypeId || null);
  const { users } = useAssignableUsers();
  const assigneeOptions = useMemo(
    () => (taskTypeId ? assignees.map(a => ({ id: a.user_id, name: a.full_name })) : users.map(u => ({ id: u.user_id, name: u.name }))),
    [taskTypeId, assignees, users],
  );

  const canConfirm = !!taskTypeId && title.trim().length > 0 && !!assignee && !busy;

  const confirm = async () => {
    setBusy(true);
    try {
      await createUserTask({
        task_type_id: taskTypeId, assignee_user_id: assignee, title: title.trim(),
        description: description.trim() || undefined,
        client_id: clientId ?? undefined,
        deadline_at: deadline ? new Date(deadline).toISOString() : undefined,
        priority,
      });
      setCreated(true);
      toast.success("Tarefa criada.");
    } catch (e) {
      toast.error((e as { message?: string })?.message ?? "Falha ao criar tarefa.");
    } finally { setBusy(false); }
  };

  if (created) return <div className="action-card--done"><Check size={15} style={{ color: "#FACC15" }} /> Tarefa criada.</div>;

  return (
    <div className="action-card">
      <div className="action-card__head"><ClipboardList size={15} /> Confirmar tarefa</div>
      {/* tipo (obrigatório) */}
      <label>Tipo de tarefa</label>
      <select value={taskTypeId} onChange={e => { setTaskTypeId(e.target.value); setAssignee(""); }}>
        <option value="">Selecione…</option>
        {types.map(t => <option key={t.id} value={t.id}>{t.display_name}</option>)}
      </select>
      <label>Título</label>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="O que fazer" />
      <label>Descrição</label>
      <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} />
      <label>Prazo {draft.deadline_display && <span style={{ color: "var(--text2)" }}>(sugerido: {draft.deadline_display})</span>}</label>
      <input type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} />
      <label>Prioridade</label>
      <select value={priority ?? "medium"} onChange={e => setPriority(e.target.value as TarefaDraft["priority"])}>
        <option value="critical">Crítica</option><option value="high">Alta</option>
        <option value="medium">Média</option><option value="low">Baixa</option>
      </select>
      {/* responsável — em aberto se não resolvido */}
      <label>Responsável {!assignee && <span style={{ color: "#EAB308" }}><AlertCircle size={12} /> em aberto</span>}</label>
      <select value={assignee} onChange={e => setAssignee(e.target.value)}>
        <option value="">Selecione…</option>
        {assigneeOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      {/* cliente: resolvido / desambiguação / aberto */}
      {draft.client_candidates.length > 1 && (
        <>
          <label style={{ color: "#EAB308" }}><AlertCircle size={12} /> Cliente ambíguo — escolha</label>
          <select value={clientId ?? ""} onChange={e => setClientId(e.target.value || null)}>
            <option value="">Sem cliente</option>
            {draft.client_candidates.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </>
      )}
      {draft.client_resolved && <div className="action-card__row"><span className="action-card__label">Cliente</span><span className="action-card__value">{draft.client_resolved.name}</span></div>}
      <div className="action-card__actions">
        <button type="button" className="action-card__btn action-card__btn--primary" disabled={!canConfirm} onClick={confirm}>
          <Check size={15} /> Confirmar
        </button>
        <button type="button" className="action-card__btn action-card__btn--ghost" disabled={busy}
          onClick={() => toast.message("Ajuste os campos e confirme quando estiver certo.")}>
          <Pencil size={14} /> Corrigir
        </button>
      </div>
    </div>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
```
> Ajustar os elementos de form ao CSS do projeto (o `ActionCard` usa classes próprias; reusar `.action-card__fields`/labels como no `RescheduleInline`). Sem libs novas.

- [ ] **Step 3: Renderizar no `JurisChatPanel` (e mapping)**

Em `MessageBubble`, adicionar:
```tsx
if (msg.kind === "tarefa_confirm" && msg.tarefaDraft) {
  return <TarefaConfirmCard key={msg.id} draft={msg.tarefaDraft} />;
}
```
Import no topo. Mapear `metadata.tarefa_draft → msg.tarefaDraft` no reducer do `JurisCloudOS` (mesma linha da Task 11 Step 4).

- [ ] **Step 4: Verificação (preview, após deploy do edge)**

- Enviar "cria uma tarefa pra eu ligar pro João amanhã 10h" no `/sistema`.
- `preview_snapshot`: aparece o `TarefaConfirmCard` com título e prazo pré-preenchidos, responsável "em aberto".
- Escolher tipo + responsável, clicar Confirmar; confirmar via `execute_sql`:
  ```sql
  SELECT title, deadline_at, assignee_user_id FROM user_tasks ORDER BY created_at DESC LIMIT 1;
  ```
- Clicar Confirmar 2x rápido → só 1 tarefa (estado `created` trava). Verificar contagem.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/TarefaConfirmCard.tsx src/components/juris-cloud/types.ts src/components/juris-cloud/JurisChatPanel.tsx src/pages/JurisCloudOS.tsx src/pages/ChatWithAgent.tsx
git commit -m "feat(chat): TarefaConfirmCard editavel -> create_user_task deterministico (4.1)"
```

---

# Verificação final (aceite do briefing)

- [ ] **4.2** — Criar tarefa para usuário e para departamento; um elegível "assume" e vira responsável; `task_audit_log` registra `assignee_user_id` (assumir) e reatribuição.
- [ ] **4.4** — Concluir grava `completed`+`completed_at`; reagendar sem justificativa é bloqueado; com justificativa preserva o prazo original (audit `deadline_at` old_value) e o criador recebe `task_creator_notice` no chat com o prazo original visível.
- [ ] **4.3** — No horário, `TaskAlertCard` aparece no chat do responsável com Concluir/Reagendar/Abrir cliente/Ver detalhes, e as ações funcionam.
- [ ] **4.5** — Prazo fora do expediente avisa e sugere o próximo horário útil; o cron não dispara de madrugada/fim de semana/feriado; config em `business_hours_config`.
- [ ] **4.1** — Pedido em linguagem natural → `TarefaConfirmCard` pré-preenchido e editável → Confirmar cria via `create_user_task` (uma vez); campos não resolvidos ficam em aberto; cliente ambíguo pede desambiguação; `CHAT_TOOLS_ENABLED` OFF; `TAREFA_CHAT_ENABLED` liga/desliga.

## Self-Review (feita pelo autor do plano)

- **Cobertura do spec:** 4.1→Tasks 16-19; 4.2→Tasks 1-3,12,13; 4.3→Tasks 9-11; 4.4→Tasks 4-6,14; 4.5→Tasks 7,8,15. ✔
- **Placeholders:** os dois marcadores propositais (`philosophy` no `RescheduleInline`; e rotas `/sistema/...` a confirmar) estão sinalizados com aviso para o implementador confirmar/remover. Nenhum "TODO" silencioso.
- **Consistência de tipos:** `TaskAlertPayload` (Task 10) e `TarefaDraft` (Task 19) são a fonte; `JcChatMessage` importa ambos; helpers `rescheduleUserTask`/`claimUserTask`/`createDepartmentTask` (Task 11) batem com as RPCs (Tasks 2-4). Status usa o enum real (`completed`). ✔
- **Riscos conhecidos:** (a) o mapping no reducer do `JurisCloudOS.tsx` precisa ser lido antes de editar (não vi o corpo exato de `applyRow`); (b) `agent_consultar_cliente` — confirmar assinatura/campos (Task 18 Step 3); (c) reusar o wrapper LLM existente para `llmExtractJson` (Task 18 Step 2) sem criar cliente HTTP novo; (d) deploy do edge é manual do Ryan.
