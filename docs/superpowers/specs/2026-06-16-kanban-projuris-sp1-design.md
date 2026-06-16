# Design — Kanban estilo Projuris · Sub-projeto 1 (Núcleo de Quadros Configuráveis)

> **Data:** 2026-06-16
> **Autor:** Ana Rosa (ryanribeiro@cohapm.com.br) + Claude
> **Status:** Em revisão (aguardando aprovação do spec antes do plano de implementação)
> **Projeto:** JurisAI (`build-your-dreams-153`)
> **Origem:** replicar "à risca" o módulo Kanban descrito em `Documentacao_Projuris_ADV.md`, decomposto em 4 sub-projetos. **Este documento é o Sub-projeto 1.**

---

## 1. Objetivo e escopo

### 1.1 O que o SP1 entrega
Substituir o Kanban atual (`/sistema/kanban`, "Kanban da Operação" — pipeline de fases fixas) por um **sistema de quadros configuráveis** no modelo Projuris:

- **Múltiplos quadros** (boards), com seletor em **menu suspenso**, favoritar ⭐, excluir 🗑 e **+ Novo quadro**.
- **Colunas de nome livre**, cada uma **mapeada a uma "Situação"** (das 5 do Projuris). Reordenáveis (drag) e excluíveis.
- **Drag-and-drop de cartões** entre colunas, que **troca a situação** do card.
- **Cartão com anatomia completa** (etiqueta de origem, título, vínculo `PRO`/`ATE`, `TAR`, responsável+avatar, data prevista 📅, data fatal ❗ vermelha, prioridade na borda, menu ⋮ Editar/Excluir).
- **Modal "Configurações do quadro"** (admin/CEO) com 3 abas: Título e colunas · Opções (privacidade/acesso, ocultar concluídas) · Exibição (cartões simplificados).
- **Tema escuro/dourado** (linguagem visual A, consistente com o app).

### 1.2 O que NÃO entra no SP1 (sub-projetos seguintes)
- **SP2 — Filtros completos (3 camadas):** abas de envolvimento, ordenação+período, modal de filtros avançados, marcadores, grupos, filtros salvos.
- **SP3 — Detalhe da tarefa (hub) base:** modal de detalhe rico, comentários com @menção, marcadores (tags), vínculos detalhados.
- **SP4 — Blocos funcionais:** timesheet, checklist, documentos+IA, tarefas relacionadas, workflow, auditoria por tarefa.

No SP1 o cartão tem o **menu ⋮ (Editar/Excluir)** e abre a edição existente; o **detalhe-hub completo é SP3**.

### 1.3 Decisões já tomadas (brainstorming)
| # | Decisão | Valor |
|---|---|---|
| D1 | Relação com o Kanban atual | **Substituir totalmente** |
| D2 | Fidelidade | **Máxima total** (decomposta em SP1–SP4) |
| D3 | Placement do card | **1 quadro por vez** (status do card = situação da coluna); "Trocar quadro" move |
| D4 | Entrada no quadro | **Adição manual** (tarefa sem quadro vive na Lista/Inbox) |
| D5 | Conjunto de situações | **5 do Projuris** via **modelo duplo** (novo campo `situacao`, mantendo `user_task_status` de 8) |
| D6 | Quem cria/configura quadros | **Apenas admin/CEO** (`is_master_admin`); demais usuários movem cards nos quadros liberados |
| D7 | Linguagem visual | **Tema escuro/dourado (A)** |
| D8 | Seletor de quadros | **Menu suspenso** (fiel ao Projuris) |

---

## 2. Contexto técnico verificado (grounding)

Fatos confirmados no código (workflow de exploração, `arquivo:linha`):

### 2.1 Modelo de dados existente
- **`public.user_tasks`** — unidade de trabalho. Colunas-chave: `id uuid`, `task_type_id`, `title`, `description`, `assigner_user_id` (NOT NULL), `assignee_user_id` (nullable), `assignee_external_id`, `process_id` (FK `processes`), `client_id` (FK `clients`), `area legal_area`, `status user_task_status NOT NULL DEFAULT 'assigned'`, `priority task_priority NOT NULL DEFAULT 'medium'`, `deadline_at`, `payload jsonb NOT NULL DEFAULT '{}'`, `external_kanban_ref`, `notes`, `completed_at`, `cancelled_at`, `created_at/updated_at`. — `20260527120000_v14_lexforce_org_model.sql:297-329`
- **CHECK XOR de responsável:** `(assignee_user_id NOT NULL AND assignee_external_id NULL) OR (assignee_user_id NULL AND assignee_external_id NOT NULL)` — nunca ambos nulos. — `…v14…:306-310`
- **Enums:** `user_task_status` = 8 valores (`draft, assigned, in_progress, awaiting_external, awaiting_validation, blocked, completed, cancelled`) `…v14…:76-85`; `task_priority` = `critical, high, medium, low`; `legal_area` = 7; `org_stage` = 20.
- **`task_types`**: `code (unique), display_name, stage, area, default_sla_hours, requires_validation, validator_role_code, is_active, sort_order`. ~67 seeds. — `…v14…:210-227`
- **`clients`** (`id, full_name, cpf, rg`) e **`processes`** (`id, process_number, client_name` texto livre, `responsible_lawyer, status, next_hearing_date`). **Não há FK `processes→clients`.** — `…412204024…:51-63`, `…412205421…:74-91`
- **Não existe nenhuma tabela `kanban_*`.** O Model A só espelha `task_types.stage`. — `kanban_fase1.sql:1-2`

### 2.2 Auth, papéis e RLS
- `useAuth()` expõe `{ user, session, loading, userRoles: string[], hasRole(role) }`. **Sem `isAdmin` nem `role_template_id` no cliente.** `hasRole = userRoles.includes(role)`; `userRoles` vem de `user_roles` (enum `app_role`). — `src/hooks/useAuth.tsx:5-14,80-94,114`
- **Gate canônico admin/CEO:** `is_master_admin(uuid)` = `has_role(uuid,'director')` **OU** profile com role_template `code='socio'`. — `20260601200000_security_fixes.sql:117-133`
- `role_templates`: 10 codes; **`socio`** = admin/CEO (`is_admin=true, can_assign_tasks=true`). `lider_recepcao` também tem `can_assign_tasks=true`. — `…v14…:482-541`
- **RLS `user_tasks`:** SELECT/UPDATE para envolvidos (`assigner/assignee/validator`) OU `has_role('admin')`; INSERT `assigner=auth.uid()`; DELETE `has_role('admin')`. — `…v14…:453-467`
- **Padrão de RPC:** `LANGUAGE plpgsql [STABLE] SECURITY DEFINER SET search_path = public`; abre com `auth.uid()` + `RAISE EXCEPTION` se NULL; gate com `RAISE EXCEPTION`; encerra com `REVOKE ALL … FROM PUBLIC` + `GRANT EXECUTE … TO authenticated`. — `v17_task_assignment.sql:328-378`

### 2.3 Convenções de front-end
- **`useSupabaseQuery<T>({ queryKey, fetcher, realtime?, enabled? }) → { data, loading, error, refetch }`**; `queryKey` também nomeia o canal realtime. Wrappers renomeiam `data→domínio`, `refetch→refresh`. — `src/hooks/useSupabaseQuery.ts:11-53`
- **React Router v6, rotas de nível único**, `lazy()`+`Suspense`, guards (`ProtectedRoute/AdminRoute/TechRoute/MasterRoute`). **Sem `Outlet` aninhado / named outlets / rota-modal.** Modais = **state local + overlay inline**. Rota `/sistema/kanban` já existe. — `src/App.tsx:103-149`
- **Estilo:** telas de tarefas/kanban usam **`React.CSSProperties` inline** com paleta dark hardcoded (`#09090f, #11111a, #16161f, #25253a, dourado #eab308/#facc15, texto #eeeef5/#c4c4d4/#7a7a92`, fonte `Plus Jakarta Sans`). shadcn existe mas não é usado aqui. — `src/pages/KanbanBoard.tsx:315-355`
- **`@hello-pangea/dnd` JÁ é usado em produção** em `src/components/TaskQueuesPanel.tsx` (`DragDropContext`/`Droppable`/`Draggable`, update **otimista** + `supabase update` + `toast.error`+`refetch` em falha). **Padrão a seguir.** — `TaskQueuesPanel.tsx:5,102-113,276-389`
- Feedback: `toast` de `sonner` (Toaster global em `App.tsx`). Loader: `<HexagonLoader variant="fullscreen" label=…/>`.
- Link "Kanban" já existe na topbar (`JurisTopBar.tsx`, ícone `KanbanSquare`, `navigate('/sistema/kanban')`), hoje gated por `isMaster`.
- `<TaskAttachments taskId canUpload/>` é reutilizável (bucket `task-attachments`, RPCs `register/get_task_attachments`).

### 2.4 Pontos de integração / impacto do modelo duplo
- `situacao` **não existe** em lugar nenhum — campo 100% novo.
- `get_kanban_board` / `advance_user_task` / `kanban_next_stage` / `kanban_stage_owner_role` são consumidos **apenas** por `KanbanBoard.tsx`/`useKanbanBoard` → **seguro depreciar**. — `useUserTasks.ts:204-243`
- **`awaiting_validation` é load-bearing (V18):** `update_user_task_status` desvia `completed→awaiting_validation` quando `requires_validation`; dependem dele `validate_user_task`, `get_my_validation_queue`, `get_validation_count`, e no front `ValidationQueue.tsx`, badge em `JurisCloudOS.tsx`, `TeamDashboard.tsx`, `MyInbox.tsx`. — `v18_task_validation.sql:63-70,119,226,270`
- **`TeamDashboard.tsx` é um segundo board** que agrupa por `user_task_status` (não usa `get_kanban_board`). Fora do escopo do SP1 (ver §9).
- `user_tasks` já tem `client_id`/`process_id`, mas o card atual não os exibe. Rota `/clientes/:id` existe; **`/processos/:id` não existe**.
- **Realtime:** `useSupabaseQuery` faz **refetch completo** a cada `postgres_changes`; basta inscrever em `{ table: 'user_tasks' }`. `user_tasks` já está na publication `supabase_realtime`.

---

## 3. Arquitetura da solução (SP1)

Dois eixos **ortogonais** passam a existir:
- **`user_task_status` (8 valores)** — ciclo de vida operacional/validação. **Inalterado.** Continua dirigindo Inbox e Fila de Validação.
- **`situacao` (5 valores)** — eixo do Kanban (a "Situação" do Projuris). **Novo.** É o que as colunas mapeiam e o que o drag-and-drop altera.

Um card no board tem **placement** (quadro + coluna + posição). A coluna define a **situação** do card. Mover o card entre colunas atualiza `situacao` e, quando a situação muda, um `user_task_status` representativo (com regra de não-sobrescrita dos estados especiais).

```
kanban_boards 1──* kanban_columns 1──* kanban_card_placements *──1 user_tasks
     │                   │ (situacao)          (1 por tarefa)         │
     ├─* kanban_board_favorites (por usuário ⭐)                       │ situacao (novo)
     └─* kanban_board_grants (acesso: user_id | role_code)            │ user_task_status (intacto)
```

---

## 4. Modelo de dados (migrations)

Tudo idempotente (`CREATE … IF NOT EXISTS` / `CREATE OR REPLACE` / `DROP … IF EXISTS`). **Não altera** o enum `user_task_status` nem o fluxo V18.

### 4.1 Novo enum
```sql
CREATE TYPE public.task_situacao AS ENUM
  ('pendente','em_execucao','concluida_sucesso','concluida_sem_sucesso','cancelado');
```

### 4.2 Nova coluna em `user_tasks`
```sql
ALTER TABLE public.user_tasks
  ADD COLUMN IF NOT EXISTS situacao public.task_situacao NOT NULL DEFAULT 'pendente';
CREATE INDEX IF NOT EXISTS user_tasks_situacao_idx ON public.user_tasks(situacao);
```
Backfill (mapa 8→5, §6.1):
```sql
UPDATE public.user_tasks SET situacao = public.kanban_situacao_from_status(status);
```

### 4.3 Tabelas novas
```sql
CREATE TABLE public.kanban_boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  is_private boolean NOT NULL DEFAULT true,
  hide_completed_after_days integer,        -- NULL = nunca ocultar
  simplified_cards boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.kanban_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.kanban_boards ON DELETE CASCADE,
  name text NOT NULL,                        -- nome livre
  situacao public.task_situacao NOT NULL,    -- mapeamento canônico
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kanban_columns_board_idx ON public.kanban_columns(board_id, position);

CREATE TABLE public.kanban_card_placements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.kanban_boards ON DELETE CASCADE,
  column_id uuid NOT NULL REFERENCES public.kanban_columns ON DELETE CASCADE,
  user_task_id uuid NOT NULL REFERENCES public.user_tasks ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kanban_one_board_per_task UNIQUE (user_task_id)   -- D3: 1 quadro por tarefa
);
CREATE INDEX kanban_placements_column_idx ON public.kanban_card_placements(column_id, position);

-- ⭐ favorito por usuário
CREATE TABLE public.kanban_board_favorites (
  board_id uuid NOT NULL REFERENCES public.kanban_boards ON DELETE CASCADE,
  user_id  uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  PRIMARY KEY (board_id, user_id)
);

-- acesso a quadro privado: usuário OU papel (grupo)
CREATE TABLE public.kanban_board_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.kanban_boards ON DELETE CASCADE,
  grantee_user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  grantee_role_code text,                    -- role_templates.code (grupo)
  CHECK (grantee_user_id IS NOT NULL OR grantee_role_code IS NOT NULL)
);
CREATE INDEX kanban_grants_board_idx ON public.kanban_board_grants(board_id);
```

### 4.4 RLS das tabelas novas
- **Habilitar RLS em todas.** Leitura via RPC `SECURITY DEFINER` (gate na função, padrão do projeto), mas como o front pode ler direto, definir policies coerentes:
  - `kanban_boards` SELECT: `owner_user_id = auth.uid()` OR `NOT is_private` OR `is_master_admin(auth.uid())` OR existe grant (user/role). INSERT/UPDATE/DELETE: **apenas `is_master_admin(auth.uid())`** (D6).
  - `kanban_columns` / `kanban_card_placements` / `kanban_board_grants`: SELECT/escrita derivadas do acesso ao board (mesma regra). Escrita de colunas/grants = admin; escrita de placement = quem tem acesso ao board (ver §5.4 RPC `kanban_move_card`).
  - `kanban_board_favorites`: o usuário só lê/escreve as próprias linhas (`user_id = auth.uid()`).

> **Nota de segurança:** seguindo o padrão do projeto, **toda mutação passa por RPC `SECURITY DEFINER`** com gate explícito; as policies acima são a segunda linha de defesa para leitura direta do front.

---

## 5. Backend — RPCs (SECURITY DEFINER, padrão canônico)

Todas: `SET search_path = public`, checam `auth.uid()`, fazem gate com `RAISE EXCEPTION`, e terminam com `REVOKE ALL … FROM PUBLIC` + `GRANT EXECUTE … TO authenticated`.

### 5.1 Helpers
- `kanban_situacao_from_status(user_task_status) RETURNS task_situacao` — `IMMUTABLE`, mapa 8→5 (§6.1). Usado no backfill e no trigger.
- `kanban_can_admin(uuid) RETURNS boolean` — `is_master_admin(uid) OR has_role(uid,'admin')`. (Centraliza o gate de configuração, evitando repetir o `EXISTS` inline.)
- `kanban_can_access_board(p_board_id uuid, uid uuid) RETURNS boolean` — admin OR owner OR `NOT is_private` OR grant por user/role.

### 5.2 Leitura
- **`get_kanban_boards()`** → lista de quadros **visíveis ao usuário** (`kanban_can_access_board`), com `is_favorite` (do usuário), `card_count`, `is_owner`, flags de exibição. Ordena por favorito desc, `sort_order`, `name`.
- **`get_kanban_board(p_board_id uuid)`** → **(reescrita, substitui a versão Model A)** retorna colunas (id, name, situacao, position) e cards com **labels já resolvidos**:
  - do `user_tasks`: `id, title, situacao, status, priority, area, deadline_at, is_overdue, assignee_user_id, payload->>'awaiting_role'`;
  - **origem/vínculo:** `client_id`, `clients.full_name`, `process_id`, `processes.process_number`, e uma **etiqueta de origem** derivada (ver §7.3 — adaptação ao modelo JurisAI);
  - identificador `TAR` para exibição (ver §7.3 — formatação a partir do `uuid`);
  - responsável (`profiles.full_name`, iniciais para avatar);
  - `column_id`, `placement.position`.
  - Gate: `kanban_can_access_board(p_board_id, auth.uid())`.

### 5.3 Configuração de quadro (gate: `kanban_can_admin`)
- `kanban_create_board(p_name, p_is_private, p_hide_completed_after_days, p_simplified_cards)` → cria board + (opcional) colunas default.
- `kanban_update_board(p_board_id, …)` → título, privacidade, ocultar concluídas, cartões simplificados.
- `kanban_delete_board(p_board_id)`.
- `kanban_set_columns(p_board_id, p_columns jsonb)` → **upsert transacional** da lista de colunas (`{id?, name, situacao, position}`), incluindo reordenar e excluir as ausentes. Ao excluir uma coluna com cards, mover os placements para a 1ª coluna restante (ou remover do board) — **regra a confirmar no plano**: padrão = mover para a 1ª coluna.
- `kanban_set_board_grants(p_board_id, p_user_ids uuid[], p_role_codes text[])` → define acesso do quadro privado.

### 5.4 Movimentação / placement
- **`kanban_move_card(p_task_id uuid, p_column_id uuid, p_position int)`** — gate: `kanban_can_access_board(board, uid)`. Lógica:
  1. Resolve `board_id`/`situacao` da coluna destino.
  2. `UPSERT` em `kanban_card_placements` (`UNIQUE(user_task_id)` garante 1 board/coluna). Atualiza `position`.
  3. Se a **situação mudou** (coluna destino tem `situacao` ≠ `user_tasks.situacao` atual): set `user_tasks.situacao = destino` **e** `user_task_status` representativo (§6.2), aplicando a **regra de não-sobrescrita** (§6.3).
  4. Se a situação **não** mudou (ex.: reorganizar entre colunas ambas "Pendente"): atualiza só placement/posição — **não mexe em status** (evita thrash; cobre o caso "todas as colunas = Pendente").
- `kanban_add_task_to_board(p_task_id, p_column_id)` — adiciona tarefa avulsa a um board (D4, manual). Mesmo efeito de `move`.
- `kanban_remove_task_from_board(p_task_id)` — apaga o placement (a tarefa volta a viver só na Lista/Inbox); não altera status.
- `kanban_toggle_favorite(p_board_id)` — ⭐ por usuário.

### 5.5 Trigger de sincronização (status → situacao)
`AFTER UPDATE OF status ON user_tasks`:
- Recalcula `situacao := kanban_situacao_from_status(NEW.status)`, **exceto**:
  - se `NEW.status='completed'` e `payload->>'outcome'='sem_sucesso'` → `concluida_sem_sucesso` (preserva o "sem sucesso" setado pelo board, §6.4);
  - não reverte uma situação explicitamente definida pelo board quando o status não corresponde a transição macro (a regra de não-sobrescrita do §6.3 garante que status especiais convivam com `em_execucao`).
- Objetivo: quando V18 (`validate_user_task`) ou o `MyInbox` mudam `status`, o card no Kanban reflete sem divergir.

### 5.6 Depreciação
Marcar como **DEPRECATED** (comentário) e remover **após** migrar `KanbanBoard.tsx`: `advance_user_task`, `kanban_next_stage`, `kanban_stage_owner_role`, e a versão Model A de `get_kanban_board`. O fluxo "Avançar fase" deixa de existir (D1).

---

## 6. Regras do modelo duplo (situação ↔ status)

### 6.1 Mapa 8→5 (`kanban_situacao_from_status`, backfill + trigger)
| `user_task_status` | `situacao` |
|---|---|
| `draft`, `assigned` | `pendente` |
| `in_progress`, `awaiting_external`, `awaiting_validation`, `blocked` | `em_execucao` |
| `completed` | `concluida_sucesso` (ou `concluida_sem_sucesso` se `payload.outcome='sem_sucesso'`) |
| `cancelled` | `cancelado` |

### 6.2 Mapa inverso (situação da coluna → status representativo)
| `situacao` destino | `user_task_status` setado |
|---|---|
| `pendente` | `assigned` |
| `em_execucao` | `in_progress` |
| `concluida_sucesso` | `completed` (passa pelo desvio V18 se `requires_validation`) |
| `concluida_sem_sucesso` | `completed` + `payload.outcome='sem_sucesso'` |
| `cancelado` | `cancelled` (grava `cancelled_at`) |

### 6.3 Regra de NÃO-SOBRESCRITA (protege a Fila de Validação)
Ao mover para uma coluna **`em_execucao`**, **se o status atual ∈ {`awaiting_validation`, `awaiting_external`, `blocked`}**, **manter o status** e atualizar **só** `situacao`. Assim `get_my_validation_queue` (que filtra `status='awaiting_validation'`) continua íntegra.

### 6.4 `concluida_sem_sucesso`
Sem 9º valor no enum de status: persiste como `situacao='concluida_sem_sucesso'` + `status='completed'` + `payload.outcome='sem_sucesso'`. Relatórios que distinguem ganho/perda usarão `situacao`/`payload.outcome` (tratado em SP4). **Decisão explícita** para não tocar o enum operacional.

### 6.5 Indicador visual de validação
Como `awaiting_validation` cai dentro de `em_execucao`, o card exibe um **badge "em validação"** quando `status='awaiting_validation'`, para o validador não perder o sinal (que hoje tem coluna dedicada no TeamDashboard).

---

## 7. Front-end (SP1)

### 7.1 Arquivos
- **Reescrever** `src/pages/KanbanBoard.tsx` para o modelo configurável (remove `FLOW_STAGES`/`NEXT_STAGE`/`advance`).
- **Novo** `src/hooks/useKanban.ts` (wrappers `useSupabaseQuery` + funções de mutação):
  - `useKanbanBoards()` → `{ boards, loading, error, refresh }`.
  - `useKanbanBoard(boardId)` → `{ columns, cards, board, loading, error, refresh }`, realtime `{ table:'user_tasks' }` (+ `kanban_card_placements`).
  - mutações async: `moveCard`, `addToBoard`, `removeFromBoard`, `createBoard`, `updateBoard`, `deleteBoard`, `setColumns`, `setGrants`, `toggleFavorite` (todas via `supabase.rpc`).
- **Novos componentes** (em `src/components/kanban/`, estilo inline dark consistente):
  - `BoardSelector.tsx` — menu suspenso (D8) com ⭐/🗑/+ Novo quadro (admin).
  - `KanbanColumn.tsx` / `KanbanCard.tsx` — anatomia (§1.1), `Droppable`/`Draggable`.
  - `BoardConfigModal.tsx` — 3 abas (overlay inline; sem rota-modal).
- **Tipos** em `src/types/jurisai.ts`: `TaskSituacao`, `KanbanBoard`, `KanbanColumn`, `KanbanCardV2`.

### 7.2 Drag-and-drop
Seguir **exatamente** o padrão de `TaskQueuesPanel.tsx`: `<DragDropContext onDragEnd>` envolvendo `<Droppable droppableId={columnId}>` por coluna e `<Draggable draggableId={taskId} index>` por card. No `onDragEnd`: **update otimista** do estado local → `await moveCard(taskId, columnId, position)` → em erro, `toast.error` + `refresh()` (rollback). `isDropDisabled` quando o usuário não tem acesso de escrita.

### 7.3 Anatomia do card (confirmada nos mockups)
Etiqueta de origem · título · vínculo clicável · `TAR.xxxx` · responsável + avatar (iniciais) · 📅 data prevista · ❗ data fatal (vermelha se vencida) · borda esquerda de prioridade · ⚠ alerta · menu ⋮ (Editar/Excluir). Badge "em validação" quando aplicável (§6.5).

- **Etiqueta de origem (adaptação ao JurisAI):** o JurisAI **não possui a entidade "Atendimento (ATE)"** do Projuris — `ATE` lá é o pré-processo. Aqui a tarefa liga a `client_id` e/ou `process_id`. Mapeamento adotado:
  - tem `process_id` → etiqueta **"Processo"** (verde), exibe `PRO.<process_number>`;
  - só `client_id` (sem processo) → etiqueta **"Cliente"** (laranja, equivalente ao "pré-processo/ATE"), exibe o nome do cliente;
  - nenhum dos dois → etiqueta **"Interna"** (cinza).
- **Vínculo cliente:** link `navigate('/clientes/' + client_id)` (rota existe).
- **Vínculo processo:** exibe `PRO.<process_number>` **sem link** no SP1 (rota `/processos/:id` não existe; criada em SP3).
- **Identificador `TAR`:** o `user_tasks.id` é `uuid` (não há sequencial). Exibir `TAR.<8 primeiros caracteres do uuid>` (somente apresentação). Um número sequencial real fica como melhoria opcional futura (coluna `seq` serial), fora do SP1.
- **Cartões simplificados:** quando o board tem `simplified_cards`, mostra só título + responsável + prazo.

### 7.4 Visibilidade / navegação
- Página **standalone** (fora do `JurisCloudOS`), com `← Voltar`, mantendo paleta inline atual.
- **Link na topbar:** hoje gated por `isMaster`. Ajustar para exibir a **todos os autenticados**; `get_kanban_boards` já filtra os quadros acessíveis (admin vê tudo + botões de config; demais veem quadros liberados e só movem cards).

---

## 8. Plano de migração e segurança (resumo de ordem)
1. `CREATE TYPE task_situacao`.
2. Helper `kanban_situacao_from_status` (precisa existir antes do backfill).
3. `ALTER TABLE user_tasks ADD situacao` + índice + **backfill**.
4. Tabelas novas + índices + **RLS** + policies.
5. Helpers `kanban_can_admin`, `kanban_can_access_board`.
6. RPCs (leitura, config, move/placement, favorito) + `REVOKE/GRANT`.
7. Trigger `AFTER UPDATE OF status`.
8. Comentar como DEPRECATED as RPCs do Model A (remover após o front migrar).
9. (Front) reescrita do `KanbanBoard` + hooks + componentes.
10. `supabase gen types` (regenerar `types.ts`) e `vite build` passando.

Tudo idempotente; **sem alteração** no enum `user_task_status` nem nas RPCs do V18.

---

## 9. Itens fora de escopo / decisões adiadas
- **`TeamDashboard.tsx`** continua agrupando por `user_task_status` (não migra para `situacao` no SP1). Coexiste; avaliar unificação depois.
- **Rota `/processos/:id`** → criada no SP3 (detalhe), quando o vínculo `PRO` vira clicável.
- **Multi-tenant:** `user_tasks` não tem `organization_id`; quadros não são segmentados por organização (modelo atual é escritório único). Não tratado no SP1.
- **Filtros avançados, marcadores, grupos, filtros salvos** → SP2.
- **Detalhe-hub, comentários, checklist, timesheet, workflow, auditoria** → SP3/SP4.

---

## 10. Riscos e mitigações
| Risco | Mitigação |
|---|---|
| Divergência `situacao` × `status` entre fluxos | Trigger de sync (§5.5) + regra de não-sobrescrita (§6.3) |
| Esvaziar a Fila de Validação ao arrastar card | Não-sobrescrita de `awaiting_validation` (§6.3) + badge (§6.5) |
| Realtime sem filtro → refetch frequente | Aceitável no volume atual (mesmo padrão de hoje); avaliar filtro/debounce se crescer |
| Remoção precoce das RPCs Model A | Só remover após `KanbanBoard.tsx` migrado (consumidor único) |
| `concluida_sem_sucesso` sem enum próprio | `payload.outcome` + `situacao` (§6.4); relatórios em SP4 |
| `processes.client_name` é texto livre (sem FK) | Card mostra `process_number`; não depende de join cliente↔processo |

---

## 11. Critérios de aceite (SP1)
1. Admin cria/edita/exclui quadros e colunas (nome livre + situação) pelo modal de 3 abas.
2. Seletor em menu suspenso lista quadros acessíveis, com ⭐ favoritar, 🗑 excluir e + Novo quadro (admin).
3. Cards arrastáveis entre colunas; soltar muda a situação e o status representativo conforme §6, **sem quebrar a Fila de Validação**.
4. Reorganizar entre colunas de mesma situação não altera status.
5. Card exibe a anatomia completa (§7.3); cliente clicável; tema escuro.
6. Quadro privado respeita grants (usuário/papel); não-admin não vê botões de configuração.
7. `ValidationQueue`, badge de validação, `MyInbox` e `TeamDashboard` continuam funcionando (regressão zero).
8. `vite build` e `npm run lint` passam; `types.ts` regenerado.
