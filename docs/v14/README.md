# V14 — LexForce Organizational Model (Bacellar Advogados)

**Tipo**: estrutural (schema + seed)
**Bloqueia**: nada (aditivo, sem breaking change)
**Habilita**: V15 (provisionamento de usuários), V16 (UI filtrada), V17 (atribuição de tarefas), V18 (caixa de entrada), V19 (protocolo inter-Assistente)
**Validação**: `vite build` ✅ · `tsc --noEmit` ✅ (apenas os 2 erros pré-existentes em `__tests__/JurisCloudOS.responsive.test.tsx`) · `git apply --check` ✅ em clone fresh do `main`

---

## O que o V14 faz

Cria a fundação multi-papel da empresa Bacellar Advogados a partir do `domain-model.md`:

- **10 cargos** (`role_templates`)
- **~75 agentes** (`agent_templates`) com `default_system_prompt`, `default_model` etc.
- **66 tipos de tarefa** (`task_types`) com SLA, validação obrigatória onde aplicável
- **Matrizes** `role_agent_matrix` (provisionamento V15) e `role_task_matrix` (autorização)
- **Tabelas operacionais**: `user_areas`, `role_coverage`, `external_collaborators`, `user_tasks`, `inter_assistant_requests`, `captacao_canais`
- **Alterações aditivas** em `profiles` (+role_template_id, +organization_id, +full_name) e `agents` (+owner_user_id, +source_template_id, +is_overridden, +is_personal)
- **Enum `agent_role`** ganha `assistant_root` (Meu Assistente)
- **RLS strict** em todas as tabelas novas
- **Realtime publication** ativado para `user_tasks`, `inter_assistant_requests`, `role_coverage`
- **Robson** registrado em `external_collaborators` (sem login)
- **3 canais de captação** seedados: cooperativa (ativo), ressaque (suspenso), indicação (ativo)

## O que o V14 **NÃO** faz (intencionalmente)

- ❌ **Não cria usuários reais** (Rodrigo, Ana, etc.) — V15 cuida via trigger `handle_new_user`
- ❌ **Não mexe nos 19 departamentos atuais** — coexistem (a UI filtra na V16)
- ❌ **Não toca em `chat-orchestrator`** — a integração com Assistant Root vem na V19
- ❌ **Não cria tabelas `kanban_columns/cards`** — decisão "espelhar" do sócio. Sistema lê via `user_tasks.external_kanban_ref`
- ❌ **Não muda nada em `agent_tasks`** — orquestração entre agentes continua igual

## Conteúdo do pacote

```
v14-package/
├── README.md                ← este arquivo
├── v14.diff                 ← diff aplicável (1573 linhas)
└── domain-model.md          ← spec fonte da verdade (gerada na Fase 0)
```

## Como aplicar

```bash
# 1. Em clone fresh do main, validar:
git apply --check v14.diff

# 2. Aplicar:
git apply v14.diff

# 3. Push migration:
supabase db push

# 4. (Opcional) Regenerar tipos Supabase:
supabase gen types typescript --project-id <ID> --schema public \
  > src/integrations/supabase/types.ts

# 5. Validar build:
npx vite build
```

## Decisões refletidas no schema

| Decisão do sócio | Como aparece no schema |
|---|---|
| Áreas órfãs (PS/consumidor/civil) → misto | `role_task_matrix` lista múltiplos `role_template_id` permitidos para cada tarefa dessas áreas |
| Família → Daiane ciclo completo | Daiane tem `confeccionar_peca_familia` em `role_task_matrix` + agente `esp_familia` em `role_agent_matrix` |
| Tributário → sócio mesmo faz | Tributário só no `socio.areas`; tarefa `confeccionar_peca_tributario` só permite role `socio` |
| Kanban → espelhar | Campo `user_tasks.external_kanban_ref` em vez de tabelas próprias |
| Cooperativa | Seed em `captacao_canais` (detalhes em `metadata` JSONB quando esclarecer) |
| Ressaque | Seed em `captacao_canais`, `is_active = false` |
| Robson uso esporádico | `external_collaborators` com `notes` explicando |
| Yasmin validação obrigatória | `task_types.requires_validation = true` em `validar_cadastro_yasmin` + `validator_role_code = 'lider_recepcao'` |
| Cobertura formal | Tabela `role_coverage` com `backup_user_id` nullable (NULL = pausa, caso Laura) |

## Conflitos e como foram resolvidos

| Conflito potencial | Resolução |
|---|---|
| `task_status` já existe (enum) | Criado novo enum `user_task_status` separado para tarefas humano→humano |
| `agent_role` já tem 8 valores | `ALTER TYPE ADD VALUE 'assistant_root' AFTER 'ceo'` (idempotente via DO block) |
| `agents.department_id NOT NULL` | NÃO alterado. Agentes pessoais ganham `owner_user_id`; antigos seedados ficam globais |
| `agent_tasks` já existe | NÃO mexido. Nova tabela `user_tasks` é separada (humano→humano vs agente→agente) |
| RLS de `agents` | NÃO alterado nesta migration. V16 atualiza para filtrar por `owner_user_id` |

## Estado conhecido pós-V14

```sql
SELECT count(*) FROM role_templates;        -- 10
SELECT count(*) FROM agent_templates;       -- ~75
SELECT count(*) FROM task_types;            -- 66
SELECT count(*) FROM role_agent_matrix;     -- ~75
SELECT count(*) FROM role_task_matrix;      -- ~150 (depende de quantos roles cada tarefa permite)
SELECT count(*) FROM captacao_canais;       -- 3
SELECT count(*) FROM external_collaborators; -- 1 (Robson)
```

## Próximo passo (V15)

`provision_users_from_seed` RPC + alteração no `handle_new_user` trigger:

1. Cria os 9 usuários reais (Rodrigo, Ana Cristina, Luísa, Daiane, Laura, Kailane, Taís, Yasmin, Ana Rosa) ligando cada um ao `role_template` correto
2. Trigger atualizado: ao inserir em `auth.users`, lê `role_template_id` do `profiles`, busca `role_agent_matrix`, e provisiona agentes pessoais (clonando do template, populando `owner_user_id`)
3. Backfill: para Rodrigo (já existe `admin@juridico.com`?), atribuir `role_template = socio` + provisionar
4. `user_roles.role = 'admin'` para o sócio (RBAC técnico)

## Notas para revisão humana

- Os `default_system_prompt` dos agentes são **rascunhos** baseados nas auditorias. Cada agente deve ser refinado em ciclo de iteração depois que estiver provisionado e em uso real
- O backfill de Rodrigo no V15 vai pisar no admin@juridico.com de teste se ele existir; o sócio precisa decidir se mantém esse user separado ou migra para o admin real
- Os 19 departamentos legados continuam ativos. A V16 vai filtrar a sidebar para mostrar **só agentes pessoais**, escondendo os legados sem deletar

---

**Pacote preparado em 27/maio/2026 por Claude Opus 4.7 conforme convenções do `AGENTS.md` raiz do projeto.**
