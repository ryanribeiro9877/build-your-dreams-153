# TRILHA C · Ciclo 3 — Checklist de documentos comandado pelo chat (card 6.3)

**Data:** 2026-07-09 · **Branch:** `claude/trilha-c-audio-atendimento` (worktree `wt-trilha-c`)

## 1. Objetivo
Comando de chat como *"Para Crefisa, solicite extrato e contrato; registre como pendentes"* → o agente identifica o cliente + documentos + réu, e **cria as pendências documentais**, usando o **mesmo cartão de confirmação editável** do 4.1 (propor → revisar → confirmar → gravar), atrás de uma **flag dedicada** (não o `CHAT_TOOLS` global). Pendências vinculadas ao cliente, visíveis à recepção; servem de **cobrança** do documento pendente. Bloqueio ocorre no **protocolo** (gate existente), não na entrada.

## 2. Descobertas que moldam o design (exploração)
- **`client_required_set` NÃO recebe tipo de ação/réu** — só distingue `cooperado`/`nao_cooperado`. Não existe required-set keyed por réu/ação. Logo, o "checklist por ação" via required-set **não existe no banco**; construí-lo seria schema novo.
- **Motor de pendências existe e basta para o MVP:** `criar_pendencia(p_tipo, p_titulo, p_cliente_id, p_descricao, p_responsavel_user_id, p_prazo, p_data_fatal)` cria um `user_task` `is_pendencia` atribuído (default = quem cria), com prazo/data fatal — **isto já é a "tarefa de cobrança" vinculada ao cliente**.
- **Fluxo 4.1 é genérico:** qualquer write-tool chamada pelo LLM passa por `proposeAction` → cartão `ActionCard` (mostra `humanSummary(tool,args)` como resumo) → confirm → `runWriteTool`. **O `ActionCard` já renderiza tools genéricas** (linha de descrição + Confirmar/Cancelar) → **sem mudança de front-end**.
- **Gate de 3 camadas:** flag env (por classe read/write) + `agents.allowed_tools` (por agente) + RBAC (por tool). Não há flag por-tool ainda — adiciono uma no mesmo idioma.
- **Bloqueio:** `auto_liberar_gate_documental` já governa o gate documental (entrada não trava; gera pendência); o protocolo é que bloqueia. 6.3 **não adiciona bloqueio novo** — só cria pendências (não-bloqueantes); o gate existente segue governando.

## 3. Decisões (MVP)
| # | Decisão |
|---|---------|
| 1 | Nova write-tool `solicitar_checklist_documental` (args: `cliente_id`, `documentos: string[]`, `reu?`, `responsavel_user_id?`, `prazo?`). O agente resolve o cliente com `consultar_cliente` antes e passa `cliente_id` (padrão do `criar_pendencia`). |
| 2 | **Flag dedicada** `CHAT_DOC_CHECKLIST_ENABLED` (default OFF), **independente** de `CHAT_TOOLS_ENABLED`. Deploy é inerte até ligar. Gating no mesmo ponto (`gatedToolNames`). |
| 3 | Handler mapeia cada documento (texto livre) → `tipo` de pendência via **dicionário determinístico testável** (`docChecklist.ts`: `mapDocumentoToTipo`, `buildPendenciaTitulo`), e chama `criar_pendencia` **uma vez por documento**, com o réu no título/descrição. Retorna `{ pendencias: [...], total }`. |
| 4 | **Cartão de confirmação = reuso total do 4.1** (`proposeAction`/`ActionCard`); só acrescento um case em `humanSummary`. **Sem mudança de front-end.** |
| 5 | **Cobrança:** a própria pendência (`user_task` `is_pendencia`, atribuída, com prazo) É a cobrança vinculada ao cliente — evita `create_user_task` (que exige `can_assign`) e a duplicação. Documentado. |
| 6 | **Bloqueio:** nenhum código novo — as pendências são não-bloqueantes; o `auto_liberar_gate_documental` existente governa o protocolo. |
| 7 | **Habilitação:** para usar em produção, (a) ligar `CHAT_DOC_CHECKLIST_ENABLED=true` no env do edge e (b) adicionar `solicitar_checklist_documental` ao `agents.allowed_tools` do agente da recepção. Ambos manuais (documentados) — mantêm o deploy inerte. |

**Fora de escopo (YAGNI/futuro):** required-set keyed por réu/ação (schema novo); cartão de checklist pós-confirm dedicado (as pendências já aparecem na aba Pendências/recepção); resolução de cliente por nome dentro do handler (o agente resolve antes via `consultar_cliente`).

## 4. Arquivos
| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `supabase/functions/chat-orchestrator/tools/docChecklist.ts` | novo | Puro/testável: `mapDocumentoToTipo(doc)`, `buildPendenciaTitulo(doc, reu?)`. |
| `supabase/functions/chat-orchestrator/tools/docChecklist.test.ts` | novo | Deno test (roda no job `edge`). |
| `supabase/functions/chat-orchestrator/tools/registry.ts` | editar | Adiciona a `ToolDef` `solicitar_checklist_documental` (write). |
| `supabase/functions/chat-orchestrator/tools/handlers.ts` | editar | `runWriteTool` case: loop `criar_pendencia` via `docChecklist`. Import do módulo. |
| `supabase/functions/chat-orchestrator/index.ts` | editar | Flag `CHAT_DOC_CHECKLIST_ENABLED` + `DOC_CHECKLIST_TOOL`; gating independente; case em `humanSummary`. |

## 5. Segurança / RBAC
- Write-tool → passa por `proposeAction` (auditoria em `agent_actions`) e só executa no confirm (identidade do usuário via `userClient`; RLS/`criar_pendencia` `security definer` valem). Sem `NEEDS_ASSIGN` (não é `criar_card_tarefa`) → executa para qualquer autenticado, como as demais pendências. Flag OFF por padrão + `allowed_tools` por agente = duas camadas de contenção.

## 6. Testes & verificação
- **Deno (CI `edge`):** `docChecklist.test.ts` (mapa determinístico: conhecidos + default `documentacao`; título com/sem réu). `toolSchemas.test.ts`/`rbac.test.ts` existentes seguem passando (o novo tool é write comum; schema iterado genericamente).
- **CI:** `deno check` de `index.ts` já cobre `handlers.ts`/`registry.ts`/`docChecklist.ts` transitivamente.
- **Aceite manual (usuário, após habilitar flag + allowed_tools):** no chat, "Para Crefisa, solicite extrato e contrato; registre como pendentes" → cartão de confirmação com os documentos → confirmar → pendências criadas e visíveis (aba Pendências do cliente / recepção); tarefa/pendência de cobrança vinculada.

## 7. Aceite
1. Comando no chat gera o checklist → pendências corretas por documento (tipo mapeado), com o réu.
2. Cartão de confirmação editável (reuso 4.1), atrás da flag dedicada (não `CHAT_TOOLS`).
3. Pendência vinculada ao cliente e visível; serve de cobrança.
4. Bloqueio no protocolo (gate existente), não na entrada.
