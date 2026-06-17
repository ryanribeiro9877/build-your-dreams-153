# Design — Kanban estilo Projuris · Sub-projeto 4 (Blocos funcionais)

> **Data:** 2026-06-17 · **Projeto:** JurisAI (`build-your-dreams-153`) · **Status:** aprovado
> **Depende de:** SP1–SP3 (em produção). Todos os blocos entram como seções do `TaskDetailModal` (SP3).

## 1. Escopo (decisões do brainstorming)
| # | Decisão | Valor |
|---|---|---|
| D1 | Blocos incluídos | **Checklist**, **Documentos**, **Workflow** (motor) |
| D2 | Fora | **Timesheet** e **Auditoria** (adiados) |
| D3 | Motor de workflow | **Rastreador de etapas sequenciais** (sem automação/ramificação) |
| D4 | Documentos | Anexos completos (reuso `TaskAttachments`) + **ponto de entrada** ao módulo de docs/IA (não reimplementa geração) |
| D5 | Gestão de templates de workflow | Modal admin (`WorkflowTemplatesModal`) aberto pelo cabeçalho do Kanban (**⚙ Fluxos**) |

## 2. Bloco A — Checklist
- **Tabela** `task_checklist_items (id, user_task_id→user_tasks CASCADE, body text, done bool default false, position int, created_at)`. RLS: SELECT por `kanban_can_edit_task`. Escrita via RPC.
- **RPCs (`SECURITY DEFINER`, gate `kanban_can_edit_task`):** `get_task_checklist(task_id)`; `kanban_add_checklist_item(task_id, body)→id`; `kanban_toggle_checklist_item(item_id, done)`; `kanban_delete_checklist_item(item_id)`.
- **UI:** seção "Checklist" no modal — itens (checkbox + texto), adicionar/remover, progresso `n/total`. Hook `useChecklist(taskId)`.

## 3. Bloco B — Documentos
- **Anexos:** renderizar `<TaskAttachments taskId canUpload={…}/>` (componente existente, completo) como seção "Documentos".
- **Modelo/IA:** botão **"Usar modelo / IA"** que navega ao fluxo existente de documentos/agentes com contexto da tarefa (ex.: `/sistema/chat?task=<id>&client=<clientId>`). **Sem** reimplementar `bacellarDocx`/geração no modal. Sem backend novo.

## 4. Bloco C — Workflow (rastreador de etapas sequenciais)
**Tabelas:**
- `workflow_templates (id, name, created_at)`.
- `workflow_template_steps (id, template_id→CASCADE, name, position)`.
- `task_workflow_instances (id, user_task_id→CASCADE, template_id, template_name, started_by, started_at)`. (UNIQUE parcial? não — permite reiniciar; o front mostra a instância mais recente.)
- `task_workflow_step_states (id, instance_id→CASCADE, name, position, done bool default false, done_at, done_by)` — **cópia** das etapas do template no início.

**RPCs (`SECURITY DEFINER`):**
- `get_workflow_templates() → (id, name, step_count)` — leitura p/ autenticados.
- `kanban_create_workflow_template(p_name text, p_steps text[]) → uuid` — gate `kanban_can_admin`; cria template + etapas ordenadas.
- `kanban_delete_workflow_template(p_id uuid)` — gate `kanban_can_admin`.
- `get_task_workflow(p_task_id uuid) → jsonb` — instância mais recente da tarefa + step_states (ou `null`). Gate `kanban_can_edit_task`.
- `kanban_start_workflow(p_task_id uuid, p_template_id uuid) → uuid` — cria instância + copia etapas como step_states (done=false). Gate `kanban_can_edit_task`.
- `kanban_set_workflow_step(p_step_state_id uuid, p_done boolean)` — marca etapa; grava `done_at/by`. Gate: `kanban_can_edit_task` da tarefa dona da instância.

**UI:**
- Seção "Workflow" no `TaskDetailModal`: sem instância → seletor de template + **"Iniciar fluxo"**; com instância → lista de etapas (checkbox) + **barra de progresso** (% concluído) + nome do template.
- `WorkflowTemplatesModal` (admin): listar/criar (nome + etapas, uma por linha)/excluir templates. Botão **⚙ Fluxos** no cabeçalho do Kanban (só admin).

## 5. Tipos / hooks / componentes
- **Tipos** (`@/types/jurisai`): `ChecklistItem`, `WorkflowTemplateSummary`, `WorkflowStepState`, `TaskWorkflow { instance_id, template_name, started_at, steps: WorkflowStepState[] } | null`.
- **Hooks** (`useKanban.ts`): `useChecklist(taskId)` + `addChecklistItem`/`toggleChecklistItem`/`deleteChecklistItem`; `useWorkflowTemplates()` + `createWorkflowTemplate`/`deleteWorkflowTemplate`; `useTaskWorkflow(taskId)` + `startWorkflow`/`setWorkflowStep`.
- **Componentes** (`src/components/kanban/`): `ChecklistSection.tsx`, `WorkflowSection.tsx`, `WorkflowTemplatesModal.tsx`; `TaskDetailModal` ganha as seções Documentos/Checklist/Workflow; `KanbanBoard` ganha o botão **⚙ Fluxos** (admin) + o modal.
- RPCs novas com `as never` no front até `npm run types:regen`.

## 6. Critérios de aceite
1. Checklist: adicionar/marcar/remover itens; progresso atualiza.
2. Documentos: anexar/baixar arquivo (TaskAttachments) no modal; botão "Usar modelo / IA" navega ao módulo de docs/chat com contexto.
3. Workflow: admin cria template (nome + etapas) em ⚙ Fluxos; numa tarefa, "Iniciar fluxo" → etapas aparecem; marcar etapa atualiza o progresso.
4. `tsc` 0 · `vite build` · `eslint` (novos) · `vitest` (sem regressão).

## 7. Riscos
| Risco | Mitigação |
|---|---|
| Escopo do "motor" explodir | D3 fixa rastreador sequencial (sem automação) |
| Geração de documento/IA no modal vira projeto | D4: só ponto de entrada (navegação), anexos completos |
| Templates de workflow editados afetam instâncias rodando | step_states são **cópia** no início; template é só molde |
| Tabelas novas fora do types.ts | RPCs com `as never` até `types:regen` (ver [[jurisai-typecheck-gotcha]]) |
