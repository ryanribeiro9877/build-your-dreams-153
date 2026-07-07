CREATE UNIQUE INDEX IF NOT EXISTS clients_cpf_bidx_uniq
  ON public.clients (cpf_bidx)
  WHERE cpf_bidx IS NOT NULL;