-- ============================================================================
-- V15 — Cadastro de cliente no esquema do Projuris ADV (módulo "Pessoas")
-- Expande public.clients para cobrir todos os campos pedidos pelo Projuris no
-- cadastro de pessoa: Pessoa Física x Jurídica, identificação, filiação,
-- contatos múltiplos, endereço detalhado, dados bancários/PIX e origem.
-- Aditivo e idempotente: só ADD COLUMN IF NOT EXISTS (preserva dados existentes).
-- ============================================================================

ALTER TABLE public.clients
  -- Tipo / classificação
  ADD COLUMN IF NOT EXISTS tipo_pessoa        text NOT NULL DEFAULT 'fisica',  -- 'fisica' | 'juridica'
  ADD COLUMN IF NOT EXISTS client_origin      text,        -- origem/captação (indicação, ressaque, etc.)

  -- Pessoa Jurídica
  ADD COLUMN IF NOT EXISTS fantasy_name       text,        -- nome fantasia
  ADD COLUMN IF NOT EXISTS cnpj               text,
  ADD COLUMN IF NOT EXISTS ie                 text,        -- inscrição estadual
  ADD COLUMN IF NOT EXISTS im                 text,        -- inscrição municipal
  ADD COLUMN IF NOT EXISTS foundation_date    date,        -- data de fundação
  ADD COLUMN IF NOT EXISTS legal_rep_name     text,        -- representante legal
  ADD COLUMN IF NOT EXISTS legal_rep_cpf      text,

  -- Pessoa Física (identificação / filiação)
  ADD COLUMN IF NOT EXISTS rg_issuer          text,        -- órgão emissor do RG
  ADD COLUMN IF NOT EXISTS rg_uf              text,        -- UF do RG
  ADD COLUMN IF NOT EXISTS birth_date         date,        -- data de nascimento
  ADD COLUMN IF NOT EXISTS gender             text,        -- sexo/gênero
  ADD COLUMN IF NOT EXISTS marital_status     text,        -- estado civil
  ADD COLUMN IF NOT EXISTS nationality        text,        -- nacionalidade
  ADD COLUMN IF NOT EXISTS natural_city       text,        -- naturalidade (cidade)
  ADD COLUMN IF NOT EXISTS natural_uf         text,        -- naturalidade (UF)
  ADD COLUMN IF NOT EXISTS mother_name        text,        -- nome da mãe
  ADD COLUMN IF NOT EXISTS father_name        text,        -- nome do pai
  ADD COLUMN IF NOT EXISTS profession         text,        -- profissão
  ADD COLUMN IF NOT EXISTS pis_nit            text,        -- PIS/NIT (trabalhista/previdenciário)

  -- Contatos adicionais
  ADD COLUMN IF NOT EXISTS phone_commercial   text,        -- telefone comercial
  ADD COLUMN IF NOT EXISTS phone_home         text,        -- telefone residencial

  -- Endereço detalhado (complementa address/city/state/zip_code já existentes)
  ADD COLUMN IF NOT EXISTS address_number     text,        -- número
  ADD COLUMN IF NOT EXISTS address_complement text,        -- complemento
  ADD COLUMN IF NOT EXISTS neighborhood       text,        -- bairro
  ADD COLUMN IF NOT EXISTS country            text DEFAULT 'Brasil',

  -- Dados bancários / PIX (alinhado ao fluxo financeiro do organograma)
  ADD COLUMN IF NOT EXISTS bank_name          text,        -- banco
  ADD COLUMN IF NOT EXISTS bank_agency        text,        -- agência
  ADD COLUMN IF NOT EXISTS bank_account       text,        -- conta
  ADD COLUMN IF NOT EXISTS bank_account_type  text,        -- corrente | poupança
  ADD COLUMN IF NOT EXISTS pix_key            text,        -- chave PIX
  ADD COLUMN IF NOT EXISTS pix_key_type       text;        -- cpf | cnpj | email | telefone | aleatória

-- Garante que registros antigos fiquem como pessoa física e com país padrão.
UPDATE public.clients SET tipo_pessoa = 'fisica' WHERE tipo_pessoa IS NULL;
UPDATE public.clients SET country = 'Brasil'     WHERE country IS NULL;

-- Índices úteis para busca (Projuris-like: por documento e por tipo).
CREATE INDEX IF NOT EXISTS idx_clients_cnpj        ON public.clients (cnpj);
CREATE INDEX IF NOT EXISTS idx_clients_tipo_pessoa ON public.clients (tipo_pessoa);

-- ============================================================================
-- Fim V15. A página /sistema/clientes (Clients.tsx) passa a exibir o formulário
-- completo no mesmo esquema do Projuris ADV.
-- ============================================================================
