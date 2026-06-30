# Design — Chat agêntico: o chat principal executa ações do sistema

**Data:** 2026-06-30
**Status:** aprovado no brainstorming, aguardando revisão do spec
**Decisão de produto (FEAT-04):** pendências/cadastro tratados **internamente** no JurisAI (sem integração ProJuris).

## 1. Objetivo

Dar ao chat principal a capacidade de **executar de verdade** funcionalidades do sistema — não apenas orientar. Na primeira fase (v1):

- **Consultar** dados reais (cliente, tarefas/cards, processo, documentos) — leitura.
- **Cadastrar cliente** — escrita.
- **Criar/atribuir card de tarefa (Kanban)** — escrita (o-quê/prazo/para-quem/área/cliente).
- **Solicitar documentos / pedir acesso a arquivos** — escrita (inter-assistente).

Resolve também o **ORQ-01** (recepção encaminha de verdade em vez de só instruir) e dá base ao **FEAT-01/02** reusando o que já existe.

## 2. Decisões de design (do brainstorming)

1. **Execução híbrida:** leitura executa direto; **escrita** mostra um cartão de ação e só grava após **Confirmar** do usuário.
2. **Sem escalonamento de privilégio:** a execução de escrita roda com a **identidade do usuário** (JWT), respeitando RLS/RBAC. Se o cargo não puder fazer a ação, ela é **encaminhada como pendência ao Admin** (não é executada à força).
3. **Abordagem A — function-calling nativo:** adicionar `tools`/`tool_calls` ao `callLLM`, com um loop de ferramentas no estado `executing_n3`.
4. **Isolamento da redação:** só agentes operacionais recebem ferramentas; redatores de peça (caminho segmentado de 5 blocos) ficam **intocados**.

## 3. Arquitetura

### 3.1 Habilitação por agente
- Nova coluna `agents.allowed_tools text[] default '{}'`.
- Agente com `allowed_tools` vazio → **nunca** entra no loop de ferramentas (comportamento atual preservado).
- Seed inicial: `assistant_root` (todas as ferramentas v1); recepção/triagem (`cadastrar_cliente` + consultas).

### 3.2 Loop de ferramentas (estado `executing_n3`, ramo de chamada única)
O ramo de chamada única (`max_tokens < SEGMENT_MIN_MAX_TOKENS`) é onde caem os agentes não-redatores. Quando o agente tem `allowed_tools`:

```
loop (teto de N iterações de leitura, ex.: 4):
  r = callLLM(..., tools = catálogo do agente)
  se r tem tool_calls:
    para cada chamada:
      - LEITURA  → executa agora (service-role, só SELECT), anexa resultado como mensagem `tool`, continua o loop
      - ESCRITA  → NÃO grava: monta proposta, salva em pending_actions, status do run = `awaiting_confirmation`, emite cartão e PARA
  senão (conteúdo textual):
    finaliza como hoje (vira a resposta do assistente)
```

Mais de uma escrita numa volta → emite múltiplos cartões (uma confirmação por ação) ou um cartão agregado (decidir no plano; default: um cartão por ação).

### 3.3 Confirmação (cartão de ação)
1. Proposta de escrita → insere `chat_messages` com `metadata.kind = "action_proposal"`, payload `{ tool, args, resumo_humano, requer_admin?, rota_pendencia? }`; persiste em `orchestration_runs.pending_actions`; status `awaiting_confirmation`.
2. Frontend renderiza cartão (resumo legível + **Confirmar** / **Cancelar**).
3. **Confirmar** → chama o orquestrador em modo `confirm` com o **JWT do usuário**; executa a escrita com **client da identidade do usuário** (RLS/`auth.uid()` valem). Atualiza a mensagem para `action_done` + resultado. Confirmação textual via template (sem nova chamada LLM na v1).
4. **Cancelar** → marca `cancelled`; agente reconhece.
5. Idempotência: status já `executed` → reclique ignorado.

### 3.4 Permissões + roteamento de pendência
No momento de propor, checa RBAC do usuário (`is_master_admin(user_id)` / `role_task_matrix`, leitura service-role):
- **Pode** → cartão normal de confirmação.
- **Não pode** (ex.: recepção × `criar_card_tarefa`) → cartão vira **"Encaminhar ao Admin"**; ao confirmar, cria `create_inter_assistant_request` (ou `bottleneck_notifications`) para Admin/sócio aprovar. Linguagem honesta ("gerei a pendência para o Admin"), alinhada ao guardrail D (ORQ-02) e ao FEAT-02.

## 4. Catálogo de ferramentas (v1)

### Leitura (executa direto)
| Ferramenta | Alvo | Retorno |
|---|---|---|
| `consultar_cliente(busca)` | `clients` por nome/CPF | id, nome, cpf, status |
| `consultar_usuario(busca)` | usuários/perfis por nome | user_id, nome, cargo (resolve "para a Laura") |
| `consultar_tarefas(filtro)` | `user_tasks` | cards por cliente/responsável/status |
| `consultar_processo(busca)` | `processes` | dados do processo |
| `consultar_documentos(client_id)` | `client_documents` | lista de documentos |

### Escrita (propõe → confirma)
| Ferramenta | Caminho de escrita | Args principais |
|---|---|---|
| `cadastrar_cliente` | insert `clients` (`created_by` = usuário) | full_name (obrig.), cpf?, tipo_pessoa?, email?, phone?, … |
| `criar_card_tarefa` | RPC `create_user_task` | title, responsavel→assignee_user_id, prazo→deadline_at, area, prioridade, client_id, descricao |
| `solicitar_documentos` | RPC `create_inter_assistant_request` (`solicitar_documentacao`) | para→to_user_id, client_id, documentos[] |
| `pedir_acesso_arquivos` | RPC `create_inter_assistant_request` (`pedir_acesso_a_arquivos`) | para→to_user_id, descricao, motivo |

Resolução de nomes (ex.: responsável do card) é feita por `consultar_usuario` dentro do loop antes de propor a escrita; ambiguidade → o agente pergunta.

## 5. Mudanças de schema (aditivas)

- `agents.allowed_tools text[] default '{}'` + seed.
- `orchestration_runs.pending_actions jsonb` (+ status textual `awaiting_confirmation`).
- Nova tabela de auditoria `agent_actions`:
  `id, run_id, session_id, user_id, agent_id, tool, args jsonb, status (proposed|confirmed|executed|failed|cancelled|routed_pendencia), result jsonb, created_at, executed_at`.
  RLS: usuário vê as próprias; Admin vê todas. Alimenta auditoria/KPIs de "ações do chat".

Nenhuma tabela de negócio nova: as 4 ações reusam `clients`, `user_tasks`, `inter_assistant_requests`, `bottleneck_notifications`. **Pendência = `user_tasks`** em quadro de pendências.

## 6. `callLLM` — suporte a tools

- Adicionar `tools` (e parsing de `tool_calls`) ao corpo da requisição em `callOpenAICompatible`, para OpenAI e OpenRouter/Anthropic (ambos suportam).
- Não-streaming no loop de ferramentas (o streaming atual de texto fica para a resposta final).
- Fallback: modelo sem suporte a tools → modo sem ferramentas (degrada com aviso, não quebra).

## 7. Erros + testes

**Erros:** falha de ferramenta → cartão mostra erro, sem gravação parcial (cada ação = 1 insert/RPC); teto de iterações de leitura; idempotência na confirmação.

**Testes (vitest):**
- Validação de argumentos de cada ferramenta.
- Decisão de roteamento RBAC (pode → confirma; não pode → pendência).
- Agente redator **nunca** recebe `tools`.
- `mechanicalValidator` intocado (regressão).
- Parse de `tool_calls` (mock do provedor).

## 8. Fora de escopo (v1) — registrado para depois
- Colunas/estados de pendência espelhando o ProJuris (FEAT-03).
- Transferência automática completa "resolver → devolver ao gerador" (FEAT-02 pleno).
- Resumo pós-confirmação gerado por LLM.
- Failover de provedor / alerta de saldo (INFRA-01).
- LLM Council (STRAT-01).

## 9. Critérios de aceite (v1)
1. No chat, "consulte a ficha do cliente X" retorna dados reais de `clients` (leitura, sem confirmação).
2. "Cadastre o cliente Y (CPF…)" → cartão de confirmação → ao confirmar, registro existe em `clients` com `created_by` = usuário.
3. "Crie um card para a Laura, prazo sexta, revisar peça" (como Admin) → card real em `user_tasks` após confirmar.
4. Mesmo pedido como **recepção** → cartão "Encaminhar ao Admin" → gera pendência/solicitação, **não** cria o card direto.
5. "Solicite RG e comprovante ao assistente de Z" → `inter_assistant_request` criado após confirmar.
6. Toda ação de escrita fica registrada em `agent_actions`.
7. Geração de peças (redatores) continua idêntica — nenhum agente redator recebe ferramentas.
