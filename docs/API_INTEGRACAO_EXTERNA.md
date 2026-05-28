# API de Integração Externa — JurisAI / Bacellar Advogados

Gateway REST para conectar **Claude**, **n8n**, ERPs, scripts Python ou qualquer sistema externo ao banco e às regras de negócio do JurisAI.

> **Acesso:** esta API usa `service_role` internamente — **ignora RLS** e tem **acesso total** ao schema `public` (leitura, escrita, RPCs). Proteja a chave como senha de administrador.

---

## 1. URL base

| Ambiente | URL |
|----------|-----|
| **Produção** | `https://tsltxvswzdnlmvljpryh.supabase.co/functions/v1/integration-api` |
| **Local** | `http://127.0.0.1:54321/functions/v1/integration-api` (com `supabase functions serve`) |

Substitua o `project-ref` se o projeto Supabase mudar.

---

## 2. Autenticação

Toda requisição precisa da chave configurada no secret **`INTEGRATION_API_KEY`**.

### Opção A — Header Authorization (recomendado)

```http
Authorization: Bearer jurisai_sua_chave_secreta_aqui
Content-Type: application/json
```

### Opção B — Header dedicado

```http
X-Integration-Key: jurisai_sua_chave_secreta_aqui
Content-Type: application/json
```

### Gerar uma chave nova

```bash
node scripts/generate-integration-api-key.mjs
```

Copie a saída e configure **apenas** nos secrets do Supabase (nunca no Git).

---

## 3. Configuração no Supabase (obrigatório)

### 3.1 Migration (auditoria + schema)

```bash
npx supabase db push
```

Ou aplique `supabase/migrations/20260605120000_integration_api.sql` no SQL Editor.

### 3.2 Secret da chave

**Dashboard:** Project Settings → Edge Functions → Secrets

| Nome | Valor |
|------|--------|
| `INTEGRATION_API_KEY` | chave gerada pelo script |

**CLI:**

```bash
npx supabase secrets set INTEGRATION_API_KEY="jurisai_..." --project-ref tsltxvswzdnlmvljpryh
```

**Local** (`supabase/.env.local`):

```env
INTEGRATION_API_KEY=jurisai_sua_chave
```

### 3.3 Deploy da edge function

```bash
npx supabase functions deploy integration-api --project-ref tsltxvswzdnlmvljpryh
```

### 3.4 Teste rápido

```bash
curl -s "https://tsltxvswzdnlmvljpryh.supabase.co/functions/v1/integration-api?action=health" \
  -H "Authorization: Bearer SUA_CHAVE"
```

Resposta esperada:

```json
{
  "ok": true,
  "service": "jurisai-integration-api",
  "version": "1.0.0",
  "access": "full_service_role"
}
```

---

## 4. Modelo de requisição

| Método | Uso |
|--------|-----|
| `GET` | `?action=health` \| `schema` \| `openapi` |
| `POST` | Corpo JSON com `"action": "..."` |

Respostas de sucesso: `{ "ok": true, ... }`  
Erros: `{ "ok": false, "error": "codigo", "message": "..." }` com HTTP 4xx/5xx.

---

## 5. Ações disponíveis

### 5.1 `health` — status do sistema

**GET**

```http
GET /functions/v1/integration-api?action=health
Authorization: Bearer SUA_CHAVE
```

**POST**

```json
{ "action": "health" }
```

---

### 5.2 `schema` — listar tabelas e RPCs

```json
{ "action": "schema" }
```

Retorna arrays `tables` e `rpcs` do Postgres (`public`).

---

### 5.3 `select` — consultar tabela

```json
{
  "action": "select",
  "table": "profiles",
  "select": "user_id, full_name, role_template_id",
  "filters": [
    { "column": "full_name", "op": "ilike", "value": "%Ana%" }
  ],
  "order": [{ "column": "full_name", "ascending": true }],
  "limit": 50,
  "offset": 0
}
```

| Campo | Descrição |
|-------|-----------|
| `table` | Nome da tabela em `public` |
| `select` | Colunas PostgREST (padrão `*`) |
| `filters` | Lista de filtros (ver §6) |
| `limit` | Máx. 2000 (padrão 100) |
| `offset` | Paginação |

---

### 5.4 `insert` — inserir registro(s)

```json
{
  "action": "insert",
  "table": "user_tasks",
  "data": {
    "title": "Revisar petição via API",
    "task_type_id": "UUID_DO_TIPO",
    "assignee_user_id": "UUID_USUARIO",
    "assigner_user_id": "UUID_SOCIO",
    "status": "assigned",
    "priority": "high"
  },
  "select": "*"
}
```

`data` pode ser **objeto** ou **array** de objetos.

---

### 5.5 `update` — atualizar

```json
{
  "action": "update",
  "table": "user_tasks",
  "data": { "status": "in_progress", "notes": "Iniciado via Claude" },
  "filters": [{ "column": "id", "op": "eq", "value": "UUID_DA_TAREFA" }],
  "select": "*"
}
```

> Sem `filters`, a atualização afeta **todas** as linhas da tabela (comportamento intencional para integração sem bloqueios).

---

### 5.6 `delete` — excluir

```json
{
  "action": "delete",
  "table": "bottleneck_notifications",
  "filters": [{ "column": "id", "op": "eq", "value": "UUID" }],
  "select": "id"
}
```

---

### 5.7 `upsert` — inserir ou atualizar

```json
{
  "action": "upsert",
  "table": "user_ui_preferences",
  "data": { "user_id": "UUID", "theme": "dark" },
  "on_conflict": "user_id",
  "select": "*"
}
```

---

### 5.8 `rpc` — funções Postgres (regras de negócio)

Preferível para fluxos que já existem no sistema (tarefas, validação, workspace).

```json
{
  "action": "rpc",
  "rpc": "get_my_workspace",
  "args": {}
}
```

> RPCs que usam `auth.uid()` retornam dados do contexto **service_role** (sem usuário). Para operações por usuário específico, use `select`/`update` direto ou `invoke_edge` com JWT do usuário.

**RPCs úteis:**

| RPC | Uso |
|-----|-----|
| `get_my_workspace` | Perfil + agentes do usuário (requer contexto auth) |
| `create_user_task` | Criar tarefa (valida matriz de cargos) |
| `get_team_tasks` | Visão master das tarefas |
| `get_my_inbox` | Inbox do assignee |
| `provision_user_agents` | `{ "p_user_id": "uuid" }` |
| `get_validation_count` | Badge validação |
| `create_inter_assistant_request` | Protocolo inter-assistente |

Exemplo — provisionar agentes de um funcionário:

```json
{
  "action": "rpc",
  "rpc": "provision_user_agents",
  "args": { "p_user_id": "UUID_DO_USUARIO" }
}
```

---

### 5.9 `batch` — várias operações em uma chamada

Máximo **50** operações.

```json
{
  "action": "batch",
  "operations": [
    { "action": "select", "table": "role_templates", "limit": 20 },
    { "action": "select", "table": "agents", "filters": [{ "column": "is_active", "op": "eq", "value": true }], "limit": 100 },
    { "action": "rpc", "rpc": "get_task_types_by_stage", "args": {} }
  ]
}
```

---

### 5.10 `invoke_edge` — chamar outra edge function

Útil para **chat-orchestrator** com JWT de um usuário real.

```json
{
  "action": "invoke_edge",
  "function_name": "chat-orchestrator",
  "user_authorization": "Bearer JWT_DO_USUARIO_SUPABASE",
  "function_body": {
    "sessionId": "uuid-sessao",
    "message": "Resuma as pendências de hoje"
  }
}
```

Sem `user_authorization`, usa `service_role` (funções que exigem JWT de usuário podem falhar).

---

## 6. Filtros (`filters`)

| `op` | Descrição | Exemplo `value` |
|------|-----------|-----------------|
| `eq` | Igual (padrão) | `"assigned"` |
| `neq` | Diferente | `"cancelled"` |
| `gt`, `gte`, `lt`, `lte` | Comparação | `"2026-01-01"` |
| `like`, `ilike` | Texto | `"%Bacellar%"` |
| `in` | Lista | `["a","b"]` |
| `is` | NULL / not null | `null` |

```json
{ "column": "status", "op": "in", "value": ["assigned", "in_progress"] }
```

---

## 7. Conectar o Claude (Anthropic)

### 7.1 Claude.ai — Projeto com Custom Tool / Connector

1. Crie um **projeto** no [Claude](https://claude.ai).
2. Em **Project knowledge** ou **Tools**, adicione uma ferramenta HTTP personalizada.
3. Configure:
   - **URL:** `https://tsltxvswzdnlmvljpryh.supabase.co/functions/v1/integration-api`
   - **Método:** POST
   - **Header:** `Authorization: Bearer <INTEGRATION_API_KEY>`
   - **Body template:** JSON com `action` conforme a intenção.

**Instrução de sistema sugerida para o projeto Claude:**

```text
Você tem acesso à API JurisAI (integração Bacellar Advogados).
Base: POST https://tsltxvswzdnlmvljpryh.supabase.co/functions/v1/integration-api
Header: Authorization: Bearer <chave configurada no projeto>

Antes de alterar dados, use action "schema" para confirmar tabelas.
Para listar: action "select" com table e filters.
Para regras de negócio (tarefas, validação): action "rpc".
Para várias leituras: action "batch".
Respostas vêm em JSON com ok: true/false.
Idioma das respostas ao usuário: português (Brasil).
```

### 7.2 Claude API (Messages) — tool use em código

```python
import os
import requests

BASE = "https://tsltxvswzdnlmvljpryh.supabase.co/functions/v1/integration-api"
KEY = os.environ["JURISAI_INTEGRATION_KEY"]

def jurisai_call(payload: dict) -> dict:
    r = requests.post(
        BASE,
        headers={
            "Authorization": f"Bearer {KEY}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=60,
    )
    r.raise_for_status()
    return r.json()

# Exemplo: listar funcionários
print(jurisai_call({
    "action": "select",
    "table": "profiles",
    "select": "user_id, full_name, is_estagiario, role_template_id",
    "limit": 50,
}))

# Exemplo: tarefas abertas
print(jurisai_call({
    "action": "select",
    "table": "user_tasks",
    "filters": [{"column": "status", "op": "in", "value": ["assigned", "in_progress"]}],
    "limit": 100,
}))
```

Defina a tool no Claude SDK apontando para `jurisai_call` ou faça o modelo emitir JSON que seu backend repassa à API.

### 7.3 cURL — referência rápida

```bash
export JURISAI_KEY="jurisai_..."

# Health
curl -s "$BASE?action=health" -H "Authorization: Bearer $JURISAI_KEY"

# Schema
curl -s -X POST "$BASE" \
  -H "Authorization: Bearer $JURISAI_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action":"schema"}'

# Leads / clientes
curl -s -X POST "$BASE" \
  -H "Authorization: Bearer $JURISAI_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action":"select","table":"clients","limit":10}'
```

---

## 8. Tabelas principais (referência)

| Tabela | Conteúdo |
|--------|----------|
| `profiles` | Funcionários (nome, cargo, estagiário) |
| `role_templates` | Cargos (sócio, recepcionista, …) |
| `agents` | Agentes IA por usuário |
| `user_tasks` | Tarefas humano → humano |
| `task_types` | Tipos de tarefa |
| `clients` | Clientes |
| `chat_sessions`, `chat_messages` | Chat com agentes |
| `inter_assistant_requests` | Pedidos inter-assistente |
| `token_balances`, `token_transactions` | Tokens LLM |
| `integration_api_audit_log` | Log de chamadas desta API |

Use `action: "schema"` para lista atualizada no banco.

---

## 9. Segurança e boas práticas

| Tópico | Recomendação |
|--------|----------------|
| Chave vazada | Gere nova com `generate-integration-api-key.mjs` e atualize o secret |
| HTTPS | Obrigatório em produção |
| IP allowlist | Configure no Supabase Dashboard se disponível no plano |
| Auditoria | Consulte `integration_api_audit_log` |
| Princípio do menor privilégio | Para integrações limitadas no futuro, crie chaves com escopo (evolução planejada) |

**O que esta API não faz**

- Não expõe SQL arbitrário (evita injection direto).
- Não substitui login de usuário no front — use JWT + `invoke_edge` quando precisar de `auth.uid()`.

**O que esta API faz (acesso total)**

- CRUD em qualquer tabela `public` via PostgREST/service_role.
- Qualquer RPC em `public` que o service_role pode executar.
- Ignora políticas RLS das tabelas.

---

## 10. Códigos de erro

| `error` | HTTP | Significado |
|---------|------|-------------|
| `missing_api_key` | 401 | Sem Bearer / X-Integration-Key |
| `invalid_api_key` | 403 | Chave incorreta |
| `integration_not_configured` | 503 | Secret `INTEGRATION_API_KEY` ausente |
| `invalid_json` | 400 | Body malformado |
| `request_failed` | 400 | Erro de negócio / Postgres (ver `message`) |
| `method_not_allowed` | 405 | Método diferente de GET/POST |

---

## 11. Fluxo recomendado para o Claude

```mermaid
sequenceDiagram
  participant Claude
  participant API as integration-api
  participant DB as Postgres

  Claude->>API: POST health
  API->>DB: service_role
  API-->>Claude: ok

  Claude->>API: POST schema
  API-->>Claude: tables + rpcs

  Claude->>API: POST select profiles
  API-->>Claude: funcionários

  Claude->>API: POST rpc create_user_task
  API-->>Claude: task id
```

1. `health` — confirmar conectividade  
2. `schema` — descobrir estrutura  
3. `select` / `rpc` — ler e agir  
4. `batch` — reduzir round-trips  

---

## 12. Suporte e repositório

- **Repo:** https://github.com/ryanribeiro9877/build-your-dreams-153  
- **Código da API:** `supabase/functions/integration-api/index.ts`  
- **Manual geral:** `AGENTS.md`  

Atualize este documento quando novas RPCs ou tabelas forem adicionadas ao projeto.
