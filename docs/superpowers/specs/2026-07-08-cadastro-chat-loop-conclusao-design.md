# CADASTRO-CHAT-LOOP-CONCLUSAO — design

**Data:** 2026-07-08
**Área:** Edge `chat-orchestrator` — caminho `ACAO_COM_TOOL` / `continuacao_coleta` / `acao_curta` do agente Especialista Cadastro ProJuris (N3, `d1a504b2-1f12-4a97-b607-9a532ba757d8`, `gpt-5.4` @ temp 0).
**Tipo:** bug (regressão só em coletas longas). **Prioridade:** alta.

## 1. Problema

O cadastro pelo chat coleta um dado por vez (tipo → nome → CPF → telefone → e-mail →
CEP → número → apto → unidade → complemento) e, ao final, em vez de apresentar o resumo
e pedir "sim/corrigir", **reinicia no campo 1** ("Qual é o tipo de pessoa?") em loop
infinito. `cadastrar_cliente` nunca é chamado; nenhum cliente é gravado. Em produção:
0 de 56 runs `ACAO_COM_TOOL` dos últimos 7 dias tiveram `pending_actions` não-nulo.

## 2. Causa raiz (confirmada no código + banco)

**Primária (H1) — truncamento da janela de histórico.** Na coleta, o contexto do N3 é
montado a partir de `loadSessionHistory(sessionId, histLimit, ...)`, uma **janela
deslizante** das últimas N mensagens user/assistant (`index.ts:499-523`, ordena por
`sequence_number` desc, pega as últimas N, cap fixo 40). `histLimit = n1.history_limit
?? n3.history_limit ?? 10` (`index.ts:2179`). No banco, `history_limit = 10` tanto no
agente de entrada quanto no N3.

Prova pela gravação de 08/07 (session da run `2026-07-08 18:15:13Z`): a coleta produziu
~22 mensagens user/assistant. No turno do loop (seq 37), `original_message` = seq 35
("tem sim, Edifício Cidade do Porto") e a janela das últimas 10 (excluindo a atual) foi
**seq 20 → 34** — só a sub-coleta de endereço (CEP em diante). Caíram para fora:
**tipo (4-5), nome (7-8), CPF (10-11), telefone (13-14), e-mail (16-17)**. Sem enxergá-los,
o modelo "recomeça" do campo 1.

**Agravante (H2) — sem estado consolidado nem fallback de resumo.** O caminho de conclusão
da ação (`finishAcaoDone`, `index.ts:2064`) **não** chama `updateRollingSummary` (invocado
só na finalização da cadeia completa, `index.ts:2647`). Logo `loadSessionSummary` retorna
null e o `summaryBlock` fica vazio: a **única** memória da coleta é a janela deslizante.
Não há slot-state persistido (o "retomando o cadastro..." é só um marcador visual de stage).

**H3 descartada:** tools funcionam — `consultar_cep` disparou (seq 22). O gate de leitura
(`CHAT_READ_TOOLS_ENABLED`, default ON) libera os `consultar_*`.

## 3. Escopo

**Em escopo:** fazer a coleta **concluir** deterministicamente num resumo textual +
"sim/corrigir", sem reiniciar, independente do tamanho do histórico.

**Fora de escopo (decisão do dono):** o caminho de **escrita** (`cadastrar_cliente` →
`proposeAction` → `pending_actions` → `save_client` → linha em `clients`). Esse caminho é
gated por `CHAT_TOOLS_ENABLED` (OFF): com a flag OFF o write tool nem é oferecido ao modelo
(`index.ts:2311-2312`), então `proposeAction` nunca dispara. Os critérios de aceite #2/#3
serão validados quando Ryan ligar a flag no ambiente de teste — a mudança deste briefing
apenas garante que a coleta CHEGUE ao ponto de resumo/confirmação.

## 4. Abordagem (A — mínima cirúrgica)

Restaurar o contexto completo da coleta e reforçar com uma instrução determinística.
Três mudanças, todas no edge, **zero chamadas de LLM extras**.

### 4.1. Helper puro `isCollectionContinuation` (`intentClassifier.ts`)

A run de continuação é criada com `chain[0] = { level:0, path:"continuacao_coleta", ... }`
(`index.ts:2914`). Helper testável, no mesmo módulo de continuidade de coleta:

```ts
export function isCollectionContinuation(chain: unknown): boolean {
  const c = Array.isArray(chain) ? chain[0] : null;
  return !!c && typeof c === "object" && (c as { path?: unknown }).path === "continuacao_coleta";
}
```

### 4.2. Sem truncar histórico na coleta ativa (`index.ts`)

`loadSessionHistory` ganha um parâmetro opcional `maxCap` (default 40 → **callers atuais
inalterados**), substituindo o `40` fixo em `Math.min(limit, 40)`.

No `executing_n3`, quando em coleta ativa, carrega com limite alto:

```ts
const COLLECTION_HISTORY_LIMIT = Number(Deno.env.get("COLLECTION_HISTORY_LIMIT")) || 80;
const inCollection = isCollectionContinuation(run.chain);
const histLimit = inCollection
  ? COLLECTION_HISTORY_LIMIT
  : (n1.history_limit ?? n3.history_limit ?? 10);
const history = await loadSessionHistory(
  admin, run.session_id, histLimit, run.user_message_id,
  inCollection ? COLLECTION_HISTORY_LIMIT : 40,
);
```

80 mensagens ≈ 40 turnos — cobre qualquer cadastro real com folga (a gravação teve 13).
Coleta curta: `inCollection` é true mas a sessão tem <10 msgs → resultado idêntico ao atual
(nenhuma regressão).

### 4.3. Guardrail estático anti-reinício (`index.ts`)

Constante injetada **só** em turno de coleta, no slot **volátil** do system (`systemPrompt`),
preservando o cache do bloco estável (`stableSystem`):

```ts
const COLLECTION_GUARD =
  "Você está no meio de uma COLETA DE CADASTRO conduzida um dado por vez. " +
  "O histórico acima contém TODOS os dados que o cliente já informou NESTA sessão — " +
  "releia-o por completo antes de decidir a próxima pergunta. NUNCA reinicie a coleta e " +
  "NUNCA repergunte um campo que já foi respondido. Assim que tiver o conjunto essencial " +
  "de dados, NÃO faça mais perguntas: apresente o RESUMO dos dados coletados e peça ao " +
  "usuário que confirme com \"sim\" ou indique o que corrigir.";

const collectionGuard = inCollection ? COLLECTION_GUARD : "";
const volatileSystem = [summaryBlock, collectionGuard].filter(Boolean).join("\n\n") || null;
```

`volatileSystem` substitui `summaryBlock || null` em `callOnce` (`~2223`), `callCorrection`
(`~2240`) e na chamada do tool-loop (`~2323`). Para runs fora de coleta `collectionGuard`
é vazio → `volatileSystem === (summaryBlock || null)` → **comportamento idêntico ao atual**.

## 5. Fluxo de dados

1. Usuário responde um dado → START cria run `continuacao_coleta` (`index.ts:2910`).
2. `executing_n3`: `inCollection=true` → carrega histórico **completo** da sessão +
   injeta `COLLECTION_GUARD`.
3. `gpt-5.4 @ temp 0` enxerga todos os campos → segue o system prompt: quando o conjunto
   essencial está presente, emite o **resumo textual** + "sim/corrigir" (não repergunta).
4. `finishAcaoDone` publica a resposta como `final` (inalterado). Loop quebrado.

## 6. Tratamento de erro

- Nenhuma chamada de LLM nova → nenhuma superfície de falha nova.
- Histórico completo de um cadastro é pequeno (~1-2k tokens): sem risco de janela/orçamento.
- `maxCap` com default preserva 100% dos callers existentes.

## 7. Testes

- **Unit (Deno)** em `intentClassifier.test.ts`: `isCollectionContinuation` para
  (a) chain de continuação → true; (b) chain de cadeia completa (`level:1/2/3`) → false;
  (c) chain vazia/`null`/não-array → false.
- **Manual/produção (Ryan):** repetir cadastro PF com endereço longo (CEP + número + apto
  + unidade + complemento); confirmar resumo + "sim/corrigir" sem voltar ao campo 1
  (AC#1); coleta curta continua concluindo (AC#4); campo já informado não é reperguntado
  (AC#5). AC#2/#3 (escrita) validados à parte, com `CHAT_TOOLS_ENABLED=ON`.

## 8. Restrições honradas

- Só edge; sem migration; **sem `db push`** (não dispara `drop_plaintext_pii`).
- `CHAT_TOOLS_ENABLED` intacto (OFF).
- Sem PII em coluna nova (nada persistido; histórico já existe em `chat_messages`).
- Sem deploy (manual do Ryan). Sem lint novo.
