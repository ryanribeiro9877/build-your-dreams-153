# Auditoria técnica — JurisAI

**Data:** 2026-07-21
**Escopo:** software completo (frontend React/Vite, edge functions Deno/Supabase, banco de produção `tsltxvswzdnlmvljpryh`)
**Método:** verificações executáveis (tsc/eslint/vitest/build) + advisors do Supabase + inspeção direta do schema/RPCs em produção via SQL + revisão de código (orquestrador, edge functions, front) com validação manual dos achados de maior severidade.
**Natureza:** auditoria honesta — cada achado indica se foi **confirmado por mim diretamente no banco/código** ou **reportado e não reconfirmado**.

---

## 1. Veredito

O software **compila, passa nos 202 testes e faz build sem erro**. A arquitetura tem defesas reais e bem-feitas em vários pontos (assinatura de webhook Stripe, isolamento por `session_id` no chat, autorização por `is_master_admin` no convite, timing-safe na API de integração).

Porém a auditoria encontrou **3 vulnerabilidades críticas ativas em produção** originadas de uma **migração de segurança que existe no repositório mas nunca foi (totalmente) aplicada no banco** — a causa-raiz mais grave. Além delas, há falhas de correção no fluxo de pagamento e no orquestrador, e um passivo grande de performance de banco.

**Contagem:** 3 Críticos · 4 Altos · 6 Médios · vários Baixos/informativos.

---

## 2. Verificações executáveis (rodadas em 2026-07-21)

| Verificação | Resultado |
|---|---|
| `tsc --noEmit` | ✅ limpo (0 erros) |
| `vitest run` | ✅ 202 testes / 22 arquivos passando |
| `vite build` | ✅ sucesso |
| `eslint .` | ❌ **152 erros + 68 warnings** |
| Bundle | ⚠️ chunks grandes: `Index` 594 kB, `Stars` 822 kB (221 kB gzip) |

---

## 3. Achados CRÍTICOS (confirmados por SQL direto em produção)

### C1 — Backdoor por e-mail hardcoded em `is_master_admin()`
**Confirmado.** A função em produção contém:
```sql
EXISTS (SELECT 1 FROM auth.users u
        WHERE u.id = _user_id AND lower(u.email) = 'admin@juridico.com')
OR public.has_role(_user_id,'director') OR (... rt.code='socio')
```
`is_master_admin` é o gate de privilégio máximo (usado em convites, provisionamento, listagem de usuários, etc.). Quem controlar/registrar o e-mail `admin@juridico.com` obtém acesso de administrador-mestre. É um backdoor clássico.
**Correção:** remover o ramo do e-mail (o Fix 2 da migração `20260601200000_security_fixes.sql` já faz exatamente isso — basta aplicá-lo). Verificar se existe conta com esse e-mail hoje.

### C2 — `consume_tokens_with_ref()` sem verificação de dono + exposta a `authenticated`
**Confirmado** (definição + grants consultados em prod). A função é `SECURITY DEFINER`, tem `GRANT EXECUTE ... TO authenticated`, e **não** checa `p_user_id = auth.uid()`.
**Cenário de exploração:** qualquer usuário logado chama via PostgREST
`rpc/consume_tokens_with_ref` com o `p_user_id` de uma vítima e debita/zera o saldo de tokens dela. Sabotagem financeira entre contas.
Obs.: `consume_tokens` (sem `_ref`) tem a mesma ausência de check, porém **não** está grantada a `authenticated` (só `service_role`) — risco latente, não explorável hoje via API.
**Correção:** adicionar `IF p_user_id <> auth.uid() THEN RAISE EXCEPTION ...` (Fix 1 da mesma migração).

### C3 — Idempotência do pagamento inexistente no banco
**Confirmado.** `token_transactions` em produção só tem `PRIMARY KEY (id)` — **não existe** a constraint `UNIQUE (reference_id, transaction_type)` que a migração `20260601200000` (Fix 3) deveria ter criado. A idempotência do webhook depende hoje 100% de um `SELECT ... maybeSingle()` antes do insert (`payments-webhook/index.ts:61-73`), que tem **janela de corrida**: duas entregas concorrentes do mesmo evento Stripe (retries) passam ambas o SELECT e **creditam tokens em dobro**.
**Correção:** aplicar a constraint única e tratar violação como sucesso idempotente no webhook.

> **Causa-raiz comum a C1–C3:** a migração `supabase/migrations/20260601200000_security_fixes.sql` (9 correções de segurança CRÍTICAS/ALTAS) **não consta na lista de migrations aplicadas em produção**. Verifiquei fix a fix: o Fix 6 (view `security_invoker`) está aplicado (por outra via), mas **Fix 1, 2, 3 e 5 NÃO estão**. Ver seção 7 (desync repo↔banco).

---

## 4. Achados ALTOS

### A1 — Webhook Stripe engole erro de `add_tokens` e responde 200
**Confirmado** — `supabase/functions/payments-webhook/index.ts:75-84`. O resultado de `supabase.rpc("add_tokens", …)` não é verificado; a função sempre retorna `200 {received:true}`. Se `add_tokens` falhar (erro de DB, deadlock, exceção), o Stripe marca o evento como entregue e **nunca reenvia** → **cliente paga e não recebe tokens, silenciosamente**.
**Correção:** checar `error`; em falha não-idempotente, retornar `5xx` para o Stripe reprocessar.

### A2 — `user_roles` visível para todos os autenticados
**Confirmado** (policies consultadas em prod). A policy de SELECT é `USING (true)` para `authenticated` ("Authenticated users can view roles"); a versão restrita (Fix 5) nunca foi aplicada. Qualquer usuário logado lê os papéis de **todos** os usuários — vazamento de informação de autorização/estrutura interna.
**Correção:** aplicar Fix 5 (`USING (user_id = auth.uid() OR has_role(auth.uid(),'admin'))`).

### A3 — `integration-api`: `delete`/`update` sem filtro afetam a tabela inteira
**Confirmado** — `_shared/integrationApi.ts:142` (`applyFilters` retorna a query inalterada quando `filters` é vazio) + `integration-api/index.ts:155-177`. Uma chamada `{action:"delete", table:"clients"}` sem `filters` executa `admin.from("clients").delete()` **sem WHERE**, com service_role (ignora RLS) → perda de dados em massa. Idem `update`. Requer a `INTEGRATION_API_KEY`, mas não há guarda contra operação full-table.
**Correção:** exigir `filters` não-vazio em delete/update (ou flag explícita `all_rows:true`).

### A4 — `integration-api`: RPC e tabelas arbitrárias com service_role
**Confirmado** — `integration-api/index.ts:191-199`. `handleRpc` executa **qualquer** RPC (só valida formato do nome), e as operações de tabela não têm allowlist. Com a chave de integração, é possível `rpc:"consume_tokens_with_ref"`, `rpc:"get_provider_key_decrypted"` (exfiltrar chaves do Vault), ler `clients`/`profiles` inteiros (PII), etc. Blast radius total sobre o schema `public`.
**Correção:** allowlist explícita de RPCs e tabelas por chave; bloquear RPCs sensíveis.

### A5 — Loop não-terminável no ramo de delegação do orquestrador
**Reportado (código lido pelo subagente); não reconfirmei execução.** `chat-orchestrator/index.ts:2651-2728`. O backstop anti-laço (`MAX_DELEGATION_HOPS`) só conta entradas de `run.chain` com ação `delegate/read/return`; os ramos de **falha** do `delegate` (profundidade máx., sem alvo, ambíguo, ancestral) reinvocam a Edge Function sem incrementar `hops`. Um agente sem filhos válidos que insista em delegar gera reinvocações indefinidas → runaway de custo/DoS silencioso.
**Correção:** contar todas as reinvocações do ramo `delegating` no teto e não expor `delegate` a agentes com `allowedChildRoles` vazio.

---

## 5. Achados MÉDIOS

- **M1 — `salvar_peca` sem handler no fluxo normal** (`tools/handlers.ts` switch; `index.ts:2989`): fora da delegação, cai no `default` → "ferramenta de escrita desconhecida"; usuário confirma e a ação falha. *(reportado)*
- **M2 — Escrita inline no ramo `delegating` sem confirmação nem RBAC** (`index.ts:2757-2767`): sub-agentes executam `cadastrar_cliente`/`distribuir_caso`/etc. pulando `proposeAction` e `decideActionRoute` — inconsistente com o fluxo normal. *(reportado)*
- **M3 — Idempotência incompleta em `handleConfirm` p/ rota "pendência"** (`index.ts:3336,3359`): o guard só trata `status="executed"`; pendências ficam `routed_pendencia` → confirmar 2× cria `inter_assistant_requests` duplicados. *(reportado)*
- **M4 — Watchdog 360s mata passos longos de delegação/leitura sem heartbeat** + `upd()` sem CAS de status (`index.ts:2555,2676,2960`). *(reportado)*
- **M5 — `useBottleneckDetection` morre após 1º refresh de token** (`src/hooks/useBottleneckDetection.tsx:33,37,236`): `initialized.current` nunca reseta; quando o objeto `user` troca (TOKEN_REFRESHED ~1h), o cleanup roda mas o efeito re-entra no guard e **não re-subscreve** → detecção de gargalos (canal realtime + polling 5min) para permanentemente, sem erro visível. **Validei o padrão do código.** Correção: remover o ref e usar dep `[user?.id]`.
- **M6 — `send-email-notifications`: `attempts` do lote usa valor da 1ª linha** (`index.ts:108`) e linhas presas em `sending` nunca são recuperadas (`:84,106`) → backoff corrompido e e-mails legítimos nunca enviados. *(reportado)*

---

## 6. Achados BAIXOS / informativos

- **`useTaskAttachments.uploadFile` retorna `null` mesmo em sucesso** (`src/hooks/useTaskAttachments.ts:144`): usa `attachments` do closure antigo após `refresh()`. *(reportado)*
- **`ChatWithAgent` carga inicial sem flag de cancelamento** (`src/pages/ChatWithAgent.tsx:82`): troca rápida de sessão sobrescreve mensagens + ignora `.error`. *(reportado)*
- **Churn de canais realtime a cada refresh de token** em `useRealtimeNotifications.tsx:104` e `ValidationQueue.tsx:73` (dep `[user]` em vez de `[user?.id]`). *(reportado)*
- **Comparações de segredo não timing-safe** (`===`) em `send-email-notifications`, `sync-provider-credits`, `google-calendar-sync`, `ocr-client-document`. *(confirmado por leitura)*
- **`google-calendar-sync` aceita qualquer `Bearer` no ramo "usuário"** sem `auth.getUser()` (`index.ts:79-83`) — bypass de baixo impacto (ação depende do estado do registro). *(reportado)*
- **Uploads OCR/transcrição sem limite de tamanho** (`await blob.arrayBuffer()`) → risco de OOM. *(reportado)*
- **ESLint fora do gate de CI:** 152 erros (`any`, `@ts-ignore`, escapes). Não são bugs ativos, mas removem a rede de tipos em pontos críticos do orquestrador.
- **Advisors de performance (banco):** 132 policies com `auth.uid()` cru (re-avaliação por linha — usar `(select auth.uid())`), 42 FKs sem índice, 36 índices não usados, 36 policies permissivas redundantes, 1 índice duplicado (`kanban_board_config`). **Confirmado.**
- **Config Auth:** OTP com expiração > 1h; 3 RPCs `SECURITY DEFINER` executáveis por `anon` (`ai_generations_compute_cost`, `enforce_tech_test_flags`, `sync_agent_allowed_tools`). **Confirmado via advisor.**

---

## 7. Causa-raiz sistêmica: desync repositório ↔ banco

- A migração de segurança `20260601200000_security_fixes.sql` **não está aplicada em produção** (parcialmente aplicada — só Fix 6). É a origem direta de C1, C2, C3 e A2.
- Há **migrations duplicadas** na lista de produção (`client_timeline_function`, `search_clients_function`, `client_saved_filters`, `assignable_users_function`, `orchestration_runs_intent_add_acao_com_tool` — cada uma 2×), sintoma de aplicação manual via MCP sem correspondência 1:1 com os arquivos.
- **Consequência:** o repositório **não é fonte de verdade confiável** do estado do banco. Correções de segurança podem "existir no código" e não estar no ar — exatamente o que aconteceu aqui.
- **Recomendação:** reconciliar migrations (baseline com `supabase db pull`), adotar deploy de migrations via CI, e uma checagem periódica de drift.

---

## 8. Plano de correção priorizado

| Prio | Item | Ação |
|---|---|---|
| P0 | C1 backdoor `is_master_admin` | Aplicar Fix 2; auditar se o e-mail existe |
| P0 | C2 `consume_tokens_with_ref` | Aplicar Fix 1 (ownership check) |
| P0 | C3 idempotência pagamento | Aplicar Fix 3 (constraint única) + tratar no webhook |
| P0 | A1 webhook engole erro | Checar `error` do `add_tokens`, retornar 5xx |
| P1 | A2 `user_roles USING(true)` | Aplicar Fix 5 |
| P1 | A3/A4 `integration-api` | Exigir filtro em delete/update; allowlist de RPCs/tabelas |
| P1 | A5 loop de delegação | Teto real de reinvocações; não expor `delegate` a folhas |
| P2 | M1–M6 | Corrigir conforme seção 5 |
| P2 | Desync migrations | Reconciliar + deploy via CI |
| P3 | Baixos + performance RLS | `(select auth.uid())`, índices de FK, ESLint no CI |

---

## 9. Correções aplicadas (2026-07-21)

Após a auditoria, as **correções críticas foram aplicadas e verificadas**. A fase de auditoria (seções 1–8) foi somente-leitura; esta seção registra as alterações feitas depois.

| Item | Onde | Status | Verificação |
|---|---|---|---|
| C1 backdoor `is_master_admin` | Banco (prod) | ✅ Aplicado | `pg_get_functiondef` não contém mais o e-mail; `is_master_admin('admin@juridico.com')` continua `true` (não perdeu acesso — já é director+sócio) |
| C2 ownership `consume_tokens*` | Banco (prod) | ✅ Aplicado | Teste funcional: chamar com `p_user_id` de outro → exceção `unauthorized`; chamar com o próprio → passa (retorna false por saldo inexistente) |
| C3 constraint idempotência | Banco (prod) | ✅ Aplicado | `uq_token_transactions_reference` existe; 0 duplicatas pré-existentes |
| A1 webhook engole erro | `payments-webhook/index.ts` | ✅ Código pronto (⚠️ falta deploy) | `deno check` limpo; trata violação de unique como duplicata e retorna 5xx em falha real |

**Como foi aplicado:** migração `20260721120000_apply_pending_security_fixes_c1_c2_c3.sql` — reaplica cirurgicamente os Fixes 1/2/3 da migração `20260601200000` que nunca chegou a produção, **preservando o corpo atual das funções em prod** (para não reverter evoluções posteriores). Aplicada via MCP e espelhada no repositório. Commit `84054c1`.

**Pendente (passo final do A1):** deploy da edge function `payments-webhook`. Não foi feito automaticamente por ser uma função de pagamento cujo redeploy não pôde ser testado ponta-a-ponta aqui. A duplicação de crédito (núcleo do risco) **já está barrada pela constraint C3** mesmo com o webhook antigo; o deploy adiciona a proteção contra "pagamento sem crédito em falha real". Comando:
```
supabase functions deploy payments-webhook --project-ref tsltxvswzdnlmvljpryh --no-verify-jwt
```

**Não aplicados (fora do escopo "crítico"):** A2 (`user_roles`), A3/A4 (`integration-api`), A5 (loop de delegação) e os médios/baixos permanecem como recomendação — ver seções 4–6.

> **Nota:** as demais verificações da auditoria foram somente leitura. As únicas alterações feitas no banco foram os fixes C1/C2/C3 acima (idempotentes, verificados).
