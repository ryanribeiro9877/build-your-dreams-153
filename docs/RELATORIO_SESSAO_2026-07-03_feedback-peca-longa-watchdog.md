# Relatório — Fase 2: feedback de peça longa + watchdog + limpeza de ruído (2026-07-03)

Correção das 4 frentes do briefing pós-diagnóstico. Contexto: a orquestração
**não** estava travada — peça longa (Caminho B) leva 18+ min (redação em 5 blocos
+ rodadas de correção). A UI mostrava só três pontinhos mudos, dando falsa
impressão de travamento. O "403" do console era o Sentry (DSN recusada), não a
orquestração.

## Frente 1 — Progresso de bloco na UI ✅

- Novo módulo puro `src/components/juris-cloud/liveStatus.ts`:
  - `parseBlockProgress` — extrai `(X de N)` real do texto da etapa (aceita
    `(2 de 5)` e `(bloco 3 de 5)`); retorna `null` sem contador (nunca inventa).
  - `stageLabel` — rótulo amigável por fase (`routing_n1` → "Analisando o caso",
    `executing_n3` → "Redigindo a peça", etc.). Esconde o log técnico cru.
  - `deriveLiveStage` — "bloco X de N" **só** em `executing_n3` com contador real.
  - `formatElapsed` + `LONG_RUN_NOTICE_MS` (210s).
- `JurisChatPanel`: `ThinkingBubble` mudo → `StatusIndicator` em **linha única**
  com rótulo amigável + "· bloco X de N" (quando real) + cronômetro ao vivo;
  some quando a resposta final chega.
- `JurisCloudOS`: rastreia `liveStage` (das etapas via realtime) e
  `thinkingStartedAt` (efeito no `thinking`). Log técnico cru continua oculto (2.1).
- Testes: `__tests__/liveStatus.test.ts` (9 casos) — inclui a garantia de que
  texto cru de validador **não** vira contador de bloco.

## Frente 2 — Timeout / estado no front ✅

- Após `LONG_RUN_NOTICE_MS` (~3min30s) sem resposta final, o `StatusIndicator`
  acrescenta: "Ainda processando — peças longas podem levar alguns minutos."
  (sem cancelar; o run segue).
- Mensagens `kind:"error"` (ex.: watchdog de timeout) renderizam com destaque
  visual claro (borda/ícone `AlertTriangle` + "Não foi possível concluir"),
  nunca ambíguas com resposta normal. O indicador some em `final`/`error`.

## Frente 3 — Watchdog por idade absoluta ✅

- Migração `20260703140000_orchestration_watchdog_absolute_age.sql` (aplicada em
  produção). `fail_stale_orchestration_runs` agora recebe 2º parâmetro
  `p_max_total_age` (default **30 min**): falha runs com
  `created_at < now() - 30min` **independente** de `updated_at`, **preservando**
  o watchdog por `updated_at` (worker morto, 6min20s).
- Cuidado importante: o `CREATE OR REPLACE` criou um overload (1 vs 2 params),
  deixando a chamada sem args do cron (jobid 2) ambígua. A migração faz
  `DROP FUNCTION ... (interval)` antes do create para manter assinatura única.
- **Teto escolhido: 30 min. Justificativa (dados reais):** a run legítima
  observada ("petição do bancário", 1 rodada de correção mecânica) concluiu com
  sucesso em **17min59s**. Cada passe de 5 blocos ≈ 9-10 min; laço limitado
  (`MAX_ITERATIONS=2` + `MAX_CONSULTIVE_ITERATIONS=2`, 5 blocos/passe). 30 min
  cobre o caso comum + até ~2 rodadas de correção (~28 min) com folga; um teto de
  10 min (sugestão pré-dados) teria **matado indevidamente** essa peça válida.
  O pior caso teórico (2 mecânicas + 2 consultivas ≈ 40-50 min) é raro; a UX de
  peça longa é resolvida pelas Frentes 1/2, não por matar o run.
- **Follow-up:** a otimização "reenviar só o bloco afetado" (briefing separado)
  reduz o pior caso bem abaixo de 30 min e permitirá baixar o teto com segurança.

## Frente 4 — Limpeza de ruído

### 4.1 Sentry front (403 no console) ✅
- `src/lib/sentry.ts`: kill-switch `VITE_SENTRY_ENABLED="false"` (desliga sem
  remover a DSN) + validação de formato da DSN (DSN malformada não inicializa).
- `.env.example` documenta ambos.
- **Ação do time (fora do código):** a DSN atual está sendo **recusada (403)**
  pelo ingest do Sentry. Rotacionar `VITE_SENTRY_DSN` na Vercel por uma DSN
  válida, **ou** definir `VITE_SENTRY_ENABLED=false` até rotacionar. (Não tenho
  acesso aos secrets da Vercel para rotacionar diretamente.)

### 4.2 Cron `send-email-notifications` (401 a cada 5 min) — DOCUMENTADO p/ Hardening (R-8)
- **Causa raiz:** o cron (jobid 1) envia `Authorization: Bearer <ANON_KEY>`, mas
  a função exige `Bearer <SERVICE_ROLE_KEY>` **ou** header `X-Cron-Secret`
  (= `CRON_SECRET`). Anon ≠ service role → **401**.
- **É ruído ou perda real?** Perda **pequena e antiga**: 5 e-mails em
  `email_notifications` presos em `pending` desde **2026-06-26**. Nenhum acúmulo
  recente relevante; baixo impacto, mas o mecanismo está quebrado.
- **Por que não corrigi agora:** exige um segredo (service role key ou
  `CRON_SECRET`) que **não deve ser commitado** numa migração. O Vault do projeto
  só tem as 2 chaves BYOK — não há secret de service role. Corrigir com segurança
  precisa de acesso ao dashboard (setar `CRON_SECRET` na função + no cron via
  Vault). Marcado para o card de Hardening (R-8).
- **Fix recomendado (Hardening R-8):**
  1. Gerar um `CRON_SECRET` forte; setar como secret da Edge Function
     `send-email-notifications` (dashboard/CLI).
  2. Guardar o mesmo valor no Vault (ex.: `cron_secret`).
  3. Reprogramar o cron jobid 1 para enviar o header via Vault:
     ```sql
     select cron.schedule('send-email-notifications-every-5min', '*/5 * * * *', $$
       select net.http_post(
         url := 'https://tsltxvswzdnlmvljpryh.supabase.co/functions/v1/send-email-notifications',
         headers := jsonb_build_object(
           'Content-Type','application/json',
           'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name='cron_secret')
         ),
         body := '{}'::jsonb
       );
     $$);
     ```
  Assim nenhum segredo fica em texto claro no comando do cron.

## Fora de escopo (não feito, conforme briefing)
- Otimização "reenviar só o bloco afetado" (block_index=0 → só bloco afetado).
- Reexibir log técnico cru (2.1 preservada).
- `CHAT_TOOLS_ENABLED` continua OFF.
- Fast-path de saudações (card 2.8).

## Validação
- `tsc --noEmit` ✅ · `bun run build` ✅ · testes: 94 + 9 novos ✅ (os 7 "errors"
  de teardown no `JurisCloudOS.responsive.test.tsx` são **pré-existentes** —
  idênticos em árvore limpa).
- `eslint`: **0 erro novo** (os `no-explicit-any` de `JurisCloudOS.tsx` são
  pré-existentes, mesma contagem em árvore limpa).
- Watchdog: assinatura única confirmada `(interval,interval)`; chamada sem args
  do cron funciona; run antes presa concluiu `done` sem ser morta.
