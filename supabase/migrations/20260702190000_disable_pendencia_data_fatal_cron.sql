-- Fase 1: desliga o cron de alertas de pendência por data fatal.
--
-- Motivo: a UI /pendencias foi removida (PR #6). O cron diário
-- (pendencias_data_fatal_daily, 0 11 * * *) gera notificação apontando para uma
-- tela que não existe mais. A lógica de pendências será MIGRADA para
-- tarefa+status+alerta na Fase 2 — por isso DESLIGAR, não apagar.
--
-- Reversível: preserva a definição do job, a função
-- public.notificar_pendencias_data_fatal e as RPCs/tabela de pendência
-- (user_tasks, criar/resolver/transferir_pendencia). Para religar na Fase 2:
--   SELECT cron.alter_job(job_id := (SELECT jobid FROM cron.job
--     WHERE jobname = 'pendencias_data_fatal_daily'), active := true);
--
-- Idempotente: usa cron.alter_job (não UPDATE direto em cron.job, que exige
-- ownership) e só age se o job existir.
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'pendencias_data_fatal_daily';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.alter_job(job_id := v_jobid, active := false);
  END IF;
END $$;
