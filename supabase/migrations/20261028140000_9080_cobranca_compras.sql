-- manifest: 9080 — cobranca_compras (compra por link de pagamento registrada antes de a empresa existir; evento_id e sessao_id unicos). Tabela nova, aditiva e idempotente; RLS ligada sem policy, so service_role. A flag VENDA_DIRETA (platform_config, desligada por padrao) vive em codigo, sem linha semeada. Apendice igual no baseline.sql.
--
-- 9080: fatia 2 da compra pela landing. O webhook de cobranca, ao receber checkout.session.completed de
-- cliente desconhecido COM a flag ligada, grava uma linha aqui (status 'recebida') e nada mais.
-- (9079 esta reservada pela PR #388.)
-- Reverter: drop table if exists public.cobranca_compras;

set lock_timeout = '3s';

create table if not exists public.cobranca_compras (
  id uuid primary key default gen_random_uuid(),
  provedor text not null check (provedor in ('stripe', 'asaas')),
  modo text check (modo in ('teste', 'producao')),
  evento_id text not null unique,
  sessao_id text unique,
  status text not null default 'recebida'
    check (status in ('recebida', 'aguardando_pagamento', 'recusada', 'duplicada', 'criada', 'falhou')),
  motivo text,
  email text,
  nome_empresa text,
  plano_chave text,
  client_reference_id text check (client_reference_id ~ '^[A-Za-z0-9_-]{1,200}$'),
  organization_id uuid references public.organizations(id) on delete set null,
  tentativas integer not null default 0 check (tentativas >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.cobranca_compras is
  'Compras feitas por link de pagamento, antes de a empresa existir (migration 9080). Da INSTALACAO: RLS ligada sem policy, so service_role. A rota do webhook so grava o ponteiro (evento_id); o resto vem da releitura no provedor. Migration 9080.';

alter table public.cobranca_compras enable row level security;
revoke all on public.cobranca_compras from anon, authenticated;
grant select, insert, update, delete on public.cobranca_compras to service_role;

drop trigger if exists trg_cobranca_compras_touch on public.cobranca_compras;
create trigger trg_cobranca_compras_touch
  before update on public.cobranca_compras
  for each row execute function public.fn_touch_updated_at();

notify pgrst, 'reload schema';
