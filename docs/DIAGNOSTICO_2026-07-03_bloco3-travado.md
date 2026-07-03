# DIAGNÓSTICO — "peça longa travada no bloco 3 de 5" (28→35 min sem avançar)

**Data:** 2026-07-03
**Escopo:** só diagnosticar a causa raiz e recomendar. Nenhuma alteração de código de
produção foi feita nesta tarefa.
**Fontes:** `orchestration_runs`, `chat_messages` (stages), logs do edge
`chat-orchestrator`, e o código do frontend (`JurisCloudOS.tsx`,
`juris-cloud/liveStatus.ts`, `juris-cloud/JurisChatPanel.tsx`).

---

## Resposta curta

**Nenhuma das 4 hipóteses de travamento no BACKEND se confirma.** O backend NÃO
travou: a peça mais recente do usuário foi gerada por inteiro (blocos 1→5 + rodada
de correção + resposta final) e persistida com `status = done` em **17,5 minutos**.

O sintoma "bloco 3 de 5" com cronômetro subindo de 28 a 35 min é um **defeito de
sincronização do FRONTEND** (Realtime): o cliente parou de receber os eventos de
etapa/final depois de uma etapa "bloco 3 de 5", e como o cronômetro só é zerado
quando chega a mensagem `final` (que esse cliente nunca recebeu) e **não existe
nenhum fallback de reconciliação nem timeout do "pensando"**, o card congelou no
bloco 3 com o cronômetro subindo indefinidamente.

---

## Run analisada

| Campo | Valor |
|---|---|
| run id | `5c4e1615-33be-41bf-92d1-3a0293892ae1` |
| session id | `9a616989-a938-4d8f-a1e8-b1716039365c` |
| user id | `1a87f6ba-e25f-46c4-9b3b-e25f71654f13` |
| mensagem | "olá, crie uma petição inicial para o bancário" |
| **status** | **done** |
| **block_index** | **5** (de 5) |
| iterations | 1 |
| blocks (jsonb) | 5 |
| acao_tipo | outro |
| error | null |
| created_at | 2026-07-03 15:35:14 UTC |
| updated_at | 2026-07-03 15:52:45 UTC |
| **duração total** | **17,5 min** |

É a run mais recente desse usuário. Concluiu com resposta final gravada
(`chat_messages` role=assistant, `metadata.kind='final'`) às 15:52:45.

### Linha do tempo dos stages (evidência de que NÃO travou)

```
15:35:14  user: "crie uma petição inicial para o bancário"
15:35:14  routing_n1  (Meu Assistente)
15:35:17  routing_n2  (Diretor Jurídico — Revisão)
15:35:19  executing_n3 acionado (Especialista Confecção Bancário)
15:35:20  bloco 1/5  "Redigindo preliminares e fatos (1 de 5)"
15:36:58  bloco 2/5  "Redigindo fundamentação III.1–III.3 (2 de 5)"      (+98s)
15:38:53  bloco 3/5  "Redigindo fundamentação III.4–III.6 (3 de 5)"      (+115s)
15:40:50  bloco 4/5  "Redigindo fundamentação III.7–III.9 (4 de 5)"      (+117s)
15:43:01  bloco 5/5  "Redigindo tutela, pedidos e valor da causa (5 de 5)" (+131s)
15:44:15  validating_n2  "concluiu a peça (5 blocos). Em revisão..."      (+74s)
15:44:16  validador mecânico: 1 violação → devolve ao N3 (rodada 1/2)
15:44:16  correção bloco 1/5
15:45:34  correção bloco 2/5   (+78s)
15:47:18  correção bloco 3/5   (+104s)   ← 2ª ocorrência de "bloco 3 de 5"
15:49:16  correção bloco 4/5   (+118s)
15:51:44  correção bloco 5/5   (+148s)
15:52:31  validating_n2  "concluiu a correção. Em revisão..."
15:52:32  validador mecânico: nenhuma violação — APROVADA
15:52:45  resposta FINAL gravada
```

Observações:
- O bloco 3 **avançou normalmente** nas duas passagens (redação +115s; correção
  +104s). Não houve reprocessamento em loop.
- Houve **uma** rodada de correção do validador MECÂNICO (1 violação → corrigiu →
  aprovou). Isso é o comportamento esperado (`MAX_ITERATIONS = 2`), respeitado.
- **Cada passagem sobre os 5 blocos emite uma etapa "bloco 3 de 5"** — uma na
  redação ("(3 de 5)") e outra na correção ("(bloco 3 de 5)"). Por isso o card
  pode exibir "bloco 3 de 5" em dois momentos distintos da mesma run.

---

## Por que as 4 hipóteses de backend NÃO se confirmam

### HIPÓTESE 1 — Loop de validação no bloco 3 → **REFUTADA**
`iterations = 1`. Houve uma única devolução (validador mecânico), que convergiu e
aprovou. Não há ciclo do bloco 3 reprovando sem fim. Os tetos (`MAX_ITERATIONS = 2`,
`MAX_CONSULTIVE_ITERATIONS = 2`) foram respeitados.

### HIPÓTESE 2 — Chamada de LLM travando/reintentando no bloco 3 → **REFUTADA**
Tempo por bloco (derivado dos timestamps das etapas): 98s / 115s / **117s (bloco 3)**
/ 131s / 74s na redação; 78s / 104s / **118s (bloco 3)** / 148s / 47s na correção.
Todos **muito abaixo** de `LLM_N3_TIMEOUT_MS = 380s`. Nenhum retry em loop; nenhum
bloco chega perto do teto. O bloco 3 não é anômalo.

### HIPÓTESE 3 — `fireNextStep` não encadeia o próximo passo → **REFUTADA**
Nos logs do edge, **todas** as invocações de `chat-orchestrator` no período
retornam **HTTP 202** (o padrão fire-and-forget). Não há 401/403/500/502 nas
chamadas internas. O encadeamento passo-a-passo funcionou de ponta a ponta (a
própria progressão 1→5 + correção 1→5 + final é a prova). (Os `401` nos logs são
da função `send-email-notifications`, um cron não relacionado a este pipeline.)

### HIPÓTESE 4 — bloco 3 conclui mas `block_index` não persiste → **REFUTADA**
`block_index` chegou a 5 e a run virou `done`. Não houve reprocessamento eterno do
bloco 3. O estado avançou e persistiu corretamente.

---

## Causa raiz (confirmada): dessincronia do Realtime no frontend

O card ao vivo (2.2) é alimentado **exclusivamente** por Supabase Realtime, em
`JurisCloudOS.tsx` (useEffect que assina `chat:{sessionId}`):

- `setLiveStage(deriveLiveStage(row))` a cada linha `kind='stage'`;
- `setThinking(false); setLiveStage(null)` **somente** quando chega
  `kind IN ('final','error','action_proposal','action_done')`.

O cronômetro (`StatusIndicator` em `JurisChatPanel.tsx`):
- `thinkingStartedAt` é marcado **uma vez** quando `thinking` liga e **nunca é
  reiniciado por bloco** — conta desde o INÍCIO da run;
- `elapsedMs = now - thinkingStartedAt`, com tick de 1s;
- só para quando `thinking` desliga (ou seja, quando chega o `final`).

Consequência: **se o Realtime deixar de entregar eventos no meio da run**, o cliente
- congela `liveStage` na última etapa recebida (uma "bloco 3 de 5"), e
- mantém `thinking = true` para sempre, com o cronômetro subindo sem limite.

Não há rede de segurança:
- o *catch-up* por `select()` roda **uma única vez** (dep `[assistantSessionId]`),
  no início — não há re-fetch periódico;
- não há re-sincronização ao reconectar o canal (nenhum tratamento de
  `CHANNEL_ERROR`/`TIMED_OUT`/`SUBSCRIBED`);
- não há timeout do "pensando" no cliente;
- não se assina `orchestration_runs` (status `done/failed`) como sinal alternativo
  de término.

Isso explica **exatamente** o vídeo: a run terminou às 15:52:45 (17,5 min), mas o
cliente que perdeu os eventos após uma etapa "bloco 3 de 5" ficou preso nesse
rótulo com o cronômetro subindo — atingindo 28→35 min porque o usuário continuou
com a tela aberta ~18 min além do fim real. O "35 min" é do relógio do frontend,
não do backend.

---

## Perguntas do briefing — respostas

- **Alguma peça longa já completou inteira?** SIM. `orchestration_runs`: 81 runs
  `done` e 7 `failed` (nenhuma presa em progresso). Além da run acima, a
  `689aeb63-…` (mesmo usuário, hoje 13:35, "crie uma petição inicial do bancário")
  também concluiu 5 blocos + final em ~18 min. O sistema **gera peças longas de
  ponta a ponta com regularidade**.

- **O travamento é sempre no bloco 3?** Não há travamento de backend. O bloco 3
  aparece porque é o ponto médio onde a lacuna de Realtime congelou o display; e
  porque tanto a redação quanto a correção emitem "bloco 3 de 5". Não é um
  comportamento específico do bloco 3 no backend.

- **Tempo real por tentativa de LLM no bloco que "trava"?** Bloco 3: ~117s
  (redação) e ~118s (correção). Nenhum bloco passou de ~150s; teto é 380s.

- **Runs `failed`:** as 7 são antigas (última em 2026-06-29) — em maioria
  OpenRouter 402 (créditos) e timeouts de watchdog de 08–15/jun (a mais longa,
  `7ca11248`, deu timeout no bloco **5**, não no 3). Nenhuma falha desde então;
  todas as runs de julho concluíram.

---

## Recomendação (a aplicar depois — fora do escopo desta tarefa)

A correção é **no FRONTEND** (resiliência do Realtime), independente do watchdog
por idade (Frente 3) e do "reenviar só o bloco afetado" — ambos permanecem fora de
escopo.

Ordem sugerida:

1. **Reconciliação/polling enquanto `thinking`** (correção principal): a cada
   ~10–15s, re-buscar as mensagens recentes da sessão (ou o `status` da
   `orchestration_runs`) e aplicar a mesma lógica de `applyRow`. Recupera qualquer
   `stage`/`final` perdido e desliga o "pensando" quando o run terminou. É o menor
   patch que mata o sintoma.

2. **Assinar `orchestration_runs` (UPDATE) como sinal de término**: quando
   `status` vira `done`/`failed`, desligar `thinking`/`liveStage` mesmo que o
   `final` de `chat_messages` não tenha chegado por Realtime.

3. **Re-sincronizar ao reconectar o canal**: tratar o callback de
   `.subscribe((status) => …)` e, em `SUBSCRIBED` após erro/timeout, refazer o
   *catch-up* `select()` (hoje ele só roda na montagem).

4. **Timeout defensivo do "pensando" no cliente** (rede final): se passar de um
   teto (ex.: alguns minutos além do `LONG_RUN_NOTICE_MS`) sem novidade, forçar
   um re-fetch antes de continuar exibindo o cronômetro.

Itens 1 ou 2 já resolvem o caso do vídeo; 3 e 4 endurecem contra reincidência.
