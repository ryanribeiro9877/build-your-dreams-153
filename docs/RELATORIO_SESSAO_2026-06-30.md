# Relatório consolidado — Sessão de 2026-06-30 (JurisAI)

Cobre tudo o que foi feito nesta sessão: correções da auditoria, decisão de produto (FEAT-04) e a entrega da **v1 do chat agêntico** (chat executando ações do sistema), com deploys e pendências.

---

## 1. Visão geral / linha do tempo

1. **Auditoria** — implementei e deployei os fixes do backlog de auditoria (front + edge).
2. **FEAT-04 (decisão de produto)** — você decidiu: pendências/cadastro **internamente** no JurisAI (sem integração ProJuris).
3. **Chat agêntico v1** — brainstorming → spec → plano → implementação (subagentes + revisão) → deploy **inerte** (atrás de feature flag).
4. **Acabamento** — fix do spinner + CI `deno check` do edge.

**Branch/entrega:** trabalho do chat agêntico isolado em `feat/chat-agentico-acoes`, mergeado na `main`. Tudo na `main` e em produção.

---

## 2. Auditoria — correções (em produção)

| ID | O que mudou | Onde | Status |
|----|-------------|------|--------|
| **BUG-01** | Injeta data atual (America/Sao_Paulo) no prompt do N3 + proíbe presumir ano passado (não mais 2024) | `chat-orchestrator` `buildUniversalGuardrails` (C) | ✅ |
| **GRD-01** | Reforço anti-invenção de partes (não citar Agibank/Facta/etc., nem como exemplo) | idem (B) | ✅ |
| **ORQ-02** | Proíbe over-claim ("cadastro confirmado") → linguagem impessoal; sem nome presumido | idem (D) | ✅ |
| **ORQ-03** | `MAX_CONSULTIVE_ITERATIONS` default 1→2 (vícios objetivos) | `chat-orchestrator` | ✅ |
| **UX-01** | WelcomeScreen revela composer e foca textarea no mount (1ª tecla/Enter não se perdem) + `autoFocus` | `WelcomeScreen.tsx` | ✅ |
| **BUG-02** | `lazyWithRetry` persiste e restaura rota-alvo após reload (`ChunkReloadRestore`) | `App.tsx` | ✅ |
| **UX-02** | Já estava resolvido (item Clientes → `/clientes`, acesso ok p/ recepção) | — | ✅ |

**Verificação:** tsc 0 erros · vitest 85/85 (baseline 10 errors async) · build ok.
**Deploy:** commit `2d1e4a1` (push → Vercel) + edge `chat-orchestrator` **v64**.

### Itens da auditoria não implementados (e por quê)
- **ORQ-01** — parcial: o guardrail D elimina o over-claim e obriga declarar encaminhamento; a **execução real** (cadastro/agenda) depende do chat agêntico (entregue na seção 4, desligado por flag).
- **FEAT-01/02/03** — pendência como objeto, transferência resolver→devolver, colunas espelhando ProJuris: dependiam do FEAT-04 (agora decidido = interno). v1 cobre a base; o resto fica pós-v1.
- **INFRA-01** — failover de provedor + alerta de saldo: feature dedicada, não feita.
- **STRAT-01** — LLM Council: opcional, não feito.

---

## 3. Decisão de produto — FEAT-04

**Decidido: tratar pendências e cadastro INTERNAMENTE no JurisAI** (sem integrar ao ProJuris via API). Pendência reusa `user_tasks` em quadro de pendências. Isso destravou a v1 do chat agêntico.

---

## 4. Chat agêntico v1 — o chat executa ações do sistema

**Objetivo:** o chat principal passa a **executar** funcionalidades reais (consultar, cadastrar cliente, criar card de tarefa, solicitar documentos/acesso) via function-calling.

**Decisões de design:**
- **Execução híbrida:** leitura executa direto; **escrita** mostra um **cartão de confirmação** e só grava após o usuário Confirmar.
- **Sem escalonamento de privilégio:** a escrita roda com a **identidade do usuário** (RLS/RBAC). Sem permissão (ex.: recepção criando card) → **encaminha pendência ao Admin** (`inter_assistant_requests` tipo `aprovar_acao_chat`).
- **Redação de peças intocada:** só agentes operacionais recebem ferramentas; redatores (modo segmentado) nunca entram no loop.
- **Function-calling nativo** no `callLLM` (OpenAI + OpenRouter).

**Documentos:** spec `docs/superpowers/specs/2026-06-30-chat-agentico-acoes-design.md` · plano `docs/superpowers/plans/2026-06-30-chat-agentico-acoes.md` · entrega `docs/ENTREGA_chat-agentico-v1.md`.

### O que foi construído
| Camada | Arquivos | Commit |
|---|---|---|
| **Schema** (aplicado em prod) | migration `20260630120000_agent_tools_actions.sql`: `agents.allowed_tools`, `orchestration_runs.pending_actions`, tabela `agent_actions` (RLS) + seeds | `ae65539` / `b453638` |
| **Edge — módulo tools** | `tools/registry.ts` (schemas), `tools/rbac.ts` (decisão executar×pendência), `tools/handlers.ts` (leitura/escrita/pendência) + testes deno | `49a3386` |
| **Edge — callLLM** | `tools`/`tool_calls` no `callOpenAICompatible` + `callLLM`; tipos `LlmToolCall`/`LlmMessage`/`LlmToolDef` | `124498f` |
| **Edge — orquestração** | loop de ferramentas no `executing_n3`, `proposeAction` (status `awaiting_confirmation`), `handleConfirm` (modo `confirm`) — **gated por `CHAT_TOOLS_ENABLED`** | `d8aae52` |
| **Front** | `hooks/useActionConfirm.ts`, `components/chat/ActionCard.tsx` (+ teste), render do `action_proposal` em `JurisChatPanel`/`MessageBubble` + threading em `JurisCloudOS` | `7dd1ecf` |
| **Acabamento** | spinner encerra em `action_proposal`/`action_done`; CI job Deno (`deno check` + `deno test`) | `1be1e30` |

### Catálogo de ferramentas (v1)
- **Leitura:** `consultar_cliente`, `consultar_usuario`, `consultar_tarefas`, `consultar_processo`, `consultar_documentos`.
- **Escrita (confirma):** `cadastrar_cliente` (→`clients`), `criar_card_tarefa` (→`create_user_task`), `solicitar_documentos` / `pedir_acesso_arquivos` (→`create_inter_assistant_request`).

### Verificação
- **Front:** tsc 0 erros · vitest **88/88** (baseline 10 errors async) · build ok.
- **Edge (Deno):** **não há Deno na máquina de dev** → não type-checado localmente. Mitigação: (a) **feature flag** (deploy inerte) e (b) novo **job Deno no CI** (`deno check` + `deno test`).

---

## 5. Deploys realizados nesta sessão

| Alvo | Conteúdo | Como |
|---|---|---|
| Edge `chat-orchestrator` **v64** | Fixes da auditoria | `supabase functions deploy` |
| Frontend (Vercel) | Auditoria (UX-01, BUG-02) | push `main` `2d1e4a1` |
| Migration prod | `agent_tools_actions` (aditiva, inerte) | `apply_migration` |
| Edge `chat-orchestrator` **v65** | Chat agêntico (flag OFF) | `supabase functions deploy` |
| Frontend (Vercel) | Chat agêntico (ActionCard, inerte) + spinner + CI | merge `d30856f` + `cd983b5` + `1be1e30` |

> **A v1 do chat agêntico está DESLIGADA em produção.** Sem a env var `CHAT_TOOLS_ENABLED=true` no edge, o orquestrador roda como antes e nenhum `action_proposal` é gerado — o `ActionCard` nunca aparece. O deploy entrou **inerte** de propósito.

### Commits (após `e7ba77c`)
```
1be1e30 fix(chat-acoes): spinner em action_proposal/done + CI deno check
cd983b5 docs(chat-acoes): nota de entrega v1 + rollout
d30856f Merge feat/chat-agentico-acoes: chat agentico v1 (flag off)
7dd1ecf feat(chat-acoes): ActionCard + confirmAction + render
d8aae52 feat(chat-acoes): loop + proposeAction + modo confirm (flag off)
124498f feat(chat-acoes): callLLM suporta tools/tool_calls
49a3386 feat(chat-acoes): modulo tools/ + testes deno
b453638 chore(chat-acoes): regen tipos
ae65539 feat(chat-acoes): migration agent_tools_actions + seeds
52928ff docs(plan): plano do chat agentico v1
3bbdab7 docs(spec): design do chat agentico
2d1e4a1 fix(auditoria): BUG-01/GRD-01/ORQ-02/ORQ-03 + UX-01 + BUG-02
```

---

## 6. Rollout seguro do chat agêntico (precisa de sessão logada)
1. **Limitar a um agente de teste:** temporariamente, deixar `allowed_tools` só num agente de teste (tirar do `assistant_root`).
2. Definir **`CHAT_TOOLS_ENABLED=true`** nas secrets do edge e redeployar.
3. **Smoke:** (a) "consulte o cliente X" → dados reais, sem cartão; (b) "cadastre o cliente Y, CPF…" → cartão → Confirmar → registro em `clients`; (c) como Admin, "crie um card para Z, prazo sexta" → `user_tasks`; (d) como recepção, mesmo pedido → cartão "Encaminhar ao Admin" → `inter_assistant_requests`; (e) conferir `agent_actions`; (f) pedir uma petição a um redator → fluxo idêntico ao de hoje.
4. Se ok, **devolver `allowed_tools` ao `assistant_root`**.

---

## 7. Pendências / próximos passos

**Curto prazo (operacional):**
- Ligar a flag e rodar o **smoke** (seção 6) — único passo que falta para o chat agêntico ficar ativo.
- Conferir o **CI Deno** no GitHub Actions (o job `edge` pode apontar problema no `deno check` do `index.ts`, ex.: import não-versionado do Sentry — informativo).

**Médio prazo (pós-v1):**
- **FEAT-02 completo:** transferência automática "resolver → devolver ao gerador" com histórico.
- **FEAT-03:** colunas/estados de pendência espelhando o ProJuris + alertas por data fatal (Especialista Lembretes/Kanban de Pendências).
- **ORQ-01 pleno:** encaminhamento operacional ponta-a-ponta (depende de FEAT-02).
- **Resumo pós-confirmação por LLM** (hoje a confirmação usa template, sem nova chamada).

**Infra/estratégico:**
- **INFRA-01:** failover OpenAI↔OpenRouter + alerta proativo de saldo.
- **STRAT-01:** avaliar custo/benefício do padrão LLM Council.
- Instalar **Deno** no ambiente de dev (ou confiar no CI) para type-checar o edge antes de evoluir o `index.ts`.

**Dívida pequena:**
- Tipos `run`/`n3` como `any` em `proposeAction` (segue a convenção atual do `processStep`; apertar depois se quiser).
