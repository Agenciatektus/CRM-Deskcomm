-- manifest: 9078 — jev_plataforma_uso (gasto do Jev com a chave da PLATAFORMA, por empresa e mes) e fn_jev_plataforma_registrar(p_org, p_custo_cents): soma atomica. Alimenta o teto mensal por empresa. Tabela nova, aditiva e idempotente; so service_role. Apendice igual no baseline.sql.
--
-- 9078: o teto de gasto por empresa do Jev da plataforma precisa saber o que a chave da PLATAFORMA gastou,
-- separado do que a chave propria da empresa gastou (essa nao e da instalacao). Um registro por chamada
-- feita com a chave da plataforma, no unico ponto por onde elas passam (lib/ai/decisao/ponto.ts).
-- Reverter: drop function if exists public.fn_jev_plataforma_registrar(uuid, numeric); drop table if exists public.jev_plataforma_uso;

set lock_timeout = '3s';

create table if not exists public.jev_plataforma_uso (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  mes date not null,
  custo_usd_cents numeric not null default 0 check (custo_usd_cents >= 0),
  chamadas integer not null default 0 check (chamadas >= 0),
  updated_at timestamptz not null default now(),
  primary key (organization_id, mes)
);

comment on table public.jev_plataforma_uso is
  'Gasto do Jev com a chave da PLATAFORMA (JEV_PLATFORM_API_KEY), por empresa e mes (UTC). Da INSTALACAO: RLS ligada sem policy, so service_role. Migration 9078.';

alter table public.jev_plataforma_uso enable row level security;
revoke all on public.jev_plataforma_uso from public, anon, authenticated;
grant select, insert, update, delete on public.jev_plataforma_uso to service_role;

create or replace function public.fn_jev_plataforma_registrar(p_org uuid, p_custo_cents numeric)
returns numeric
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_total numeric;
begin
  insert into public.jev_plataforma_uso as u (organization_id, mes, custo_usd_cents, chamadas)
  values (p_org, (date_trunc('month', now() at time zone 'utc'))::date, greatest(coalesce(p_custo_cents, 0), 0), 1)
  on conflict (organization_id, mes) do update
    set custo_usd_cents = u.custo_usd_cents + excluded.custo_usd_cents,
        chamadas = u.chamadas + 1,
        updated_at = now()
  returning u.custo_usd_cents into v_total;
  return v_total;
end;
$$;

revoke execute on function public.fn_jev_plataforma_registrar(uuid, numeric) from public, anon, authenticated;
grant execute on function public.fn_jev_plataforma_registrar(uuid, numeric) to service_role;

notify pgrst, 'reload schema';
