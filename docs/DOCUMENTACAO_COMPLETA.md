# JurisAI — Documentação Completa do Sistema

> **Super-documentação** de tudo o que o sistema faz hoje, do princípio.
> Base: código-fonte (React + Edge Functions Deno), banco de dados vivo (Supabase, projeto `JurisAI`, 63 tabelas) e a especificação de domínio do escritório.
> Idioma do sistema: **PT-BR** · Deploy: **Vercel** (frontend) + **Supabase** (backend).
>
> Versão navegável (HTML): artefato publicado em `https://claude.ai/code/artifact/0fcc52f3-8faa-4525-8655-c47f9454ce24`

---

## 1. O que é o JurisAI

Plataforma multi-agente de IA jurídica, **uso interno** do escritório **Bacellar Advogados** (Salvador-BA). Coordena dezenas de agentes de IA especializados que pesquisam jurisprudência, redigem peças, **leem os documentos do caso**, calculam valores, controlam prazos e organizam o trabalho da equipe — enquanto **toda decisão técnica e a assinatura final permanecem com o advogado responsável**.

É, na prática, um "sistema operacional de escritório": de um lado um **chat central** onde cada colaborador conversa com o seu assistente de IA pessoal; do outro, os **painéis de trabalho** (Kanban, filas de tarefas, clientes, audiências, pendências, KPIs). A IA não é um chatbot solto: é uma **cadeia hierárquica de agentes** que roteia cada pedido ao especialista certo, valida a saída e devolve a peça pronta para revisão humana.

Sistema **single-tenant** hoje; base preparada para multi-tenant futuro via `organization_id` em todas as tabelas.

**Números atuais (banco vivo):** 7 áreas jurídicas · 10 cargos + papel Tech · 59 modelos de agente (41 agentes vivos) · 63 tabelas (todas com RLS) · 52 modelos de LLM catalogados · 33 clientes · 29 processos.

### Princípios inegociáveis
- **Humano no comando.** A IA propõe; o advogado decide e assina. Toda peça pode receber o marcador `[REVISAR]` como rede de segurança.
- **Sem alucinação de dados.** Agentes não inventam partes, bancos, valores ou nº de processo. O que não está nos autos vira `[A PREENCHER]`.
- **Honestidade operacional.** Um agente nunca afirma ter concluído ação que o sistema não executou — diz "encaminhei" / "gerei a pendência".
- **Rastreabilidade.** Mudanças de tarefa, ações de agente e requisições de integração ficam em logs de auditoria imutáveis.

---

## 2. A empresa e a equipe

Bacellar Advogados: sociedade individual (Rodrigo Bacellar), estrutura horizontal. Especialização **híbrida** — por etapa do processo **e** por área jurídica.

| Pessoa | Cargo (`role_template`) | Etapa principal | Áreas |
|---|---|---|---|
| Rodrigo Bacellar | `socio` (admin) | gestão, revisão, execução, alvará, recursos críticos | todas |
| Ana Cristina | `adv_confeccao_geral` | confecção, atendimento | bancário, plano de saúde, consumidor, cível |
| Luísa | `adv_protocolo` | protocolo | todas exceto previdenciário |
| Daiane | `adv_audiencia_execucao` | audiência, execução, recursos, diligência | bancário, família |
| Laura | `adv_previdenciario` | ciclo completo | previdenciário |
| Kailane | `lider_recepcao` | recepção, gestão de equipe, captação, kanban | n/a |
| Taís | `recepcionista` | recepção, kanban de pendências | n/a |
| Yasmin | `recepcionista` (estagiária) | recepção supervisionada | n/a |
| Ana Rosa | `financeiro` | financeiro | n/a |
| Robson | `audiencia_externa` (sem login) | audiência | bancário, família |

O sistema codifica também as **regras de cobertura em férias** (ex.: Luísa fora → Ana protocola; Laura fora → previdenciário pausa) e os **recursos críticos exclusivos do sócio** (Agiproteg, Agibank, Facta Seguros). Três **canais de captação**: Cooperativa, Ressaque, Indicação.

Essas regras são **dados de configuração** — alimentam quem recebe cada tipo de tarefa, quais agentes cada pessoa vê e quem valida o quê.

---

## 3. Arquitetura & stack

SPA React conversando com backend serverless Supabase. Sem servidor próprio: lógica de negócio em Edge Functions Deno ou RPC no Postgres, sempre atrás de RLS.

- **Frontend:** React 18 + TypeScript + Vite (SWC) · Tailwind 3 + shadcn/ui (Radix) · React Router v6 (rotas lazy) · TanStack Query · Recharts · React Three Fiber (cenas 3D) · @hello-pangea/dnd (drag-drop) · Web Speech API (ditado). Deploy Vercel (push na `main` = deploy).
- **Backend:** Supabase — Postgres 17 (RLS estrito), Auth (e-mail/senha + OAuth), Storage, Realtime, Edge Functions Deno. Integrações: Stripe (test), Resend (e-mail), Cloudflare Turnstile (captcha). Agendamento via `pg_cron`.

**Fluxo de camadas:** React SPA (assina com JWT do usuário) → Edge Functions (orquestrador, convites, pagamentos, captcha, e-mail, integração) → Postgres + RPC (RLS, funções SECURITY DEFINER; Realtime devolve mudanças ao cliente).

O padrão de **tempo real** é onipresente: o cliente assina canais Supabase (mensagens, tarefas, presença, quadros, notificações) e recebe as mudanças por push.

---

## 4. Mapa de telas & rotas

30+ rotas, todas lazy, com quatro níveis de acesso: **autenticado**, **admin** (admin/diretor/sócio), **master** (o sócio) e **tech**. Se um chunk falhar após redeploy, o sistema recarrega e restaura a rota de destino.

| Rota | Tela | Acesso | O que faz |
|---|---|---|---|
| `/` | LandingPage | pública | Apresentação com hero 3D, casos de uso, pilares, segurança, planos, FAQ |
| `/auth` | Auth | pública | Login/cadastro (fundo 3D), recuperação de senha |
| `/definir-senha` | DefinePassword | pública | Senha inicial pós-convite (captcha Turnstile) |
| `/sistema` | JurisCloudOS | autenticado | **Hub principal**: chat central + sidebar de agentes + painel de processos/alertas |
| `/sistema/chat` | ChatWithAgent | autenticado | Chat dedicado e persistente, com histórico e custo por mensagem |
| `/sistema/tarefas` | MyInbox | autenticado | Minhas tarefas (máquina de estados) |
| `/sistema/validar` | ValidationQueue | autenticado | Fila de validação: aprovar/rejeitar tarefas |
| `/sistema/inter-assistente` | InterAssistantInbox | autenticado | Pedidos entre assistentes pessoais |
| `/sistema/kanban` | KanbanBoard | autenticado | Quadros Kanban com filtros, tags, checklist, workflow, timesheet |
| `/sistema/equipe` | TeamDashboard | master | Kanban de tarefas + roster com presença online |
| `/sistema/equipe/atribuir` | AssignTask | master | Atribuir tarefa a colaborador elegível |
| `/pendencias` | Pendencias | autenticado | Kanban de pendências por estado, com data fatal |
| `/clientes` · `/clientes/:id` | Clients · ClientDetails | autenticado | Cadastro de clientes (PF/PJ), documentos e tarefas |
| `/dashboard` | Dashboard | autenticado | Gráficos das tarefas pessoais (14 dias) |
| `/eficiencia` | EfficiencyKPIs | autenticado | KPIs e detecção de gargalos por departamento |
| `/organograma` | OrgChart | autenticado | Árvore hierárquica dos agentes |
| `/tokens` | Tokens | autenticado | Saldo de tokens e pacotes de recarga (Stripe) |
| `/perfil` | Profile | autenticado | Edição do próprio perfil |
| `/admin` (+ funcionarios, tokens, notificacoes, ui) | Admin* | admin | Hub administrativo: funcionários, tokens, notificações, auditoria de UI |
| `/admin/agentes` · `/:id` | AgentsAdmin · AgentDetail | tech | Catálogo e configuração completa de agentes |
| `/configuracoes/providers` | ProvidersConfig | tech | Chaves de API dos provedores (BYOK) |
| `/admin/crons` | CronJobs | tech | Tarefas agendadas |
| `/admin/importar` | ImportarDados | tech | Importação de clientes por CSV (dedup por CPF) |
| `/admin/master` | AdminMaster | master | Painel do sócio: auditoria global |

---

## 5. Núcleo: orquestração multi-agente N1→N2→N3

Cada mensagem percorre uma **cadeia hierárquica de agentes com validação**, rodada de forma **assíncrona** pela Edge Function `chat-orchestrator`. O cliente envia, recebe imediatamente um `runId` (HTTP 202) e acompanha progresso/resposta via Realtime.

- **N1 · `assistant_root` ("Meu Assistente")** — roteador estratégico (alçada JEC, encaminhamentos, para qual diretor mandar).
- **N2 · `director` (Diretor de Área)** — escolhe o especialista e depois valida a peça.
- **N3 · `specialist` (Especialista)** — o único que **cria**: redige, lê documentos e usa ferramentas.

Máquina de estados: `routing_n1 → routing_n2 → executing_n3 → validating_n2 → validating_n1 → done`. Validadores podem **devolver ao N3** com feedback (até 2 rodadas) antes de anexar `[REVISAR]`.

Decisões de engenharia:
- **Modelos rápidos por nível**; N3 (redação) com timeout ampliado (~380s, peça de ~20k tokens). Nunca modelos flagship lentos no chat.
- **Cache de prompt**: bloco estável (prompt + regras + resumos) marcado para cache; só o resumo rolante fica volátil.
- **Roteamento de provedor pelo nome do modelo**: com `/` → OpenRouter; sem `/` → OpenAI.
- **Data correta**: data atual (fuso SP) injetada no prompt; proibido presumir anos passados.
- **Observabilidade**: Sentry isolado por request (`runId`, sessão, etapa, modelo); execução registrada em `orchestration_runs`.

**"Meu Assistente"**: cada colaborador tem um agente-raiz privado e isolado (`assistant_root`), ponto de entrada de todas as suas conversas. O modelo antigo de "CEO único" foi aposentado (V21).

---

## 6. Os agentes leem os autos: documentos & fatos canônicos

Dois canais de conhecimento injetados no N3:
- **Canal A — Documentos do caso:** anexos (PDF/DOCX/MD/TXT) com texto extraído no navegador (mammoth/pdf.js), gravados em `chat_attachments` e resumidos de forma estruturada por tipo de documento. **Fonte autoritativa.**
- **Canal B — Modelos de referência:** peças-modelo da `document_library`, vinculadas ao agente e filtradas por **tipo de ação** (revisional de juros, RMC/RCC, fraude/inexistência…) e palavras-chave.

**Fatos canônicos (regex vence LLM):** para identidade e números, um extrator determinístico lê o **texto cru** e captura verbatim CPFs, CNPJs, RGs, contratos, benefícios, valores, datas e nomes — cada um com o arquivo de origem. **Prevalecem** sobre resumos. Ausência ≠ invenção.
- **CEP:** resolvido por ViaCEP/BrasilAPI ou, offline, só a UF por faixa.
- **Planilha de indébito:** valor **lido** do campo TOTAL; dobro **calculado em código** (o N3 não produz números de indébito).

**Cerca anti-alucinação:** os validadores N2/N1 recebem os documentos e reprovam rascunhos que inventem dados, citem partes não solicitadas ou usem o nome do advogado onde deveria haver campo a preencher.

---

## 7. O validador mecânico (pós-N3)

Antes de qualquer validação por IA, a peça passa por um **validador determinístico** (código puro). Achados `error` devolvem ao N3; `warning` não bloqueia (entra no checklist final).

| Verificação | Garante |
|---|---|
| Extenso × numeral | Converte valor por extenso (pt-BR) e compara com o número |
| Síntese × corpo | Confere títulos de seção do corpo contra a síntese; regenera se divergir |
| Léxico proibido por ação | Ex.: ação de fraude não pode afirmar que "o contrato é válido" |
| Aritmética do cálculo | Reconstrói parcelas × valor vs. total (margem ±2%) |
| Alçada JEC | Valor acima do teto (40 salários mínimos) em ação de Juizado → erro |
| Súmula do catálogo | Jurisprudência citada deve constar do catálogo interno |

---

## 8. Chat agêntico: o assistente executa ações

Além de redigir, o chat pode **operar o sistema** via function calling. Toda **escrita** passa por **cartão de confirmação** e roda com a **identidade do usuário** (respeita RLS/RBAC). Sem permissão, a ação vira pendência encaminhada ao Admin.

- **Leitura (sempre):** buscar cliente por nome/CPF, listar tarefas de um cliente, consultar processos, ver documentos, localizar colaboradores.
- **Escrita (com confirmação + RBAC):** cadastrar cliente, criar card de tarefa, solicitar documentos/acesso, criar/transferir/resolver pendência, agendar reunião.

**Estado atual: entregue, porém inerte por padrão.** O motor de ferramentas só liga com `CHAT_TOOLS_ENABLED=true` no Edge — design deliberado para ativar com segurança, agente por agente, em produção. A redação de peças permanece intocada.

---

## 9. Sistema de agentes de IA

Hierarquia com papel, etapa, área, cor, provedor/modelo padrão e prompt. Instâncias vivas podem sobrescrever config e ser **pessoais** (`owner_user_id`).

Distribuição no catálogo (`agent_templates`, 59 modelos): `assistant_root` 9 · `director` 5 · `specialist` 36 · `monitor` 8 · `ceo` 1 (legado). Agentes vivos instanciados: 41.

**Configuração (tela AgentDetail, 8 abas):** Identidade · Modelo (provedor/modelo/temperatura/top-p/max tokens) · Prompt · Memória (longo prazo + limite de histórico) · Markdown (RAG via `document_library`) · Provedor (chaves) · Tools (catálogo, schema function-call) · MCP (servidores Model Context Protocol com credenciais).

Novos agentes nascem de **templates** combinados por uma **matriz cargo↔agente** (`role_agent_matrix`, 75 vínculos). Memória de sessão em `chat_sessions`/`chat_messages`, com custo em USD e tokens por mensagem.

---

## 10. LLM, BYOK & tokens

**BYOK** ("traga sua própria chave"): cada usuário cadastra suas chaves, guardadas por usuário com RLS estrito (UI mostra só os últimos 4 caracteres) e orçamento mensal opcional por chave.

- **Provedores:** OpenAI · Anthropic · Google · OpenRouter · DeepSeek.
- **Catálogo de modelos (`model_pricing`, 52 modelos):** OpenAI 32 · OpenRouter 14 · Anthropic 3 · Google 2 · DeepSeek 1. Cada modelo com preço por Mtok, janela de contexto, suporte a tools/visão e tier.
- **Tokens internos:** saldo, transações (compra/consumo/bônus/estorno), pacotes de recarga via Stripe, avisos de saldo baixo.

**Cobrança desligada hoje** (`BILLING_ENABLED = false`): toda a infra existe, mas o saldo aparece como ilimitado (∞). Admin ainda vê analytics de consumo por usuário/período.

---

## 11. Kanban estilo ProJuris

Quadros completos com **modelo duplo**: cada cartão tem *status real* (8 valores) e *situação simplificada* (5 colunas). Arrastar decide, no backend, se muda o status real ou só reposiciona.

| Coluna (situação) | Status reais |
|---|---|
| Pendente | draft, assigned |
| Em execução | in_progress, awaiting_external, awaiting_validation, blocked |
| Concluída (sucesso) | completed |
| Concluída (sem sucesso) | — |
| Cancelada | cancelled |

- **Múltiplos quadros** públicos/privados, favoritos, "ocultar concluídas após N dias", "cartões simplificados".
- **Filtros ricos:** envolvimento (minhas/delegadas/envolvido/todas), busca, ordenação, período por prazo; avançados por responsável, tipo, área, situação, tags, cliente, nº processo. **Filtros salvos.**
- **Cartões:** origem (processo/cliente/interna), prioridade (borda), responsável, prazo (vermelho se atrasado), tags.
- **Permissões de quadro (grants)** a usuários ou cargos; admin de colunas restrita.

**Detalhe-hub do cartão:** vínculos (cliente/processo/quadro com "trocar de quadro"), responsável/atribuidor/validador, prioridade, descrição, tags + cinco seções: **Checklist**, **Workflow** (instancia template de etapas), **Timesheet** (horas por pessoa), **Comentários** (com menções), **Anexos** e **Auditoria** (log imutável de/para).

---

## 12. Tarefas humano↔humano & validação

Sistema de atribuição de trabalho entre pessoas (`user_tasks`), separado das tarefas de agente. Tarefa tem tipo (dos ~66 catalogados por etapa/área), responsável, prioridade, prazo, SLA padrão, cliente/processo e carga JSON livre.

- **Ciclo:** `draft → assigned → in_progress →` (awaiting_external / awaiting_validation / blocked) `→ completed / cancelled`. Cada pessoa avança suas tarefas no MyInbox.
- **Elegibilidade:** matriz cargo↔tipo (`role_task_matrix`, 131 vínculos) define os responsáveis elegíveis. **Atribuir é exclusividade do Admin/sócio.**
- **Fila de validação:** tipos que exigem conferência (ex.: cadastros da estagiária Yasmin → aval da Kailane) entram em `awaiting_validation`; o validador **aprova** (→ concluída) ou **rejeita com notas** (→ volta ao responsável). Notificações e badges em tempo real.

---

## 13. Protocolo Inter-Assistente

Assistentes pessoais trocam **pedidos formais**: consultar documento de cliente, status de processo, solicitar protocolo, validar cálculo… com carga estruturada e expiração (72h padrão).

- **Recebidos / Enviados / Novo**, com status *pendente → em andamento → respondido / negado / expirado*.
- **Anexos:** subir arquivo novo ou referenciar documento de cliente existente; a resposta carrega anexos de volta.
- **Tempo real:** pedidos e respostas chegam por push; contador alimenta o badge no topo.

---

## 14. Pendências internas

Pendência = aquilo que falta resolver para um caso andar (documentação, comprovante, senha/reset INSS, extratos, agendamento…). Decisão de arquitetura: **uma pendência é uma `user_task` com `is_pendencia = true`** — reusa Kanban, comentários, auditoria e alertas.

| Recurso | Como funciona |
|---|---|
| Estados | Aberta · Em tratamento · Resolvida · Devolvida (Cancelada fica fora do quadro) |
| Data fatal | Sinal visual: vermelho se atrasada, âmbar se ≤ 2 dias |
| Transferência | Muda departamento/responsável, com histórico origem→destino e notificação |
| Devolução automática | Ao resolver, se houve origem distinta, volta ao gerador para ciência |
| Alertas por cron | Job diário (`pg_cron`) notifica pendências próximas/estouradas |
| Importação | CSV de clientes com dedup por CPF, sem API externa |

**Decisão de produto:** tratar pendências **internamente** no JurisAI (não integrar ao ProJuris via API). Migrações aditivas; execução automática por IA compartilha a flag `CHAT_TOOLS_ENABLED` — as páginas funcionam por ações explícitas; a operação por chat liga no rollout.

---

## 15. Clientes & processos

Cadastro completo PF/PJ com tudo o que uma petição exige:
- **PF:** CPF, RG, filiação, estado civil, profissão, PIS/NIT, naturalidade, perfil gov.br. **PJ:** CNPJ, IE/IM, representante legal. Endereço completo, contatos, dados bancários, chave PIX, origem, observações.
- **Documentos tipados** (RG, CPF, comprovante de residência, extratos, CNIS, procuração, contrato, certidão…) em storage seguro.
- **Processos:** nº, responsável, status, próxima audiência.

Base viva: **33 clientes**, **29 processos**. Notificações em tempo real sobre novos clientes, documentos e tarefas críticas.

---

## 16. Dashboards, KPIs & gargalos

- **Dashboard pessoal:** tarefas dos últimos 14 dias por categoria, prioridade, status e tendência (Recharts).
- **Dashboard de equipe (master):** Kanban de tarefas por status + roster com presença online.
- **KPIs de eficiência:** por departamento — total, pendentes, atrasadas, críticas, carga média, "bottleneck score".
- **Detecção de gargalos:** monitor a cada ~5 min dispara alertas (fila pendente, críticas sem dono, sobrecarga, custo, marketing), com severidade (crítico/aviso/info), toast agrupado clicável e silenciar 1h; registro em `bottleneck_notifications`.
- **Organograma** navegável dos agentes e **presença de plataforma** (heartbeat) mostrando quem está online.

---

## 17. Papéis & permissões

Dois sistemas complementares (não confundir ao depurar):
- **`role_templates` (organizacional):** o cargo real — `socio`, `adv_*`, `lider_recepcao`, `recepcionista`, `financeiro`… Guarda etapas, áreas e flags (`is_admin`, `has_login`, `can_assign_tasks`). Governa o **RLS** no banco.
- **`user_roles` / `app_role` (aplicação):** o papel de UI — admin, lawyer, receptionist, financial, intern, tech… Governa o que `usePermissions` mostra (departamentos, comandos, menu, agentes visíveis, widgets).

Quatro camadas de rota (autenticado / admin / master / tech). O **master** é o sócio (papel diretor/admin ou cargo `socio`), com auditoria global. **Atribuir tarefas é exclusividade do Admin/master.**

---

## 18. Integrações externas

| Integração | Para quê |
|---|---|
| **Resend** | E-mail transacional: convite de funcionários (link de 7 dias) e **fila de notificações** por e-mail processada por cron (até 20/execução, até 5 tentativas) |
| **Stripe** | Checkout embutido para recarga de tokens; webhook idempotente credita saldo após pagamento (sandbox/live) |
| **Cloudflare Turnstile** | Captcha na definição de senha pós-convite |
| **Integration API** | Gateway REST (`service_role`) para Claude/n8n/ERPs/scripts: select/insert/update/delete/upsert, RPC, lote, invocação de Edge Functions — com chave dedicada, comparação timing-safe e log de auditoria |

**Atenção:** a Integration API ignora RLS e tem acesso total ao schema público. A chave `INTEGRATION_API_KEY` é senha de administrador.

---

## 19. Segurança & dados

- **RLS nas 63 tabelas** — acesso decidido no banco, por usuário e cargo.
- **Auth Supabase** (e-mail/senha + OAuth); usuários nascem por **convite do sócio** (sem autocadastro), senha forte e captcha.
- **Segredos** de Edge Functions em `edge_runtime_secrets` (só `service_role`); chaves BYOK por usuário (migração para Vault prevista).
- **Auditoria em camadas:** `task_audit_log` (tarefas), `agent_actions` (chat agêntico), `integration_api_audit_log` (API externa), `ui_events` (uso da interface).
- **LGPD:** com o Postgres como lar oficial de PII, revisão de Vault/DPA sinalizada antes do cutover pleno das pendências.

---

## 20. Evolução & estado atual

Rebrand do antigo "LexForce"; mais de duas dúzias de patches versionados. Marcos:

| Versão | Marco |
|---|---|
| V7 | Chat com BYOK e config de LLM por agente |
| V14 | Modelo organizacional Bacellar: cargos, agentes por cargo, matrizes, convite de funcionários, presença |
| V16–V17 | Workspace por usuário; tarefas humano↔humano, inbox, atribuição, validação |
| V19 | Protocolo Inter-Assistente |
| V20 | Fila de e-mail e anexos de tarefas |
| V21 | Aposenta "CEO" compartilhado → "Meu Assistente" por usuário |
| V22 | Biblioteca de modelos de peça com roteamento por tipo de ação |
| V23 | Chat → orquestração multi-agente N1→N2→N3 (assíncrona + Realtime) |
| V24 | Agentes leem os documentos do caso + modelos, com cerca anti-alucinação |
| V25 | Validador mecânico pós-N3 e fatos canônicos por regex |
| Kanban SP1–SP5 | Kanban ProJuris completo: quadros, filtros, detalhe-hub, checklist/workflow/timesheet, auditoria |
| Pendências | Pendências internas com data fatal, transferência/devolução, alertas por cron |

### Ligado vs. em espera
- **Em produção:** orquestração N1→N2→N3, leitura de documentos, validador mecânico, Kanban completo, tarefas + validação, Inter-Assistente, pendências (ação explícita), clientes/processos, dashboards, convites, importador CSV.
- **Aguardando ativação / desligado:** chat agêntico executando ações reais (flag `CHAT_TOOLS_ENABLED`, inerte); cobrança de tokens (`BILLING_ENABLED=false`). Failover automático entre provedores de IA e ramificação de workflow são próximos passos.

---

*Documentação gerada a partir do código-fonte, do banco de dados vivo (Supabase, projeto `JurisAI`, 63 tabelas) e da especificação de domínio do escritório. Os números refletem o estado do banco na data de geração; recursos "aguardando ativação" existem no código e estão prontos, porém desligados por flag.*
