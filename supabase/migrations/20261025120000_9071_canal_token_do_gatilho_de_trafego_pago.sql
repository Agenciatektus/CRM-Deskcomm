-- manifest: 9071 — channel_sessions.trafego_push_token_hash (nulo): sha256 do token da URL do gatilho de tráfego pago do canal nativo; só o hash fica no banco. Índice único parcial. RLS e grants da tabela não mudam. Apêndice igual no baseline.sql.
--
-- 9071: gatilho de tráfego pago (FZAP empurra, CRM faz o PULL).

set lock_timeout = '3s';

alter table public.channel_sessions
  add column if not exists trafego_push_token_hash text;

create unique index if not exists channel_sessions_trafego_push_token_hash_uq
  on public.channel_sessions (trafego_push_token_hash)
  where trafego_push_token_hash is not null;

comment on column public.channel_sessions.trafego_push_token_hash is
  'sha256 (hex) do token secreto da URL do gatilho de trafego pago. Nunca o token. Nulo = push nao registrado. Migration 9071.';
