-- PRIVATIZAÇÃO DA PII — o texto puro sai, o dado FICA (cifrado)
--
-- O QUE ESTAVA ERRADO
-- `clients_pii_sync` cifra cada campo de PII no seu `_enc` correspondente, mas
-- nunca anula a coluna em texto puro depois. Resultado medido em 13/08/2026:
-- 530 dos 559 clientes tinham o CPF gravado EM CLARO ao lado do `cpf_enc`.
-- Com a cópia legível na mesma linha, a cifragem não protegia nada no cenário
-- para o qual ela existe: vazamento de backup, cópia do banco, SELECT amplo.
--
-- ISTO NÃO APAGA CPF. O CPF continua inteiro em `cpf_enc`, e a aplicação
-- continua lendo normalmente pela view `clients_decrypted`, que faz
-- `COALESCE(pii_decrypt(cpf_enc), cpf)` — ela já prefere o cifrado. O que sai
-- é só a CÓPIA duplicada e redundante.
--
-- PROVAS COLHIDAS ANTES (13/08/2026):
--   linhas que dependem SÓ do texto puro ............ 0  (nas 10 colunas)
--   divergência entre pii_decrypt(x_enc) e o texto .. 0  (byte a byte igual)
--   cpf_enc sem cpf_bidx ............................ 0  (busca por CPF intacta)
--   bidx divergente de pii_bidx(cpf) ................ 0
--   1 cliente já operava só com a versão cifrada, provando que o app não
--   precisa da coluna em claro.
--
-- QUEM LÊ `clients.cpf` FORA DA VIEW: apply_ocr_client_fields, atualizar_cliente,
-- importar_clientes_planilha, importar_telefones_planilha, save_client e
-- search_clients — TODAS localizam o cliente por `cpf_bidx`, nenhuma lê a coluna
-- em claro. `search_clients` lê o `cpf` do PARÂMETRO de entrada, não da coluna,
-- e nem o retorna na projeção.
--
-- POR QUE A IMPORTAÇÃO NÃO PRECISA MUDAR
-- `trg_clients_pii_sync` é BEFORE INSERT OR UPDATE FOR EACH ROW. Então
-- `importar_clientes_planilha` pode continuar escrevendo o CPF em `NEW.cpf`:
-- o trigger cifra, gera o bidx e anula o campo ANTES da linha chegar ao disco.
-- Corrigir no trigger cobre TODO caminho de escrita, inclusive os futuros —
-- reescrever a função de importação cobriria só um.
--
-- LIMITAÇÃO CONHECIDA (pré-existente, não introduzida aqui): com o texto puro
-- sempre nulo, um UPDATE que envie `cpf = NULL` para APAGAR o CPF é
-- indistinguível de um UPDATE que apenas não mexe no campo — em ambos o
-- `cpf_enc` é preservado. Já era assim antes desta migração. Apagar um CPF de
-- verdade exige limpar `cpf_enc`/`cpf_bidx` explicitamente.

BEGIN;

CREATE OR REPLACE FUNCTION public.clients_pii_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Em cada bloco: cifra, deriva o índice cego quando existe, e SÓ ENTÃO
  -- descarta o texto puro. A ordem importa — anular antes perderia o dado.
  IF NEW.cpf IS NOT NULL AND ((TG_OP = 'INSERT') OR (NEW.cpf IS DISTINCT FROM OLD.cpf)) THEN
    NEW.cpf_enc  := public.pii_encrypt(NEW.cpf);
    NEW.cpf_bidx := public.pii_bidx(NEW.cpf);
  END IF;
  NEW.cpf := NULL;

  IF NEW.rg IS NOT NULL AND ((TG_OP = 'INSERT') OR (NEW.rg IS DISTINCT FROM OLD.rg)) THEN
    NEW.rg_enc := public.pii_encrypt(NEW.rg);
  END IF;
  NEW.rg := NULL;

  IF NEW.legal_rep_cpf IS NOT NULL AND ((TG_OP = 'INSERT') OR (NEW.legal_rep_cpf IS DISTINCT FROM OLD.legal_rep_cpf)) THEN
    NEW.legal_rep_cpf_enc := public.pii_encrypt(NEW.legal_rep_cpf);
  END IF;
  NEW.legal_rep_cpf := NULL;

  IF NEW.pis_nit IS NOT NULL AND ((TG_OP = 'INSERT') OR (NEW.pis_nit IS DISTINCT FROM OLD.pis_nit)) THEN
    NEW.pis_nit_enc := public.pii_encrypt(NEW.pis_nit);
  END IF;
  NEW.pis_nit := NULL;

  IF NEW.bank_agency IS NOT NULL AND ((TG_OP = 'INSERT') OR (NEW.bank_agency IS DISTINCT FROM OLD.bank_agency)) THEN
    NEW.bank_agency_enc := public.pii_encrypt(NEW.bank_agency);
  END IF;
  NEW.bank_agency := NULL;

  IF NEW.bank_account IS NOT NULL AND ((TG_OP = 'INSERT') OR (NEW.bank_account IS DISTINCT FROM OLD.bank_account)) THEN
    NEW.bank_account_enc := public.pii_encrypt(NEW.bank_account);
  END IF;
  NEW.bank_account := NULL;

  IF NEW.pix_key IS NOT NULL AND ((TG_OP = 'INSERT') OR (NEW.pix_key IS DISTINCT FROM OLD.pix_key)) THEN
    NEW.pix_key_enc := public.pii_encrypt(NEW.pix_key);
  END IF;
  NEW.pix_key := NULL;

  IF NEW.cnpj IS NOT NULL AND ((TG_OP = 'INSERT') OR (NEW.cnpj IS DISTINCT FROM OLD.cnpj)) THEN
    NEW.cnpj_enc  := public.pii_encrypt(NEW.cnpj);
    NEW.cnpj_bidx := public.pii_bidx(NEW.cnpj);
  END IF;
  NEW.cnpj := NULL;

  IF NEW.ie IS NOT NULL AND ((TG_OP = 'INSERT') OR (NEW.ie IS DISTINCT FROM OLD.ie)) THEN
    NEW.ie_enc := public.pii_encrypt(NEW.ie);
  END IF;
  NEW.ie := NULL;

  IF NEW.im IS NOT NULL AND ((TG_OP = 'INSERT') OR (NEW.im IS DISTINCT FROM OLD.im)) THEN
    NEW.im_enc := public.pii_encrypt(NEW.im);
  END IF;
  NEW.im := NULL;

  RETURN NEW;
END;
$function$;

-- Limpeza do passivo. Duas travas para tornar a perda impossível, mesmo que a
-- contagem colhida antes estivesse desatualizada:
--   1. só onde o cifrado EXISTE
--   2. só onde o decifrado é IDÊNTICO ao texto puro
-- Qualquer linha fora disso é deixada intacta de propósito, para ser olhada.
--
-- O trigger de updated_at é desligado durante o UPDATE: isto é higiene de
-- dados, não edição de cadastro, e não deve fazer 530 clientes parecerem
-- "atualizados hoje" nas telas e ordenações.
ALTER TABLE public.clients DISABLE TRIGGER update_clients_updated_at;

UPDATE public.clients
   SET cpf = NULL
 WHERE cpf IS NOT NULL
   AND cpf_enc IS NOT NULL
   AND public.pii_decrypt(cpf_enc) = cpf;

ALTER TABLE public.clients ENABLE TRIGGER update_clients_updated_at;

COMMIT;
