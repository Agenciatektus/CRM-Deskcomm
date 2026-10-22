-- 9064: índice da poda curta da linha de CANAL em `webhook_events_log`.
--
-- O cron `webhook-log-retention` passa a apagar a linha com `channel_session_id`
-- em D+30 (`WEBHOOK_LOG_CHANNEL_ROW_RETENTION_DAYS`; a linha sem canal continua
-- em D+90). Racional e leitores em `lib/channels/poda-das-linhas-de-canal.ts`.
--
-- Sem este índice o DELETE em lote (`order by received_at limit 500`) varre a
-- tabela a cada 5 minutos. Com ele, visita só as linhas do lote.
--
-- Em produção, com tráfego, crie ANTES do deploy, fora de transação:
--   create index concurrently if not exists webhook_events_log_poda_de_canal_idx
--     on public.webhook_events_log (received_at) where channel_session_id is not null;
-- Aí esta migration fica inerte (`if not exists`). Aditiva e idempotente.
set lock_timeout = '3s';

create index if not exists webhook_events_log_poda_de_canal_idx
  on public.webhook_events_log (received_at)
  where channel_session_id is not null;
