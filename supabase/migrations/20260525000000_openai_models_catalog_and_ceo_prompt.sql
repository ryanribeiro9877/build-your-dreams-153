-- ============================================================
-- LexForce — Catálogo completo de modelos OpenAI + prompt do CEO
--
-- 1) Faz upsert de TODOS os modelos OpenAI atualmente disponíveis
--    no /v1/models (Maio 2026), do mais novo (gpt-5.5) ao mais antigo
--    (gpt-4o). Os preços estão em USD por 1M tokens conforme a tabela
--    pública da OpenAI.
--
-- 2) Configura o CEO LexForce como AGENTE MODERADOR/DELEGADOR:
--    todo input do usuário chega nele primeiro; ele responde direto
--    se for uma decisão de CEO, ou explicitamente delega ao agente
--    correto (estilo bot.zanetti).
-- ============================================================

-- ---------- 1) Catálogo OpenAI ----------
-- Tabela model_pricing tem: id (uuid), provider, model_id, display_name,
-- tier, input_price_per_mtok, output_price_per_mtok, context_window,
-- max_output_tokens, supports_tools, is_active.

INSERT INTO public.model_pricing
  (provider, model_id, display_name, tier, input_price_per_mtok, output_price_per_mtok, context_window, max_output_tokens, supports_tools, is_active)
VALUES
  -- ========== GPT-5.5 (flagship — Abril 2026) ==========
  ('openai', 'gpt-5.5',               'GPT-5.5 · flagship',          'flagship',  5.00,  30.00, 1000000, 16384, true, true),
  ('openai', 'gpt-5.5-pro',           'GPT-5.5 Pro · max quality',   'flagship', 30.00, 180.00, 1000000, 16384, true, true),

  -- ========== GPT-5.4 ==========
  ('openai', 'gpt-5.4',               'GPT-5.4 · flagship',          'flagship',  2.50,  15.00,  400000, 16384, true, true),
  ('openai', 'gpt-5.4-pro',           'GPT-5.4 Pro · max quality',   'flagship', 30.00, 180.00,  400000, 16384, true, true),
  ('openai', 'gpt-5.4-mini',          'GPT-5.4 mini · balanced',     'balanced',  0.75,   4.50,  400000,  8192, true, true),
  ('openai', 'gpt-5.4-nano',          'GPT-5.4 nano · ultra-cheap',  'fast',      0.20,   1.25,  128000,  4096, true, true),

  -- ========== GPT-5.3 ==========
  ('openai', 'gpt-5.3-codex',         'GPT-5.3 Codex · code',        'balanced',  1.75,  14.00,  256000,  8192, true, true),

  -- ========== GPT-5.2 ==========
  ('openai', 'gpt-5.2',               'GPT-5.2 · balanced',          'balanced',  1.75,  14.00,  256000,  8192, true, true),
  ('openai', 'gpt-5.2-codex',         'GPT-5.2 Codex · code',        'balanced',  1.75,  14.00,  256000,  8192, true, true),
  ('openai', 'gpt-5.2-pro',           'GPT-5.2 Pro · max quality',   'flagship', 21.00, 168.00,  256000,  8192, true, true),

  -- ========== GPT-5.1 ==========
  ('openai', 'gpt-5.1',               'GPT-5.1 · balanced',          'balanced',  1.25,  10.00,  256000,  8192, true, true),
  ('openai', 'gpt-5.1-codex',         'GPT-5.1 Codex · code',        'balanced',  1.25,  10.00,  256000,  8192, true, true),
  ('openai', 'gpt-5.1-codex-max',     'GPT-5.1 Codex Max · code',    'flagship',  1.25,  10.00,  256000,  8192, true, true),

  -- ========== GPT-5 ==========
  ('openai', 'gpt-5',                 'GPT-5 · balanced',            'balanced',  1.25,  10.00,  256000,  8192, true, true),
  ('openai', 'gpt-5-codex',           'GPT-5 Codex · code',          'balanced',  1.25,  10.00,  256000,  8192, true, true),
  ('openai', 'gpt-5-mini',            'GPT-5 mini · fast',           'fast',      0.25,   2.00,  128000,  8192, true, true),
  ('openai', 'gpt-5-nano',            'GPT-5 nano · ultra-cheap',    'fast',      0.05,   0.40,  128000,  4096, true, true),
  ('openai', 'gpt-5-pro',             'GPT-5 Pro · max quality',     'flagship', 15.00, 120.00,  256000,  8192, true, true),

  -- ========== Reasoning (o-series) ==========
  ('openai', 'o4-mini',               'o4-mini · reasoning fast',    'reasoning', 1.10,   4.40,  200000, 16384, true, true),
  ('openai', 'o4-mini-deep-research', 'o4-mini deep research',       'reasoning', 2.00,   8.00,  200000, 16384, true, true),
  ('openai', 'o3',                    'o3 · reasoning',              'reasoning', 2.00,   8.00,  200000, 16384, true, true),
  ('openai', 'o3-mini',               'o3-mini · reasoning fast',    'reasoning', 1.10,   4.40,  200000, 16384, true, true),
  ('openai', 'o3-pro',                'o3 Pro · max reasoning',      'reasoning',20.00,  80.00,  200000, 16384, true, true),
  ('openai', 'o3-deep-research',      'o3 deep research',            'reasoning',10.00,  40.00,  200000, 16384, true, true),
  ('openai', 'o1',                    'o1 · reasoning',              'reasoning',15.00,  60.00,  200000,  4096, false, true),
  ('openai', 'o1-mini',               'o1-mini · reasoning fast',    'reasoning', 1.10,   4.40,  128000,  4096, false, true),
  ('openai', 'o1-pro',                'o1 Pro · max reasoning',      'reasoning',150.00, 600.00, 200000,  8192, false, true),

  -- ========== GPT-4.1 family ==========
  ('openai', 'gpt-4.1',               'GPT-4.1 · long context',      'balanced',  2.00,   8.00, 1000000,  8192, true, true),
  ('openai', 'gpt-4.1-mini',          'GPT-4.1 mini · long ctx',     'fast',      0.40,   1.60, 1000000,  8192, true, true),
  ('openai', 'gpt-4.1-nano',          'GPT-4.1 nano · cheapest',     'fast',      0.10,   0.40,  128000,  4096, true, true),

  -- ========== GPT-4o (legado) ==========
  ('openai', 'gpt-4o',                'GPT-4o · multimodal',         'balanced',  2.50,  10.00,  128000,  4096, true, true),
  ('openai', 'gpt-4o-mini',           'GPT-4o mini · fast',          'fast',      0.15,   0.60,  128000, 16384, true, true)
ON CONFLICT (provider, model_id) DO UPDATE SET
  display_name           = EXCLUDED.display_name,
  tier                   = EXCLUDED.tier,
  input_price_per_mtok   = EXCLUDED.input_price_per_mtok,
  output_price_per_mtok  = EXCLUDED.output_price_per_mtok,
  context_window         = EXCLUDED.context_window,
  max_output_tokens      = EXCLUDED.max_output_tokens,
  supports_tools         = EXCLUDED.supports_tools,
  is_active              = EXCLUDED.is_active;

-- ---------- 2) Prompt do CEO LexForce ----------
-- O CEO é o ponto de entrada. Ele recebe tudo, analisa e:
--   • responde direto se for decisão estratégica/sumária
--   • delega explicitamente ao agente correto se precisar de execução
--
-- A delegação real é feita pela edge function `chat-orchestrator`
-- (deployada no Supabase). O prompt aqui orienta o estilo de resposta
-- pra ficar claro pro usuário quem está executando.

UPDATE public.agents
   SET system_prompt = $PROMPT$Você é o CEO LexForce, o agente que comanda toda a operação jurídica do escritório.

PRINCÍPIOS:
- Você NÃO é um chatbot genérico. Você é o moderador e orquestrador de uma força de trabalho de IA jurídica.
- Toda solicitação do usuário chega primeiro a você. Você decide se responde direto ou se delega.
- Sempre fale em primeira pessoa como "CEO LexForce" (não "OpenAI", "ChatGPT" etc.).
- Tom: profissional, direto, sem floreios. Português do Brasil.

QUANDO RESPONDER DIRETO:
- Perguntas estratégicas sobre o escritório, prioridades, decisões executivas.
- Resumos consolidados de operação.
- Esclarecimentos sobre quem faz o quê na hierarquia.
- Saudações e perguntas curtas ("oi", "tudo bem", "quem é você").

QUANDO DELEGAR (informe explicitamente ao usuário):
- Petição inicial / contestação / recurso → "Vou pedir para o Redator de Petições preparar isso."
- Cálculo de rescisão / liquidação / juros → "Vou acionar o Ger. de Cálculos."
- Pesquisa de jurisprudência ou consulta processual → "O Ger. Consulta Processual cuida disso."
- Marcar audiência / confirmar audiência → "Confirmação de Audiências vai resolver."
- Triagem de cliente novo / qualificação → "Agente de Triagem assume."
- Cobrança / contas a receber → "Ger. de Cobranças vai entrar em contato."
- Compliance / LGPD → "Ger. de Compliance valida."
- Marketing / conteúdo → "Diretor de Marketing dispara."

FORMATO DAS DELEGAÇÕES:
Quando delegar, use o padrão:
  "Anotado. Vou delegar isso para [AGENTE]. [breve explicação do que ele vai fazer]. Te aviso quando estiver pronto pra sua revisão."

CONTROLE FINAL:
- Você nunca promete prazo sem confirmar.
- Nunca protocola, envia e-mail ou fecha acordo sozinho — sempre devolve pro humano aprovar.
- Se a solicitação for inviável (fora do escopo jurídico, ilegal, antiética), recuse com clareza.

Pronto. Aguardo o usuário.$PROMPT$
 WHERE LOWER(role) = 'ceo'
    OR LOWER(name) LIKE 'ceo lexforce%';

-- ============================================================
-- Fim. Após rodar essa migração:
--   • A aba "Modelo" em /admin/agentes/:id passa a mostrar 31 modelos OpenAI.
--   • O CEO LexForce recebe um system_prompt explícito de delegação.
-- ============================================================
