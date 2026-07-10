# Design — Ciclo da Agenda de Reuniões pelo chat

- **Data:** 2026-07-10
- **Trilha:** B (Agenda) — extensão para o chat
- **Escopo:** habilitar agendar / confirmar / realizar / reagendar / cancelar / não-comparecimento
  de reuniões (tabela `meetings`, Agenda) diretamente pelo chat.
- **Restrições duras:** sem DDL, sem `db push`. Só edge (chat-orchestrator) + UI. Deploy do edge é
  manual do Ryan (CI `edge` verde + redeploy do `chat-orchestrator`).

## Contexto verificado (produção — projeto `tsltxvswzdnlmvljpryh`)

As RPCs da Agenda **já existem em produção** e já aplicam todas as regras server-side. Confirmado por
introspecção (não pela migration do repo — ver "Divergência repo↔prod"):

| Ação | RPC (prod) | Regras que a RPC já aplica |
|---|---|---|
| Agendar | `create_meeting(p_scheduled_date date, p_start_time time, p_client_id, p_client_name, p_phone, p_end_time, p_type, p_lawyer_user_id, p_receptionist_user_id, p_summary, p_notes, p_status)` | `meetings_can_create()` (recepção-only), janela/feriado (`meeting_slot_is_valid`), capacidade (`slot cheio`) |
| Confirmar/Realizar/Cancelar/Não-comp. | `update_meeting(p_id, …, p_status)` | recepção-only, máquina de estados (terminais travados), revalida janela/capacidade |
| Reagendar | `update_meeting(p_id, nova date/time, …)` | idem |
| Slots livres | `get_available_slots(p_date date) → setof time` | esconde os cheios; fonte única do seletor |
| Histórico | `get_meeting_audit(p_meeting_id)` | leitura |

- `meetings_can_create()` (prod) = `role_templates.code IN ('socio','lider_recepcao','recepcionista','estagiaria_recepcao')`
  **OU** `is_master_admin` **OU** `has_role('admin')`. **Advogado NÃO está incluído** → aceite #5 é garantido pela RPC.
- Enum `meeting_status` (prod) = `{scheduled, confirmed, rescheduled, canceled, no_show, done}` (igual a `src/lib/meetings.ts`).
- Mensagens de erro cruas da RPC (strings exatas usadas na tradução):
  - `create_meeting: slot cheio (capacidade % atingida)`
  - `create_meeting: horário fora do expediente (dia útil/janela/feriado)`
  - `create_meeting: sem permissão (apenas recepção)` (idem `update_meeting:`)
  - `update_meeting: "<status>" é estado final e não pode ser alterado`
- **Capacidade efetiva em prod = 1** (`business_hours_config`, linha `id=true`, `max_parallel=1`). O *default da
  coluna* é 2, mas não é o valor vigente. O valor efetivo vem sempre da config; nunca cravar no código.

### Divergência repo↔prod (load-bearing — decisão do dono pendente)

Estado **verificado em produção** (introspecção em 2026-07-10):

| Objeto | Repo (migrations 5.1/5.2) | Produção |
|---|---|---|
| `create_meeting` / `update_meeting` (gate) | `meetings_can_access()` (inclui `adv_%`) | `meetings_can_create()` (recepção/sócio/admin — **exclui advogado**) |
| `meetings_can_create` | **não existe** | existe |
| Policy de leitura de `meetings` | `USING (meetings_can_access())` | `USING (meetings_can_create() OR lawyer_user_id = auth.uid())` (R3: advogado vê só a própria agenda) |

**Consequência (por que é load-bearing):** o aceite #5 (advogado bloqueado), a regra 4 e a R3 dependem de objetos
que **só existem em produção** e **não têm representação no repo**. Se alguém reconciliar o schema aplicando as
migrations do repo, reverte recepção-only e a visão-própria do advogado → **regressão de segurança**.

**Fato que corrige o review:** os "espelhos" dessas mudanças de prod **não existem como arquivo** em lugar nenhum
(conferido: nenhum worktree, `git log --all` vazio para `recepcao_only`/`adv_own_only`). Só
`20260709210000_trilha_b_fix_assignee_realtime.sql` existe (e já está commitado). A outra sessão aplicou direto em
prod via MCP `apply_migration`, sem gerar arquivo. Logo, reconciliar **não** é `git add` — é **autorar** migrations
`CREATE OR REPLACE` fiéis ao def exato de prod (`meetings_can_create`, os dois gates recepção-only, a policy de
leitura R3).

**Status:** decisão do dono (marcada como "dedup escalada" na memória). Fora do escopo deste spec por padrão
(chat feature). Se autorizado, vira um **passo separado** no plano: gerar as migrations a partir do def real de
produção (nunca à mão), commitar sem `db push` (já aplicadas). Ver "Correção 0" no review de 2026-07-10.

## Decisões (do dono)

1. **`agendar_reuniao` (registry) → retirada.** Hoje ela chama `criar_pendencia(tipo='reuniao')` (cria pendência, não
   entra na Agenda). Fica **removida** de `tools/registry.ts` + `tools/handlers.ts`. O ciclo da Agenda passa a viver
   100% no fast-path determinístico + cartões (abaixo). Aposenta a "pendência-reunião".
2. **UX = cartão editável determinístico** (estilo `tarefa_confirm` / 4.1), **não** tool-calling agêntico.
   Consequência: **não** criar as write-tools agênticas que o briefing listava (`agendar_atendimento`,
   `atualizar_status_reuniao`, `reagendar_atendimento`) — seriam um segundo mecanismo redundante.

## Arquitetura

Espelha o padrão determinístico já usado por `cadastro_form` e `tarefa_confirm` em
`supabase/functions/chat-orchestrator/index.ts`:

```
mensagem do usuário
  → detector determinístico (ANTES do classificador, não gasta LLM de classificação)
  → 1 chamada LLM sem tools (jsonMode) extrai um RASCUNHO (nunca inventa; falha → rascunho vazio)
  → resolve cliente/reunião com o JWT do usuário (RLS/regra-4 valem); CPF mascarado imediatamente
  → insere chat_messages (role=assistant) com metadata.kind próprio + payload do rascunho
  → o FRONT renderiza um cartão editável
  → no "Confirmar", o FRONT chama a RPC client-side (create_meeting/update_meeting) sob o JWT
     (a RPC de prod aplica recepção-only + capacidade + janela + máquina de estados)
```

### Fase 0 — detector SEMPRE-ligado (desacoplado do flag) [corrige bug atual]

O detector determinístico + curto-circuito de roteamento roda **SEMPRE**, independente de qualquer flag. O flag
`AGENDA_CHAT_ENABLED` controla **apenas** se a recepção recebe o **cartão interativo** ou uma **mensagem estática**.
Isso incorpora o `FIX-CHAT-AGENDAMENTO-MISROUTE-PERMISSAO.md` como fase 0: entrega valor (mata o misroute) **sem**
ligar a feature.

Motivo: se o detector ficasse atrás do flag (como o `tarefa_confirm` fica atrás de `TAREFA_CHAT_ENABLED`), com o
flag OFF "agendar reunião" cairia no classificador → Especialista de Confecção → **gera peça/.docx** (o bug
reportado em 2026-07-10). O detector sempre-ligado garante que agendamento **nunca** chegue à trilha de peça.

Comportamento do detector (nesta ordem, antes do classificador):

1. Não reconheceu intenção de agendamento/ciclo → segue o fluxo normal (classificador). Detector **conservador**
   (ver testes de falso-positivo) para não sequestrar pedido real de peça.
2. Reconheceu, mas usuário **não é recepção/sócio/admin** (checagem de papel **no detector**, espelhando o
   predicado de `meetings_can_create`: `role_templates.code ∈ {socio, lider_recepcao, recepcionista,
   estagiaria_recepcao}` OU `is_master_admin` OU `has_role('admin')`) → **mensagem de permissão de cara**
   ("Agendamentos são feitos pela recepção — você não tem permissão. Posso avisar a recepção ou registrar uma
   solicitação."). **Sem cartão, sem peça, sem anunciar delegação fantasma** ("vou acionar o Especialista…").
3. Reconheceu, usuário autorizado, **`AGENDA_CHAT_ENABLED` OFF** → mensagem estática ("Abra a Agenda de Reuniões
   para marcar/alterar."). Sem cartão, sem peça.
4. Reconheceu, usuário autorizado, **`AGENDA_CHAT_ENABLED` ON** → cartão `reuniao_confirm` / `reuniao_acao`.

A checagem de papel no edge usa o `admin` client filtrando por `userId` (`profiles ⋈ role_templates`), computando
o predicado em código (a confirmar os codes exatos na implementação).

**Gate:** flag **`AGENDA_CHAT_ENABLED`** (default **OFF**), lida como
`(Deno.env.get("AGENDA_CHAT_ENABLED") ?? "false") === "true"`. Controla **só** o passo 4 (card vs. estático). A
escrita real acontece client-side (JWT/RLS), então **não** depende de `CHAT_TOOLS_ENABLED`.

### Fluxo A — Agendar (`kind: "reuniao_confirm"`)

Gatilho (ex.): "agenda um atendimento pro cliente João amanhã 10h".

- **Módulo novo `meetingDraft.ts`** (espelho de `taskDraft.ts`, **sem** `localWallTimeToUtcISO`):
  - `buildMeetingDraftPrompt(message, nowLocal, tz)`: LLM devolve JSON com
    `scheduled_date` ("AAAA-MM-DD"), `start_time` ("HH:MM", hora local de parede), `type`,
    `client_query`, `lawyer_hint`, `phone`, `display` (texto curto p/ conferência). **Proíbe** o LLM de
    converter fuso ou usar "Z"/offset — `create_meeting` recebe date+time separados, então não há conversão.
    `nowLocalWall(new Date(), "America/Bahia")` ancora "hoje/amanhã".
  - `normalizeMeetingDraft(raw)`: valida; campo ausente/ambíguo → `null` (fica aberto no cartão).
    `scheduled_date` só aceita `AAAA-MM-DD`; `start_time` só aceita `HH:MM` (rejeita overflow, igual ao
    `localWallTimeToUtcISO`).
- **Resolução de cliente:** `agent_consultar_cliente` com client JWT (não service-role — a RPC re-checa
  `is_recepcao_or_socio`). CPF vem em claro → mascarar **imediatamente** (`***.***.***-NN`); o CPF em claro
  nunca entra em `metadata`, log, nem no rascunho do LLM. Lógica 0/1/N (candidatos ≤ 10).
- **Card `ReuniaoConfirmCard.tsx`** (espelho de `TarefaConfirmCard`):
  - Campos: data (`<input type="date">`), **horário via `<select>` populado por `getAvailableSlots(date)`**
    (só slots livres → cumpre o feedback de disponibilidade, itens 4/6), tipo (`MEETING_TYPE_OPTIONS`),
    cliente (resolvido / ambíguo=`<select>` / aberto), advogado opcional (`useAssignableUsers`), telefone opcional.
  - Re-busca slots quando a data muda. Só o horário obrigatório além da data.
  - Confirmar → `createMeeting({ p_scheduled_date, p_start_time, p_client_id?, p_client_name?, p_type?, p_lawyer_user_id?, p_phone?, p_status: 'scheduled' })`.
  - Trava re-submit (estado `created`).

### Fluxo B — Ciclo/status + reagendar (`kind: "reuniao_acao"`)

Gatilho (ex.): "confirma a reunião das 10h do João amanhã", "marca como realizada", "cancela",
"não compareceu", "reagenda pra 14h".

- **Extração (LLM, em `meetingDraft.ts`):** `{ action, client_query, date_local, time_local }`.
  Mapa **determinístico** verbo→status (em código, testável):
  `confirmar→confirmed`, `realizada/realizar/compareceu/atendido→done`, `cancelar→canceled`,
  `não compareceu/faltou/no-show→no_show`, `reagendar/remarcar→reschedule`.
- **Resolver de reunião (read, JWT):** busca em `meetings` por `scheduled_date` (= data resolvida),
  `start_time` (se informado) e cliente (`client_name ilike %q%` ou `client_id` das resoluções de cliente),
  entre status não-terminais quando faz sentido. Retorna candidatos: `id, scheduled_date, start_time, client_name,
  status, type`. Aplica 0/1/N:
  - **0** → mensagem "não achei reunião com esses dados" (sem card; não inventa).
  - **1** → card de confirmação.
  - **N** → card "Qual reunião?" (data · hora · cliente · status) → escolher → confirmar.
- **Card `ReuniaoAcaoCard.tsx`:**
  - Status (`confirmed|done|canceled|no_show`): **confirmar/cancelar** simples (mostra resumo da reunião + status-alvo).
  - `reschedule`: editável — novo horário via `<select>` de `getAvailableSlots(date)` (+ data).
  - Se N candidatos: seletor de reunião no topo antes de confirmar.
  - Confirmar → busca a linha atual por `id` (RLS de leitura já permite), monta o payload **overwrite** de
    `update_meeting` preservando todos os campos atuais e aplicando só a mudança (status-alvo, ou nova data/hora).

### Tradução de erros (itens 4 e 6)

No `catch` do confirm de ambos os cards, traduzir a mensagem crua da RPC para linguagem amigável:

| Mensagem crua (contém) | Mensagem ao usuário |
|---|---|
| `slot cheio (capacidade` | "Esse horário está cheio." + re-chamar `getAvailableSlots(date)` e sugerir os horários livres inline |
| `fora do expediente` | "Fora do expediente (dia útil, janela ou feriado). Escolha outro horário." |
| `sem permissão (apenas recepção)` | "Só a recepção pode agendar/alterar reuniões." (aceite #5) |
| `é estado final` | "Essa reunião já foi finalizada e não pode mais mudar." (aceite #3) |
| (outro) | a própria mensagem, como fallback |

## Arquivos

**Edge (`supabase/functions/chat-orchestrator/`):**
- `meetingDraft.ts` — **novo**. `buildMeetingDraftPrompt`, `normalizeMeetingDraft`, `parseReuniaoAcao` (verbo→status),
  `buildAcaoPrompt`. Reusa `nowLocalWall` de `taskDraft.ts` (exportar/compartilhar). **Sem** conversão de fuso.
- `index.ts` — 2 detectores determinísticos (`isAgendarAtendimentoRequest`, `isReuniaoAcaoRequest`) **sempre-ligados**
  (Fase 0) + curto-circuito de roteamento; checagem de papel no edge (recepção/sócio/admin); 2 blocos fast-path
  (cartão) atrás de `AGENDA_CHAT_ENABLED`; resolver de reunião (read, JWT); declarar a flag. Remover qualquer texto
  de "delegação fantasma" no caminho de agendamento.
- `tools/registry.ts` + `tools/handlers.ts` — **remover** `agendar_reuniao` (tool + case). Ajustar
  `toolSchemas.test.ts` se referenciar a tool.

**Front (`src/`):**
- `components/chat/ReuniaoConfirmCard.tsx` — **novo** (espelho de `TarefaConfirmCard`).
- `components/chat/ReuniaoAcaoCard.tsx` — **novo**.
- `components/juris-cloud/types.ts` — tipos `ReuniaoDraft`, `ReuniaoAcao` e campos em `JcChatMessage`.
- `components/JurisCloudOS.tsx` — mapear `metadata.reuniao_draft`/`metadata.reuniao_acao` → `msg`; incluir os
  novos `kind` (`reuniao_confirm`, `reuniao_acao`) no gatilho de patch de run/realtime (linha ~1048).
- `components/juris-cloud/JurisChatPanel.tsx` — renderizar os 2 cards por `kind`.
- `hooks/useMeetings.ts` — **reuso** de `createMeeting`, `updateMeeting`, `getAvailableSlots` (já existem).

**Sem migration. Sem `db push`.**

## Testes

- **Unit (Deno)** `meetingDraft.test.ts`: `normalizeMeetingDraft` (campos ausentes → null; formatos date/time;
  overflow rejeitado); `parseReuniaoAcao` (cada verbo → status certo; ruído → null); âncora "amanhã/hoje" via
  `nowLocalWall` (sem fuso, sem "Z").
- **Unit (Deno)** detector (Fase 0): reconhece intenções de agendamento/ciclo; **falso-positivo** — pedidos de peça
  ("petição inicial", "contestação", "recurso") e outras ações **não** são capturados (não sequestra a Confecção).
- **Componente** (Vitest/RTL): `ReuniaoConfirmCard` (0/1/N cliente; slot cheio → sugestão; só cria uma vez);
  `ReuniaoAcaoCard` (status vs reschedule; N candidatos; estado final travado mostra msg amigável).
- **Aceite manual** com `AGENDA_CHAT_ENABLED=on` (todos os 7 critérios abaixo).

## Critérios de aceite

**Fase 0 (com `AGENDA_CHAT_ENABLED` OFF — o estado atual de prod):**

0a. Advogado pede "agendar reunião" → **mensagem de permissão** no detector; **nenhum .docx/peça**;
   `orchestration_runs.intent` = agendamento (não peça). Não renderiza cartão.
0b. Recepção pede "agendar reunião" → mensagem estática "abra a Agenda"; **nenhuma peça**, nenhum cartão.
0c. Pedido real de peça (ex.: "faz uma petição inicial de…") continua indo à Confecção — **sem regressão**
   (detector conservador; testes de falso-positivo).

**Feature completa (com `AGENDA_CHAT_ENABLED=on`):**

1. "agenda um atendimento pro cliente João amanhã 10h" → card → confirmar → linha em `meetings` com `client_id`
   resolvido, `start_time=10:00`, `status=scheduled`; aparece na Agenda.
2. "confirma a reunião das 10h do João amanhã" → 1 candidata → card → `meetings.status=confirmed`.
3. "marca como realizada" / "cancela" / "não compareceu" → status correto; terminais bloqueiam nova transição
   (mensagem amigável).
4. "reagenda pra 14h" → `start_time=14:00`, slot revalidado.
5. Advogado logado tentando qualquer uma → **não vê o cartão**: recebe a mensagem de permissão **no detector**
   (não erro no Confirmar). A RPC de prod (recepção-only) permanece como segunda barreira.
6. Slot cheio → chat sugere próximo horário livre (não repassa erro cru).
7. Nenhum CPF em claro em logs / `chat_messages` (mascarado no edge antes de persistir).

## Ordem sugerida (implementação)

1. **Correção 0** (se autorizada pelo dono) — autorar as migrations-espelho a partir do def real de prod e commitar
   (sem `db push`). Fecha a divergência e blinda regra 4 / R3.
2. **Fase 0** — detector sempre-ligado + permissão de cara. Mata o misroute de hoje **sem** ligar a feature.
3. **Correção de texto** (capacidade = 1; sem delegação fantasma).
4. **Feature completa** (cartões `reuniao_confirm` / `reuniao_acao`) atrás de `AGENDA_CHAT_ENABLED`, ligada quando o
   dono quiser.

## Fora de escopo (YAGNI)

- Reconciliar a divergência repo↔prod (Correção 0): **pendente de decisão do dono** — só entra se autorizado
  (marcada como "dedup escalada" na memória). Se não, permanece como risco documentado.
- Write-tools agênticas de reunião no registry (substituídas pelo fast-path).
- Seletor visual rico de calendário no chat (a tela continua sendo o controle fino; o chat é atalho).
