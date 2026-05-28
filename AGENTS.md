# JurisAI / Bacellar Advogados — Manual para Agentes IA

> **READ ME FIRST** se você é um assistente IA (Claude, Cowork, Cursor, Copilot)
> abrindo este projeto. Este arquivo entrega em 5 minutos o que normalmente
> levaria 2 horas explorando o repositório. Atualize-o sempre que algo
> arquitetural mudar — ele é a fonte de verdade canônica.

---

## 0. TL;DR em 30 segundos

- **Sistema**: plataforma multi-agente jurídica BR, **uso interno** da empresa Bacellar Advogados (Salvador-BA). 1 sócio + 8 funcionárias + 1 colaborador externo.
- **Stack**: Vite + React 18 + TypeScript + Tailwind + shadcn/ui · Supabase (Auth, Postgres com RLS, Edge Functions Deno) · Stripe (test mode) · Resend (email) · Cloudflare Turnstile (captcha) · Vercel + Lovable.
- **Dono**: Rodrigo Bacellar (`ryanribeiro@cohapm.com.br`). Idioma: **PT-BR**.
- **Conta de teste**: `admin@juridico.com / admin123` no deploy `build-your-dreams-153.vercel.app`.
- **Repo**: `https://github.com/ryanribeiro9877/build-your-dreams-153` (branch `main`).
- **Estado atual**: 17 patches aplicados (V7-V17). Próximas: V18 (validação Yasmin→Kailane) e V19 (protocolo inter-Assistente).
- **NÃO faça**: não use light mode, não invente cores fora da paleta, não mexa em arquivos sem rodar `vite build` antes de entregar, não pré-crie usuários (todos vêm do convite do sócio).

---

## 1. O sistema — Bacellar Advogados

**Nome de exibição** (logo do sidebar): `JurisAI` (rebrand do "LexForce", commit `c4cef21`). Fonte: Coolvetica.

**Para quem**: uso interno da Bacellar Advogados. **Não é multi-tenant comercializável por enquanto** — single-tenant Bacellar (Ryan deixou aberto pra multi-tenant futuro via `organization_id` em todas tabelas).

**Áreas jurídicas atendidas**: bancário, família, plano de saúde, consumidor, civil, previdenciário, tributário.

**Equipe real (10 pessoas)**:

| Funcionário | Cargo (role_template) | Etapa principal | Áreas |
|---|---|---|---|
| Rodrigo Bacellar | `socio` (admin) | gestao, revisao, execucao, alvara, recursos_criticos | todas |
| Ana Cristina | `adv_confeccao_geral` | confeccao, atendimento | bancario, plano_saude, consumidor, civil |
| Luísa | `adv_protocolo` | protocolo | todas exceto previdenciario |
| Daiane | `adv_audiencia_execucao` | audiencia, execucao_sindicato, recursos, diligencia, acompanhamento | bancario, familia |
| Laura | `adv_previdenciario` | ciclo completo | previdenciario |
| Kailane | `lider_recepcao` | recepcao, admin_equipe, captacao_cooperativa, kanban_pendencias | n/a |
| Taís | `recepcionista` (is_estagiario=false) | recepcao, kanban_pendencias | n/a |
| Yasmin | `recepcionista` (is_estagiario=true) | recepcao_supervisionada | n/a |
| Ana Rosa | `financeiro` | financeiro | n/a |
| Robson | `audiencia_externa` (sem login) | audiencia | bancario, familia |

**Regra crucial de cobertura/férias**:
- Luísa férias → Ana protocola
- Ana férias → Rodrigo ou Luísa
- Daiane férias → Rodrigo, Laura ou Robson externo
- Laura férias → **previdenciário pausa até retorno**
- Kailane férias → Taís assume liderança

**Recursos críticos exclusivos do sócio**: Agiproteg, Agibank, Facta Seguros (decidido nas auditorias).

---

## 2. Stack técnico

### Frontend
- **Build**: Vite (não usar webpack, não usar Next)
- **JS Runtime**: usuário usa `bun` (tem `bun.lockb`). Pode rodar com `npm` se necessário.
- **React 18** + **TypeScript** + **SWC**
- **Tailwind CSS** + **shadcn/ui** (componentes Radix em `src/components/ui/`)
- **React Three Fiber** para cenas 3D
- **React Query** para fetch/cache
- **React Router v6** (lazy routes em `App.tsx`)
- **lucide-react** para ícones (NUNCA reinvente, use o que existe)
- **@marsidev/react-turnstile** para captcha Cloudflare

### Backend
- **Supabase**: Auth (OAuth + email/senha), Postgres com RLS strict, Edge Functions Deno, Realtime
- **Resend** para envio de emails (convites)
- **Cloudflare Turnstile** para captcha em define-password
- **Stripe** em modo teste para pagamentos
- **Sem servidor próprio**: tudo é Edge Function (Deno) ou RPC Postgres

### Deploy
- **Vercel** (frontend): `build-your-dreams-153.vercel.app`
- **Lovable** (companion editor visual)
- **Supabase** (banco + edge functions)

---

## 3. Estrutura de pastas

```
build-your-dreams-153/
├── AGENTS.md                       ← VOCÊ ESTÁ AQUI
├── package.json
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.app.json               (use ESTE pra `tsc --noEmit`)
├── docs/
│   ├── RESEND.md                   ← config do Resend
│   └── v14/                        ← especificação Bacellar
│       ├── README.md
│       └── domain-model.md
├── public/fonts/                   ← Coolvetica
├── scripts/                        ← sync de secrets pra edge functions
│   ├── push-edge-secrets.mjs
│   ├── set-edge-secrets.mjs
│   └── sync-edge-secrets-to-db.mjs
├── src/
│   ├── App.tsx                     (25 rotas, todas lazy-loaded)
│   ├── main.tsx
│   ├── index.css
│   ├── pages/                      (24 páginas)
│   │   ├── Index.tsx               (rota /sistema — renderiza JurisCloudOS)
│   │   ├── Auth.tsx                · ResetPassword.tsx · DefinePassword.tsx (pós-convite)
│   │   ├── LandingPage.tsx
│   │   ├── AgentsAdmin.tsx · AgentDetail.tsx
│   │   ├── ChatWithAgent.tsx       (/sistema/chat/:agentId)
│   │   ├── ProvidersConfig.tsx     (cadastra chaves BYOK)
│   │   ├── Dashboard.tsx · Tokens.tsx · Clients.tsx · OrgChart.tsx · EfficiencyKPIs.tsx
│   │   ├── AdminTokens.tsx · AdminUiEvents.tsx · AdminMaster.tsx · AdminNotifications.tsx
│   │   ├── CreateEmployee.tsx      ← V14-master: convite de funcionário (sócio)
│   │   ├── AdminEmployees.tsx      ← V14-master: lista de funcionários + presence
│   │   ├── OrgModelV14.tsx         ← painel de diagnóstico V14 (rota redirecionada)
│   │   ├── MyInbox.tsx             ← V17: /sistema/tarefas (inbox pessoal)
│   │   ├── TeamDashboard.tsx       ← V17: /sistema/equipe (kanban master)
│   │   └── AssignTask.tsx          ← V17: /sistema/equipe/atribuir
│   ├── components/
│   │   ├── JurisCloudOS.tsx        ← 2100+ linhas, o "Meu Assistente". Pivô do sistema.
│   │   ├── WelcomeScreen.tsx       ← tela inicial estilo ChatGPT
│   │   ├── TaskQueuesPanel.tsx     ← filas no painel direito
│   │   ├── TurnstileCaptcha.tsx    ← captcha em define-password
│   │   ├── PlatformPresenceSync.tsx ← sync de presença online
│   │   ├── NavLink.tsx · NotificationCenter.tsx · SafeMarkdown.tsx
│   │   ├── ui/                     ← 60+ componentes shadcn
│   │   └── __tests__/              ← 2 erros TS pré-existentes (ignoráveis)
│   ├── hooks/                      (15+)
│   │   ├── useChatOrchestrator.tsx ← fala com Edge Function (V7)
│   │   ├── useAgents.tsx           ← carrega public.agents (Realtime)
│   │   ├── useAgentLLMConfig.tsx   ← read/write colunas LLM (V7)
│   │   ├── useProviders.tsx        ← BYOK
│   │   ├── useAuth.tsx · usePermissions.tsx
│   │   ├── useTokenBalance.tsx · useUiPreferences.tsx
│   │   ├── useRealtimeNotifications.tsx
│   │   ├── useMasterAdmin.ts       ← V14-master: detecta o sócio
│   │   ├── useEmployeeRoster.ts    ← V14-master: lista de funcionários
│   │   ├── usePlatformPresence.ts  ← V14-master: heartbeat de presença
│   │   ├── useTeamPresence.ts      ← V14-master: detecta quem está online
│   │   ├── useMyWorkspace.ts       ← V16: workspace personalizado (cargo + agentes próprios)
│   │   └── useUserTasks.ts         ← V17: 5 hooks de tarefas humano→humano
│   ├── lib/                        (10+)
│   │   ├── validateProviderKey.ts  · jurisaiShellTheme.ts · utils.ts
│   │   ├── stripe.ts · tracking.ts · uiTracking.ts
│   │   ├── edgeFunctionError.ts    ← V14-master: parser de erros de edge
│   │   ├── passwordPolicy.ts       ← V14-master: validador de senha forte
│   │   └── platformPresenceChannel.ts ← V14-master: canal Realtime
│   ├── types/jurisai.ts            ← tipos V14 + V16 + V17
│   ├── config/roleVisibility.ts    ← visibility legada (será depreciada)
│   ├── styles/                     ← CSS modular
│   └── integrations/supabase/      ← client.ts + types.ts (auto-gerado, REGENERAR após migrations!)
└── supabase/
    ├── functions/                  (Edge Functions Deno)
    │   ├── chat-orchestrator/      ← BYOK V7
    │   ├── chat-with-agent/        ← ANTIGA, deprecated
    │   ├── invite-employee/        ← V14-master: convite via Resend
    │   ├── verify-turnstile/       ← V14-master: captcha
    │   ├── create-checkout/ · get-stripe-price/ · payments-webhook/
    │   └── _shared/                ← stripe.ts · inviteEmail.ts · runtimeSecrets.ts
    └── migrations/                 (29 SQLs, ordem cronológica)
        ├── 20260412..._init.sql                                    (V1)
        ├── 20260511122000_seed_agents.sql                          (V1.1 — agentes legados)
        ├── 20260524120000_onda2_chat_orchestrator.sql              (V7 — chat-orchestrator)
        ├── 20260525000000_openai_models_catalog_and_ceo_prompt.sql (V7+)
        ├── 20260527120000_v14_lexforce_org_model.sql               (V14 — modelo Bacellar)
        ├── 20260528120000_master_employee_invites.sql              (V14-master — convite)
        ├── 20260528130000_master_director_role.sql                 (V14-master — is_master_admin)
        ├── 20260529120000_remove_estagiaria_recepcao_role.sql      (V14-master — Yasmin = recepcionista+flag)
        ├── 20260530120000_edge_runtime_secrets.sql                 (V14-master — secrets em tabela)
        ├── 20260531120000_v16_fix_agent_matrix.sql                 (V16 — UI filtrada + provisionamento)
        ├── 20260601120000_v17_task_assignment.sql                  (V17 — RPCs de tarefa)
        ├── 20260602120000_socio_bootstrap.sql                      (Bootstrap sócio)
        ├── 20260603120000_v18_task_validation.sql                  (V18 — validação Yasmin→Kailane)
        └── 20260604120000_v19_inter_assistant.sql                  (V19 — protocolo inter-Assistente)
```

### Arquivos que valem 80% do sistema
1. `src/components/JurisCloudOS.tsx` — UI principal (2100+ linhas)
2. `src/hooks/useMyWorkspace.ts` — workspace do user logado (V16)
3. `src/hooks/useUserTasks.ts` — fluxo de tarefas (V17)
4. `supabase/functions/chat-orchestrator/index.ts` — orquestrador BYOK
5. `supabase/migrations/20260527120000_v14_lexforce_org_model.sql` — schema da Bacellar
6. `docs/v14/domain-model.md` — spec canônica de cargos/agentes/tarefas

---

## 4. Modelo de domínio

### Tabelas Postgres (em `public`)

**Estrutura V1 (pré-existente)**:
- `agents` (uuid id, name, color, role, status, department_id, level, current_tasks, max_concurrent_tasks, reports_to, can_orchestrate, description, ...)
- `departments`, `agent_permissions`, `agent_tasks`, `agent_orchestration_log`, `agent_messages`
- `clients`, `client_documents`, `processes`
- `profiles`, `user_roles`
- `token_balances`, `token_transactions`
- `landing_events`, `ui_events`, `user_ui_preferences`
- `bottleneck_notifications`

**V7 (Onda 2)**:
- `model_pricing` · `llm_provider_configs` · `chat_sessions` · `chat_messages`
- Novas colunas em `agents`: `provider`, `model`, `temperature`, `top_p`, `max_tokens`, `memory_enabled`, `history_limit`, `allow_fallbacks`, `system_prompt`

**V14 (modelo Bacellar)**:
- `role_templates` (10 cargos) · `agent_templates` (~75 agentes seedados) · `role_agent_matrix`
- `task_types` (66 tipos) · `role_task_matrix`
- `user_areas` (N:N user × área jurídica)
- `role_coverage` (cobertura de férias com backup_user_id nullable)
- `external_collaborators` (Robson)
- `user_tasks` (humano→humano, NÃO confundir com agent_tasks)
- `inter_assistant_requests` (V19, schema já criado)
- `captacao_canais` (cooperativa, ressaque, indicação)
- Novas colunas em `profiles`: `role_template_id`, `organization_id`, `full_name`
- Novas colunas em `agents`: `owner_user_id`, `source_template_id`, `is_overridden`, `is_personal`

**V14-master (convites)**:
- `profiles.is_estagiario` (BOOLEAN) — flag pra Yasmin
- `edge_runtime_secrets` (key/value pra Resend/Turnstile/SITE_URL, RLS strict)

**V16 (matriz corrigida + provisionamento)**:
- `role_agent_matrix.requires_is_estagiario` (BOOLEAN nullable: NULL=all, true=só estagiários, false=só não-estagiários)
- View `agents_with_owner_v`

### RPCs (todas SECURITY DEFINER + grants explícitos)

**V7**:
- `start_chat_session(p_entry_agent_id, p_client_id, p_title)` → uuid
- `register_provider_key(p_provider, p_api_key, p_set_default, p_monthly_budget_usd, p_notes)` → uuid
- `validate_agent_for_chat(p_agent_id)` → table

**V14-master**:
- `is_master_admin(_user_id)` → bool (3 critérios: email admin@juridico.com OR role director OR cargo socio)
- `apply_employee_profile(p_user_id, p_full_name, p_role_template_id, p_is_estagiario, p_app_role)` → void
- `get_edge_runtime_secret(p_key)` → text

**V16**:
- `provision_user_agents(p_user_id)` → table (agent_id, template_code, display_name, was_created) — **clona templates como agentes pessoais. Chamado automaticamente por apply_employee_profile.**
- `get_my_workspace()` → JSON (profile + role_template + agents + is_master)

**V17**:
- `is_role_eligible_for_task(p_task_type_id, p_role_template_id)` → bool
- `get_eligible_assignees(p_task_type_id)` → table
- `create_user_task(...)` → uuid
- `update_user_task_status(p_task_id, p_new_status, p_notes)` → user_task_status
- `get_my_inbox(p_include_completed)` → table
- `get_team_tasks(p_status, p_assignee_user_id, p_include_completed, p_limit)` → table (master only)
- `get_task_types_by_stage()` → table
- `get_inbox_count()` → table (total, overdue, critical)

### Enums

**V1**: `agent_role`, `agent_status`, `task_status`, `task_priority`, `permission_type`, `app_role`
**V7**: `provider_code`, `chat_session_status`, `chat_message_role`, `model_tier`
**V14**: `org_stage`, `legal_area`, `user_task_status`, `coverage_status`, `inter_assistant_status`, `captacao_canal_tipo`
**V14-update**: `agent_role` ganhou valor `'ceo'` e depois `'assistant_root'`

### Fluxo principal: convite → provisionamento → uso

```
1. Sócio em /sistema → clica "Criar Funcionário"
2. Overlay CreateEmployee → preenche nome/email/cargo/é-estagiário
3. POST → Edge invite-employee
   3a. Valida is_master_admin
   3b. supabase.auth.admin.generateLink({ type: "invite" })
   3c. Resend envia email com link → /definir-senha
   3d. Chama apply_employee_profile(...)
       3d-1. INSERT/UPDATE em profiles
       3d-2. INSERT em user_roles (intern/lawyer/receptionist/financial/admin)
       3d-3. CHAMA provision_user_agents(user_id)
             3d-3a. Lê profile.role_template_id + is_estagiario
             3d-3b. Loop role_agent_matrix filtrado por requires_is_estagiario
             3d-3c. INSERT em agents (clone) com owner_user_id, is_personal=true
4. Funcionário clica no email → /definir-senha
   4a. Turnstile captcha
   4b. validatePassword + supabase.auth.updateUser({ password })
   4c. Redireciona /sistema
5. Funcionário em /sistema:
   5a. useMyWorkspace chama get_my_workspace()
   5b. Sidebar dinâmica baseada em workspace.role_template.stages
   5c. Lista de agentes filtra workspace.agents (apenas os dele)
6. Sócio atribui tarefa em /sistema/equipe/atribuir
   6a. UI filtra destinatários elegíveis via role_task_matrix
   6b. create_user_task valida e cria user_tasks row
   6c. Realtime notifica funcionário → badge "Tarefas" no header
7. Funcionário em /sistema/tarefas vê inbox
   7a. update_user_task_status muda status
   7b. Realtime atualiza kanban do sócio
```

---

## 5. Design system (decisões já fixas)

### Paleta — preto + dourado (tema único, sem light mode)
```css
--bg:  #09090f  --bg2: #11111a  --bg3: #16161f  --bg4: #1c1c28
--border: #25253a  --border2: #34344d
--text1: #eeeef5  --text2: #c4c4d4  --text3: #7a7a92
--gold: #EAB308  --gold2: #FACC15
```

> **NÃO** usar light mode. NÃO usar variações de tema.

### Fontes
- `--font-brand` — **Coolvetica** (logo `JurisAI`). Arquivo: `/public/fonts/coolvetica.{otf,woff2}`. Fallback: Bebas Neue → Anton → Impact.
- `--font-spartan` — **League Spartan** (Google Fonts) — "Meu Assistente" + KPI values
- `--font-disp` — **Literata** (display serif)
- `--font-body` — **Plus Jakarta Sans** (Google Fonts) — texto geral

### Cores hierárquicas dos agentes
```ts
const HIERARCHY_COLORS = {
  ceo:             "#EAB308",  // dourado — cor do sistema
  assistant_root:  "#7a7a92",  // cinza — "Meu Assistente"
  director:        "#B45309",  // âmbar profundo
  manager:         "#92400E",  // bronze
  specialist:      "#92400E",  // bronze (especialistas)
  monitor:         "#6B7280",  // cinza (monitores)
  default:         "#6B7280",
};
```

### Cores hierárquicas humanas (presence/cards)
- Online: `#22c55e` (verde) com glow `0 0 8px rgba(34,197,94,0.6)`
- Offline: `#52525b` (cinza)
- Estagiária: badge âmbar `"(estagiária)"` após cargo

### Toggles dos painéis (CRÍTICO ESTRUTURAL)
Botões `.jc-sidebar-toggle` e `.jc-right-toggle-desk` são **filhos diretos do `.jc-root`**, NÃO dos painéis. Position `fixed`. Razão: `.jc-sidebar` tem `overflow-y: hidden` que (por quirk CSS) força `overflow-x: visible` a virar `auto`. **Se você reposicionar os toggles pra dentro dos painéis, eles vão sumir.**

### O que JÁ FOI REMOVIDO (NÃO ressuscite)
- "SISTEMA OPERACIONAL" subtítulo da topbar (V11)
- "ATENÇÃO · ALERTAS ATIVOS" / "OPERACIONAL · 24/7" subtítulo do logo (V11)
- Botão toggle light/dark (V11)
- Tipo `Theme` em `JurisCloudOS.tsx` (V11)
- Imports `Sun, Moon` de lucide-react (V11)

---

## 6. Histórico de patches (V7 → V19)

### V7 — Backend Onda 2 (chat-orchestrator BYOK)
Cria tabelas `model_pricing/llm_provider_configs/chat_sessions/chat_messages`, colunas LLM em agents, RPCs, seed Anthropic, RLS strict, Edge Function BYOK.

### V8-V10 — Toggles dos painéis
V8 e V9 falharam (problema era estrutural overflow, não visual). V10 corrigiu movendo toggles pra fora dos painéis (filhos diretos do `.jc-root`).

### V11 — Welcome screen ChatGPT + paleta única + cores hierárquicas
8 itens: welcome estilo ChatGPT, KPIs preservados, paleta única, light mode removido, cores brancas nas filas, "SISTEMA OPERACIONAL" removido, cores hierárquicas (`getHierarchyColor(role)`).

### V12 — Coolvetica + League Spartan + gravação real com waveform
@font-face Coolvetica, League Spartan via Google Fonts, composer com waveform real (Web Audio API), transcrição em tempo real (webkitSpeechRecognition pt-BR).

### V13 — SVG inline customizado para mic/send
Esconder input bar inferior durante Welcome, ícones SVG inline pros botões (imune a extensões a11y).

### Rebrand: LexForce → JurisAI (commit c4cef21)
Renomeação completa em todo o produto.

### V14 — Modelo organizacional Bacellar
Aplica o `domain-model.md`:
- 10 role_templates seedados
- 75 agent_templates com system_prompts
- 66 task_types
- Matrizes completas
- Tabelas user_tasks, inter_assistant_requests, role_coverage, external_collaborators (Robson)
- Página `/admin/modelo-v14` (rota redirecionada por enquanto)

### V14-master (commits f225488, 0c79c2a)
Implementado pelo Lovable em cima da minha V14:
- Convite de funcionário via Resend
- `is_master_admin` com 3 critérios
- Turnstile captcha
- Tabela `edge_runtime_secrets`
- Página `/admin/funcionarios` com presence Realtime
- Overlay de "Criar Funcionário" sobre `/sistema`
- Estagiária deixou de ser cargo (virou `is_estagiario` sobre `recepcionista`)

### V16 — UI filtrada por role_template + provisionamento automático
- Corrige furos do V14 (Confecção Tributário do sócio, Captação Cooperativa da Taís)
- Adiciona `requires_is_estagiario` em `role_agent_matrix` (diferencia Taís/Yasmin no mesmo cargo)
- Desativa cargo `estagiaria_recepcao` (vira `recepcionista` + flag)
- RPC `provision_user_agents` clona templates como agentes pessoais
- `apply_employee_profile` agora chama provision automaticamente no convite
- RPC `get_my_workspace()` consolida tudo do user logado
- Hook `useMyWorkspace` no frontend → sidebar dinâmica
- Fallback nos 19 departamentos legados quando workspace.role_template é null

### V17 — Atribuição de tarefas humano → humano
- 8 RPCs novas (sem tabela nova — usa `user_tasks` do V14)
- Hook `useUserTasks` (5 hooks + 2 helpers)
- 3 páginas novas: `/sistema/tarefas` (inbox), `/sistema/equipe` (kanban master), `/sistema/equipe/atribuir`
- Botões "Tarefas" (todos, com badge) e "Equipe" (só master) no header
- Realtime em `user_tasks` pro Lovable já tinha ativado V14
- Validação em 2 camadas: assigner pode atribuir + assignee elegível

### Bootstrap Sócio
- Seeds o profile do `admin@juridico.com` com cargo `socio` (em vez de continuar legado)
- Trigger ao confirmar perfil chama `provision_user_agents` automaticamente
- Garante que o sócio veja sidebar dinâmica com seus 10 agentes

### V18 — Validação obrigatória de cadastros (Yasmin → Kailane)
- task_types ganham `validator_user_id` opcional na user_task
- Quando `task_types.requires_validation = true`, status vira `awaiting_validation` ao concluir
- Kailane recebe alerta no kanban
- RPC `validate_user_task(task_id, approve, notes)`

### V19 — Protocolo inter-Assistente
- RPC `create_inter_assistant_request(from_user, to_user, type, payload)`
- RPC `answer_inter_assistant_request(request_id, response)`
- Hook `useInterAssistantInbox`
- UI: aba "Pedidos" no kanban da equipe

---

## 7. Gaps conhecidos / Backlog técnico

### Crítico (impede produção plena)
- **2 erros TS pré-existentes** em `src/components/__tests__/JurisCloudOS.responsive.test.tsx` — imports `screen`/`fireEvent` mal mockados. Débito anterior, ignorar.
- **types.ts do Supabase** desatualizado após V14 (Lovable usa `as "agents"` / `as never` pra contornar). Regenerar quando possível.

### Médio
- **Sem tool-use** no chat-orchestrator. É o resto da Onda 3.
- **Sem streaming de resposta** (SSE) — token a token na UI.
- **API key em plaintext** em `llm_provider_configs.api_key`. RLS protege, mas migrar pra Vault (pgsodium) em V20+.
- **Coluna `agents.color` órfã** após V11 (UI usa getHierarchyColor).
- **19 DEPARTMENTS hardcoded** ainda em JurisCloudOS.tsx — viraram fallback na V16, podem ser removidos quando todos os usuários ativos tiverem `role_template_id` setado.

### Pequeno
- **Upload real de arquivos não implementado** (WelcomeScreen abre picker mas só anexa nome como texto)
- **Speech recognition** principal e WelcomeScreen são código diferente — unificar em `useSpeechRecorder`
- **Captação Ressaque** (`is_active=false`) — quando voltar precisa definir canal e default_assignee

---

## 8. Convenções de trabalho com este usuário

O Ryan tem padrão de qualidade alto e detesta retrabalho:

1. **Sempre validar com `vite build` antes de entregar.** Erros TS pré-existentes em `__tests__` podem ser ignorados.
2. **Entregue como diff aplicável** (`git apply --check` deve passar), não como reescrita completa. Empacote `.diff` + `README.md` em `.zip`.
3. **Mostre o raciocínio antes de implementar** quando o pedido é ambíguo. Quando é claro, vai direto.
4. **Quando ele aponta bug, SEMPRE leia a screenshot com atenção** (lição do V8 que errou diagnóstico).
5. **Ele fala PT-BR**. Termos técnicos em inglês ok, explicação em português.
6. **Em múltipla escolha (`ask_user_input_v0`)**, "todos" significa prioridade pelo mais bloqueante.
7. **Não invente features que ele não pediu.** Bônus pequenos triviais ok, grandes não.
8. **Numere patches sequencialmente** (V20, V21, ...). Cada um vira ZIP em `/mnt/user-data/outputs/`.
9. **Anti-padrões dele**: subjetivismos sem comparação concreta; refatorações invasivas sem motivo; uso de tooling não-padrão (yarn, webpack).
10. **Se criar arquivo novo, ATUALIZE este `AGENTS.md`** com a referência.
11. **NÃO crie usuários reais via SQL.** Todos os usuários (exceto admin@juridico.com legado e o bootstrap do sócio) vêm do botão "Criar Funcionário" do sócio.

---

## 9. Próximas frentes sugeridas (ordem de impacto)

1. **Atualizar types.ts do Supabase** após V19 — destrava cast safety nos hooks
2. **Tool-use no chat-orchestrator** — loop de tool calls, persistência em `tool_calls`/`tool_result`
3. **Streaming SSE** no chat-orchestrator — UX token a token
4. **Upload real de arquivos** — Supabase Storage + multipart no `chat_messages` e `user_tasks`
5. **Migração pra Supabase Vault** — esconder `llm_provider_configs.api_key` plaintext
6. **Painel de KPIs financeiros** — gasto USD por dia/provider/modelo
7. **Detector de prompt-injection** em mensagens externas
8. **Hook unificado de Speech Recognition** entre WelcomeScreen e jc-mic-btn
9. **Remover os 19 DEPARTMENTS hardcoded** quando todos os usuários ativos tiverem `role_template_id`
10. **Reabilitar `/admin/modelo-v14`** ou remover (hoje a rota redireciona)

---

## 10. Como rodar localmente

```bash
git clone https://github.com/ryanribeiro9877/build-your-dreams-153
cd build-your-dreams-153

# Instala (preferência: bun, fallback npm)
bun install
# ou: npm install --legacy-peer-deps

# Coloque os arquivos de fonte
mkdir -p public/fonts
# cp ~/Downloads/coolvetica.otf public/fonts/

# Dev server
bun run dev
# ou: npx vite

# Build de produção (USE ISSO ANTES DE ENTREGAR PATCH)
npx vite build

# Type check
npx tsc --noEmit -p tsconfig.app.json

# Lint
bun run lint
```

### Banco / Edge Functions
```bash
# Push migrations
supabase db push

# Deploy edge functions
supabase functions deploy invite-employee
supabase functions deploy chat-orchestrator
supabase functions deploy verify-turnstile

# Sync secrets (Resend, SITE_URL, Turnstile) entre env e tabela edge_runtime_secrets
node scripts/sync-edge-secrets-to-db.mjs

# Regenerar types após migration
supabase gen types typescript --project-id <id> --schema public > src/integrations/supabase/types.ts
```

### Variáveis de ambiente
- Frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TURNSTILE_SITE_KEY`
- Edge `invite-employee`: `RESEND_API_KEY`, `SITE_URL`, `INVITE_EMAIL_FROM` (vindos da tabela `edge_runtime_secrets`)
- Edge `chat-orchestrator`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` (default do Supabase)

---

## 11. Glossário

| Termo | Significado |
|---|---|
| **JurisAI** | nome de exibição do sistema (era LexForce até commit c4cef21) |
| **JurisCloudOS** | nome interno do componente principal (`src/components/JurisCloudOS.tsx`) |
| **Bacellar Advogados** | empresa cliente única — Salvador-BA, sócio Rodrigo Bacellar |
| **Meu Assistente** | agente raiz pessoal de cada funcionário (role `assistant_root`). Sócio tem `CEO LexForce` (role `ceo`). |
| **role_template** | cargo no sistema (socio, adv_confeccao_geral, recepcionista, etc.) |
| **agent_template** | template de agente IA (~75 cadastrados) — clonado pro user no provisionamento |
| **task_type** | catálogo de 66 tipos de tarefa atribuíveis |
| **Onda 2** | V7 — chat-orchestrator + BYOK |
| **Onda 3** | tool-use + delegação + upload + Vault (em curso) |
| **BYOK** | "Bring Your Own Key" — cada user cadastra chave do provider |
| **Token (interno)** | unidade do `token_balances` (não confundir com tokens LLM) |
| **Master** | usuário com `is_master_admin = true` (sócio Rodrigo) |
| **Edge Function** | função Deno hospedada no Supabase |
| **Resend** | serviço de email transacional (convites) |
| **Turnstile** | captcha do Cloudflare em define-password |
| **Lovable** | editor visual que o Ryan usa em paralelo (faz commits direto no GitHub) |
| **Cowork** | ferramenta da Anthropic que o Ryan usa pra automação local. Lê `AGENTS.md`. |
| **provisionamento** | clonar agent_templates como agents pessoais quando user é criado |
| **inter-Assistente** | protocolo entre Meus Assistentes (V19) — ex: Assistente da Ana pede RG ao da Kailane |

---

**Última atualização**: 02/junho/2026 (após V14-V17 + bootstrap + V18 + V19)
**Mantido por**: o próprio Claude que está editando o projeto. Atualize as seções 6 (histórico) e 7 (gaps) sempre que mudar algo arquitetural.
