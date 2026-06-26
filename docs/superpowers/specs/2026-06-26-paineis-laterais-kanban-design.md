# Painéis laterais (Central de Operações) como lentes do Kanban

**Data:** 2026-06-26
**Status:** Aprovado para planejamento

## Problema

No cockpit `JurisCloudOS` (rota `/sistema`), o painel lateral direito "Central de Operações"
(`JurisRightPanel`) tem três abas — **Filas**, **Processos**, **Alertas** — que hoje estão
desconectadas das tarefas reais do sistema:

- **Filas** lê a tabela `agent_tasks` (tarefas de agentes de IA), agrupada por `task_category`.
- **Processos** e **Alertas** renderizam constantes estáticas **vazias** (`PROCESSES = []`, `ALERTS = []`).

Verificação no banco (projeto Supabase `tsltxvswzdnlmvljpryh`) via `pg_stat_user_tables`
(contadores acumulados que sobrevivem a deletes):

| tabela | inseridos (histórico) | vivos |
|---|---|---|
| `agent_tasks` | **0** | 0 |
| `agent_messages` | 0 | 0 |
| `agent_orchestration_log` | 0 | 0 |
| `user_tasks` | 8 | 4 |
| `processes` | **0** | 0 |

Conclusão: o subsistema de tarefas de agentes de IA (`agent_tasks`) **nunca recebeu dados** e está
morto. As tarefas vivas estão em `user_tasks` (o Kanban). As tarefas atribuídas ao usuário não
chegam a nenhum painel lateral.

## Objetivo

Transformar os três painéis laterais em **lentes da mesma fonte viva** — as tarefas do Kanban
(`user_tasks`) atribuídas ao usuário logado — e os casos (`processes`) do usuário. Descartar
`agent_tasks` dos painéis.

## Decisões tomadas

1. **Escopo dos painéis:** somente as tarefas **do usuário logado** (mesma fonte do botão "Tarefas",
   `useMyInbox`). Não é visão de equipe.
2. **Processos = casos, não tarefas.** O painel "Processos" lê a tabela `processes`
   (filtrada por `user_id`), não as `user_tasks`. Tarefa ≠ processo.
3. **Sem UI de criação de processos.** Não existe tela de criação de processo no app hoje, e isso
   permanece assim. Processos serão coletados/integrados ao banco externamente (futuro) e aparecerão
   automaticamente via realtime. O painel começa vazio (estado vazio explícito).
4. **Painel read-only de glance.** Sem drag-and-drop. Mover status de tarefa continua sendo
   responsabilidade do Kanban (`/sistema/kanban`), que tem as regras de workflow no backend.

## Design

Fonte única por aba:

| Aba | Fonte | Recorte / agrupamento |
|---|---|---|
| **Filas** | `useMyInbox(false)` (`user_tasks` abertas, assignee = eu) | agrupadas por `status`: Atribuída · Em andamento · Aguardando externo · Aguardando validação · Bloqueada |
| **Processos** | nova hook `useMyProcesses` (`processes` onde `user_id` = eu) | lista de casos: `process_number`, `client_name`, `status`, `next_hearing_date`, `responsible_lawyer` |
| **Alertas** | `useMyInbox(false)` | tarefas com `is_overdue = true` **ou** `priority = 'critical'`, ordenadas por urgência (vencidas primeiro, depois críticas) |

Interação: cada card de tarefa (Filas/Alertas) é clicável e navega para `/sistema/kanban`. Cards de
processo são, por ora, apenas visuais (não há tela de detalhe de processo dedicada). Realtime já é
fornecido pelos hooks (subscription em `user_tasks` e em `processes`).

Contadores: cada aba exibe a contagem do seu recorte. O badge do botão "Tarefas" da topbar
(`useInboxCount`) permanece inalterado.

## Componentes

### Novo: `src/hooks/useMyProcesses.ts`
- Usa `useAuth` + `useSupabaseQuery` (mesmo padrão de `useMyInbox`).
- `fetcher`: `supabase.from("processes").select("id, process_number, client_name, status, responsible_lawyer, next_hearing_date, created_at").eq("user_id", user.id).order("next_hearing_date", { ascending: true, nullsFirst: false })`.
- `enabled: !!user`.
- `realtime: { table: "processes", filter: \`user_id=eq.${user.id}\` }`.
- Retorna `{ processes, loading, error, refresh }`.
- Tipo `MyProcess` exportado (id, process_number, client_name, status, responsible_lawyer, next_hearing_date, created_at).

### Novo: `src/lib/userTaskLabels.ts` (pequeno, compartilhado)
- Move/centraliza `USER_TASK_STATUS_LABELS` e a ordem de exibição das filas
  (`assigned`, `in_progress`, `awaiting_external`, `awaiting_validation`, `blocked`).
- Reutilizado por `MyInbox.tsx` (que hoje define o map localmente) e pelo painel, evitando duplicação.

### Modificado: `src/components/juris-cloud/JurisRightPanel.tsx`
- Remove `import TaskQueuesPanel`.
- Importa `useMyInbox` (de `@/hooks/useUserTasks`), `useMyProcesses`, `useNavigate`, e os labels de status.
- Chama os hooks dentro do componente.
- **Filas:** agrupa `tasks` por `status` na ordem definida; renderiza só grupos não-vazios, cada um
  com cabeçalho (label + contador) e os cards de tarefa (título, cliente/area se houver, prioridade,
  prazo). Clique → `navigate("/sistema/kanban")`. Estado vazio: "Nenhuma tarefa atribuída".
- **Processos:** renderiza `processes` reaproveitando as classes existentes (`jc-case-card`,
  `jc-case-num`, `jc-case-name`, `jc-process-badge`). Mostra `process_number`, `client_name`, badge de
  `status`, e `next_hearing_date` (cor de alerta se passada). Estado vazio: "Nenhum processo
  cadastrado".
- **Alertas:** filtra `tasks` por `is_overdue || priority === 'critical'`; renderiza com `AlertIcon`
  e classes `jc-alert-item`. Mapeamento: vencida → tipo `warning` (ou `fatal` se também crítica);
  crítica não-vencida → `fatal`. Texto = título; tempo = prazo formatado. Estado vazio: "Nenhum alerta".
- A assinatura de props do componente não muda (os hooks usam `useAuth` internamente).

### Modificado: `src/components/juris-cloud/constants.ts`
- Remove as constantes mortas `PROCESSES` e `ALERTS`.
- Remove `getCaseAreaChip` **se** ficar sem uso após a mudança (verificar; hoje só é usada no render
  antigo de PROCESSES). Manter `INITIAL_MESSAGES` e demais utilitários.

### Removido: `src/components/TaskQueuesPanel.tsx`
- Era 100% `agent_tasks` (tabela morta) e só era consumido por `JurisRightPanel`. Excluir o arquivo.

## Fora de escopo

- Não remover `agent_tasks` dos demais consumidores (`Dashboard`, `EfficiencyKPIs`, `ClientDetails`,
  `Clients`, `WelcomeScreen`, `useBottleneckDetection`, `useRealtimeNotifications`). Eles continuarão
  lendo a tabela vazia (mostram zero, que é a verdade). Faxina completa de `agent_tasks` é um trabalho
  separado.
- Nenhuma UI de criação de processos.
- Nenhuma mudança de schema no banco.

## Estados e tratamento de erro

- Loading: cada aba mostra um loader compacto (`HexagonLoader variant="compact"`) enquanto o hook carrega.
- Erro: mensagem discreta na aba ("Erro ao carregar").
- Vazio: textos de estado vazio por aba (acima).

## Verificação

- `npm run build` e `tsc` limpos (baseline: type-check 100% recuperado — ver memória do projeto).
- Conferir no preview que Filas mostra a tarefa "Protocolar peça (DEMO)" (status `assigned`) e que
  Alertas a mostra como vencida (deadline 2026-06-18 < hoje). Processos vazio.
