-- manifest: 9073 — Conectar com Meta, fatia 2: ad_insights_connections ganha needs_reconnect (boolean not null default false), needs_reconnect_desde (timestamptz) e last_token_error (text, so codigos da Meta), e nasce meta_alertas_enviados (dedup dos alertas de vencimento: unique organizacao+marco+janela; RLS ligada sem policy, so service_role). Aditiva e idempotente. Apendice igual no baseline.sql.
--
-- 9073: a Meta recusou renovar o token (190/102) ou o token vai vencer: o cron
-- meta-renovar-token marca a conexao e o cron meta-alerta-vencimento avisa os
-- admins uma vez por marco.

set lock_timeout = '3s';

alter table public.ad_insights_connections
  add column if not exists needs_reconnect boolean not null default false,
  add column if not exists needs_reconnect_desde timestamptz,
  add column if not exists last_token_error text;

comment on column public.ad_insights_connections.needs_reconnect is
  'A Meta recusou o token (code 190 ou 102, sem is_transient) na renovacao: so reconectar resolve. Zerado ao reconectar por OAuth ou colar token. Migration 9073.';
comment on column public.ad_insights_connections.needs_reconnect_desde is
  'Quando needs_reconnect virou true; ancora do ritmo dos alertas. Migration 9073.';
comment on column public.ad_insights_connections.last_token_error is
  'Resumo do ultimo erro da Meta: so codigos (http, code, subcode, tipo), nunca mensagem livre nem token. Migration 9073.';

create table if not exists public.meta_alertas_enviados (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  marco text not null,
  janela text not null,
  created_at timestamptz not null default now(),
  constraint meta_alertas_enviados_uk unique (organization_id, marco, janela)
);

comment on table public.meta_alertas_enviados is
  'Dedup dos alertas de vencimento do token da Meta: o INSERT e o cadeado (so quem criou a linha avisa). Server-side only: RLS ligada sem policies, grants so do service_role. Migration 9073.';

alter table public.meta_alertas_enviados enable row level security;
revoke all on public.meta_alertas_enviados from anon, authenticated;
grant select, insert, update, delete on public.meta_alertas_enviados to service_role;

notify pgrst, 'reload schema';
