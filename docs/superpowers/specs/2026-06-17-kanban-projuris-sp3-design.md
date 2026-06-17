# Design — Kanban estilo Projuris · Sub-projeto 3 (Detalhe-hub da tarefa)

> **Data:** 2026-06-17 · **Projeto:** JurisAI (`build-your-dreams-153`) · **Status:** aprovado
> **Depende de:** SP1 (quadros) + SP2 (filtros), ambos em produção.

## 1. Escopo

O "hub" da tarefa do Projuris, em 3 partes construídas em sequência num ciclo:

### Decisões (brainstorming)
| # | Decisão | Valor |
|---|---|---|
| D1 | Modal | **Overlay inline** (padrão SP1/SP2; "tela cheia" = toggle CSS). Sem rota-modal. |
| D2 | Marcadores | **Criação livre ao digitar** (tags compartilhadas no escritório). |
| D3 | @menção | **Notifica o mencionado** via `bottleneck_notifications` (tabela do sino), criada por RPC `SECURITY DEFINER`. |
| D4 | Campo "local" | **Cortado** (não existe em `user_tasks`). |
| D5 | Edição de situação/tipo no modal | **Fora** do SP3 (situação muda arrastando no board; tipo é leitura). |

## 2. SP3.1 — Modal de detalhe (hub)

Componente `TaskDetailModal.tsx` (overlay inline), aberto pelo card (clique no corpo ou ⋮ → "Abrir"). Busca o detalhe por `useTaskDetail(taskId)` (RPC `get_user_task_detail`).

- **Cabeçalho:** título + badge de situação + ações: **Editar** (modo edição inline), **Excluir** (remove a tarefa), **tela cheia** (toggle CSS).
- **Vínculos:** cliente (link `/clientes/:id`), processo (`PRO.<process_number>`, rótulo), responsável/delegante/validador (nomes), **"Trocar quadro"** (board picker → `kanban_move_card` para a 1ª coluna do quadro destino).
- **Detalhes editáveis** (modo edição → `UPDATE` direto em `user_tasks`, RLS permite envolvidos/admin): título, descrição, **data fatal** (`deadline_at`), **responsável** (`assignee_user_id`), prioridade. Leitura: `TAR.<id8>`, tipo, situação, datas de criação/conclusão.
- **Marcadores** (SP3.2) e **Comentários** (SP3.3) renderizam como seções do modal.

**RPC** `get_user_task_detail(p_task_id uuid) → jsonb`: a tarefa + labels (cliente, processo, nomes de responsável/delegante/validador, tipo) + tags + placement atual (board/coluna). Gate: envolvido na tarefa OR admin OR acesso a um board onde ela está.

## 3. SP3.2 — Marcadores/tags (net-new)

**Tabelas:** `kanban_tags (id, name UNIQUE-normalizado, color, created_at)`; `task_tags (user_task_id, tag_id, PK composta)`. RLS: leitura para autenticados; escrita via RPC.

**RPCs (`SECURITY DEFINER`):**
- `get_kanban_tags() → setof (id, name, color)` — lista do escritório.
- `kanban_set_task_tags(p_task_id uuid, p_names text[])` — define as tags da tarefa, **criando as inexistentes** (find-or-create por nome normalizado lower/trim). Gate: envolvido na tarefa OR admin OR board-access.
- `get_kanban_board_tags(p_board_id uuid) → setof (user_task_id, tags jsonb)` — tags por card do quadro, **merged client-side** no `useKanbanBoard` (mesmo padrão do envolvimento do SP2; NÃO reescreve `get_kanban_board`).

**Front:**
- `KanbanCardV2` ganha `tags: { id, name, color }[]` (preenchido pelo merge). Chip(s) de tag no card (`KanbanCard`).
- Seção "Marcadores" no `TaskDetailModal`: input com criação livre (Enter cria/adiciona) + remoção; salva via `kanban_set_task_tags`.
- **Integração ao filtro SP2:** `KanbanFilterState` ganha `marcadores: string[]` (ids); `applyFilters` filtra por tag (card tem ≥1 tag em `marcadores`); `countActiveAdvanced` conta; `KanbanFilterModal` ganha a seção Marcadores (opções derivadas das tags presentes nos cards). Testes do `applyFilters` estendidos (TDD).

## 4. SP3.3 — Comentários com @menção (net-new)

**Tabela:** `user_task_comments (id, user_task_id, author_user_id, body text CHECK length<=2000, mentioned_user_ids uuid[], created_at)`. RLS: leitura/insert para envolvido-na-tarefa OR admin OR board-access; autor = `auth.uid()`.

**RPCs (`SECURITY DEFINER`):**
- `get_task_comments(p_task_id uuid) → setof (id, author_user_id, author_name, body, mentioned_user_ids, created_at)`.
- `kanban_add_comment(p_task_id uuid, p_body text, p_mentioned uuid[]) → uuid` — insere o comentário **e**, para cada mencionado, insere em `bottleneck_notifications (user_id, alert_type='mention', message)` (bypassa a RLS de insert-próprio por ser SECURITY DEFINER). Gate: como acima.

**Front:** seção "Comentários" no modal — lista (autor, data, corpo com nomes mencionados em destaque) + textarea (≤2000) + multiselect "@ Mencionar" (usuários do quadro). Sem autocomplete inline de @ no SP3 (multiselect entrega menção + notificação).

## 5. Padrões / backend
- **2 migrations** (`20260617130000_kanban_sp3_tags.sql`, `20260617140000_kanban_sp3_comments.sql`) — pequenas; **não** reescrevem `get_kanban_board` (RPCs auxiliares + merge).
- `get_user_task_detail` pode ir junto da migration de tags (ou própria).
- RPCs no padrão do projeto (`SECURITY DEFINER`, `search_path=public`, gate, REVOKE/GRANT). Casts `as never` no front até `types:regen`.

## 6. Critérios de aceite
1. Abrir card → modal com vínculos/detalhes; editar título/descrição/prazo/responsável/prioridade e salvar; excluir; "Trocar quadro".
2. Adicionar/remover marcadores (criação livre); chips aparecem no card; filtrar por marcador no modal de filtros do SP2.
3. Comentar; @mencionar um usuário cria notificação no sino dele; lista de comentários atualiza.
4. `tsc` 0 · `vitest` (incl. applyFilters c/ marcadores) · `build` · `lint` limpos.

## 7. Riscos
| Risco | Mitigação |
|---|---|
| Reescrever `get_kanban_board` (135 linhas) p/ tags | Evitado — RPC `get_kanban_board_tags` + merge client-side |
| Duplicatas de tags por digitação | `kanban_set_task_tags` normaliza (lower/trim) e faz find-or-create |
| @menção inserir notificação p/ outro usuário (RLS) | RPC `SECURITY DEFINER` bypassa o WITH CHECK de insert-próprio |
| `bottleneck_notifications` é semanticamente "gargalo" | É a tabela real do sino; reuso com `alert_type='mention'` (pragmático) |
