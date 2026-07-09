# Trilha D — Google Agenda: scaffolding client-side (encaixe pronto)

**Data:** 2026-07-09
**Natureza:** integração externa (Google Calendar). Scaffolding local apenas.
**Dependência:** tabela de reuniões da Trilha B (5.1) — já em produção.

## Contexto e estado atual (auditado)

Antes de qualquer trabalho, o estado real foi auditado no repo e no banco de produção
(projeto `tsltxvswzdnlmvljpryh`). Conclusão: **quase todo o escopo de "hoje" do briefing
já foi entregue pela sessão da Trilha B.**

- **Colunas de vínculo — JÁ EXISTEM** em `public.meetings`, tanto no repo
  (`supabase/migrations/20260709120000_meetings_agenda_5_1.sql`) quanto em produção
  (confirmado por consulta a `information_schema.columns`):
  `google_event_id`, `google_calendar_id`, `google_sync_status`, `last_synced_at`.
  Os tipos gerados (`src/integrations/supabase/types.ts`) também já as incluem.
  → **Nenhum `apply_migration` é necessário.** Coerente com a regra de não mexer em
  schema já em produção (R-2) e não reconciliar schema alheio.
- **Botão "Sincronizar com Google Agenda" — JÁ EXISTE e está desabilitado**, com tooltip
  "Requer conexão Google (em breve)", em `src/components/agenda/MeetingDetailModal.tsx`.
  Hoje é 100% inerte (não chama nada).

**O que realmente falta de "hoje":** apenas o **ponto de extensão no código** — a função
`syncMeetingToGoogle(meetingId)`, que ainda não existe.

**Fora de escopo (confirmado):**
- Audiências: não há tabela/tela de audiências no sistema; "audiência" só aparece em
  contextos não relacionados (cadastro de cliente, KPIs). Adiado junto com o resto.
- OAuth Google, credenciais no Vault, edge function de sync, decisão uni/bidirecional.

## Objetivo

Deixar **um único ponto de extensão** no frontend para o sync futuro, sem chamada de API,
sem OAuth, sem tocar no banco. Quando as credenciais e a edge function existirem, o encaixe
é "ligar a chave" e implementar o corpo da função.

## Componentes

### 1. `src/lib/googleCalendarSync.ts` (novo)

- `export const GOOGLE_SYNC_ENABLED = false;`
  Flag única que controla o encaixe. Vira `true` (ou passa a ler de env) quando OAuth +
  edge function + Vault existirem.
- `export type SyncResult = { status: "not_configured" | "synced" | "error"; message?: string; eventId?: string | null };`
- `export async function syncMeetingToGoogle(meetingId: string): Promise<SyncResult>`
  - Hoje: retorna `{ status: "not_configured", message: "Integração Google Agenda ainda não configurada." }`.
  - **Não lança** — degrada suave, para o caller nunca quebrar.
  - Contém bloco `// TODO Trilha D` comentado mostrando exatamente onde entrará o
    `supabase.functions.invoke("google-calendar-sync", { body: { meetingId } })`.
- Comentário de cabeçalho: identifica o arquivo como o ponto de extensão da Trilha D e
  lista o que está adiado (uni/bi + credenciais no Vault, nunca hardcode — R-6/R-8).

### 2. Fiação do botão em `src/components/agenda/MeetingDetailModal.tsx`

- Trocar o `disabled` fixo por `disabled={!GOOGLE_SYNC_ENABLED || !isEdit}`
  (sync só faz sentido para reunião já salva, com `meeting.id`).
- `onClick` chama `syncMeetingToGoogle(meeting.id)` e mostra `toast` conforme o `status`
  retornado. Como o botão fica desabilitado (flag `false`), **não dispara agora** — a
  fiação fica pronta para o dia em que a flag virar.
- Tooltip permanece "Requer conexão Google (em breve)" enquanto desabilitado.

### 3. `src/lib/__tests__/googleCalendarSync.test.ts` (novo)

- Trava o contrato: com `GOOGLE_SYNC_ENABLED === false`, `syncMeetingToGoogle(id)` resolve
  `status: "not_configured"` e não lança.
- Segue o padrão de `src/lib/__tests__/meetings.test.ts`. Roda só no CI (sem Node local).

## Fluxo de dados

Hoje: botão (desabilitado) → `syncMeetingToGoogle` → short-circuit `not_configured`.

Futuro (adiado): botão (habilitado) → `syncMeetingToGoogle(meetingId)` →
`supabase.functions.invoke("google-calendar-sync")` → edge lê credenciais do Vault, cria/
atualiza evento no Google, grava `meetings.google_*` → retorna `eventId` → toast de sucesso.

## Tratamento de erro

- `syncMeetingToGoogle` nunca lança; sempre retorna `SyncResult` tipado.
- O caller decide o toast pelo `status` (`synced` → sucesso; `error` → erro; `not_configured`
  → informativo). Hoje só o caminho `not_configured` é alcançável (e nem isso, pois o botão
  está desabilitado).

## Aceite

- Stub no lugar; botão fiado porém desabilitado; teste de contrato passando (CI); nada
  quebra; **zero migration**; nada tocado no banco.

## Restrições respeitadas

- Sem `db push`; sem `apply_migration` (colunas já existem — R-2).
- Credenciais sempre no Vault, nunca no código (R-6/R-8) — apenas documentado, nada
  implementado hoje.
