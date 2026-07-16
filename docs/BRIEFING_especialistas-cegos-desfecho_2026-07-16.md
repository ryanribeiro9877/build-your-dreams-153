# Briefing — Especialistas cegos ao que a própria conversa acabou de fazer

> Contexto conversacional para implementação (FIX). Data: 2026-07-16.

## Problema

Especialistas (agentes N3) são cegos ao que a própria conversa acabou de fazer.

**Evidência (banco, 16/07 — sessão `beaf031c-3634-4295-be59-46618df6f4bd`):**
cadastro via formulário às 23:07 UTC **sem nenhuma mensagem de desfecho** na sessão;
às 23:11 o Kanban de Pendências pediu o cadastro completo de novo **e** não resolveu "mim".
Agentes: `memory_enabled=false`, `history_limit=10` (suficiente — o problema é o **fato ausente** do histórico).

Trilha de mensagens da sessão-evidência:

| seq | role | conteúdo |
|-----|------|----------|
| 1 | user | "quero cadastrar um cliente" |
| 2 | assistant | renderiza `cadastro_form` (wizard Modelo A) |
| — | — | **cliente RYAN criado via `save_client` (browser) — NADA gravado em chat_messages** |
| 3 | user | "atribua como tarefa a coleta desses documentos pendentes para mim … amanhã 17:30" |
| 4-5 | system | roteamento → Especialista Kanban de Pendências |
| 6 | assistant | "preciso dos dados mínimos do cliente… a busca por 'mim'…" (pede tudo de novo) |

## Tarefas

**E1 — Desfecho de formulário/ActionCard vira mensagem.**
Toda ação concluída via UI dentro do chat (formulário de cadastro, ActionCard confirmado) grava
mensagem na sessão: "✔ Cliente RYAN RIBEIRO DE OLIVEIRA cadastrado." (sem UUID — cláusula H).
Sem isso o histórico mente por omissão.

**E2 — Entity carry-over.**
O orquestrador mantém por sessão as últimas entidades resolvidas (cliente, processo, destinatário —
nome + id) e injeta no contexto do N3: "Contexto da conversa: cliente atual = X". Turnos seguintes
com "esse cliente/desses documentos" resolvem sem repetir dados.

**E3 — Reescrever o prompt do Especialista Kanban de Pendências** (template + instâncias; hoje 944
chars genéricos) no padrão do Cadastro: fluxo = (1) cliente: contexto → `consultar_cliente` por nome →
só então perguntar (nunca pedir a lista completa de cadastro — cadastro é do Especialista Cadastro);
(2) destinatário: `consultar_usuario` (dêixis "mim" já resolve no banco; >1 → listar e perguntar; 0 →
não inventar); (3) prazo; (4) `criar_pendencia(p_tipo, p_titulo, p_cliente_id, p_descricao,
p_responsavel_user_id, p_prazo, …)`.

**E4 — Guardrail universal:** "referências de 1ª pessoa ('mim', 'eu') = o usuário da sessão; chame
`consultar_usuario('mim')` em vez de pedir o nome."

**Deploy do edge:** Ryan (`--no-verify-jwt`).

**Validação:** refazer o cenário do Ryan ponta a ponta — cadastro via formulário → "atribua a coleta
desses documentos para mim, prazo amanhã 17:30" → pendência criada para o cliente certo, assignee =
usuário da sessão, sem pedir dado repetido.

---

## Achados de implementação (grounding no código real)

- **`chat_messages.role`** aceita `user|assistant|system|tool`, mas o edge nunca grava `'system'`
  literal — usa `role='assistant'` + `metadata.kind`. `loadSessionHistory` só inclui no contexto do N3
  os `assistant` com `metadata.kind ∈ {'final', null}`. **→ a mensagem de desfecho do E1 precisa ser
  `metadata.kind='final'`** para entrar no histórico.
- **Wizard Modelo A** grava via `save_client` **direto do browser** (`ClienteFormWizard.tsx`), sem
  passar pelo edge. `handleClienteCadastrado` (`JurisCloudOS.tsx`) no cadastro simples faz
  `if (!snap) return;` — **não grava nada**. As mensagens de sucesso dos fluxos de tarefa/reunião são
  `setMessages` **locais** (ids `local_*`), nunca persistidas.
- **`agent_consultar_usuario` JÁ resolve 1ª pessoa**: branch `v_tokens <@
  ARRAY['mim','eu','me','comigo',…]` → devolve o usuário de `auth.uid()`. O edge chama a RPC com JWT,
  então `auth.uid()` = usuário da sessão. **→ E4 no banco já funciona; falta o prompt mandar o agente
  chamar `consultar_usuario('mim')` e o guardrail universal.**
- **Sem carry-over de entidade** hoje; `clientResolver.ts` está "sem consumidor".
  `chat_sessions.metadata` (jsonb) e `chat_sessions.client_id` já existem → armazenamento de carry-over
  sem mudança de schema.
- **Cláusula H** (anti-UUID) em `buildUniversalGuardrails()` — carry-over e desfecho referem-se ao
  cliente **pelo NOME** (+ CPF mascarado), nunca pelo UUID.
- `provision_user_agents` copia `default_system_prompt`→`system_prompt` **só na criação** → E3 precisa
  atualizar o template **e** as 2 instâncias não-overridden.

## Sequência de entrega

1. **E3 (prompt)** — migração DB, entra em produção na hora (agentes leem `agents.system_prompt` ao vivo).
2. **E1 (RPC `registrar_desfecho_chat` + frontend)** — migração + `main`; ship **sem** depender do
   deploy do edge do Ryan.
3. **E2 + E4 (edge)** — commit na `main`, aguarda deploy manual do Ryan (`--no-verify-jwt`).

> **E1 + E3 juntos fecham o bug reportado ponta a ponta**: o desfecho "✔ Cliente X cadastrado" entra no
> histórico e o prompt melhorado manda resolver por `consultar_cliente`/`consultar_usuario('mim')`.
> E2 e o guardrail universal E4 são reforço na camada do edge.
