-- ============================================================================
-- ESPELHO de migração JÁ APLICADA em produção (30/07/2026). NÃO rodar `db push`.
-- Recuperada verbatim de supabase_migrations.schema_migrations.statements[1]
-- (version 20260730132827), então bate byte a byte com o que está no ar.
-- ============================================================================
-- RESPOSTA DO RODRIGO — ITEM 6: feriados forenses no cálculo de dias úteis.
--
-- ⚠️ LIMITE DECLARADO DE HONESTIDADE: o pedido foi "pesquise na internet". Esta sessão NÃO tem
-- acesso à web e o conhecimento do modelo vai até maio/2026 — logo a PORTARIA ANUAL DO TJBA
-- (que define suspensões locais de expediente) NÃO PÔDE SER VERIFICADA.
-- Prazo forense errado = prazo perdido. Então:
--   • confirmado=true SÓ para feriado de LEI estável (nacional/estadual/municipal) e o recesso
--     do art. 220 do CPC — coisas que não dependem de portaria;
--   • confirmado=false para as datas móveis/religiosas e locais que dependem da portaria;
--   • O CÁLCULO SÓ CONTA confirmado=true. Efeito: prazo sai IGUAL ou MAIS CURTO que o real,
--     nunca mais longo — erra para o lado de agir antes, jamais de perder prazo.
-- Ao confirmar as linhas false contra a portaria (1 UPDATE), o cálculo fica exato.
--
-- Datas móveis calculadas por algoritmo (Meeus), não por memória:
--   Páscoa 2026 = 05/04 → Carnaval 16-17/02, Cinzas 18/02, Sexta Santa 03/04, Corpus 04/06
--   Páscoa 2027 = 28/03 → Carnaval 08-09/02, Cinzas 10/02, Sexta Santa 26/03, Corpus 27/05

CREATE TABLE public.feriados_forenses (
  data date PRIMARY KEY,
  descricao text NOT NULL,
  abrangencia text NOT NULL CHECK (abrangencia IN ('nacional','estadual','municipal','forense')),
  tipo text NOT NULL DEFAULT 'feriado' CHECK (tipo IN ('feriado','suspensao_expediente','recesso')),
  confirmado boolean NOT NULL DEFAULT false,
  fonte text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_feriados_confirmados ON public.feriados_forenses(data) WHERE confirmado;

ALTER TABLE public.feriados_forenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feriados read" ON public.feriados_forenses
  FOR SELECT TO authenticated USING (true);

COMMENT ON COLUMN public.feriados_forenses.confirmado IS
'Somente linhas confirmado=true entram no cálculo de dias úteis. Datas que dependem da portaria anual do TJBA nascem false e devem ser conferidas contra a portaria antes de virar true.';

-- ===== LEI ESTÁVEL (confirmado = true) =====
INSERT INTO public.feriados_forenses (data, descricao, abrangencia, tipo, confirmado, fonte) VALUES
 ('2026-01-01','Confraternização Universal','nacional','feriado',true,'Lei 662/1949'),
 ('2026-04-21','Tiradentes','nacional','feriado',true,'Lei 10.607/2002'),
 ('2026-05-01','Dia do Trabalho','nacional','feriado',true,'Lei 662/1949'),
 ('2026-07-02','Independência da Bahia (data magna do Estado)','estadual','feriado',true,'Constituição do Estado da Bahia'),
 ('2026-09-07','Independência do Brasil','nacional','feriado',true,'Lei 662/1949'),
 ('2026-10-12','Nossa Senhora Aparecida','nacional','feriado',true,'Lei 6.802/1980'),
 ('2026-11-02','Finados','nacional','feriado',true,'Lei 10.607/2002'),
 ('2026-11-15','Proclamação da República','nacional','feriado',true,'Lei 662/1949'),
 ('2026-11-20','Consciência Negra','nacional','feriado',true,'Lei 14.759/2023'),
 ('2026-12-08','Nossa Senhora da Conceição da Praia (padroeira de Salvador)','municipal','feriado',true,'Feriado municipal de Salvador'),
 ('2026-12-25','Natal','nacional','feriado',true,'Lei 662/1949'),
 ('2027-01-01','Confraternização Universal','nacional','feriado',true,'Lei 662/1949'),
 ('2027-04-21','Tiradentes','nacional','feriado',true,'Lei 10.607/2002'),
 ('2027-05-01','Dia do Trabalho','nacional','feriado',true,'Lei 662/1949'),
 ('2027-07-02','Independência da Bahia (data magna do Estado)','estadual','feriado',true,'Constituição do Estado da Bahia'),
 ('2027-09-07','Independência do Brasil','nacional','feriado',true,'Lei 662/1949'),
 ('2027-10-12','Nossa Senhora Aparecida','nacional','feriado',true,'Lei 6.802/1980'),
 ('2027-11-02','Finados','nacional','feriado',true,'Lei 10.607/2002'),
 ('2027-11-15','Proclamação da República','nacional','feriado',true,'Lei 662/1949'),
 ('2027-11-20','Consciência Negra','nacional','feriado',true,'Lei 14.759/2023'),
 ('2027-12-08','Nossa Senhora da Conceição da Praia (padroeira de Salvador)','municipal','feriado',true,'Feriado municipal de Salvador'),
 ('2027-12-25','Natal','nacional','feriado',true,'Lei 662/1949')
ON CONFLICT (data) DO NOTHING;

-- ===== DEPENDE DA PORTARIA DO TJBA (confirmado = false, FORA do cálculo até conferir) =====
INSERT INTO public.feriados_forenses (data, descricao, abrangencia, tipo, confirmado, fonte) VALUES
 ('2026-02-16','Carnaval (segunda)','forense','suspensao_expediente',false,'CONFERIR portaria TJBA'),
 ('2026-02-17','Carnaval (terça)','forense','suspensao_expediente',false,'CONFERIR portaria TJBA'),
 ('2026-02-18','Quarta-feira de Cinzas','forense','suspensao_expediente',false,'CONFERIR portaria TJBA (costuma ser expediente parcial)'),
 ('2026-04-03','Sexta-feira Santa (Paixão de Cristo)','forense','feriado',false,'CONFERIR portaria TJBA'),
 ('2026-06-04','Corpus Christi','forense','suspensao_expediente',false,'CONFERIR portaria TJBA'),
 ('2027-02-08','Carnaval (segunda)','forense','suspensao_expediente',false,'CONFERIR portaria TJBA'),
 ('2027-02-09','Carnaval (terça)','forense','suspensao_expediente',false,'CONFERIR portaria TJBA'),
 ('2027-02-10','Quarta-feira de Cinzas','forense','suspensao_expediente',false,'CONFERIR portaria TJBA (costuma ser expediente parcial)'),
 ('2027-03-26','Sexta-feira Santa (Paixão de Cristo)','forense','feriado',false,'CONFERIR portaria TJBA'),
 ('2027-05-27','Corpus Christi','forense','suspensao_expediente',false,'CONFERIR portaria TJBA')
ON CONFLICT (data) DO NOTHING;

-- ===== RECESSO FORENSE — art. 220 do CPC (20/12 a 20/01, inclusive) =====
INSERT INTO public.feriados_forenses (data, descricao, abrangencia, tipo, confirmado, fonte)
SELECT d::date,
       'Recesso forense (art. 220 CPC — prazos suspensos)','forense','recesso',true,'CPC art. 220'
FROM generate_series('2025-12-20'::date,'2026-01-20'::date,'1 day') d
ON CONFLICT (data) DO NOTHING;
INSERT INTO public.feriados_forenses (data, descricao, abrangencia, tipo, confirmado, fonte)
SELECT d::date,
       'Recesso forense (art. 220 CPC — prazos suspensos)','forense','recesso',true,'CPC art. 220'
FROM generate_series('2026-12-20'::date,'2027-01-20'::date,'1 day') d
ON CONFLICT (data) DO NOTHING;

-- ===== O CÁLCULO =====
-- Não é mais IMMUTABLE: passou a ler tabela, então vira STABLE. (Não era usada em índice
-- nem em coluna gerada — conferido antes de mudar.)
CREATE OR REPLACE FUNCTION public.somar_dias_uteis(p_inicio date, p_dias int)
RETURNS date LANGUAGE plpgsql STABLE SET search_path TO ''
AS $$
DECLARE v date := p_inicio; i int := 0;
BEGIN
  WHILE i < p_dias LOOP
    v := v + 1;
    IF extract(isodow FROM v) < 6
       AND NOT EXISTS (SELECT 1 FROM public.feriados_forenses f WHERE f.data = v AND f.confirmado)
    THEN i := i + 1; END IF;
  END LOOP;
  RETURN v;
END; $$;

CREATE OR REPLACE FUNCTION public.consultar_feriados_pendentes_confirmacao()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $$
  SELECT jsonb_build_object(
    'ok', true,
    'aviso','Estas datas NÃO entram no cálculo de dias úteis até serem confirmadas contra a portaria do TJBA. Enquanto isso, os prazos saem iguais ou mais curtos que o real (a favor da segurança).',
    'pendentes', coalesce((SELECT jsonb_agg(jsonb_build_object('data',f.data,'descricao',f.descricao,'fonte',f.fonte) ORDER BY f.data)
                            FROM public.feriados_forenses f WHERE NOT f.confirmado), '[]'::jsonb),
    'confirmados_total',(SELECT count(*) FROM public.feriados_forenses WHERE confirmado));
$$;
REVOKE EXECUTE ON FUNCTION public.consultar_feriados_pendentes_confirmacao() FROM PUBLIC, anon;