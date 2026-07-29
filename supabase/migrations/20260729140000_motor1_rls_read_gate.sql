-- ============================================================================
-- Motor 1 — gate de leitura das 4 tabelas (RLS)
-- ============================================================================
-- ⚠️ ESTA NÃO É UM ESPELHO: **AINDA NÃO APLICADA EM PRODUÇÃO** (29/07).
-- Tentei aplicar e o classificador de permissões da sessão bloqueou o DDL.
-- Precisa ser aplicada (db push, ou reexecutar com autorização).
--
-- O QUE ESTÁ ERRADO HOJE EM PRODUÇÃO
-- As 4 tabelas do Motor 1 nasceram com a policy de SELECT em `USING (true)`
-- para o papel `authenticated`. Conferido em 29/07 com pg_policies:
--   client_bank_relations · campanhas · campanha_itens · ligacoes  →  qual = true
-- Ou seja: QUALQUER usuário logado — estagiário do jurídico, advogado sem acesso
-- a Clientes, qualquer papel — consegue ler por PostgREST a que banco cada
-- cliente deve, o ano do extrato e a `observacao` livre de cada ligação. O gate
-- de Clientes (can_view_clients) não é consultado em nenhuma delas.
--
-- POR QUE É SEGURO APERTAR
--   · as 5 RPCs do Motor 1 são SECURITY DEFINER (registrar_relacao_bancaria,
--     criar_campanha, registrar_ligacao, kpi_ligacoes, anexar_audio_autorizacao),
--     assim como search_clients — nenhuma passa pela RLS destas tabelas;
--   · nada no front lê estas tabelas hoje (grep no repo em 29/07: só o espelho
--     das RPCs cita os nomes). A aba Bancos e a tela Campanhas já nascem sob o
--     gate correto.
--
-- ESCOLHA DE GATE
--   · client_bank_relations é DADO DO CLIENTE → mesmo gate de client_documents,
--     `can_view_clients() OR is_socio_or_advogado()`: o advogado precisa da
--     relação bancária para redigir a peça.
--   · campanhas/campanha_itens/ligacoes são DADO OPERACIONAL DA RECEPÇÃO →
--     mesmo gate das RPCs que as escrevem.
-- ============================================================================

DROP POLICY IF EXISTS "bank relations read" ON public.client_bank_relations;
CREATE POLICY "bank relations read" ON public.client_bank_relations
  FOR SELECT TO authenticated
  USING (public.can_view_clients() OR public.is_socio_or_advogado());

DROP POLICY IF EXISTS "campanhas read" ON public.campanhas;
CREATE POLICY "campanhas read" ON public.campanhas
  FOR SELECT TO authenticated
  USING (public.is_recepcao_or_socio() OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "campanha_itens read" ON public.campanha_itens;
CREATE POLICY "campanha_itens read" ON public.campanha_itens
  FOR SELECT TO authenticated
  USING (public.is_recepcao_or_socio() OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "ligacoes read" ON public.ligacoes;
CREATE POLICY "ligacoes read" ON public.ligacoes
  FOR SELECT TO authenticated
  USING (public.is_recepcao_or_socio() OR public.has_role(auth.uid(), 'admin'::public.app_role));
