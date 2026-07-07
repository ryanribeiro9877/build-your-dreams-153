# CHAT-ACAO-FASTPATH — Fast-lane para ações operacionais no chat

**Data:** 2026-07-07
**Status:** Em brainstorming (aguardando aprovação do design)
**Escopo:** `supabase/functions/chat-orchestrator/index.ts` (máquina de estados) + `tools/handlers.ts` (já em WIP) + instrumentação de timing. Deploy da Edge Function em produção pelo Claude quando pronto e testado.

## Problema

Cadastrar cliente pelo chat leva **85s medidos**. Alvo: poucos segundos.

## Causa raiz (confirmada com dados de produção)

Run `cec3a38f` (`"quero cadastrar um cliente"`, sessão `af8fb6f6…`, **85,9s total**). Reconstruindo pela timeline de `chat_messages` (stages) e `orchestration_runs`:

| Δ | Stage | O que roda |
|---|---|---|
| +1,4s | routing_n1 | START: classificador de intenção + insert + hop |
| +0,4s | routing_n2 | N1 escolhe N2 (curto-circuito: 1 diretor → sem LLM) |
| +1,5s | executing_n3 | N2 (Diretor) escolhe especialista + acao_tipo (1 LLM) |
| **+13,2s** | validating_n2 | **N3 executa (1ª vez)** |
| +2,0s | executing_n3 | **Validador consultivo (LLM) REPROVA "a peça"** |
| **+29,4s** | validating_n2 | **N3 regenera (2ª vez)** |
| +2,5s | executing_n3 | **Validador consultivo REPROVA de novo** |
| **+34,2s** | validating_n2 | **N3 regenera (3ª vez)** |

`ACAO_COM_TOOL` é roteado para `route_path=full` — a cadeia completa de **redação de peça**. O **validador consultivo (LLM N2)**, desenhado para julgar peças jurídicas, reprova a resposta operacional do cadastro e devolve ao N3 para regenerar, **3 execuções do N3** (13+29+34 ≈ **77s** dos 85,9s). O overhead de encadeamento HTTP entre passos é pequeno (0,4–2,5s por hop) e o roteamento N1→N2 é barato (~2s). **O gargalo é a quantidade de chamadas ao N3, não modelo lento nem hops.**

## Estado atual do código (WIP não-commitado, não-deployado)

1. `index.ts` — fast-path que pula a validação consultiva para `ACAO_COM_TOOL` (`validating_n2` → `validating_n1` direto). **Não está deployado** (confirmado: a função em produção não tem o marcador). Elimina as 2 regenerações.
2. `handlers.ts` — `cadastrar_cliente` passou a usar a RPC `save_client` (PII cifrada + trata CPF duplicado `23505`).
3. O reconhecimento `ACAO_COM_TOOL` no classificador **já está** deployado em produção.

## Design — fast-lane para `ACAO_COM_TOOL`

Uma ação de tool é determinística (executou ou não), não uma peça que precise de revisão de qualidade. Toda a malha de qualidade (validador mecânico + consultivo + finalização redundante) é desnecessária.

1. **Pular o validador consultivo** (WIP #1): `ACAO_COM_TOOL` não passa por `validateDraft`. Já escrito — consolidar. **Maior ganho isolado (−~63s).**
2. **Colapsar a cauda:** para `ACAO_COM_TOOL`, o passo `executing_n3` (caminho de resposta textual do tool-loop) **publica a resposta final e vai direto a `done`**, sem os hops `validating_n2`/`validating_n1`. Ações de ESCRITA (`cadastrar_cliente` etc.) seguem pausando em `awaiting_confirmation` via `proposeAction` (inalterado). Remove 2 hops (~2s).
3. **Manter roteamento N1→N2:** necessário para escolher entre os N especialistas com tools do dono (recepção tem **9**, todos com os mesmos 11 tools, mas personas diferentes — Cadastro, Pendências, Lembretes…). N1 já faz curto-circuito (1 diretor). N2 é 1 LLM (~1,5s). Não vale o risco de roteamento determinístico errado por ~1,5s.
4. **Instrumentação:** logar duração de cada passo (START/classificador, N2 pick, N3, publish) para medir com precisão pós-deploy e localizar o próximo gargalo.

### Expectativa de latência (honesta)

- Só as mudanças de código (itens 1–2): **85s → ~15-18s**, dominado pela **execução única do N3 (~13s)**.
- Chegar a **single-digit "poucos segundos"** depende da latência do modelo do especialista de ação (hoje `fugu-ultra`) e de possível round-trip de read-tool no loop. Isso é um **segundo diagnóstico**, a fazer com a instrumentação após o deploy: se o N3 for o piso, recomendar modelo mais rápido para os especialistas de ação e/ou reduzir round-trips do tool-loop. **Não é garantido pelas mudanças de máquina de estados sozinhas** e pode envolver config de agente (`agents.model`), fora do código.

## Fora de escopo

- Não mexer no classificador (`intentClassifier.ts`), já deployado e testado.
- Não mexer no fluxo de peças (`NEGOCIO_COM_INSUMO`) — validação mecânica + consultiva intactas.
- Não mexer no loop de confirmação (`proposeAction`/`handleConfirm`) de ações de escrita.
- Não trocar modelos de agente nesta fatia (só recomendar após medir).

## Critério de aceite

- [ ] `ACAO_COM_TOOL` não passa pelo validador consultivo (consolidar WIP) nem pela cauda `validating_n2`/`validating_n1` (publica em `executing_n3` → `done`).
- [ ] Resposta operacional (ex.: "me informe nome e CPF") chega ao usuário sem loop de regeneração.
- [ ] Ações de escrita seguem pausando em `awaiting_confirmation` (regressão zero no fluxo de confirmação).
- [ ] Fluxo de peça (`NEGOCIO_COM_INSUMO`) inalterado.
- [ ] Instrumentação de timing por passo presente.
- [ ] `deno check`/lint limpos; run real de "quero cadastrar um cliente" medido pós-deploy < ~18s, com breakdown que aponte o próximo gargalo.
