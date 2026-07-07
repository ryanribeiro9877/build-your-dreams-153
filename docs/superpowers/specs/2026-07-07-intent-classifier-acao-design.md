# Intent Classifier — Reconhecer demandas de ACAO (tools)

**Data:** 2026-07-07
**Status:** Aprovado para implementacao
**Escopo:** `intentClassifier.ts` + `intentClassifier.test.ts` (zero mudancas em `index.ts`)

## Problema

O classificador de intencao (Card 2.8) reconhece apenas dois tipos de demanda de negocio: peca juridica COM insumo e peca juridica SEM insumo. Demandas de **acao operacional** (cadastrar cliente, consultar CPF, criar tarefa, resolver pendencia) nao se encaixam em nenhuma: nao tem reu/fatos/valores (criterios de "insumo de peca"), entao caem sempre em `NEGOCIO_SEM_INSUMO` — o classificador dispara `NEED_INFO_SYSTEM` (pede dados de peca) e **nunca desce ao N3**, que e quem tem as tools.

**Consequencia:** toda a visao de "operar o sistema por conversa" esta bloqueada na porta de entrada. As tools existem, os agentes N3 as declaram, `CHAT_TOOLS_ENABLED=true`, a RPC `save_client` funciona — mas o classificador barra antes de chegar la.

**Verificado em `orchestration_runs`:** usuario `700e5729` (Kailane, lider de recepcao) — todas as mensagens de cadastro classificadas como `NEGOCIO_SEM_INSUMO`, `route_path=need_info`, `tem_n3=false`.

## Decisoes de design

1. **Abordagem A: nova categoria `ACAO_COM_TOOL`** — separacao limpa entre peca e acao.
2. **Roteamento: sempre cadeia completa** — `ACAO_COM_TOOL` mapeia para `route_path=full`. O especialista N3 (que tem o schema da tool) decide se tem dados suficientes e pede ao usuario naturalmente se faltar algo.
3. **Deteccao: lista explicita de verbos** — os verbos de acao que correspondem as tools do `registry.ts` sao enumerados no prompt do classificador. Previsivel, testavel, extensivel.

## Mudancas

### 1. `intentClassifier.ts`

#### 1.1 Tipo `IntentCategory`

```ts
// ANTES:
export type IntentCategory = "TRIVIAL" | "NEGOCIO_SEM_INSUMO" | "NEGOCIO_COM_INSUMO";

// DEPOIS:
export type IntentCategory = "TRIVIAL" | "NEGOCIO_SEM_INSUMO" | "NEGOCIO_COM_INSUMO" | "ACAO_COM_TOOL";
```

#### 1.2 Prompt `INTENT_CLASSIFIER_RULES`

Adicionar a 4a categoria entre `NEGOCIO_SEM_INSUMO` e `NEGOCIO_COM_INSUMO`:

```
- "ACAO_COM_TOOL": pedido de ACAO OPERACIONAL no sistema — NAO e uma peca juridica,
  e uma operacao executavel: cadastrar cliente, consultar cliente/CPF/processo/tarefas/
  documentos, criar tarefa/card, solicitar documentos, pedir acesso a arquivos,
  criar/transferir/resolver pendencia, agendar reuniao. Mesmo que o usuario nao
  forneca todos os dados, classifique como ACAO_COM_TOOL se a intencao e claramente
  uma dessas acoes. Ex.: "quero cadastrar um cliente", "consulte o CPF do cliente",
  "crie uma tarefa para fulano", "me mostre as pendencias".
```

Adicionar regra de ouro #3:

```
3) Se a mensagem pedir uma ACAO operacional (cadastrar, consultar, solicitar, criar
   tarefa, pendencia, agendar), use ACAO_COM_TOOL — NAO confunda com NEGOCIO (peca).
   Mesmo "cadastrar" seguido de dados (nome, CPF, endereco) e ACAO_COM_TOOL, nao peca.
```

Atualizar a linha de resposta JSON para incluir o novo valor:

```
Responda APENAS com JSON: {"categoria":"TRIVIAL"|"NEGOCIO_SEM_INSUMO"|"NEGOCIO_COM_INSUMO"|"ACAO_COM_TOOL"}.
```

#### 1.3 `normalizeIntent`

Adicionar reconhecimento explicito de `ACAO_COM_TOOL` (antes do default):

```ts
if (c === "ACAO_COM_TOOL" || c === "AÇÃO_COM_TOOL" || c === "ACAO") return "ACAO_COM_TOOL";
```

O default seguro (`NEGOCIO_COM_INSUMO`) permanece inalterado para qualquer valor desconhecido.

#### 1.4 `routePathFor`

`ACAO_COM_TOOL` mapeia para `"full"`:

```ts
if (category === "ACAO_COM_TOOL") return "full";
```

### 2. `intentClassifier.test.ts`

Adicionar testes:

- `normalizeIntent("ACAO_COM_TOOL")` -> `"ACAO_COM_TOOL"`
- `normalizeIntent("AÇÃO_COM_TOOL")` -> `"ACAO_COM_TOOL"` (variante com acento)
- `normalizeIntent("ACAO")` -> `"ACAO_COM_TOOL"` (forma curta)
- `routePathFor("ACAO_COM_TOOL")` -> `"full"`
- Testes existentes inalterados (regressao)

### 3. `index.ts` — ZERO mudancas

A logica existente ja funciona corretamente para `ACAO_COM_TOOL`:

- **Linha 2722:** `if (intentCategory === "NEGOCIO_SEM_INSUMO" && hasReadableDocs)` — nao afeta `ACAO_COM_TOOL`.
- **Linha 2724:** `if (intentCategory === "TRIVIAL" || intentCategory === "NEGOCIO_SEM_INSUMO")` — `ACAO_COM_TOOL` nao entra aqui, cai direto na cadeia completa.
- **Linha 2744:** `routePathFor(intentCategory)` — retorna `"full"` para `ACAO_COM_TOOL`.
- **Linha 2768:** `intent_category: intentCategory` — grava `ACAO_COM_TOOL` na auditoria.

## Seguranca e regressao

| Cenario | Classificacao esperada | Rota |
|---|---|---|
| "oi" / "bom dia" / "obrigado" | `TRIVIAL` | `fast` |
| "gere uma peticao" (sem dados) | `NEGOCIO_SEM_INSUMO` | `need_info` |
| "peticao de indebito para Joao, contrato 123..." | `NEGOCIO_COM_INSUMO` | `full` |
| "quero cadastrar um cliente" | `ACAO_COM_TOOL` | `full` |
| "Ryan Ribeiro, CPF 123.456.789-00, endereco..." (apos pedir cadastro) | `ACAO_COM_TOOL` | `full` |
| "consulte o CPF do cliente" | `ACAO_COM_TOOL` | `full` |
| "crie uma tarefa para o Ryan" | `ACAO_COM_TOOL` | `full` |
| "me mostre as pendencias" | `ACAO_COM_TOOL` | `full` |
| "agende uma reuniao com o cliente amanha" | `ACAO_COM_TOOL` | `full` |
| Valor desconhecido / erro / ambiguo | `NEGOCIO_COM_INSUMO` | `full` |

**Assimetrias preservadas:**
- Duvida trivial vs negocio -> negocio (inalterado)
- Duvida insumo de peca -> COM_INSUMO / gerar (inalterado)
- Duvida acao vs peca -> na pratica, ambos vao para `full`, entao o "erro" nao bloqueia nada
- Default de `normalizeIntent` -> `NEGOCIO_COM_INSUMO` (inalterado)

## Validacao

1. "quero cadastrar um cliente" + dados -> `orchestration_runs` mostra `intent_category=ACAO_COM_TOOL`, `route_path=full`, `tem_n3=true`, tool `cadastrar_cliente` executa.
2. "consulte o CPF do cliente X" -> desce ao N3, executa `consultar_cliente`.
3. "ola" ainda e `TRIVIAL` (nao regrediu).
4. "gere uma peticao" (sem dados) ainda pede dados (assimetria de peca preservada).
5. Testar com usuario `700e5729` (Kailane).

## Fora de escopo

- Nao alterar tools, `save_client`, handlers, registry.
- Nao alterar `chooseSpecialistAndAcaoTipo` (N2 routing) — ja funciona uma vez que a mensagem chega la.
- Nao alterar `CHAT_TOOLS_ENABLED` nem o loop de ferramentas do N3.
