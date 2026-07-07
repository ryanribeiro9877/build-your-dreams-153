-- ============================================================================
-- CPF-UNICO — unicidade de CPF via índice cego (cpf_bidx)
-- ----------------------------------------------------------------------------
-- Impede o cadastro de múltiplos clientes com o mesmo CPF. A unicidade recai
-- no `cpf_bidx` (HMAC determinístico: mesmo CPF -> mesmo valor), NÃO no
-- `cpf_enc` (cifra pgp_sym com IV aleatório: mesmo CPF -> bytes diferentes,
-- imprópria para unicidade). O trigger `clients_pii_sync` (R-2 Fase 2A) já
-- popula o bidx no INSERT/UPDATE, então o UNIQUE passa a valer automaticamente.
--
-- Índice PARCIAL (WHERE cpf_bidx IS NOT NULL): permite múltiplos NULL, ou seja,
-- PJ / cliente sem CPF continuam livres para coexistir.
--
-- Pré-requisito (já executado): resolução das 3 duplicatas do mesmo CPF em
-- produção — senão a criação do UNIQUE falharia.
--
-- Sobrevive à Fase 2C: quando o texto puro `cpf` for dropado, o bidx e este
-- índice continuam válidos. Não toca em `cpf`/`cpf_enc` (R-2).
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS clients_cpf_bidx_uniq
  ON public.clients (cpf_bidx)
  WHERE cpf_bidx IS NOT NULL;
