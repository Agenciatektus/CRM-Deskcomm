-- manifest: 9067 — Verdash nativo (FZAP): channel_sessions.verdash_origem ('vinculada'|'nativa', default 'vinculada') e tabela verdash_fzap_pastas (pasta FZAP + token de pasta cifrado por org, so service_role). O CRM cria a instancia no FZAP com o token da pasta, nunca com o ADMIN_TOKEN. Provider continua 'verdash'; CHECKs de provider nao mudam.
--
-- 9067: base do caminho NATIVO do canal verdash (Fatia 2 do plano FZAP nativo).

set lock_timeout = '3s';

-- 1 · de onde veio a instancia verdash: vinculada (criada pela Verdash, o CRM so
--     liga) ou nativa (o CRM criou direto no FZAP). Coluna explicita em vez de
--     inferir por `verdash_vinculo_id` nulo, que o modo direto tambem tem.
alter table public.channel_sessions
  add column if not exists verdash_origem text not null default 'vinculada'
    constraint channel_sessions_verdash_origem_check check (verdash_origem in ('vinculada', 'nativa'));

comment on column public.channel_sessions.verdash_origem is
  'vinculada = instancia criada pela Verdash e ligada ao CRM; nativa = o CRM criou a instancia direto no FZAP (verdash_token_encrypted guarda o token dela). Migration 9067.';

-- 2 · token da PASTA do FZAP por organizacao. O CRM nunca guarda o ADMIN_TOKEN do
--     servidor: so o token da pasta, que alcanca apenas as instancias dela.
--     Server-side only (RLS ligada, zero policies, grants so do service_role).
create table if not exists public.verdash_fzap_pastas (
  organization_id       uuid primary key references public.organizations(id) on delete cascade,
  fzap_folder_id        text not null,
  folder_token_encrypted bytea not null,
  criada_em             timestamptz not null default now()
);

create unique index if not exists verdash_fzap_pastas_folder_uq
  on public.verdash_fzap_pastas (fzap_folder_id);

comment on table public.verdash_fzap_pastas is
  'Pasta do FZAP de cada organizacao (uma por org) e o token dela, cifrado por fn_encrypt_oauth. Server-side only: RLS ligada sem policies e grants revogados de anon/authenticated. Migration 9067.';

alter table public.verdash_fzap_pastas enable row level security;
revoke all on public.verdash_fzap_pastas from anon, authenticated;
grant select, insert, update, delete on public.verdash_fzap_pastas to service_role;

create or replace trigger trg_organizacao_nao_muda
  before update of organization_id on public.verdash_fzap_pastas
  for each row execute function public.fn_organizacao_da_linha_nao_muda();

notify pgrst, 'reload schema';
