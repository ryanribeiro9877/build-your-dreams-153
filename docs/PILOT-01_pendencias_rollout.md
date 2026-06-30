# PILOT-01 — Piloto de pendências internas pela recepção + cutover

**Objetivo:** rodar as pendências internas em paralelo ao ProJuris, começando pela **recepção**, sem Big-Bang, com rollback fácil.

## Mecanismo de habilitação (sem flag nova)
O controle já existe em duas camadas — não precisa de tabela/flag nova:
1. **Flag global do motor agêntico:** env `CHAT_TOOLS_ENABLED` no edge `chat-orchestrator`. Off → nada de tool-calling. On → loop ativo.
2. **Habilitação por agente:** coluna `agents.allowed_tools`. Só os agentes com as ferramentas semeadas executam. Hoje estão semeados: `assistant_root` (todos) e specialists/monitors de **recepção/triagem/cadastro/pendências/lembretes**.

**Piloto = recepção primeiro:** mantenha `CHAT_TOOLS_ENABLED=true` e deixe `allowed_tools` apenas nos agentes de recepção (e num agente de teste), removendo temporariamente do `assistant_root` até validar. Assim só a recepção executa pendências/cadastro/agenda; o resto do escritório segue como hoje.

### Ligar o piloto (recepção)
```sql
-- 1) tirar ferramentas do assistant_root durante o piloto (guardar o valor antes)
UPDATE public.agents SET allowed_tools = '{}' WHERE role = 'assistant_root';
-- (recepção/triagem/cadastro já estão semeados pelas migrations)
```
```
-- 2) edge: definir secret CHAT_TOOLS_ENABLED=true e redeployar o chat-orchestrator
```

### Rollback (desligar)
```
-- edge: remover/zerar CHAT_TOOLS_ENABLED (ou =false) e redeployar  → motor volta a inerte
```
```sql
-- opcional: devolver ferramentas ao assistant_root quando expandir
UPDATE public.agents SET allowed_tools = ARRAY[
  'consultar_cliente','consultar_usuario','consultar_tarefas','consultar_processo','consultar_documentos',
  'cadastrar_cliente','criar_card_tarefa','solicitar_documentos','pedir_acesso_arquivos',
  'criar_pendencia','transferir_pendencia','resolver_pendencia','agendar_reuniao'
] WHERE role = 'assistant_root';
```
Nenhum dado é perdido no rollback — as pendências criadas continuam em `user_tasks`; só o motor agêntico é desligado. A operação manual (página `/pendencias`) continua funcionando.

## Operação em paralelo
- Recepção cria/transfere/resolve pendências pelo chat **ou** pela página `/pendencias` (FEAT-03a).
- ProJuris continua sendo usado em paralelo até o cutover — sem integração (FEAT-04 = interno).

## Métricas do piloto (queries)
```sql
-- volume por estado
SELECT pendencia_estado, count(*) FROM public.user_tasks WHERE is_pendencia GROUP BY 1;
-- pendências atrasadas
SELECT count(*) FROM public.user_tasks
 WHERE is_pendencia AND data_fatal < current_date AND pendencia_estado NOT IN ('resolvida','cancelada','devolvida');
-- tempo de resolução (criação → conclusão)
SELECT avg(completed_at - created_at) FROM public.user_tasks
 WHERE is_pendencia AND completed_at IS NOT NULL;
-- ciclo de auditoria (gerar→transferir→resolver→devolver)
SELECT field, count(*) FROM public.task_audit_log
 WHERE field LIKE 'pendencia_%' GROUP BY 1 ORDER BY 2 DESC;
```

## Checklist de cutover (recepção → escritório)
- [ ] Recepção operou o ciclo completo por ≥1 semana sem incidentes (gerar→alertar→resolver→devolver).
- [ ] Métricas estáveis (volume, prazos, % resolvida no prazo).
- [ ] Importação histórica concluída (MIG-01) e conferida.
- [ ] Equipe treinada nos cartões de confirmação e na página `/pendencias`.
- [ ] Plano de rollback testado (desligar a flag e confirmar operação manual).
- [ ] Devolver `allowed_tools` ao `assistant_root` e/ou semear demais departamentos.
- [ ] Comunicar descontinuação gradual do ProJuris para pendências.

## LGPD (transversal)
Com o JurisAI virando lar oficial de PII: RLS reforçada (policies de pendência já escopadas por papel/origem/departamento), segredos no Vault, e DPA/registro de tratamento revisados antes do cutover pleno.
