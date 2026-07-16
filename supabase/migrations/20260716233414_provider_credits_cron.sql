-- PACOTE B (cron) — wrapper que chama a edge sync-provider-credits de hora em hora.
-- Espelha trigger_send_email_notifications: le o mesmo vault secret 'cron_send_email_auth'
-- (== env CRON_SECRET das edges) e envia no header X-Cron-Secret.
-- So produz snapshots reais apos o deploy da edge (deploy do Ryan). Ate la, a
-- leitora reporta 'indisponivel' (comportamento honesto, nao inventa numero).
-- Aplicada em producao via MCP em 2026-07-16; versionada aqui p/ repo<->banco.
CREATE OR REPLACE FUNCTION public.trigger_sync_provider_credits()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
declare
  v_token text;
  v_req   bigint;
begin
  select decrypted_secret into v_token
    from vault.decrypted_secrets
   where name = 'cron_send_email_auth';
  if v_token is null then
    raise exception 'Vault secret cron_send_email_auth ausente';
  end if;

  select net.http_post(
    url := 'https://tsltxvswzdnlmvljpryh.supabase.co/functions/v1/sync-provider-credits',
    headers := jsonb_build_object('Content-Type','application/json','X-Cron-Secret', v_token),
    body := '{}'::jsonb
  ) into v_req;

  return v_req;
end;
$fn$;
revoke all on function public.trigger_sync_provider_credits() from public, anon, authenticated;
grant execute on function public.trigger_sync_provider_credits() to service_role;

-- Agenda de hora em hora (padrao dos jobs 3-7).
select cron.unschedule('sync-provider-credits')
 where exists (select 1 from cron.job where jobname='sync-provider-credits');
select cron.schedule('sync-provider-credits', '0 * * * *',
  $cron$ SELECT public.trigger_sync_provider_credits(); $cron$);
