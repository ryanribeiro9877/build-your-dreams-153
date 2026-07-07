# Design — Organograma de Marketing (Onda 1: criativo + inteligência consultiva)

> **Data:** 2026-06-19 · **Autor:** Claude (sessão com Ryan) · **Status:** aprovação pendente
> **Origem:** porte do organograma de marketing da Legal É Viver (tenant 161, plataforma
> `bot.zanetti.app.br`) descrito em `DOC_Agentes_Marketing_LEV.md`, trazido para dentro do
> próprio JurisAI/Cohapm. Esta é a **Onda 1**, escopo enxuto e 100% funcional sem ferramentas.

---

## 1. Contexto e decisão de escopo

A documentação de origem descreve **49 agentes** de marketing distribuídos em 4 níveis,
operando sobre **3 MCPs** (58 = BD interno LEV, 62 = Meta Ads, 63 = TikTok Ads) + `web.search`.

**O JurisAI não tem nada disso hoje:**
- O `chat-orchestrator` (2041 linhas) **não tem tool-use** — zero menção a tools/MCP
  (gap conhecido no `AGENTS.md`: *"Sem tool-use no chat-orchestrator. É o resto da Onda 3"*).
- Não há conexão com Meta Ads, TikTok nem um BD de marketing.

**Consequência:** ~metade dos 49 agentes (monitores de campanha, ROAS, budget, publicadores,
funil) dependem de ferramentas inexistentes — virariam cascas inertes. A outra metade — a
**fábrica criativa** — funciona 100% sem ferramenta, porque o trabalho dela é **gerar**, não
**ler dado ao vivo**. A própria doc recomenda *"comece enxuto"* (D.5.2).

**Decisões tomadas com o usuário (brainstorming):**
1. **Natureza:** agentes criativos/consultivos (puro LLM). Sem campanhas ao vivo.
2. **Roster:** núcleo criativo + um punhado de consultivos.
3. **Nomeação:** lista completa proposta de uma vez, ajustada pelo usuário.
4. **Acesso:** somente `tech` e `admin`.
5. **Arquitetura de integração:** **workspace compartilhado sob um dono de serviço**
   (isolado do jurídico pelo dono do agente de entrada). Aprovado sobre as alternativas
   "provisão pessoal + escopo de org" e "chat avulso sem delegação".

---

## 2. Objetivos e não-objetivos

### Objetivos
- Disponibilizar, **só para tech/admin**, um organograma de marketing chat-able que produz
  copy de anúncios, scripts, CTAs, variações A/B, diretrizes de arte e análises consultivas.
- Reusar a orquestração N1→N2→N3 existente **sem reescrevê-la**.
- Isolar o marketing do jurídico (zero contaminação de roteamento nas duas direções).
- Ser idempotente e não-destrutivo (migrações re-executáveis; nada do jurídico é tocado).

### Não-objetivos (ficam para ondas futuras)
- Tool-use / MCP (Meta Ads, TikTok, BD de marketing).
- Agentes de monitoramento ao vivo, ROAS, budget, publicadores de campanha.
- CRONs de supervisão automática.
- Loop fechado fadiga→reescrita→republicação.
- Externalizar o contexto de negócio para uma KB versionada (no v1 vai num bloco de prompt).

---

## 3. Arquitetura

### 3.1 Os 3 níveis reais do orquestrador
O `chat-orchestrator` só roteia em 3 níveis: `assistant_root` (N1) → `director` (N2) →
`specialist`/`monitor`/`executor` (N3). **Não existe nível "manager" no chat** (seria órfão).
Mapeamento adotado:

| Camada conceitual | Papel no enum `agent_role` | Qtd |
|---|---|---|
| Diretor de Marketing (entrada/roteador) | `assistant_root` | 1 |
| Gerência (a célula) | `director` | 1 |
| Executores | `specialist` | 9 |

### 3.2 Isolamento por dono de serviço
A cadeia de orquestração é montada pelo **dono do agente de entrada**
(`chat-orchestrator/index.ts:1985` → `agent.owner_user_id || session.user_id`), e
`loadSubAgents(owner, roles)` carrega os sub-agentes **daquele dono**. Portanto:

- Criamos **um usuário de serviço** (ex.: `marketing@cohapm.com.br` / display "Marketing — Serviço")
  via a Admin API do Supabase (padrão já usado em `scripts/create-admin-user.mjs`), **não via SQL
  cru** e **sem fluxo de convite de funcionário**. Esse usuário **nunca conversa** — só **possui**
  os 11 agentes.
- Como `agents.owner_user_id` é FK obrigatória → `auth.users(id)`, o dono precisa ser real;
  o usuário de serviço satisfaz isso.
- Resultado: quando tech/admin abrem conversa entrando pelo **Diretor de Marketing**
  (assistant_root do serviço), a cadeia carrega só os agentes do serviço → **isolado** do
  jurídico. E quando conversam pelo seu assistant_root pessoal (jurídico), a cadeia carrega só
  os agentes pessoais → o marketing **não aparece**. Isolamento natural, sem código.

### 3.3 Por que `start_chat_session` aceita um agente de outro dono
`start_chat_session` (`20260524120000_onda2_chat_orchestrator.sql:325`) é `SECURITY DEFINER` e
**não checa dono do agente de entrada** — valida apenas que o agente existe/está ativo e que o
**usuário que chama** (tech/admin) tem chave do provider em `llm_provider_configs` (BYOK).
A sessão é criada com `user_id = auth.uid()` (o humano) e `entry_agent_id` = o Diretor de
Marketing (do serviço). Confirmado de ponta a ponta.

---

## 4. Modelo de dados

### 4.1 Nova coluna `agents.access_scope`
```sql
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS access_scope text;
-- NULL = comportamento atual; 'marketing' = visível só a tech/admin.
CREATE INDEX IF NOT EXISTS idx_agents_access_scope ON public.agents (access_scope);
```

### 4.2 RLS — acesso só tech/admin (substitui a policy de SELECT, idempotente)
```sql
DROP POLICY IF EXISTS agents_select_isolated ON public.agents;
CREATE POLICY agents_select_isolated ON public.agents
  FOR SELECT
  USING (
    (access_scope = 'marketing'
      AND (has_role(auth.uid(), 'tech'::app_role) OR has_role(auth.uid(), 'admin'::app_role)))
    OR
    (access_scope IS DISTINCT FROM 'marketing' AND (
        is_personal = false
        OR owner_user_id = auth.uid()
        OR (is_personal = true AND has_role(auth.uid(), 'tech'::app_role))
    ))
  );
```
- Comportamento de **todos os agentes não-marketing fica idêntico** ao de hoje.
- Agentes de marketing (`access_scope='marketing'`) visíveis **só a tech + admin** + (implicitamente)
  ao próprio dono de serviço (que não loga).
- **INSERT/UPDATE/DELETE permanecem como estão** (gestão de config = `tech`). Admin **usa**, não edita.
  *(decisão: "só o acesso técnico edita prompt/provider" — consistente com `tech_access_and_crons`.)*

### 4.3 Departamentos `mkt_*` e faixa `external_id` 6000–6999
Faixas já usadas: legado 0–406, jurídico 5000–5999. **Marketing reserva 6000–6999.**
Seed idempotente: `DELETE FROM agents WHERE external_id BETWEEN 6000 AND 6999` +
`DELETE FROM departments WHERE name LIKE 'mkt\_%'` antes de recriar.

Departamentos:
- `mkt_direcao` — Marketing · Direção
- `mkt_criacao` — Marketing · Criação e Inteligência

---

## 5. Os 11 agentes

Provider = `openai` (BYOK). Modelos por nível conforme `AGENTS.md` (**NUNCA gpt-5.5**):
roteadores em `gpt-4o-mini`, executores em `gpt-4o`. `provider` **e** `model` setados
explicitamente (o `start_chat_session` lê a coluna `provider`).

| ext_id | Nome de exibição | role | dept | model | temp | reports_to |
|---|---|---|---|---|---|---|
| 6000 | **Diretor de Marketing** | assistant_root | mkt_direcao | gpt-4o-mini | 0.3 | — |
| 6001 | **Gerência de Marketing** | director | mkt_direcao | gpt-4o-mini | 0.3 | 6000 |
| 6010 | Copywriter de Anúncios Meta | specialist | mkt_criacao | gpt-4o | 0.7 | 6001 |
| 6011 | Copywriter de Anúncios TikTok | specialist | mkt_criacao | gpt-4o | 0.7 | 6001 |
| 6012 | Diretor de Arte | specialist | mkt_criacao | gpt-4o | 0.6 | 6001 |
| 6013 | Roteirista de Vídeo | specialist | mkt_criacao | gpt-4o | 0.7 | 6001 |
| 6014 | Estrategista de CTA | specialist | mkt_criacao | gpt-4o | 0.6 | 6001 |
| 6015 | Gerador de Variações A/B | specialist | mkt_criacao | gpt-4o | 0.7 | 6001 |
| 6016 | Analista de Posicionamento | specialist | mkt_criacao | gpt-4o | 0.4 | 6001 |
| 6017 | Leitor de Tendências do Consignado | specialist | mkt_criacao | gpt-4o | 0.4 | 6001 |
| 6018 | Consolidador de Relatório de Marketing | specialist | mkt_criacao | gpt-4o | 0.3 | 6001 |

> Os 9 specialists vivem num **pool único** (o orquestrador não filtra N3 pela gerência
> escolhida). Com 1 só gerência isso é irrelevante — a "Gerência de Marketing" roteia todos.

### 5.1 Atributos comuns
- `is_personal = false`, `access_scope = 'marketing'`, `owner_user_id = <usuário de serviço>`,
  `status='active'`, `memory_enabled` conforme nível (routers ON, specialists ON),
  `history_limit` 10–20, `max_tokens` **< `SEGMENT_MIN_MAX_TOKENS`** (mantém o N3 em chamada
  única, fora do modo segmentado de peça longa).

### 5.2 Bloco de contexto compartilhado (vai em todo system_prompt)
Perfil-base fiel à doc de origem:
> Legal É Viver — plataforma digital intermediária de **crédito consignado CLT** (não é banco);
> conecta CLT de 21–65 anos a bancos parceiros (Presença, UY3, V8); 100% online; ticket médio
> ~R$ 800; canais site/WhatsApp/lote. **Narrativas:** Padrão · Curiosidade · Urgência ·
> Escassez · Reimpacto. **Compliance de anúncio financeiro:** nunca prometer aprovação garantida,
> taxa fora de faixa, nem usar gatilho enganoso; respeitar políticas Meta/TikTok para serviços
> financeiros.

### 5.3 Função resumida de cada executor (system_prompt)
- **Copywriter Meta** — copy de Facebook/Instagram Ads por etapa de funil × narrativa, com headline,
  corpo e CTA; justificativa curta da escolha de narrativa.
- **Copywriter TikTok** — copy nativa/informal; conhece formatos (In-Feed: hook nos 2s, ~150 chars,
  9:16; Spark Ads; TopView 60s).
- **Diretor de Arte** — diretrizes visuais (paleta, tipografia, layout, identidade) por canal e
  etapa, com referências do mercado financeiro. **Não inventa imagem; descreve direção.**
- **Roteirista de Vídeo** — scripts 15–60s na estrutura gancho(3s)→problema(5s)→solução(10s)→CTA(3s),
  adaptados por plataforma (TikTok informal, Meta institucional).
- **Estrategista de CTA** — CTAs otimizados por etapa × canal × narrativa; aponta lacunas de cobertura.
- **Gerador de Variações A/B** — 2–3 variações testáveis de um texto-base, cada uma com **hipótese**
  ("deve converter mais porque…") + métrica sugerida.
- **Analista de Posicionamento** — compara LEV vs concorrentes (consultivo, com base no que o usuário
  fornecer + conhecimento do modelo); **rotula claramente** o que é estimativa, não dado ao vivo.
- **Leitor de Tendências do Consignado** — lê tendências do setor (INSS/Dataprev, fintechs, regulação,
  políticas Meta/TikTok); classifica impacto ALTO/MÉDIO/BAIXO + ação sugerida; **rotula como consultivo**.
- **Consolidador de Relatório** — resume o que foi produzido na conversa em um sumário executivo;
  **não calcula métrica que não recebeu** (anti-alucinação: faltou dado → `[SEM DADOS]`).

---

## 6. Alteração no orquestrador (única, defensiva — não é reescrita)

O caminho `executing_n3` hoje injeta documentos de caso, modelos de referência, regras de redação
de peça e roda o **validador mecânico** (jurídico). Para marketing isso é, na prática, inofensivo
(sem anexos, sem `agent_document_links`), **exceto o validador mecânico**, que pode reprovar
conteúdo que não seja peça jurídica.

**Guarda a implementar:** rodar validador mecânico + regras de redação + injeção de
`acao_tipo`/modelos **somente quando** o run for jurídico (há `caseDocs`, ou `acao_tipo` de redação
de peça, ou modelos vinculados ao agente). Caso contrário, o N3 roda **limpo**: `system_prompt` do
agente + histórico + mensagem. É uma **guarda condicional**, não muda o fluxo jurídico existente.

> ⚠️ **A verificar na implementação:** ler `mechanicalValidator.ts` e o trecho de validação
> (~`index.ts:1842`) para confirmar onde a guarda entra e que o caminho jurídico segue idêntico.

`ROUTING_INTENT_RULES` (jurídico) continua sendo injetado no `chooseSpecialist` — ruído inofensivo
no v1 (a escolha sai pela descrição do specialist; eventual `acao_tipo` espúrio não tem efeito sem
modelos vinculados). Tornar as regras de roteamento "org-aware" fica para onda futura.

---

## 7. Frontend (entrada só para tech/admin)

`JurisCloudOS.tsx` auto-seleciona o `assistant_root` pessoal como entrada (`:683-687`). Adicionar,
**condicionado a tech/admin**, um modo de abrir conversa com o **Diretor de Marketing** (ext 6000):
- Os agentes de marketing já aparecem na query de agentes para tech/admin (RLS permite).
- Um seletor/toggle "Marketing" (ou item na lista de assistentes) seta `entryAgentId` = id do
  Diretor de Marketing; `startSession` cria a sessão sobre ele e a cadeia delega isolada.
- Para usuários não-tech/non-admin, **nada muda** (não veem os agentes nem a entrada).

Escopo de UI mínimo no v1: tornar o Diretor de Marketing selecionável como entrada para tech/admin.
Refinamentos visuais (seção própria, ícone/cor de hierarquia) são incrementais.

---

## 8. Pré-requisitos operacionais
- **BYOK:** tech e admin precisam de uma chave **OpenAI** ativa em `llm_provider_configs`
  (`start_chat_session` exige; o orquestrador resolve a chave do usuário que chama).
- Usuário de serviço de marketing criado via Admin API (script dedicado, padrão do repo).

---

## 9. Migrações previstas (ordem)
1. `scripts/create-marketing-service-user.mjs` — cria o usuário de serviço via Admin API
   (e-mail fixo, ex.: `marketing@cohapm.com.br`; senha aleatória descartável; idempotente:
   se já existir, só retorna o UUID). **Roda antes das migrações de seed.**
2. `20260619xxxxxx_marketing_access_scope.sql` — coluna `access_scope` + índice + nova policy SELECT.
3. `20260619xxxxxx_marketing_seed_organograma.sql` — departamentos `mkt_*` + 11 agentes
   (idempotente, faixa 6000–6999). **Resolve o `owner_user_id` por lookup em `auth.users`**
   (`SELECT id FROM auth.users WHERE email = 'marketing@cohapm.com.br'`); se não encontrar,
   `RAISE EXCEPTION` clara ("rode create-marketing-service-user.mjs primeiro"). Sem UUID hardcoded.

Code:
- `supabase/functions/chat-orchestrator/index.ts` — guarda condicional da seção 6.
- `src/components/JurisCloudOS.tsx` (+ hook de workspace se necessário) — entrada de marketing
  para tech/admin.

Pós:
- Regenerar `src/integrations/supabase/types.ts`.
- `npx vite build` + `npx tsc --noEmit -p tsconfig.app.json` antes de entregar.
- Atualizar `AGENTS.md` (seções 6 e 7).

---

## 10. Riscos e mitigações
| Risco | Mitigação |
|---|---|
| Validador mecânico jurídico reprova copy de marketing | Guarda condicional (seção 6); verificar caminho na implementação |
| Usuário de serviço via SQL viola convenção #11 | Criado via Admin API (script), não SQL cru; não é funcionário |
| tech/admin sem chave OpenAI → chat não inicia | Pré-requisito documentado; erro legível já existe (`provider_not_configured`) |
| `access_scope` quebra visibilidade de agentes legados | Policy preserva caminho `IS DISTINCT FROM 'marketing'` idêntico ao atual |
| Pool único de N3 mistura consultivos com criativos | Aceitável no v1 (1 gerência); roteamento org-aware fica para depois |
| Contexto de negócio hardcoded no prompt | Aceito no v1; externalizar para KB é não-objetivo desta onda |

---

## 11. Critérios de aceite
- [ ] 11 agentes de marketing semeados na faixa 6000–6999, `access_scope='marketing'`,
      donos = usuário de serviço.
- [ ] tech e admin **veem** e conseguem **abrir conversa** com o Diretor de Marketing;
      usuário comum **não vê** nenhum agente de marketing.
- [ ] Conversa real: Diretor de Marketing → Gerência de Marketing → specialist correto →
      resposta (ex.: "me escreva 3 variações de copy Meta para consignado" → Copywriter Meta /
      Gerador de Variações A/B), run = `done`.
- [ ] Cadeia jurídica **inalterada** (o marketing não aparece no pool pessoal; o jurídico não
      aparece no pool de marketing).
- [ ] Validador mecânico **não reprova** saída de marketing.
- [ ] `vite build` e `tsc --noEmit` limpos; `types.ts` regenerado.

---

## 12. Fora de escopo / ondas futuras (registro)
- Tool-use + MCPs (Meta/TikTok/BD) e os ~38 agentes que dependem deles.
- CRONs de supervisão e relatório de topo.
- Loop fechado fadiga→reescrita→republicação.
- Roteamento org-aware (regras de intenção por organograma) e KB de contexto versionada.
