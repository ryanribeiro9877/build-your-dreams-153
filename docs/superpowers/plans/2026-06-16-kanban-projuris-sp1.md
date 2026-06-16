# Kanban Projuris — Sub-projeto 1 (Núcleo de Quadros Configuráveis) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o Kanban atual (pipeline de fases) por um sistema de quadros configuráveis estilo Projuris — múltiplos boards, colunas de nome livre mapeadas a uma "situação", drag-and-drop que troca a situação, cartão com anatomia completa e modal de configuração (3 abas), tudo restrito a admin para configurar e aberto aos demais para mover cards.

**Architecture:** Modelo duplo — `user_task_status` (8 valores, intacto, dirige Inbox/Validação) + novo `task_situacao` (5 valores, eixo do Kanban). Tabelas novas `kanban_boards/columns/card_placements/favorites/grants`; RPCs `SECURITY DEFINER`; front em React (página + hooks + componentes) com `@hello-pangea/dnd`.

**Tech Stack:** Supabase (Postgres + RLS + RPC), React 18 + TypeScript + Vite, `@hello-pangea/dnd`, `sonner` (toast), Vitest. Estilo inline `CSSProperties` (paleta dark), sem shadcn nas telas de tarefa.

**Spec:** [2026-06-16-kanban-projuris-sp1-design.md](2026-06-16-kanban-projuris-sp1-design.md)

---

## Como este plano usa o código já rascunhado

Os 9 arquivos do SP1 já foram **gerados e reconciliados** (contrato consistente entre SQL → tipos → hooks → UI) e vivem em:

```
docs/superpowers/plans/2026-06-16-kanban-sp1-draft/
├── supabase/migrations/20260616120000_kanban_sp1.sql   (1036 linhas)
├── src/lib/kanbanSituacao.ts                            (mapa + rótulos)
├── src/lib/kanbanSituacao.test.ts                       (teste vitest)
├── src/types/jurisai.ts                                 (BLOCO a anexar — ver Task 2)
├── src/hooks/useKanban.ts                               (hooks + mutações)
├── src/components/kanban/kanbanStyles.ts
├── src/components/kanban/KanbanCard.tsx
├── src/components/kanban/KanbanColumn.tsx
├── src/components/kanban/BoardSelector.tsx
├── src/components/kanban/BoardConfigModal.tsx
├── src/pages/KanbanBoard.tsx                            (reescrita)
└── src/components/juris-cloud/JurisTopBar.tsx           (BLOCO a editar — ver Task 9)
```

Cada task copia o arquivo de rascunho para o destino real e **verifica** (build/lint/teste/smoke). O código completo está nos rascunhos — este plano dá a ordem, os comandos, os pontos de commit e os ajustes de integração conhecidos.

> **Nota (tamanho):** os arquivos de UI/SQL são grandes; por isso não são reproduzidos inline aqui — a fonte da verdade é o rascunho versionado acima. O único código inline é o do mapeador (Task 3, TDD real).

---

## Contrato reconciliado (glue entre camadas) — já aplicado nos rascunhos

Assinaturas/typings canônicos que TODAS as camadas respeitam (verificar que continuam batendo após qualquer ajuste):

- **RPC** `get_kanban_board(p_board_id uuid) → jsonb` `{ board, columns, cards }`, onde `board` inclui `id,name,is_private,is_owner,is_favorite,can_admin,card_count,hide_completed_after_days,simplified_cards,sort_order,grant_user_ids[],grant_role_codes[]`.
- **RPC** `get_kanban_boards() → setof` summary (`id,name,is_private,is_owner,is_favorite,can_admin,card_count,hide_completed_after_days,simplified_cards,sort_order`).
- **Tipos** (`@/types/jurisai`): `TaskSituacao` (5), `KanbanBoardSummary` (com `can_admin`), `KanbanBoardDetailBoard extends KanbanBoardSummary { grant_user_ids: string[]; grant_role_codes: string[] }`, `KanbanColumn`, `KanbanCardV2`, `KanbanBoardDetail { board: KanbanBoardDetailBoard; columns: KanbanColumn[]; cards: KanbanCardV2[] }`.
- **Hooks** (`@/hooks/useKanban`): `useKanbanBoards()→{boards,loading,error,refresh}`; `useKanbanBoard(boardId)→{board:KanbanBoardDetailBoard|null,columns,cards,loading,error,refresh}`; mutações **posicionais**: `createBoard(name,isPrivate,hideCompletedAfterDays|null,simplifiedCards)→string`, `updateBoard(boardId,name,isPrivate,hideCompletedAfterDays|null,simplifiedCards)`, `deleteBoard(boardId)`, `setColumns(boardId, {id?,name,situacao,position}[])`, `setBoardGrants(boardId,userIds[],roleCodes[])`, `moveCard(taskId,columnId,position)`, `addTaskToBoard(taskId,columnId)`, `removeTaskFromBoard(taskId)`, `toggleFavorite(boardId)`.

---

## Mapa de arquivos

| Destino | Ação | Responsabilidade |
|---|---|---|
| `supabase/migrations/20260616120000_kanban_sp1.sql` | criar | enum `task_situacao`, coluna `user_tasks.situacao`+backfill, tabelas kanban_*, RLS, helpers, RPCs, trigger, deprecações |
| `src/types/jurisai.ts` | anexar bloco | tipos do Kanban SP1 |
| `src/lib/kanbanSituacao.ts` | criar | `situacaoFromStatus`, `SITUACAO_LABELS`, `SITUACAO_ORDER` |
| `src/lib/kanbanSituacao.test.ts` | criar | testes do mapeador (TDD) |
| `src/hooks/useKanban.ts` | criar | hooks + mutações |
| `src/components/kanban/kanbanStyles.ts` | criar | estilos/paleta compartilhados |
| `src/components/kanban/KanbanCard.tsx` | criar | anatomia do cartão |
| `src/components/kanban/KanbanColumn.tsx` | criar | coluna (Droppable + cards) |
| `src/components/kanban/BoardSelector.tsx` | criar | menu suspenso de quadros |
| `src/components/kanban/BoardConfigModal.tsx` | criar | modal de 3 abas |
| `src/pages/KanbanBoard.tsx` | **substituir** | composição da tela (DragDropContext) |
| `src/components/juris-cloud/JurisTopBar.tsx` | editar | link Kanban visível a autenticados |

---

## Task 0: Branch e ponto de partida

**Files:** nenhum (git).

- [ ] **Step 1: Criar branch de feature**

```bash
git checkout -b feat/kanban-projuris-sp1
```

- [ ] **Step 2: Confirmar baseline verde**

Run: `npm run lint && npx vitest run`
Expected: lint sem erros; testes existentes PASS (incl. `src/test/example.test.ts`).

---

## Task 1: Migration do banco (Model B)

**Files:**
- Create: `supabase/migrations/20260616120000_kanban_sp1.sql` (de `docs/superpowers/plans/2026-06-16-kanban-sp1-draft/supabase/migrations/20260616120000_kanban_sp1.sql`)

- [ ] **Step 1: Copiar a migration para o destino real**

```bash
cp "docs/superpowers/plans/2026-06-16-kanban-sp1-draft/supabase/migrations/20260616120000_kanban_sp1.sql" "supabase/migrations/20260616120000_kanban_sp1.sql"
```

- [ ] **Step 2: Aplicar no banco de desenvolvimento**

Opção A (Supabase CLI local): `supabase db reset` (recria do zero aplicando todas as migrations) **ou** `supabase migration up`.
Opção B (MCP Supabase, ambiente remoto/dev): aplicar via `apply_migration` com o conteúdo do arquivo.
Expected: aplica sem erro. A função é idempotente (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP IF EXISTS`, guardas `DO $$` para enum/coluna).

- [ ] **Step 3: Smoke-test do enum, coluna e backfill**

Run (SQL editor / psql autenticado):
```sql
SELECT enum_range(NULL::public.task_situacao);
-- esperado: {pendente,em_execucao,concluida_sucesso,concluida_sem_sucesso,cancelado}
SELECT status, situacao, count(*) FROM public.user_tasks GROUP BY 1,2 ORDER BY 1,2;
-- esperado: distribuição coerente (assigned/draft->pendente; in_progress/awaiting_*/blocked->em_execucao; completed->concluida_sucesso; cancelled->cancelado)
```
Expected: enum com 5 valores; nenhuma linha com `situacao` incoerente com o mapa.

- [ ] **Step 4: Smoke-test do ciclo de board (como admin/CEO)**

Run:
```sql
SELECT public.kanban_create_board('Quadro Teste', true, 30, false) AS board_id; \gset
SELECT name, situacao, position FROM public.kanban_columns WHERE board_id = :'board_id' ORDER BY position;
SELECT public.kanban_add_task_to_board((SELECT id FROM public.user_tasks LIMIT 1),
       (SELECT id FROM public.kanban_columns WHERE board_id=:'board_id' AND situacao='pendente' LIMIT 1));
SELECT public.get_kanban_board(:'board_id');  -- deve trazer board{grant_user_ids,grant_role_codes,is_favorite,card_count} + columns + cards
SELECT public.kanban_move_card((SELECT user_task_id FROM public.kanban_card_placements WHERE board_id=:'board_id' LIMIT 1),
       (SELECT id FROM public.kanban_columns WHERE board_id=:'board_id' AND situacao='em_execucao' LIMIT 1), 0);
SELECT ut.status, ut.situacao FROM public.user_tasks ut
  JOIN public.kanban_card_placements cp ON cp.user_task_id=ut.id WHERE cp.board_id=:'board_id';
```
Expected: `get_kanban_board` retorna JSON com as 3 chaves e o `board` enriquecido; após mover para `em_execucao`, `situacao='em_execucao'` e `status` vira `in_progress` **ou** permanece `awaiting_validation/awaiting_external/blocked` (regra de não-sobrescrita).

- [ ] **Step 5: Verificar regressão zero da Fila de Validação**

Run:
```sql
SELECT count(*) FROM public.user_tasks WHERE status='awaiting_validation';
-- mover um card awaiting_validation para coluna em_execucao e reconferir que o count NÃO diminuiu:
```
Expected: a contagem de `awaiting_validation` não muda ao mover cards para colunas `em_execucao`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260616120000_kanban_sp1.sql
git commit -m "feat(kanban): migration SP1 — task_situacao, tabelas de board, RPCs e trigger (Model B)"
```

---

## Task 2: Tipos do domínio (Kanban SP1)

**Files:**
- Modify: `src/types/jurisai.ts` (anexar ao final, após a última interface `FindUserMissingAgentsRow`)

- [ ] **Step 1: Anexar o bloco de tipos ao final de `src/types/jurisai.ts`**

Conteúdo a anexar = o arquivo `docs/superpowers/plans/2026-06-16-kanban-sp1-draft/src/types/jurisai.ts` (já reconciliado: `TaskSituacao`, `KanbanBoardSummary` com `can_admin`, `KanbanColumn`, `KanbanCardV2`, `KanbanBoardDetailBoard`, `KanbanBoardDetail`). Reusa `UserTaskStatus/LegalArea/TaskPriority` já existentes no arquivo.

```bash
printf '\n' >> src/types/jurisai.ts
cat "docs/superpowers/plans/2026-06-16-kanban-sp1-draft/src/types/jurisai.ts" >> src/types/jurisai.ts
```

- [ ] **Step 2: Verificar type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: sem novos erros relativos aos tipos do Kanban.

- [ ] **Step 3: Commit**

```bash
git add src/types/jurisai.ts
git commit -m "feat(kanban): tipos SP1 (TaskSituacao, boards, colunas, cards)"
```

---

## Task 3: Mapeador situação↔status (TDD)

**Files:**
- Create: `src/lib/kanbanSituacao.ts`
- Test: `src/lib/kanbanSituacao.test.ts`

- [ ] **Step 1: Copiar o TESTE primeiro (deve falhar — módulo ainda não existe)**

```bash
cp "docs/superpowers/plans/2026-06-16-kanban-sp1-draft/src/lib/kanbanSituacao.test.ts" "src/lib/kanbanSituacao.test.ts"
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/lib/kanbanSituacao.test.ts`
Expected: FAIL — não resolve `./kanbanSituacao` (módulo inexistente).

- [ ] **Step 3: Copiar a implementação**

```bash
cp "docs/superpowers/plans/2026-06-16-kanban-sp1-draft/src/lib/kanbanSituacao.ts" "src/lib/kanbanSituacao.ts"
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/lib/kanbanSituacao.test.ts`
Expected: PASS — cobre os 8 status → situação, e a ordem/labels das 5 situações.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kanbanSituacao.ts src/lib/kanbanSituacao.test.ts
git commit -m "feat(kanban): mapeador situacao<->status com testes (TDD)"
```

---

## Task 4: Hooks de dados e mutações

**Files:**
- Create: `src/hooks/useKanban.ts`

- [ ] **Step 1: Copiar o hook**

```bash
cp "docs/superpowers/plans/2026-06-16-kanban-sp1-draft/src/hooks/useKanban.ts" "src/hooks/useKanban.ts"
```

- [ ] **Step 2: Verificar type-check (depende dos tipos da Task 2)**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: sem erros — `useKanbanBoard` retorna `board: KanbanBoardDetailBoard|null`; `createBoard/updateBoard` posicionais batem com o que a página chamará.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useKanban.ts
git commit -m "feat(kanban): hooks useKanbanBoards/useKanbanBoard + mutações RPC"
```

---

## Task 5: Estilos compartilhados

**Files:**
- Create: `src/components/kanban/kanbanStyles.ts`

- [ ] **Step 1: Copiar**

```bash
mkdir -p src/components/kanban
cp "docs/superpowers/plans/2026-06-16-kanban-sp1-draft/src/components/kanban/kanbanStyles.ts" "src/components/kanban/kanbanStyles.ts"
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/kanban/kanbanStyles.ts
git commit -m "feat(kanban): estilos compartilhados (paleta dark)"
```

---

## Task 6: Componentes de cartão e coluna

**Files:**
- Create: `src/components/kanban/KanbanCard.tsx`
- Create: `src/components/kanban/KanbanColumn.tsx`

- [ ] **Step 1: Copiar os dois componentes**

```bash
cp "docs/superpowers/plans/2026-06-16-kanban-sp1-draft/src/components/kanban/KanbanCard.tsx" "src/components/kanban/KanbanCard.tsx"
cp "docs/superpowers/plans/2026-06-16-kanban-sp1-draft/src/components/kanban/KanbanColumn.tsx" "src/components/kanban/KanbanColumn.tsx"
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: sem erros — `KanbanCard` consome `KanbanCardV2`; `KanbanColumn` usa `Droppable`/`Draggable`.

- [ ] **Step 3: Commit**

```bash
git add src/components/kanban/KanbanCard.tsx src/components/kanban/KanbanColumn.tsx
git commit -m "feat(kanban): componentes KanbanCard e KanbanColumn"
```

---

## Task 7: Seletor de quadros e modal de configuração

**Files:**
- Create: `src/components/kanban/BoardSelector.tsx`
- Create: `src/components/kanban/BoardConfigModal.tsx`

- [ ] **Step 1: Copiar**

```bash
cp "docs/superpowers/plans/2026-06-16-kanban-sp1-draft/src/components/kanban/BoardSelector.tsx" "src/components/kanban/BoardSelector.tsx"
cp "docs/superpowers/plans/2026-06-16-kanban-sp1-draft/src/components/kanban/BoardConfigModal.tsx" "src/components/kanban/BoardConfigModal.tsx"
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: sem erros — o `board` recebido pelo `BoardConfigModal` é `KanbanBoardDetailBoard & { columns: KanbanColumn[] }` (a página passa `{ ...board, columns }`). Se o tsc reclamar do tipo do prop `board` do modal, alinhar a interface de props do modal para `KanbanBoardDetailBoard & { columns: KanbanColumn[] }`.

- [ ] **Step 3: Commit**

```bash
git add src/components/kanban/BoardSelector.tsx src/components/kanban/BoardConfigModal.tsx
git commit -m "feat(kanban): BoardSelector (menu suspenso) e BoardConfigModal (3 abas)"
```

---

## Task 8: Reescrita da página KanbanBoard

**Files:**
- Modify (substituir conteúdo): `src/pages/KanbanBoard.tsx`

- [ ] **Step 1: Substituir a página pela versão Model B**

```bash
cp "docs/superpowers/plans/2026-06-16-kanban-sp1-draft/src/pages/KanbanBoard.tsx" "src/pages/KanbanBoard.tsx"
```

- [ ] **Step 2: Corrigir o destino do link de cliente (ajuste de integração conhecido)**

A rota real do cliente é `/clientes/:id` (ver `src/App.tsx`), não `/sistema/clientes?client=`. Em `handleOpenClient`, trocar:

```ts
// de:
navigate(`/sistema/clientes?client=${clientId}`);
// para:
navigate(`/clientes/${clientId}`);
```

(O `handleEditCard` aponta para `/sistema/tarefas?task=<id>`; `/sistema/tarefas` existe — a navegação cai no MyInbox mesmo sem deep-link. Aceitável no SP1; deep-link de tarefa é tratado no SP3.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: sem erros — a página usa `useKanbanBoards`, `useKanbanBoard(activeBoardId)`, `createBoard/updateBoard` posicionais, `setColumns`, `setBoardGrants`, `toggleFavorite`, e compõe `DragDropContext`.

- [ ] **Step 4: Commit**

```bash
git add src/pages/KanbanBoard.tsx
git commit -m "feat(kanban): reescrita da página /sistema/kanban (quadros configuráveis + DnD)"
```

---

## Task 9: Visibilidade do link na topbar

**Files:**
- Modify: `src/components/juris-cloud/JurisTopBar.tsx`

- [ ] **Step 1: Aplicar a edição do rascunho**

Mover o botão "Kanban" (ícone `KanbanSquare`, `navigate('/sistema/kanban')`) para FORA do gate `{isMaster && (...)}`, deixando-o visível a qualquer usuário autenticado. Conteúdo de referência: `docs/superpowers/plans/2026-06-16-kanban-sp1-draft/src/components/juris-cloud/JurisTopBar.tsx` (bloco a substituir, ~linha 141, descrito no `anchor`). O `import { KanbanSquare }` já existe; nenhum import novo.

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit -p tsconfig.app.json && npm run lint`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/juris-cloud/JurisTopBar.tsx
git commit -m "feat(kanban): link Kanban visível a usuários autenticados (acesso fino no backend)"
```

---

## Task 10: Regenerar tipos, build e verificação manual

**Files:** `src/integrations/supabase/types.ts` (regenerado).

- [ ] **Step 1: Regenerar os tipos do Supabase**

Run: `npm run types:regen` (requer `SUPABASE_PROJECT_ID`). Se indisponível no ambiente, pular e anotar — o app usa casts `as never` nas RPCs novas, então o build não depende disso.
Expected: `src/integrations/supabase/types.ts` atualizado com as tabelas/colunas novas.

- [ ] **Step 2: Build de produção**

Run: `npm run build`
Expected: build conclui sem erros de tipo.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: sem erros.

- [ ] **Step 4: Verificação manual no app (dev server)**

Run: `npm run dev` e, autenticado como **admin/CEO**:
1. Abrir `/sistema/kanban` → criar um quadro ("+ Novo quadro").
2. Abrir ⚙ Configurar → criar 3 colunas com situações diferentes; salvar.
3. Adicionar uma tarefa ao quadro; arrastar o cartão entre colunas e confirmar que a situação muda (toast de sucesso, posição persiste após refresh).
4. Favoritar ⭐ e trocar de quadro pelo menu suspenso.
5. Marcar "Quadro privado" + conceder a um usuário; logar como esse usuário (não-admin) e confirmar: vê o quadro, **move** cards, **não** vê ⚙/+ Novo quadro.

Expected: comportamento conforme os critérios de aceite do spec §11.

- [ ] **Step 5: Verificação de regressão (sem quebrar V18/Inbox)**

1. `/sistema/validar` (Fila de Validação): tarefas `awaiting_validation` continuam aparecendo.
2. Mover no Kanban um card cuja tarefa esteja `awaiting_validation` para uma coluna `em_execucao` → confirmar que ela **continua** na Fila de Validação (não foi arrancada).
3. `/sistema/tarefas` (MyInbox) e badge de validação funcionam normalmente.

Expected: regressão zero.

- [ ] **Step 6: Remover artefatos de rascunho do versionamento (opcional)**

Os rascunhos em `docs/superpowers/plans/2026-06-16-kanban-sp1-draft/` e `scripts/extract-kanban-draft.mjs` podem ser removidos ou mantidos como referência. Se remover:
```bash
git rm -r "docs/superpowers/plans/2026-06-16-kanban-sp1-draft" scripts/extract-kanban-draft.mjs
```

- [ ] **Step 7: Commit final**

```bash
git add -A
git commit -m "chore(kanban): regenera tipos, valida build/lint e limpa rascunhos do SP1"
```

---

## Self-Review

**1. Cobertura do spec (§ do design → task):**
- §4.1 enum `task_situacao` → Task 1. ✓
- §4.2 coluna `user_tasks.situacao` + backfill → Task 1. ✓
- §4.3 tabelas (boards/columns/placements/favorites/grants) → Task 1. ✓
- §4.4 RLS → Task 1. ✓
- §5 RPCs (leitura/config/move/favorito) + helpers + trigger → Task 1. ✓
- §6 regras situação↔status (mapa 8→5, inverso, não-sobrescrita, sem_sucesso) → Task 1 (SQL) + Task 3 (mapeador de display). ✓
- §6.5 badge "em validação" → Task 6 (KanbanCard). ✓
- §7.1 arquivos front (hooks/componentes/tipos) → Tasks 2,4,5,6,7,8. ✓
- §7.2 drag-and-drop padrão TaskQueuesPanel → Task 8 (DragDropContext) + Task 6 (Droppable/Draggable). ✓
- §7.3 anatomia do card + origem (processo/cliente/interna) + TAR + cliente clicável → Task 6 + Task 8 (link corrigido). ✓
- §7.4 visibilidade/topbar → Task 9. ✓
- §5.6 depreciação Model A → Task 1 (comentários; sem drop). ✓
- §11 critérios de aceite → Task 10 (verificação manual + regressão). ✓

**2. Placeholders:** nenhum passo usa "TBD/implementar depois". O código completo vive nos rascunhos versionados; cada task referencia caminho exato + comando de cópia + verificação. O único ajuste manual (link de cliente, Task 8 Step 2) está com o código exato.

**3. Consistência de tipos:** contrato reconciliado e aplicado nos rascunhos (Task de reconciliação já feita antes deste plano):
- `createBoard/updateBoard` posicionais em `useKanban.ts` **e** chamadas posicionais em `KanbanBoard.tsx`. ✓
- `KanbanBoardDetailBoard` (com `grant_user_ids/grant_role_codes`) em tipos, retornado por `get_kanban_board(uuid)` (SQL) e tipado no retorno de `useKanbanBoard`. ✓
- `can_admin` presente em `KanbanBoardSummary` e retornado por `get_kanban_boards()`. ✓
- `setColumns(boardId, cols)` / `setBoardGrants(boardId,userIds,roleCodes)` batem entre hook e página. ✓

**Riscos residuais conhecidos (verificar no build/manual):**
- Prop `board` do `BoardConfigModal` deve aceitar `KanbanBoardDetailBoard & { columns }` (Task 7 Step 2 cobre o ajuste se o tsc reclamar).
- `memberOptions/roleOptions` no modal leem `profiles`/`role_templates` via cast (padrão atual do repo); funciona, mas idealmente vira RPC dedicada em iteração futura.
- `npm run types:regen` depende de credencial; se ausente, o app compila mesmo assim (casts `as never`).

---

## Execução

Plano completo e salvo em `docs/superpowers/plans/2026-06-16-kanban-projuris-sp1.md`. Duas opções de execução:

1. **Subagente por tarefa (recomendado)** — um subagente novo por task, revisão entre tasks, iteração rápida.
2. **Execução inline** — executar as tasks nesta sessão com `executing-plans`, em lotes com checkpoints.
