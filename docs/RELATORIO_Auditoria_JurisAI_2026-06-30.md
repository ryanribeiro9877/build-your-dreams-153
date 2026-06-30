# Relatório de execução — Backlog de Auditoria JurisAI

**Data:** 2026-06-30
**Executor:** Claude Code
**Base:** `build-your-dreams-153/` (branch `main`)
**Documento de origem:** `Backlog_Auditoria_JurisAI_para_ClaudeCode.md`

## Verificação executada
- `tsc --noEmit -p tsconfig.app.json` → **0 erros**
- `vite build` → **OK** (build limpo em ~22s)
- `vitest run` → **85/85 testes passam** (os 10 "errors" são o baseline conhecido de async não-tratado em testes, sem relação com estas mudanças)
- Boot da aplicação no preview → landing renderiza, **sem erros de console/servidor**, roteamento íntegro (mudança crítica em `App.tsx` validada)

---

## A. Itens implementados e verificados

### ✅ BUG-01 — Datas presumidas como 2024
**Arquivo:** `supabase/functions/chat-orchestrator/index.ts` — nova função `currentDateContext()` + cláusula **C** em `buildUniversalGuardrails()`.
**O que mudou:** a data atual (fuso `America/Sao_Paulo`, pt-BR) passa a ser injetada no system prompt de **todo N3**. A diretriz proíbe presumir qualquer ano passado; data sem ano usa o ano corrente (ou o próximo, se já passou) **e explicita a suposição** ou pede confirmação.
**Detalhe técnico:** a data é formatada com granularidade de **dia** — estável dentro de um mesmo run (todos os blocos rodam no mesmo dia), portanto **não quebra o cache** do prefixo estável (`stableSystem`).
**Aceite:** pedir "dia 20/07 às 16h" → resposta usa **2026** (ou pede confirmação), nunca 2024.

### ✅ GRD-01 — Agente injeta partes não solicitadas
**Arquivo:** mesmo arquivo — cláusula **B** reforçada.
**O que mudou:** a proibição de inventar partes/empresas agora cita explicitamente bancos/seguradoras/financeiras (**Agibank, Agiproteg, Facta, BMG, etc.**) como exemplos do que **não** pode ser introduzido — **nem a título de exemplo, hipótese ou ilustração**. Em pergunta genérica sem parte no contexto, a resposta deve ser abstrata, sem citar nome de banco/empresa.
**Aceite:** pergunta sem parte informada → resposta não cita nomes de bancos/empresas.

### ✅ ORQ-02 — Over-claim e nome presumido (recepção)
**Arquivo:** mesmo arquivo — nova cláusula **D** em `buildUniversalGuardrails()`.
**O que mudou:** proíbe afirmar que uma ação (cadastro/agenda/protocolo/integração) foi concluída quando o sistema não a executou; exige linguagem **impessoal e honesta** ("encaminhei ao especialista" / "gerei a pendência" / "segue a minuta para registro"); proíbe inferir nome de cliente/parte sem lastro (tratar como `[A PREENCHER]`).
**Aceite:** sem execução real, a resposta diz "encaminhei/gerei a pendência" — nunca "cadastro confirmado".

### ✅ ORQ-03 — Loop consultivo limitado a 1 rodada
**Arquivo:** mesmo arquivo — `MAX_CONSULTIVE_ITERATIONS`.
**O que mudou:** default elevado de **1 → 2**. Uma única rodada não bastava para vícios objetivos (ex.: o ano errado persistia após uma devolução); 2 rodadas cabem no orçamento de latência e corrigem vícios simples antes de degradar para o aviso `[REVISAR]` (que continua sendo a rede de segurança, já visível ao usuário no rodapé da peça). Continua configurável via env `MAX_CONSULTIVE_ITERATIONS`.
**Aceite:** vício objetivo simples (ano da data) é corrigido dentro do orçamento de rodadas.

### ✅ UX-01 — Foco da WelcomeScreen engole a 1ª tecla/Enter
**Arquivo:** `src/components/WelcomeScreen.tsx`.
**O que mudou:**
1. O composer (modo idle) é **revelado de imediato** no mount — não mais gated em `greetingDone`. Eliminada a janela morta (`pointer-events:none`/opacity 0) durante a animação do título (~1,2s), em que a 1ª tecla/Enter se perdia.
2. O foco do `textarea` acontece assim que a tela sai do `loading` (sem esperar o fim da digitação do título).
3. Adicionado `autoFocus` ao `textarea` (cinto e suspensório).
**Aceite:** digitar e dar Enter imediatamente ao abrir a tela envia a 1ª mensagem.
**Ressalva de validação:** a `WelcomeScreen` é protegida por login + dados Supabase; a verificação ao vivo desta tela exige sessão autenticada. Coberta aqui por typecheck + build + testes.

### ✅ BUG-02 — "Crons" na sidebar não navega
**Arquivo:** `src/App.tsx` — `lazyWithRetry` + novo componente `ChunkReloadRestore`.
**Diagnóstico:** o item "Crons" e o "Organograma" usam o **mesmo** mecanismo de navegação (`item.action()` → `navigate(...)`), então o clique dispara igual. O sintoma "fica em /sistema" é compatível com a hipótese do backlog: após um redeploy (hash novo na Vercel), o `import()` do chunk de `CronJobs` falha, o `lazyWithRetry` dá `window.location.reload()` e o destino podia se perder na borda.
**O que mudou:** antes do reload, a **rota de destino** (`pathname + search`) é persistida em `sessionStorage`; após o boot, o `ChunkReloadRestore` (montado dentro do Router) re-navega para ela se necessário e limpa a chave. No caminho feliz é um no-op.
**Aceite:** clicar "Crons" abre `/admin/crons` mesmo após redeploy/hash novo. (`TechRoute` + role `tech` já estavam corretos; o gating de `loading` no `useAuth` evita race de papéis.)

### ✅ UX-02 — Item "Clientes" da recepção sem destino — **já resolvido no código atual**
**Verificação:** `JurisCloudOS.tsx` (l.1178) já aponta o item para `/clientes` (rota válida), **não** para o quebrado `/sistema/clientes`. Em `usePermissions`, `canAccessClients` é `true` para `receptionist`, e `clientes` consta no `menuItems` da recepção (`roleVisibility.ts`). Logo o item aparece **e abre a tela** — critério de aceite satisfeito. Nenhuma mudança necessária.

---

## B. Itens parcialmente endereçados

### 🟨 ORQ-01 — Recepção orienta, mas não executa nem encaminha
**Endereçado nesta passada:** a cláusula **D** (ORQ-02) elimina o over-claim e obriga o agente a declarar o **encaminhamento real** ("encaminhei ao especialista" / "gerei a pendência") em vez de devolver passos manuais genéricos como se a ação estivesse feita.
**O que ainda falta (bloqueado):** o **handoff operacional de fato** (acionar o especialista de cadastro **e** o de agenda, ou criar pendências rastreáveis) depende da entidade de pendência (**FEAT-01/02**), que por sua vez depende da decisão de produto **FEAT-04**. Sem isso, não há cadastro/agenda reais para onde rotear.

---

## C. Itens NÃO implementados — exigem decisão de produto ou trabalho de maior porte

> Estes itens foram **deliberadamente não implementados** nesta passada porque envolvem decisão de produto (FEAT-04) e/ou mudança de schema + Kanban + orquestração de grande porte, com impacto direto em um sistema jurídico em produção. Implementá-los às cegas seria arriscado.

### ⬜ FEAT-04 — Decisão: integrar com ProJuris vs. tratar internamente **(BLOQUEADOR)**
É a **primeira decisão** a tomar: as pendências/cadastros devem ser criados **no ProJuris via API** ou tratados **internamente** no JurisAI (só refletindo)? Impacta arquitetura, credenciais e LGPD. **FEAT-01, FEAT-02 e FEAT-03 dependem desta resposta.**

### ⬜ FEAT-01 — Pendência como objeto de 1ª classe
Entidade `pendência` (tipo, responsável, cliente/processo, prazo + `data_fatal`, estado, origem). Requer migração de schema Supabase + UI. **Depende de FEAT-04.**

### ⬜ FEAT-02 — Transferência entre departamentos (alerta → resolver → devolver)
Equivalente ao "Trocar quadro" do ProJuris, com devolução automática ao gerador e histórico. **Depende de FEAT-01/04.**

### ⬜ FEAT-03 — Colunas/estados de pendência + alertas por data fatal
Colunas espelhando o ProJuris + alertas atrelados à `data_fatal` (via "Especialista Lembretes"/"Kanban de Pendências"). **Depende de FEAT-01.**

### 🟨 INFRA-01 — Failover de provedor de IA + alerta de saldo
A parte segura (alerta interno com provedor real) já existe. Falta o **failover automático** OpenAI↔OpenRouter e o **aviso proativo de saldo baixo**. O `callLLM` deriva o provider do modelo (`providerFromModel`); um failover correto exige um **mapa de equivalência de modelos** entre provedores e uma rotina de saldo — decisões de design que recomendo tratar como feature dedicada (não um patch rápido). **Não implementado nesta passada.**

### ⬜ STRAT-01 — Aproximar do padrão LLM Council (opcional)
Explicitamente opcional no backlog ("avaliar custo/benefício"). Exigiria conselheiros independentes em paralelo, peer review anônimo e síntese final. **Não implementado** — recomendo decidir custo/benefício antes.

---

## D. Resumo

| ID | Status final | Onde |
|----|--------------|------|
| BUG-01 | ✅ Implementado | chat-orchestrator `buildUniversalGuardrails` (C) |
| GRD-01 | ✅ Implementado | chat-orchestrator `buildUniversalGuardrails` (B) |
| ORQ-02 | ✅ Implementado | chat-orchestrator `buildUniversalGuardrails` (D) |
| ORQ-03 | ✅ Implementado | chat-orchestrator `MAX_CONSULTIVE_ITERATIONS` (1→2) |
| UX-01 | ✅ Implementado | WelcomeScreen.tsx |
| BUG-02 | ✅ Implementado | App.tsx `lazyWithRetry` + `ChunkReloadRestore` |
| UX-02 | ✅ Já resolvido | (sem mudança — código já correto) |
| ORQ-01 | 🟨 Parcial | guardrail D feito; execução real depende de FEAT-01/02/04 |
| FEAT-01/02/03 | ⬜ Bloqueado | depende de FEAT-04 (decisão) |
| FEAT-04 | ⬜ Decisão pendente | produto |
| INFRA-01 | 🟨 Pendente | failover/saldo = feature dedicada |
| STRAT-01 | ⬜ Opcional | avaliar custo/benefício |

## E. Arquivos alterados
- `supabase/functions/chat-orchestrator/index.ts` — **edge function** (precisa de deploy: `supabase functions deploy` para entrar em vigor)
- `src/App.tsx` — frontend
- `src/components/WelcomeScreen.tsx` — frontend

## F. Deploy
- **Frontend** (UX-01, BUG-02): entra em produção ao commitar/push na `main` (dispara deploy Vercel).
- **Edge function** (BUG-01, GRD-01, ORQ-02, ORQ-03): só entra em vigor após **deploy da edge** (`npm run deploy:edge` ou deploy do `chat-orchestrator`). Mudanças são de **prompt/guardrail** num agente jurídico em produção — recomenda-se um smoke test pós-deploy (cenário de data + pergunta genérica sem parte).
