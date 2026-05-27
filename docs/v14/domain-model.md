# Bacellar Advogados — Modelo de Domínio LexForce

> **Fonte da verdade canônica** derivada das Auditorias 1 (Gestão Jurídica) e 2 (Recepção) + Revisão do Sócio (27/05).
> Alimenta as migrations da V14, o seed de templates da V15, a UI filtrada da V16, e o painel de atribuição da V17.
> **Última atualização**: 27/maio/2026 · Pós-revisão do sócio
> **Status**: 5 buracos remanescentes na seção 12 antes da V14 poder ser gerada.

---

## 0. TL;DR

- **Empresa**: Bacellar Advogados (Salvador-BA), sociedade individual em nome de Rodrigo Bacellar.
- **10 cargos** (9 internos com login + 1 colaborador externo).
- **9 usuários internos** + 1 externo (Robson — uso esporádico, sem login).
- **Estrutura organizacional**: célula horizontal (1 sócio + 4 advogadas + 3 recepção + 1 financeira).
- **Especialização híbrida**: por etapa do processo **+** flag de área jurídica (Laura é única do previdenciário; Daiane é única de família).
- **SLA crítico**: 3 dias para protocolar após documentação completa.
- **Kanban de pendências gerais**: já existe hoje (gerenciado pela Kailane). Sistema precisa decidir se substitui ou espelha (seção 12.5).
- **Captação via cooperativa**: novo canal confirmado pelo sócio (precisa detalhamento — seção 12.4).
- **Áreas atendidas (5)**: bancário, família, plano de saúde, consumidor, civil, previdenciário (tributário **a confirmar — seção 12.3**).

---

## 1. Pessoas reais → mapping pra `users`

| # | Nome real | Cargo (role_template) | Será admin? | Tem login? |
|---|---|---|---|---|
| 1 | Rodrigo Bacellar | `socio` | ✅ sim | ✅ |
| 2 | Ana Cristina | `adv_confeccao_geral` | não | ✅ |
| 3 | Luisa | `adv_protocolo` | não | ✅ |
| 4 | Daiane | `adv_audiencia_execucao` | não | ✅ |
| 5 | Laura | `adv_previdenciario` | não | ✅ |
| 6 | Kailane | `lider_recepcao` | não | ✅ |
| 7 | Taís | `recepcionista` | não | ✅ |
| 8 | Yasmin | `estagiaria_recepcao` | não | ✅ |
| 9 | Ana Rosa | `financeiro` | não | ✅ |
| 10 | Robson | `audiencia_externa` | não | ❌ |

---

## 2. Catálogo de cargos (`role_templates`) — REVISADO

| ID | Nome | Stage | Area | Notas |
|---|---|---|---|---|
| `socio` | Sócio | gestao, revisao, execucao, alvara, recursos_criticos | todas | Acesso total. Cobre Ana e Daiane em férias. Recursos Agiproteg/Agibank/Facta exclusivos. |
| `adv_confeccao_geral` | Advogada de Confecção | confeccao, atendimento | bancario, plano_saude, consumidor, civil | **NÃO atende família nem previdenciário.** Cobre Luisa em férias. |
| `adv_protocolo` | Advogada de Protocolo | protocolo | todas, exceto previdenciario | Cobre Ana em férias (junto com sócio). |
| `adv_audiencia_execucao` | Advogada de Audiência | audiencia, execucao_sindicato, recursos, diligencia, acompanhamento | bancario, familia | Recursos exceto Agiproteg/Agibank/Facta. Backup: sócio + Laura + Robson. |
| `adv_previdenciario` | Advogada Previdenciária | todas | previdenciario | Ciclo completo sozinha. Em férias dela, previdenciário **pausa**. |
| `lider_recepcao` | Líder de Recepção | recepcao, admin_equipe, captacao_cooperativa, kanban_pendencias | n/a | Gerencia Taís e Yasmin. Captação cooperativa. **Valida cadastros da Yasmin**. |
| `recepcionista` | Recepcionista | recepcao, kanban_pendencias | n/a | Mesmo escopo da Kailane menos gestão. PROCON/SUSEP confirmado. Assume liderança em férias da Kailane. |
| `estagiaria_recepcao` | Estagiária | recepcao_supervisionada | n/a | PROCON/SUSEP confirmado. Cadastra processos com **Kailane validando**. |
| `financeiro` | Financeiro | financeiro | n/a | Conferência processo a processo. Aciona recepção pro PIX. |
| `audiencia_externa` | Colaborador Externo | audiencia | bancario, familia | **Sem login**. Uso **esporádico** ("quando precisa"). Mensagem via WhatsApp gerada pelo sistema. |

---

## 3. Mapa de áreas × etapas (TABELA QUE REVELA OS BURACOS)

| Área | Atendimento | Confecção | Revisão | Protocolo | Audiência | Execução | Recursos |
|---|---|---|---|---|---|---|---|
| **Bancário** | Ana | Ana | Sócio | Luisa | Daiane | Sócio + Daiane | Daiane (sócio nos 3 críticos) |
| **Família** | **? 12.2** | **? 12.2** | Sócio | Luisa | Daiane | Daiane | Daiane |
| **Plano de Saúde** | Ana | Ana | Sócio | Luisa | **? 12.1** | **? 12.1** | **? 12.1** |
| **Consumidor** | Ana | Ana | Sócio | Luisa | **? 12.1** | **? 12.1** | **? 12.1** |
| **Civil** | Ana | Ana | Sócio | Luisa | **? 12.1** | **? 12.1** | **? 12.1** |
| **Previdenciário** | Laura | Laura | Sócio (?) | Laura | Laura | Laura | Laura |
| **Tributário** | **? 12.3** | | | | | | |

---

## 4. Catálogo de agentes por cargo

### 4.1. Sócio — 9 agentes

| Agente | Role |
|---|---|
| CEO LexForce | ceo |
| Diretor de Operações | director |
| Diretor Jurídico (Revisão) | director |
| Diretor Financeiro | director |
| Diretor de Equipe | director |
| Especialista Execução | specialist |
| Especialista Alvará | specialist |
| Especialista Recursos Críticos | specialist |
| Monitor de SLA Global | monitor |

### 4.2. Ana Cristina — 7 agentes (áreas atualizadas)

| Agente | Role |
|---|---|
| Meu Assistente | assistant_root |
| Especialista Confecção Bancário | specialist |
| Especialista Confecção Plano de Saúde | specialist |
| Especialista Confecção Consumidor | specialist |
| Especialista Confecção Civil | specialist |
| Especialista Atendimento | specialist |
| Monitor Andamento por Cliente | monitor |

### 4.3. Luisa — 5 agentes (sem mudança)

### 4.4. Daiane — 8 agentes (+1 família)

| Agente | Role |
|---|---|
| Meu Assistente | assistant_root |
| Especialista Audiência | specialist |
| Especialista Alvará (Diligência) | specialist |
| Especialista Recurso Inominado | specialist |
| Especialista Contrarrazões | specialist |
| Especialista Agravo Interno | specialist |
| **Especialista Direito de Família** | specialist |
| Monitor Execução Sindicato | monitor |

### 4.5. Laura — 7 agentes (sem mudança)

### 4.6. Kailane — 12 agentes (+2: cooperativa e kanban)

| Agente | Role |
|---|---|
| Meu Assistente | assistant_root |
| Especialista Triagem | specialist |
| Especialista Tabela de Audiências | specialist |
| Especialista WhatsApp | specialist |
| Especialista Cadastro ProJuris (com validação da Yasmin) | specialist |
| Especialista Documentação Geral | specialist |
| Especialista Demandas Administrativas | specialist |
| Especialista Lembretes | specialist |
| **Especialista Captação Cooperativa** | specialist |
| **Especialista Kanban de Pendências** | specialist |
| Monitor Pendências de Cliente | monitor |
| Monitor Equipe Recepção | monitor |

### 4.7. Taís — 9 agentes

Mesmo conjunto da Kailane menos: Monitor Equipe + Captação Cooperativa (a confirmar). PROCON/SUSEP confirmado.

### 4.8. Yasmin — 7 agentes (PROCON/SUSEP confirmado, cadastro com validação)

| Agente | Role |
|---|---|
| Meu Assistente | assistant_root |
| Especialista WhatsApp | specialist |
| Especialista Tabela de Audiências | specialist |
| Especialista Documentação Geral | specialist |
| Especialista Lembretes | specialist |
| Especialista Cadastro ProJuris (rascunho — Kailane valida) | specialist |
| Especialista Demandas Administrativas | specialist |

### 4.9. Ana Rosa — 5 agentes (sem mudança)

### 4.10. Robson — sem agentes. Apenas registro em `external_collaborators`.

---

## 5. Catálogo de tipos de tarefa (`task_types`)

61 tipos da V1 mantidos + 5 novos:

- `captacao_cooperativa_ligacao` (Kailane, Taís)
- `criar_card_kanban` (Kailane, Taís, Yasmin)
- `mover_card_kanban` (idem)
- `resolver_pendencia_kanban` (idem)
- `validar_cadastro_yasmin` (apenas Kailane)

**Total: 66 task_types.**

---

## 6. Matriz Tarefa × Cargo

Ajustes finais:
- ✅ Yasmin pode abrir PROCON/SUSEP
- ✅ Taís pode abrir PROCON/SUSEP
- ✅ Yasmin pode cadastrar processo (`validation_required = true → Kailane`)
- ✅ Captação cooperativa: Kailane (e Taís quando Kailane fora)
- ✅ Kanban: todas as 3 da recepção (com líder organizando)

---

## 7. Matriz Inter-Assistente (atualizada)

Adições à V1:
- **Kailane → Sócio**: status do kanban, leads da cooperativa, métricas da equipe
- **Yasmin → Kailane**: validação obrigatória de cadastro
- **Taís → Kailane**: dúvida ou validação opcional

---

## 8. SLAs operacionais (sem alteração da V1)

10 regras duras da V1 §7 mantidas.

---

## 9. Cobertura / Backup — FECHADO

| Quem em férias | Substituto(s) | Notas |
|---|---|---|
| Luisa | Ana Cristina | Confirmado. |
| Ana Cristina | Rodrigo **OU** Luisa | Compartilhado. |
| Daiane | Rodrigo **OU** Laura **OU** Robson | Triagem por carga. |
| Laura | **Suspende** — aguarda retorno | Previdenciário pausa. |
| Kailane | Taís | Assume formalmente. |
| Taís | Yasmin (com Kailane validando mais) | Inferido. |
| Yasmin | Sem reposição | Não-crítico. |
| Ana Rosa | Rodrigo | A confirmar — seção 12.6. |

---

## 10. Riscos cobertos (V1 §9 mantida) + 2 novos

- ✅ Kailane sumindo do kanban → painel do sócio mostra pendências sem dono
- ✅ Captação cooperativa sem follow-up → tarefa auto-criada após X dias

---

## 11. Sistemas externos (V1 §10) + adições

- **Cooperativa** (canal de captação) — a detalhar em 12.4
- **Kanban interno** — substituir ou espelhar (12.5)

---

## 12. DECISÕES PENDENTES (5 BURACOS ANTES DA V14)

### 12.1. Áreas órfãs de audiência/execução

Plano de saúde, consumidor e civil têm confecção (Ana) mas **ninguém listou** quem faz audiência, execução e recursos.

- (a) Sócio assume todas as 3 áreas
- (b) Daiane também cobre (expande lista de áreas dela)
- (c) Ana acumula o ciclo dessas 3 áreas
- (d) Mistura: definir caso a caso por tipo de ação

### 12.2. Família — quem confecciona?

Daiane lista "acompanhamento das ações de direito de família". É só pós-protocolo ou também petição inicial?

- (a) Daiane faz ciclo completo de família (atendimento + peça + audiência + execução)
- (b) Ana confecciona família, Daiane só acompanha
- (c) Sócio confecciona família

### 12.3. Tributário foi descontinuado?

Apareceu no áudio original, ninguém lista mais.

- (a) Sócio mesmo faz, não delega
- (b) Não atende mais — remover da lista
- (c) Atende esporadicamente — manter dormente

### 12.4. Cooperativa — esclarecimento

- Nome/tipo dessa cooperativa?
- Um parceiro ou várias?
- Inbound (cooperativa manda contato) ou outbound (Kailane liga pros associados)?
- Vira `client_b2b` ou `lead_channel`?

### 12.5. Kanban de pendências gerais

- Onde mora hoje? (ProJuris / Trello / planilha / papel?)
- Substituir ou espelhar?
- Colunas atuais? (Pendente / Em andamento / Resolvido?)
- Quem abre cartão (qualquer cargo ou só recepção)?

### 12.6. Outros pequenos

- Ana Rosa em férias: Rodrigo cobre? Confirmar.
- Ressaque (captação suspensa): quando voltar, canal e responsável?

---

## 13. O que entra na V14

Quando você fechar as 5 pendências:

1. Migration `20260527000000_lexforce_org_model.sql` com:
   - Enums: `org_stage`, `legal_area`, `task_status`, `coverage_status`
   - Tabelas novas: `role_templates`, `agent_templates`, `role_agent_matrix`, `task_types`, `role_task_matrix`, `role_coverage`, `external_collaborators`, `tasks`, `inter_assistant_requests`, `user_areas`, `captacao_canais`, `kanban_columns`, `kanban_cards`
   - Alterações em `profiles`, `agents`, `chat_sessions`
   - Seed completo: 10 cargos, ~75 agentes, 66 task_types, matrizes, 9 usuários iniciais reais
   - RLS strict em tudo
2. Atualização `src/types/lexforce.ts`
3. Atualização `AGENTS.md` (Cohapm → Bacellar Advogados, nomes corretos)
4. `vite build` passando

---

**Esse documento é a fonte da verdade até a V14 ser aplicada.**
