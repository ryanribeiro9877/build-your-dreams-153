# Design — Kanban estilo Projuris · Sub-projeto 2 (Filtros — 3 camadas)

> **Data:** 2026-06-17 · **Projeto:** JurisAI (`build-your-dreams-153`) · **Status:** aprovado ("execute todos")
> **Depende de:** SP1 (Núcleo de Quadros Configuráveis), já em produção.
> **Spec SP1:** [2026-06-16-kanban-projuris-sp1-design.md](2026-06-16-kanban-projuris-sp1-design.md)

## 1. Objetivo e escopo

Adicionar ao Kanban (SP1) a **filtragem completa em 3 camadas** do Projuris, **client-side** sobre os cards já carregados do quadro ativo, mais **filtros salvos**.

### Decisões (brainstorming)
| # | Decisão | Valor |
|---|---|---|
| D1 | Onde filtra | **Client-side** (sobre `localCards` do quadro ativo) |
| D2 | Marcadores (tags) | **Adiado p/ SP3** (subsistema novo de tags + atribuição) |
| D3 | Filtros sem backing | **Cortados**: Unidade organizacional, Fila de trabalho, Grupos de trabalho |
| D4 | Dimensão de data | **Uma só** (`user_tasks.deadline_at`) — JurisAI não separa "prevista" vs "fatal" |
| D5 | Filtros salvos | **Incluídos no SP2** (tabela + RPCs, por usuário) |

### Fora de escopo
Marcadores/tags (SP3), detalhe-hub (SP3), timesheet/checklist/workflow (SP4).

## 2. Camadas de filtro

**(a) Abas de envolvimento** (filtro rápido, exclusivo):
- `Todas` · `Sou responsável` (`assignee_user_id == eu`) · `Estou envolvido` (`eu ∈ {assignee, assigner, validator}`) · `Delegadas por mim` (`assigner_user_id == eu`).
- **Requer** estender o card com `assigner_user_id` e `validator_user_id` (hoje só há `assignee_user_id`).

**(b) Barra de controle:**
- **Busca** textual (título, responsável, tipo, cliente, nº processo).
- **Ordenação:** Mais recentes (`created_at desc`) · Prazo (`deadline_at asc`, nulls last) · Prioridade (critical→low) · Título (A–Z).
- **Período** por `deadline_at` (intervalo de/até). Cards sem `deadline_at` entram só quando não há período definido.
- Botão **"Filtros"** com **badge** = nº de filtros avançados ativos.

**(c) Modal de filtros avançados** (campos):
- Responsáveis (multiseleção de `assignee_user_id`).
- Tipo de atividade (`task_type_label`).
- Área (`legal_area`).
- Situação (`task_situacao`).
- Nome do cliente (texto, casa em `client_name`).
- Número do processo (texto, casa em `process_number`).
- Período (de/até, mesma dimensão `deadline_at`).
- Botões: **Limpar · Cancelar · Buscar**.

## 3. Arquitetura

### Estado e função pura
- Tipo `KanbanFilterState` (em `@/types/jurisai`): `{ involvement: 'todas'|'responsavel'|'envolvido'|'delegadas'; search: string; sort: 'recentes'|'prazo'|'prioridade'|'titulo'; periodStart: string|null; periodEnd: string|null; assignees: string[]; taskTypes: string[]; areas: LegalArea[]; situacoes: TaskSituacao[]; clientName: string; processNumber: string }`.
- `EMPTY_FILTERS: KanbanFilterState` (constante).
- **`applyFilters(cards: KanbanCardV2[], f: KanbanFilterState, userId: string): KanbanCardV2[]`** — função **pura** em `src/lib/kanbanFilters.ts`: aplica envolvimento → avançados → busca, depois ordena. Testável com Vitest (cada camada + combinações).
- `countActiveAdvanced(f): number` — para o badge (conta só os campos da camada (c) + período; abas e busca não contam).

### Componentes (em `src/components/kanban/`)
- `KanbanFilterBar.tsx` — abas de envolvimento + busca + ordenação + período + botão "Filtros" (badge) + `SavedFiltersMenu`.
- `KanbanFilterModal.tsx` — modal avançado (overlay inline, padrão SP1), recebe opções (responsáveis, tipos, áreas, situações) e o estado; Limpar/Cancelar/Buscar.
- `SavedFiltersMenu.tsx` — dropdown: aplicar um filtro salvo, salvar o atual (prompt de nome), excluir.

### Hook
- `useKanbanFilters()` — estado local do filtro (`KanbanFilterState`) + setters; deriva opções (responsáveis/tipos/áreas/situações) a partir dos `cards` carregados (sem ida ao servidor).
- Funções de filtros salvos em `useKanban.ts`: `useSavedFilters()→{filters,...,refresh}`, `saveFilter(name, state)`, `deleteSavedFilter(id)`.

### Página (`KanbanBoard.tsx`)
- Mantém `localCards`; aplica `applyFilters(localCards, filters, user.id)` → `filteredCards`; agrupa `filteredCards` por coluna (em vez de `localCards`).
- O **drag** continua operando sobre os cards visíveis; ao mover, o update otimista respeita o filtro (card pode sair da vista se deixar de casar — comportamento aceitável).

## 4. Backend (mínimo)

Migration `supabase/migrations/20260617120000_kanban_sp2.sql` (idempotente, transacional):

1. **`get_kanban_board(uuid)`** — `CREATE OR REPLACE`: adiciona ao objeto `card` as chaves `assigner_user_id` (`ut.assigner_user_id`) e `validator_user_id` (`ut.validator_user_id`). Nada mais muda.
2. **Tabela `kanban_saved_filters`**: `id uuid pk`, `user_id uuid → auth.users ON DELETE CASCADE`, `name text NOT NULL`, `filter jsonb NOT NULL`, `created_at/updated_at`. Índice por `user_id`. **RLS:** só o próprio usuário (`user_id = auth.uid()`) lê/escreve.
3. **RPCs** (`SECURITY DEFINER`, padrão do projeto): `get_my_saved_filters()` (lista do usuário), `kanban_save_filter(p_name text, p_filter jsonb)→uuid`, `kanban_delete_saved_filter(p_id uuid)`.

> Filtros salvos guardam o **JSON do `KanbanFilterState`** (não dependem de board específico) — reaplicados client-side.

### Tipos
- `KanbanCardV2`: + `assigner_user_id: string | null`, `validator_user_id: string | null`.
- `KanbanFilterState`, `SavedFilter { id, name, filter: KanbanFilterState, created_at }`.

## 5. Testes
- TDD de `applyFilters` e `countActiveAdvanced` em `src/lib/kanbanFilters.test.ts` (Vitest), cobrindo: cada aba de envolvimento; busca; cada campo avançado; período (incl. cards sem data); cada ordenação; combinações; filtro vazio = todos.

## 6. Critérios de aceite
1. Abas de envolvimento filtram corretamente (incl. "Estou envolvido" via assigner/assignee/validator).
2. Busca, ordenação e período funcionam e combinam com os filtros avançados.
3. Modal avançado filtra por responsáveis/tipo/área/situação/cliente/processo/período; badge reflete os ativos; Limpar zera.
4. Salvar um filtro (nome), reaplicá-lo e excluí-lo — por usuário (RLS).
5. Drag-and-drop do SP1 segue funcionando com filtros ativos.
6. `tsc --noEmit` = 0, `vite build` e `lint` (arquivos novos) limpos; testes de `applyFilters` passam.

## 7. Riscos
| Risco | Mitigação |
|---|---|
| Card sem `assigner/validator` → abas quebram | Migration adiciona os 2 campos ao payload (item 4.1) |
| Filtro salvo com formato antigo (evolução do `KanbanFilterState`) | `applyFilters` faz merge com `EMPTY_FILTERS` (campos ausentes assumem default) |
| Card filtrado some no meio de um drag | Aceitável; o update otimista + `refreshBoard` reconciliam |
