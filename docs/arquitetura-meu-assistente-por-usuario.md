# Arquitetura: Meu Assistente por Usuário

> **Etapa A** — Documento para revisão antes de qualquer migration.
> Projeto: JurisAI / Bacellar Advogados
> Data: 2026-06-01

---

## 1. Resumo da Mudança

Substituir o modelo "CEO compartilhado" por **"Meu Assistente" privado por usuário** (`assistant_root`). Cada pessoa que entra no sistema recebe automaticamente um orquestrador pessoal + os sub-agentes que seu papel libera. Não existe "cérebro coletivo" acima dos assistentes.

---

## 2. Estado Atual (Auditado no Banco — 2026-06-01)

### 2.1 Agentes com role `ceo` (4)

| # | nome | external_id | is_personal | owner_user_id | situação |
|---|------|-------------|-------------|---------------|----------|
| 1 | `CEO JurisAI` | 0 | false | null | Raiz original do organograma de 77 agentes |
| 2 | `⚖️ Meu Assistente — CEO Jurídico` | 5000 | false | null | Segundo root (sobrou de iteração) |
| 3 | `CEO LexForce` | null | true | `1a87f6ba-…654f13` | **Órfão** — dono não existe em `profiles` |
| 4 | `CEO LexForce` | null | true | `5165ca8b-…36c9eb` | **Órfão** — dono não existe em `profiles` |

### 2.2 Perfis Reais (3)

| nome | role_template | is_estagiario |
|------|---------------|---------------|
| Sócio Bacellar Advogados | `socio` | false |
| Ryan Ribeiro | `socio` | false |
| (sem nome) | `tech` | false |

### 2.3 assistant_root — Templates vs. Instâncias

- **7 templates** existem em `agent_templates` (audiencia, confeccao, estagiaria, financeiro, lider_recepcao, previdenciario, protocolo).
- **0 instâncias** com role `assistant_root` existem em `agents`.
- O papel `socio` **NÃO tem** `assistant_root` na `role_agent_matrix` — mapeia para `ceo_lexforce` (role=ceo).

### 2.4 Agentes pessoais órfãos

Dois `owner_user_id` que não existem em `profiles` possuem 10 agentes pessoais cada (incluindo 1 CEO LexForce). São resíduos de iteração; os agentes serão desativados na Etapa B.

---

## 3. Fronteira Privado / Compartilhado

Este é o **ponto central** da arquitetura. Toda tabela do sistema cai em exatamente uma das duas categorias:

### 3.1 PRIVADO por usuário (RLS por `owner_user_id` ou `user_id`)

Memória de conversa, estado do assistente, fila pessoal. O assistente da Kailane **nunca** enxerga o da Taís.

| Tabela | Coluna de isolamento | Quem vê |
|--------|----------------------|---------|
| `chat_sessions` | `user_id` | Dono + admin |
| `chat_messages` | `user_id` (via session) | Dono + admin |
| `user_tasks` | `assignee_user_id` / `assigner_user_id` / `validator_user_id` | Envolvidos + admin |
| `agents` (pessoais) | `owner_user_id` (WHERE `is_personal = true`) | Dono + admin/tech |
| `inter_assistant_requests` | `from_user_id` / `to_user_id` | Remetente + destinatário + admin |

### 3.2 COMPARTILHADO / universal (RLS por papel ou aberto a autenticados)

Dados de negócio do escritório. Qualquer Meu Assistente lê sob demanda, conforme o que o papel permite.

| Tabela | Quem vê |
|--------|---------|
| `clients` | Autenticados (RLS por papel, se aplicável) |
| `client_documents` | Autenticados (RLS por papel) |
| `processes` | Autenticados (RLS por papel) |
| `agent_templates` | Autenticados (catálogo, read-only) |
| `role_templates` | Autenticados (catálogo, read-only) |
| `role_agent_matrix` | Autenticados (catálogo, read-only) |
| `task_types` | Autenticados (catálogo, read-only) |
| `role_task_matrix` | Autenticados (catálogo, read-only) |
| `departments` | Autenticados (legado, read-only) |
| `model_pricing` | Autenticados (read-only) |
| `captacao_canais` | Autenticados |

### 3.3 Regra de acesso — resumo

```
SE o dado pedido é COMPARTILHADO e o papel pode ver
  → Meu Assistente RESPONDE DIRETO (leitura normal via RLS)

SE o dado pedido é PRIVADO DE OUTRO USUÁRIO
  → Meu Assistente abre inter_assistant_request
  → Assistente do destinatário recebe + notifica o dono humano
  → Dono responde → resposta volta ao remetente
  → NUNCA leitura automática do estado privado alheio
```

---

## 4. Diagrama de Fluxo: Pergunta → Resposta

```
Usuário faz pergunta ao "Meu Assistente"
            │
            ▼
    ┌─────────────────────┐
    │  O dado é de quem?  │
    └────────┬────────────┘
             │
     ┌───────┴───────┐
     │               │
     ▼               ▼
 COMPARTILHADO    PRIVADO
 (clients,        (chat, tasks,
  processes,       estado de
  documents)       outro user)
     │               │
     ▼               │
 RLS permite?        │
 ┌───┴───┐           │
 SIM     NÃO         │
  │       │           │
  ▼       ▼           ▼
Responde  Nega    ┌────────────────────┐
direto    acesso  │ É do PRÓPRIO user? │
                  └───────┬────────────┘
                    ┌─────┴─────┐
                    SIM         NÃO
                     │           │
                     ▼           ▼
                  Responde   Cria inter_assistant_request
                  direto     (humano no loop)
                              │
                              ▼
                     Assistente do destinatário
                     notifica o dono
                              │
                              ▼
                     Dono responde (approve/deny)
                              │
                              ▼
                     Resposta volta ao remetente
```

---

## 5. Modelo de Instanciação

### 5.1 Fluxo (já implementado em V16, precisa de ajuste para `socio`)

```
Convite de funcionário
  → Edge Function invite-employee
    → RPC apply_employee_profile(user_id, full_name, role_template_id, is_estagiario)
      → RPC provision_user_agents(user_id)
        → Para cada linha em role_agent_matrix WHERE role_template_id = perfil.role_template_id:
            SE requires_is_estagiario IS NULL → instancia
            SE requires_is_estagiario = perfil.is_estagiario → instancia
            SENÃO → pula
        → INSERT em agents:
            is_personal = true
            owner_user_id = user_id
            source_template_id = agent_template_id (da matrix)
            role = template.role
            name = template.display_name
            (copia defaults: provider, model, temperature, system_prompt, etc.)
        → Idempotente: ON CONFLICT DO NOTHING (por owner_user_id + source_template_id)
```

### 5.2 O que muda para o `socio`

Hoje a `role_agent_matrix` do `socio` mapeia para `ceo_lexforce` (role=ceo). Precisamos:

1. **Criar um novo template** `asst_root_socio` (role=`assistant_root`, stage=`gestao`) — o "Meu Assistente" do sócio.
2. **Substituir** `ceo_lexforce` → `asst_root_socio` na `role_agent_matrix` do `socio`.
3. Os diretores (N2) permanecem na matrix do sócio — a árvore do sócio é a única com diretores.
4. `provision_user_agents` passa a instanciar `assistant_root` para o sócio (em vez de `ceo`).

### 5.3 Resultado esperado por papel

| Papel | Meu Assistente (assistant_root) | Sub-agentes | Total |
|-------|------|-------------|-------|
| `socio` (Rodrigo) | 1 (`asst_root_socio`) | 4 directors + 4 specialists + 1 monitor = 9 | **10** |
| `adv_confeccao_geral` (Layane) | 1 | ~11 especialistas/monitores | ~12 |
| `adv_protocolo` (Luana) | 1 | ~10 | ~11 |
| `adv_audiencia_execucao` (Ana Rosa) | 1 | ~4 | ~5 |
| `adv_previdenciario` (Emília) | 1 | ~8 | ~9 |
| `lider_recepcao` (Kailane) | 1 | ~11 | ~12 |
| `recepcionista` (Taís, is_estagiario=false) | 1 | ~10 | ~11 |
| `recepcionista` (Yasmin, is_estagiario=true) | 1 | ~4 | ~5 |
| `financeiro` (Emanoela) | 1 | ~6 | ~7 |
| `tech` (Dev) | 1 (precisa template) | 0 (ou ferramentas técnicas) | ~1 |

### 5.4 Hierarquia por usuário

```
Sócio (Rodrigo):                         Funcionário (ex.: Kailane):
  Meu Assistente (assistant_root)           Meu Assistente (assistant_root)
    ├── Dir. Jurídico & Revisão               ├── Esp. Triagem Geral
    ├── Dir. Operações                        ├── Esp. Projuris Admin
    ├── Dir. Financeiro                       ├── Mon. SLA Recepção
    ├── Dir. Equipe & Gestão                  ├── Esp. Captação
    ├── Esp. Execução                         └── ... (conforme matrix)
    ├── Esp. Recursos Críticos
    ├── Esp. Alvará
    ├── Esp. Confecção Tributário
    └── Mon. SLA Global
```

A árvore do sócio tem diretores (N2); a dos demais é **rasa** (Meu Assistente + especialistas/monitores diretos).

---

## 6. Tratamento do Enum `ceo` (Decisão para Etapa B)

`agents.role` é um enum Postgres (`agent_role`). Remover um valor de enum no PG é custoso (requer recriar o tipo + migrar dados).

**Abordagem recomendada: deixar o valor `ceo` órfão no enum.**

- Migrar todos os agentes de `ceo` → `assistant_root` (os que ficarem ativos) ou desativar/remover.
- Não remover `ceo` do enum — ele fica como valor não utilizado.
- Adicionar constraint ou check em `provision_user_agents` que nunca instancia `ceo`.
- Documentar no AGENTS.md que `ceo` é deprecated.

**Alternativa (mais limpa, mais arriscada):** recriar o enum sem `ceo` via `ALTER TYPE ... RENAME + CREATE TYPE + ALTER TABLE`. Risco: Lovable commita em paralelo, migration parcial pode quebrar.

> **Checkpoint**: qual abordagem prefere? (Recomendo a primeira — baixo risco, sem desvantagem funcional.)

---

## 7. RLS — Ajustes Necessários

### 7.1 Já correto (não mexer)
- `chat_sessions` / `chat_messages`: RLS por `user_id` (dono + admin). OK.
- `user_tasks`: RLS por assigner/assignee/validator + admin. OK.
- `inter_assistant_requests`: RLS por from/to_user + admin. OK.

### 7.2 Precisa de ajuste
- **`agents` (SELECT)**: Hoje é `true` para qualquer autenticado — ou seja, qualquer usuário vê TODOS os agentes, incluindo pessoais de outros. **Corrigir para:**
  - Agentes públicos (`is_personal = false`): visíveis a todos (catálogo/organograma template).
  - Agentes pessoais (`is_personal = true`): visíveis **apenas** ao dono (`owner_user_id = auth.uid()`) + admin/tech.

### 7.3 A garantir (Etapa D)
- Meu Assistente só orquestra/delega para agentes com seu próprio `owner_user_id`.
- `chat-orchestrator` Edge Function deve receber `agent_id` + validar que o agent pertence ao `user_id` autenticado.

---

## 8. Comunicação Entre Assistentes (Etapa E)

Usa **exclusivamente** `inter_assistant_requests` (já existe, com RPCs V19).

```
Assistente de Alice precisa de info privada de Bob
  │
  ▼
create_inter_assistant_request(
  to_user_id = Bob,
  request_type = 'info_request',
  payload = { pergunta, contexto }
)
  │
  ▼
Bob recebe notificação (inbox + futuro: e-mail/push)
  │
  ▼
Bob (humano) decide e responde via answer_inter_assistant_request(...)
  │
  ▼
Assistente de Alice recebe response_payload
```

Nenhum canal novo a criar. RPCs existentes (`create_inter_assistant_request`, `answer_inter_assistant_request`, `get_my_inter_assistant_inbox/outbox`, `list_users_for_inter_assistant`) cobrem o fluxo.

---

## 9. Roteamento por Setor / Carga (Etapa F)

RPC `SECURITY DEFINER` que retorna **apenas contagem agregada** (nunca conteúdo):

```sql
get_sector_workload(target_role_code text)
  RETURNS TABLE(user_id uuid, full_name text, pending_count bigint)

-- Lógica:
-- 1. Busca usuários com role_template.code = target_role_code
-- 2. Para cada um, COUNT de user_tasks WHERE status IN ('assigned','in_progress','blocked')
-- 3. ORDER BY pending_count ASC (mais livre primeiro)
```

Esta é a **única exceção controlada** ao isolamento estrito:
- Expõe **metadado agregado** (contagem), nunca conteúdo de tarefa.
- `SECURITY DEFINER` com `search_path = public` — o chamador não precisa de SELECT em `user_tasks` alheio.
- Documentada como exceção no AGENTS.md.

---

## 10. Sequência de Entrega (Etapas B–F)

| Etapa | O que | Depende de | Checkpoint? |
|-------|-------|------------|-------------|
| **B** | Limpeza dos 4 CEOs + criação de `asst_root_socio` + atualização da matrix | A (este doc) | Sim: qual CEO vira raiz-template; abordagem do enum |
| **C** | Ajuste do `provision_user_agents` + provisionar para os 3 perfis existentes | B | Não |
| **D** | RLS de `agents` (pessoais isolados) + validação no orchestrator | C | Não |
| **E** | Formalizar regra "privado alheio → inter_assistant_request" na lógica do orchestrator | D | Não |
| **F** | RPC `get_sector_workload` | C | Não |

Cada etapa vira um patch sequencial numerado (`.diff` + SQL/TSX + `README.md` em `.zip`), conforme convenção do AGENTS.md.

---

## 11. Perguntas para Checkpoint (Antes da Etapa B)

1. **Enum `ceo`**: deixar órfão no enum (recomendado) ou recriar o tipo?
2. **Raiz do organograma-template**: dos 2 roots não-pessoais (`CEO JurisAI` ext_id=0, `⚖️ Meu Assistente — CEO Jurídico` ext_id=5000), qual vira a raiz do organograma-template e qual é removido? O `CEO JurisAI` (ext_id=0) parece ser o original com os 77 agentes subordinados.
3. **Template `tech`**: o papel `tech` não tem `assistant_root` na matrix. Criar um `asst_root_tech` ou o tech não precisa de Meu Assistente?
