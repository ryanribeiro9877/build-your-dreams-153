-- Card 7.4 (hardening): a trigger function não deve ser executável por clientes.
-- (Complemento à 20260714150000; o espelho principal já inclui este REVOKE para
--  deploys novos — este arquivo mantém o histórico de migrações alinhado ao prod.)
revoke all on function public.trg_confeccao_completa_cria_revisao() from public, anon;
