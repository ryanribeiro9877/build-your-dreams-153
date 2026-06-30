# Design — Pendências internas + execução agêntica (JurisAI independente do ProJuris)

**Data:** 2026-06-30 · **Decorre de:** FEAT-04 = INTERNO. **Continuação de:** chat agêntico v1 (`2026-06-30-chat-agentico-acoes-design.md`).
**Princípio:** reusar `user_tasks` + Kanban + comentários/auditoria/notificações existentes. **Sem tabela nova de pendência. Nada de ProJuris.**
**Segurança:** tudo agêntico atrás de `CHAT_TOOLS_ENABLED`; toda escrita exige confirmação + RBAC.

## Tickets cobertos
FEAT-01 (schema), ORQ-01 (handlers), FEAT-02 (transferência/devolução), FEAT-03a (kanban), FEAT-03b (alertas), MIG-01 (import CSV), PILOT-01 (flag/rollout).

---

## 1. FEAT-01 — Modelo de pendência (estende `user_tasks`)
Pendência = `user_task` com `is_pendencia = true` + campos extras. Colunas novas em `user_tasks`:
- `is_pendencia boolean not null default false`
- `pendencia_tipo text` — CHECK in (`documentacao`,`comprovante_endereco`,`senha_inss`,`reset_inss`,`extratos`,`falta_documentacao`,`audiencia`,`reuniao`,`andamento`,`whatsapp`,`outro`)
- `pendencia_estado text` — CHECK in (`aberta`,`em_tratamento`,`resolvida`,`devolvida`,`cancelada`)
- `data_fatal date`
- `origem_user_id uuid references auth.users(id)`
- `origem_departamento org_stage`, `departamento_atual org_stage`

Reuso (sem duplicar): comentários → `user_task_comments`; auditoria → `task_audit_log`; prazo → `deadline_at`; marcadores → `task_tags`; cliente/processo → `client_id`/`process_id`; responsável → `assignee_user_id`.

**RLS:** policy adicional em `user_tasks` para linhas `is_pendencia`: `tech` global; demais veem onde `auth.uid()` ∈ (`assignee_user_id`,`origem_user_id`) OU o `departamento_atual` corresponde ao stage do usuário; recepção vê `departamento_atual = 'recepcao'`/`kanban_pendencias`. Espelha as policies de `user_tasks` já existentes (não remover as atuais; só ADD policy permissiva para pendência).

**Aceite:** migração limpa; types regen; CRUD respeita RLS (recepção vê o seu; advogado não vê pendência de outro; tech vê tudo).

## 2. ORQ-01 — Handlers (RPCs + tools)
RPCs Postgres (SECURITY DEFINER, validam RBAC + gravam auditoria + notificação):
- `criar_pendencia(p_tipo, p_titulo, p_cliente_id, p_descricao, p_responsavel?, p_prazo?, p_data_fatal?, p_departamento?)` → cria `user_task` is_pendencia, estado `aberta`; audit; notifica responsável.
- `transferir_pendencia(p_id, p_departamento_destino?, p_responsavel_destino?)` → muda `departamento_atual`/`assignee_user_id`; audit (de→para); notifica destino; estado→`em_tratamento`.
- `resolver_pendencia(p_id, p_resolucao)` → estado `resolvida`; **devolução automática ao gerador**: cria/atualiza para `devolvida` apontando `departamento_atual = origem_departamento`/`assignee = origem_user_id`; audit; notifica origem.

Tools no edge (`tools/registry.ts`/`handlers.ts`/`rbac.ts`), atrás de `CHAT_TOOLS_ENABLED` + confirmação:
- `criar_pendencia`, `transferir_pendencia`, `resolver_pendencia` (escrita → cartão de confirmação).
- `agendar_reuniao(cliente, data, hora, modalidade)` → cria pendência `tipo=reuniao` com `deadline_at`/`data_fatal` (ano ancorado pelo guardrail BUG-01). Escrita → confirmação.
- RBAC: recepção pode criar/transferir/resolver pendência, cadastrar cliente, agendar; **não** pode ações exclusivas de advogado → cai em pendência ao Admin (decisão `decideActionRoute`). Testar casos negativos.

**Aceite:** "Cadastrar cliente X e agendar reunião 20/07 16h" → agente propõe → ao confirmar, cria cliente + pendência reunião (ano 2026), resposta cita IDs. Sem confirmação, nada grava. Recepção bloqueada em ação de advogado.

## 3. FEAT-02 — Transferência/devolução
Implementado pelas RPCs `transferir_pendencia`/`resolver_pendencia` (seção 2). Notificações via `bottleneck_notifications` (in-app) + opcional `email_notifications`. Histórico completo em `task_audit_log` (de→para, autor, timestamps). UI mostra o histórico (reusa o detalhe da tarefa).

**Aceite:** ciclo A gera → recepção recebe alerta → resolve → A é notificado e pendência volta para A, com histórico.

## 4. FEAT-03a — Kanban de pendências
Board "Pendências" (seed em `kanban_boards`) + `kanban_columns`: Demanda WhatsApp · Senha/Reset INSS · Comprovante de endereço · Extratos · Falta Documentação · Pendência Resolvida · Agendar Nova Reunião. Mapa `pendencia_tipo`/`pendencia_estado` → coluna. Cards = `user_tasks` is_pendencia via `kanban_card_placements`. Filtro por responsável/estado/prazo (reusa `kanban_saved_filters`). Mover card atualiza estado/coluna (com confirmação; sem race — reusa o RPC de move existente).

**Aceite:** pendências na coluna certa; filtro funciona; mover atualiza estado.

## 5. FEAT-03b — Alertas por data_fatal
Job `pg_cron` (instalado) que varre `user_tasks where is_pendencia and data_fatal <= current_date + N and pendencia_estado not in ('resolvida','cancelada')` e insere `bottleneck_notifications` para responsável/recepção (dedup por dia). Kanban marca atraso em vermelho (`data_fatal < hoje`).

**Aceite:** pendência com `data_fatal` ≤ hoje/+N gera alerta; atraso destacado.

## 6. MIG-01 — Import CSV (sem API ProJuris)
Página admin (tech) importadora (PapaParse, já é dep): clientes, processos, pendências abertas. Mapeia colunas do export → schema. Dedup/idempotência (por CPF/CNPJ em clientes; por chave natural em pendências). Erros linha-a-linha. Reimport não duplica.

**Aceite:** CSV de exemplo importa clientes+pendências; reimport não duplica; erros reportados por linha.

## 7. PILOT-01 — Flag por departamento + cutover
`CHAT_TOOLS_ENABLED` (global, já existe) + config por departamento (ex.: tabela/flag `pendencias_pilot_departments text[]` em config, ou env). Recepção primeiro; operação paralela ao ProJuris; métricas (volume/prazos/resolução — query sobre `user_tasks`/`task_audit_log`); rollback (desligar flag); checklist de cutover (doc).

**Aceite:** recepção opera ciclo completo sob flag; desligável sem perda; checklist documentado.

## 8. Verificação
- Edge (Deno): `deno check` + `deno test` (CI já cobre). Front: `vitest` + `tsc` + build.
- Tudo flag-gated; smoke ao vivo do ciclo gerar→alertar→resolver→devolver + execução real (cadastro/agenda).

## 9. Notas transversais
- **Fora de escopo:** qualquer escrita/integração no ProJuris.
- **LGPD:** Supabase vira o lar de PII → RLS reforçada (policies de pendência), Vault para segredos.
- **Confirmação + RBAC obrigatórios** em toda ação com efeito colateral.
- **Ordem de execução:** FEAT-01 → ORQ-01/FEAT-02 → FEAT-03a/b → MIG-01 → PILOT-01.
