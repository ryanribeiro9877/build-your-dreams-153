# Relatório Técnico — Separação de rotas por privacidade (tech × admin)

**Data:** 2026-07-02
**Branch:** `claude/route-privacy-naming-ljtum3`
**Escopo aprovado:** renomear rotas por nível de privacidade (com redirect das antigas), corrigir referências/mensagens no código e **auditar** as políticas de acesso do back-end (RLS) sem alterá-las.

---

## 1. Problema

As rotas `/admin/agentes`, `/admin/agentes/:id`, `/admin/crons` e `/admin/importar` viviam sob o prefixo `/admin/*`, sugerindo que eram **administrativas**. Na prática elas são **tech-only**: protegidas pelo guard `TechRoute` e liberadas apenas para o papel `tech` (o acesso técnico do desenvolvedor), não para administradores/sócios/diretores.

Além disso, a rota de configuração de provedores (`/configuracoes/providers`) também é tech-only, mas estava nomeada como se fosse uma configuração genérica.

Esse descasamento entre **URL** e **privacidade real** confundia a leitura do sistema: um `/admin/*` que o admin não acessa, e um `/configuracoes/*` que só o tech vê.

---

## 2. O que foi feito

### 2.1 Novo prefixo `/tech/*` para tudo que é tech-only

As rotas passaram a ser nomeadas conforme a privacidade real. O guard (`TechRoute`) não mudou — apenas o caminho:

| Antes (URL) | Depois (URL) | Guard | Papel exigido |
|---|---|---|---|
| `/admin/agentes` | `/tech/agentes` | `TechRoute` | `tech` |
| `/admin/agentes/:id` | `/tech/agentes/:id` | `TechRoute` | `tech` |
| `/admin/crons` | `/tech/crons` | `TechRoute` | `tech` |
| `/admin/importar` | `/tech/importar` | `TechRoute` | `tech` |
| `/configuracoes/providers` | `/tech/providers` | `TechRoute` | `tech` |

As rotas de fato administrativas foram **mantidas** sob `/admin/*` (coerentes com `AdminRoute`/`MasterRoute`):

| URL | Guard | Papéis |
|---|---|---|
| `/admin` | `AdminRoute` | admin / director / socio |
| `/admin/funcionarios` | `AdminRoute` | admin / director / socio |
| `/admin/tokens` | `AdminRoute` | admin / director / socio |
| `/admin/ui` | `AdminRoute` | admin / director / socio |
| `/admin/notificacoes` | `AdminRoute` | admin / director / socio |
| `/admin/master` | `MasterRoute` | master |

Resultado: o prefixo da URL agora reflete a privacidade — `/tech/*` = técnico, `/admin/*` = administrativo, `/admin/master` = master.

### 2.2 Redirects de compatibilidade (sem links quebrados)

Os caminhos antigos continuam funcionando: cada um redireciona (`replace`) para o novo destino em `/tech/*`, preservando bookmarks e links legados (inclusive mensagens de erro antigas que possam ter sido copiadas).

```
/admin/agentes          → /tech/agentes
/admin/agentes/:id      → /tech/agentes/:id   (parâmetro :id preservado)
/admin/crons            → /tech/crons
/admin/importar         → /tech/importar
/configuracoes/providers→ /tech/providers
```

Para preservar o `:id` do agente no redirect (o `<Navigate>` puro não interpola parâmetros), foi adicionado um pequeno componente `RedirectWithParams` em `src/App.tsx`.

### 2.3 Atualização de todas as referências internas

Todos os pontos que navegavam para os caminhos antigos foram atualizados para o novo prefixo:

| Arquivo | Referências atualizadas |
|---|---|
| `src/App.tsx` | Definição das rotas + redirects de compat + `RedirectWithParams` |
| `src/components/JurisCloudOS.tsx` | Itens de menu (Agentes, Crons, Providers, Importar) + mensagem de erro "nenhum agente configurado" |
| `src/components/juris-cloud/JurisSidebar.tsx` | "Configurar agente" (dropdown do agente) |
| `src/components/juris-cloud/JurisTopBar.tsx` | CTA de onboarding "Configurar agora" |
| `src/components/juris-cloud/types.ts` | Comentário do campo `uuid` |
| `src/pages/Admin.tsx` | Botão "Agentes IA" |
| `src/pages/AgentDetail.tsx` | 4 `navigate()` (voltar/desativar/excluir) + docstring |
| `src/pages/AgentsAdmin.tsx` | Botão "Provedores" + abrir detalhe do agente |
| `src/pages/ChatWithAgent.tsx` | CTA "Configurar" |
| `src/pages/ProvidersConfig.tsx` | Docstring |
| `src/hooks/useChatOrchestrator.tsx` | 2 mensagens de erro (chave inválida / modelo inexistente) |

Verificação: `grep` por `/admin/agentes`, `/admin/crons`, `/admin/importar` e `/configuracoes/providers` em `src/` retorna **apenas** as linhas de redirect/comentário intencionais em `App.tsx`.

---

## 3. Auditoria de privacidade do back-end (RLS)

Conforme o escopo aprovado, **as políticas existentes não foram alteradas** — apenas auditadas. Conclusão: o back-end **já** implementa o modelo de privacidade correto. O descasamento era exclusivamente de **nomenclatura de URL**, não de controle de acesso.

### 3.1 Configuração compartilhada, gated por papel `tech`

| Tabela | Política | Efeito |
|---|---|---|
| `cron_jobs` | `Tech manage cron_jobs` (`FOR ALL`, `has_role(uid,'tech')`) | Apenas o papel `tech` lê e gerencia as crons. |
| `agents` (escrita) | `Tech manage agents` / `agents_update` / `agents_delete` | Escrita exclusiva do `tech` (ou dono do agente pessoal). |
| `departments` | `Tech manage departments` | Escrita exclusiva do `tech`. |
| `agent_permissions` | `Tech manage agent_permissions` | Escrita exclusiva do `tech`. |

Migração de referência: `20260529170100_tech_access_and_crons.sql` e `20260618105547_agents_rls_admin_restrito_acesso_global_so_tech.sql`.

### 3.2 Dados **privados e únicos por usuário** (owner-only)

O material sensível já é isolado por `auth.uid()` — cada usuário só enxerga o que é seu:

| Tabela | Política | Isolamento |
|---|---|---|
| `llm_provider_configs` (chaves BYOK — página `/tech/providers`) | `Owners view/insert/update/delete own provider configs` | `user_id = auth.uid()` em SELECT/INSERT/UPDATE/DELETE — **cada usuário só vê e gerencia as próprias chaves de API**. |
| `chat_sessions` | `Owners ... own chat sessions` | `user_id = auth.uid()` (SELECT com leitura adicional p/ admin). |
| `chat_messages` | `Owners ... own chat messages` | `user_id = auth.uid()` (SELECT com leitura adicional p/ admin). |
| `agents` pessoais | `agents_select_isolated` | `owner_user_id = auth.uid()`; agentes pessoais de terceiros só visíveis ao `tech`. |

Migração de referência: `20260524120000_onda2_chat_orchestrator.sql`.

### 3.3 Importação de dados (`/tech/importar`)

O fluxo de importação insere clientes com `created_by` do usuário autenticado e faz dedup idempotente por CPF (ver `RELATORIO_Pendencias_Internas_2026-06-30.md`). O acesso à página é gated por `tech` no front (`TechRoute`).

### 3.4 Recomendações (não aplicadas — fora do escopo aprovado)

1. **Renomear as policies** de `agents`/`departments` para deixar explícito o papel (`Tech manage ...` já é claro; ok).
2. Se no futuro se desejar isolar **crons por usuário** (owner-only em vez de tech-compartilhado), seria necessária uma migração alterando `cron_jobs` para `created_by = auth.uid()` — mudança semântica que **não** foi feita porque crons são configuração de sistema compartilhada entre o time tech.
3. Considerar leitura de `cron_jobs`/`agents` também restrita a `tech` no SELECT caso haja requisito de ocultar totalmente a existência dessas configs de outros papéis (hoje o SELECT de `agents` não-pessoais é aberto para leitura).

---

## 4. Verificação

| Verificação | Resultado |
|---|---|
| `npx tsc --noEmit` | ✅ sem erros |
| `npm run build` (vite) | ✅ build concluído |
| `grep` de caminhos antigos em `src/` | ✅ apenas redirects/comentários intencionais |
| Redirects de compat | ✅ 5 caminhos antigos → novos `/tech/*` |
| Políticas RLS | ✅ auditadas, inalteradas |

---

## 5. Resumo

- **Nomenclatura corrigida:** tudo que é tech-only agora vive sob `/tech/*`; o que é administrativo permanece sob `/admin/*` (e `/admin/master` para master). URL passa a refletir a privacidade real.
- **Sem quebra:** caminhos antigos redirecionam para os novos.
- **Back-end:** já estava privatizado corretamente — chaves de API e conversas são owner-only por `auth.uid()`; agentes/crons/departamentos são gated por papel `tech`. Nenhuma alteração de RLS foi necessária (nem feita, conforme escopo).
