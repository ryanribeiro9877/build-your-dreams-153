# Entrega — Chat agêntico v1 (ações do sistema via tool-calling)

**Data:** 2026-06-30 · **Branch:** `feat/chat-agentico-acoes` → merge na `main` (`d30856f`)
**Spec:** `docs/superpowers/specs/2026-06-30-chat-agentico-acoes-design.md` · **Plano:** `docs/superpowers/plans/2026-06-30-chat-agentico-acoes.md`

## O que foi entregue (FEAT-04 = interno)
O chat principal passa a poder **executar ações reais** do sistema via function-calling: consultar (cliente, usuário, tarefas, processo, documentos), cadastrar cliente, criar card de tarefa e solicitar documentos/acesso. Escrita passa por **cartão de confirmação**; execução roda com a **identidade do usuário** (RLS/RBAC); sem permissão → **encaminha pendência ao Admin**. Redação de peças fica intocada.

## Estado: DEPLOYADO E INERTE
- Edge `chat-orchestrator` deployado (**v65**) e frontend em produção (Vercel), porém **desligado** por padrão.
- O loop de ferramentas só ativa quando a env var **`CHAT_TOOLS_ENABLED=true`** está definida no edge. Sem ela, o orquestrador roda exatamente como antes e nenhum `action_proposal` é gerado (o `ActionCard` nunca aparece).

## Componentes
- **Migration** `20260630120000_agent_tools_actions.sql` (aplicada em prod): `agents.allowed_tools`, `orchestration_runs.pending_actions`, tabela de auditoria `agent_actions` (RLS). Seeds: `assistant_root` (todas as ferramentas) + recepção/triagem (subset).
- **Edge** `tools/registry.ts` (schemas), `tools/rbac.ts` (decisão executar×pendência), `tools/handlers.ts` (leitura service-role / escrita com client do usuário / pendência). `callLLM` com `tools`/`tool_calls`. Loop + `proposeAction` + `handleConfirm` (modo `confirm`) no `index.ts`, gated por `CHAT_TOOLS_ENABLED && !run.feedback`.
- **Front** `hooks/useActionConfirm.ts`, `components/chat/ActionCard.tsx` (+ teste), render do `action_proposal` em `JurisChatPanel`/`MessageBubble`.

## Verificação
- Front: `tsc` 0 erros, `vitest` 88/88 (10 errors são o baseline de async), `build` ok.
- Edge (Deno): **não há `deno` na máquina de dev** → não foi type-checado localmente. Por isso o gating por flag: o deploy é inerte; validar com smoke ao ligar a flag.

## Rollout seguro (recomendado) — precisa de sessão logada
1. **Limitar a um agente de teste:** temporariamente, deixar `allowed_tools` só num agente de teste (ex.: tirar do `assistant_root`).
2. Definir **`CHAT_TOOLS_ENABLED=true`** nas secrets do edge e redeployar (ou via dashboard de Edge Functions → Secrets).
3. **Smoke** no chat (logado): (a) "consulte o cliente X" → dados reais, sem cartão; (b) "cadastre o cliente Y, CPF…" → cartão → Confirmar → registro em `clients`; (c) como Admin, "crie um card para Z, prazo sexta" → card em `user_tasks`; (d) como recepção, mesmo pedido → cartão "Encaminhar ao Admin" → `inter_assistant_requests`; (e) conferir `agent_actions`.
4. Se ok, **devolver `allowed_tools` ao `assistant_root`** (já está semeado; só reverter o passo 1 se tiver mexido).

## Pendências conhecidas (pós-v1)
- **UX:** o indicador "pensando" só encerra em `kind = final|error`; um `action_proposal` não o encerra (o cartão renderiza, mas o spinner pode continuar). Ajuste pequeno em `applyRow` (JurisCloudOS).
- **Edge sem typecheck local:** instalar Deno (ou rodar `deno check` em CI) antes de evoluir o `index.ts`.
- **Fora do escopo v1:** FEAT-02/03 completos (transferência automática resolver→devolver, colunas de pendência espelhando ProJuris), resumo pós-confirmação por LLM, INFRA-01 (failover).
