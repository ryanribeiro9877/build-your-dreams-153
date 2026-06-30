-- FEAT-03b: alertas por data_fatal. Função varre pendências abertas com data_fatal
-- próxima/estourada e notifica o responsável (dedup por dia). Agendada via pg_cron.
-- Aditivo e inerte na prática até existirem pendências.

CREATE OR REPLACE FUNCTION public.notificar_pendencias_data_fatal(p_dias_aviso INTEGER DEFAULT 2)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
  v_rec RECORD;
BEGIN
  FOR v_rec IN
    SELECT t.id, t.title, t.assignee_user_id, t.data_fatal, t.departamento_atual
    FROM public.user_tasks t
    WHERE t.is_pendencia
      AND t.data_fatal IS NOT NULL
      AND t.data_fatal <= (current_date + p_dias_aviso)
      AND COALESCE(t.pendencia_estado, '') NOT IN ('resolvida','cancelada','devolvida')
      AND t.assignee_user_id IS NOT NULL
  LOOP
    -- Dedup por dia: não repete alerta da mesma pendência no mesmo dia.
    IF NOT EXISTS (
      SELECT 1 FROM public.bottleneck_notifications n
      WHERE n.user_id = v_rec.assignee_user_id
        AND n.alert_type = 'pendencia_data_fatal'
        AND n.message LIKE '%' || v_rec.id::text || '%'
        AND n.created_at::date = current_date
    ) THEN
      INSERT INTO public.bottleneck_notifications (user_id, alert_type, severity, department, message, agent_name)
      VALUES (
        v_rec.assignee_user_id,
        'pendencia_data_fatal',
        CASE WHEN v_rec.data_fatal < current_date THEN 'critical' ELSE 'warning' END,
        v_rec.departamento_atual::text,
        CASE WHEN v_rec.data_fatal < current_date
             THEN 'Pendência ATRASADA (data fatal ' || to_char(v_rec.data_fatal,'DD/MM/YYYY') || '): ' || v_rec.title || ' [' || v_rec.id::text || ']'
             ELSE 'Pendência com data fatal próxima (' || to_char(v_rec.data_fatal,'DD/MM/YYYY') || '): ' || v_rec.title || ' [' || v_rec.id::text || ']'
        END,
        'Especialista Lembretes'
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

-- Agenda diária às 11:00 UTC (~08:00 BRT). Remove agendamento anterior se existir.
DO $$ BEGIN
  PERFORM cron.unschedule('pendencias_data_fatal_daily');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule('pendencias_data_fatal_daily', '0 11 * * *',
  $cron$ SELECT public.notificar_pendencias_data_fatal(2); $cron$);
