# Correções pós-smoke — Pendências + execução agêntica

**Data:** 2026-06-30 · **Origem:** smoke ao vivo (perfil recepção/kailane), veredito PARCIAL.

## Diagnóstico
O motor de tool-calling funcionava (cadastro provado ponta a ponta), mas **criar pendência via chat só narrava**. Causa-raiz (confirmada no roster de agentes): os especialistas que recebiam o pedido — **"Documentação Geral"** e **"Demandas Administrativas"** — estavam com `allowed_tools` **vazio** (o seed por padrão de nome era estreito demais). Sem ferramenta, o agente narrava e o over-claim ressurgia.

## Correções aplicadas (todas em produção)

### #1 — Ferramentas em todos os especialistas não-redatores · ✅ (sem redeploy)
Migration `20260630160000_pendencia_tools_broaden.sql`: dá o conjunto operacional (consultas + cadastrar_cliente + solicitar/pedir + criar/transferir/resolver_pendencia + agendar_reuniao) a **todos** os `specialist`/`monitor` não-redatores (max_tokens < 12000). Redatores (Confecção) ficam fora — não entram no loop. Resultado: **22 agentes** com `criar_pendencia`, incluindo os 2 que falharam no smoke. `allowed_tools` é lido em runtime → efeito imediato.

### #2 — Guardrail "execução real" · ✅ (edge v68)
Nova cláusula **F** em `buildUniversalGuardrails()`: quando há ferramenta para a ação pedida, o agente **deve chamá-la**; é proibido dizer "pendência gerada/cadastro realizado/agendado" sem o resultado da tool. Reforça o ORQ-02 no caminho de ferramentas.

### #3 — Pedido multi-ação dispara todas as escritas · ✅ (edge v68)
O loop agora coleta **todas** as tool_calls de escrita (não só a primeira); `proposeAction` emite **um cartão por ação**; `handleConfirm` só encerra o run quando **não restam** ações `proposed`. Assim "cadastrar **e** agendar" propõe as duas ações.

## Edge
`chat-orchestrator` redeployado **v67** (flag ligada) → **v68** (#2+#3). Migração #1 aplicada à parte. Tudo na `main` (`f891878`).

## Re-smoke recomendado (precisa de sessão logada)
- **Pendência via chat:** "abra uma pendência de documentação para \<cliente\>, data fatal sexta" → **cartão** → Confirmar → aparece em `/pendencias` (estado Aberta); conferir `task_audit_log` e notificação.
- **Multi-ação:** "cadastre \<cliente\> e agende reunião dia 20/07 16h" → **dois cartões** (cadastro + reunião); confirmar ambos; conferir ano **2026** na reunião.
- **FEAT-02 (B):** transferir a pendência a outro depto → resolver → devolve ao gerador (notificação + histórico).
- **RBAC (C):** recepção tentando ação exclusiva de advogado → encaminha pendência ao Admin (não executa direto).
- **Anti over-claim:** nenhuma resposta deve afirmar ação feita sem o cartão/execução.

## Limpeza pendente
Cliente de teste **"Joao Teste da Silva" (CPF 999.888.777-66)** criado no smoke — remover quando quiser (não removido automaticamente por ser exclusão de dado).
