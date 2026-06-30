# Relatório — Pendências internas + execução agêntica (tickets FEAT-01…PILOT-01)

**Data:** 2026-06-30 · **Decisão base:** FEAT-04 = INTERNO (sem ProJuris).
**Branch:** `feat/pendencias-internas` → merge na `main` (`80262ff`). **Edge:** `chat-orchestrator` **v66**.
**Spec:** `docs/superpowers/specs/2026-06-30-pendencias-internas-design.md`.

> **Estado:** entregue e em produção, porém o **motor agêntico está DESLIGADO** (`CHAT_TOOLS_ENABLED` ausente). As migrations são aditivas/inertes; as páginas novas ficam vazias até existirem pendências. Rollout em `docs/PILOT-01_pendencias_rollout.md`.

---

## 1. Princípio aplicado
Reusar o que já existe (`user_tasks`, Kanban, `user_task_comments`, `task_audit_log`, `bottleneck_notifications`, `pg_cron`) em vez de criar do zero. **Pendência = `user_task` com `is_pendencia=true`.** Nenhuma tabela de pendência nova. Nada de ProJuris.

## 2. O que foi feito, por ticket

### FEAT-01 — Modelo de pendência (SCHEMA) · ✅ aplicado em prod
Migration `20260630130000_pendencias_internas.sql`. Colunas novas em `user_tasks`: `is_pendencia`, `pendencia_tipo` (CHECK 11 tipos), `pendencia_estado` (CHECK: aberta/em_tratamento/resolvida/devolvida/cancelada), `data_fatal`, `origem_user_id`, `origem_departamento`, `departamento_atual` (`org_stage`). Índices parciais. **RLS:** policy SELECT adicional escopada a `is_pendencia` (tech/master global; responsável/origem/assigner; recepção vê `recepcao`/`kanban_pendencias`). Comentários→`user_task_comments`, auditoria→`task_audit_log`, prazo→`deadline_at` (reuso, sem duplicar).

### ORQ-01 — Execução real via tool-calling (ORQUESTRAÇÃO) · ✅ em prod (inerte/flag)
Migration `20260630140000_pendencia_rpcs.sql` (RPCs SECURITY DEFINER): `criar_pendencia`, `transferir_pendencia`, `resolver_pendencia` + helper `pode_operar_pendencia`. Seed do `task_type` `pendencia_interna` (stage `kanban_pendencias`). Tools no edge (`tools/registry.ts`/`handlers.ts`): `criar_pendencia`, `transferir_pendencia`, `resolver_pendencia`, `agendar_reuniao` (reusa criar_pendencia tipo `reuniao`; ano ancorado pelo guardrail BUG-01). Toda escrita passa por **cartão de confirmação**; **RBAC** dentro das RPCs (recepção opera pendência/cadastro/agenda; ação de advogado → pendência ao Admin). `allowed_tools` semeado em `assistant_root` + agentes de recepção/triagem/cadastro/pendências.

### FEAT-02 — Transferência → resolver → devolver (BACKEND) · ✅ em prod
Implementado pelas RPCs: `transferir_pendencia` muda `departamento_atual`/responsável + auditoria (de→para) + notifica destino; `resolver_pendencia` conclui e, se há origem distinta, **devolve automaticamente ao gerador** (`pendencia_estado='devolvida'`, reatribui a `origem_*`) + notifica origem. Histórico completo em `task_audit_log`.

### FEAT-03a — Kanban de pendências (FRONTEND) · ✅ em prod
`src/pages/Pendencias.tsx` (rota `/pendencias`, item de menu). Colunas por estado (Aberta · Em tratamento · Resolvida · Devolvida); cards com tipo/prioridade/`data_fatal` (vermelho se atrasada, âmbar se ≤2 dias). Filtros por estado/tipo/"só atrasadas". Ações **Resolver**/**Transferir** com confirmação (chamam as RPCs).

### FEAT-03b — Alertas por data_fatal (BACKEND) · ✅ em prod
Migration `20260630150000_pendencia_alertas_cron.sql`: função `notificar_pendencias_data_fatal(dias)` + job `pg_cron` diário (11:00 UTC) que insere `bottleneck_notifications` para pendências próximas/estouradas (dedup por dia; crítico se atrasada).

### MIG-01 — Importador CSV sem API (DADOS) · ✅ em prod
`src/pages/ImportarDados.tsx` (rota `/admin/importar`, tech). PapaParse (instalado), mapeamento de colunas (nome/cpf/cnpj/email/telefone/cidade/uf), **dedup por CPF** (idempotente; pula existentes e duplicados no arquivo), resultado linha-a-linha + resumo. Insere com `created_by` do usuário.

### PILOT-01 — Piloto + cutover (PROCESSO) · ✅ documentado
`docs/PILOT-01_pendencias_rollout.md`. Mecanismo: flag global `CHAT_TOOLS_ENABLED` + `allowed_tools` por agente (recepção primeiro; remover do `assistant_root` durante o piloto). Inclui SQL de ligar/rollback, queries de métricas e checklist de cutover. Sem flag nova.

## 3. Migrations aplicadas em produção (aditivas)
| Arquivo | Conteúdo |
|---|---|
| `20260630130000_pendencias_internas.sql` | Colunas de pendência + RLS |
| `20260630140000_pendencia_rpcs.sql` | RPCs criar/transferir/resolver + seed task_type + allowed_tools |
| `20260630150000_pendencia_alertas_cron.sql` | Função + job pg_cron de alertas |

## 4. Deploys
- Edge `chat-orchestrator` **v66** (tools de pendência; flag OFF → inerte).
- Frontend (Vercel): páginas `/pendencias` e `/admin/importar` via merge `80262ff`.
- Migrations já aplicadas (acima).

## 5. Commits (branch `feat/pendencias-internas`)
- spec + migration FEAT-01 · regen tipos · RPCs+tools (`2a532bc`) · regen tipos · cron FEAT-03b · frontend FEAT-03a/MIG-01 (`9f9b66c`) · doc PILOT-01 · merge `80262ff`.

## 6. Verificação
- Front: `tsc` 0 erros · `vitest` **88/88** (baseline 10 errors async) · `build` ok.
- Edge (Deno): sem `deno` local → não type-checado na máquina; coberto pela flag (deploy inerte) + job CI `deno check`/`deno test` (adicionado na sessão anterior). Validar no rollout.

## 7. Como ligar (rollout seguro — precisa de sessão logada)
Ver `docs/PILOT-01_pendencias_rollout.md`. Resumo: (1) limitar `allowed_tools` à recepção/agente de teste; (2) `CHAT_TOOLS_ENABLED=true` + redeploy edge; (3) smoke do ciclo **criar→transferir→resolver→devolver** + cadastro/agenda (ano 2026, sem over-claim) + RBAC negativo (recepção × ação de advogado); (4) conferir `/pendencias`, notificações e `task_audit_log`; (5) expandir/cutover.

## 8. Pendências / próximos passos
- **Ligar a flag e rodar o smoke** (único passo para ativar; precisa de login).
- **Mover card no Kanban** muda estado via botões Resolver/Transferir; arrastar-e-soltar entre colunas não foi incluído (v1 usa ações explícitas).
- **MIG-01:** v1 cobre **clientes**; importar processos/pendências em massa pode ser estendido com o mesmo padrão.
- **task_audit_log** usa `field/old_value/new_value` (não há coluna `payload`) — leitores de auditoria devem ler desses campos.
- **LGPD:** com o Supabase como lar oficial de PII, revisar Vault/DPA antes do cutover pleno.
- **Deno local** para type-check do edge antes de evoluir o `index.ts` (ou confiar no CI).
