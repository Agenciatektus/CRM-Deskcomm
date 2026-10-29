-- manifest: 9085 — view contact_visit_stats (faltas, última visita concluída, próxima marcada por contato; security_invoker) e tabela calendar_waitlist (fila de espera da agenda, RLS por comando, status open/offered/booked/cancelled) + índice de apoio em calendar_appointments.
--
-- 9085 (salão Fabiana Lopes, 29/10): o agente precisa contar faltas e registrar interesse num
-- horário ocupado. Nada aqui oferece vaga sozinho: a fila é lida pela recepção e pelo agente.
--
-- A view herda a RLS de calendar_appointments (security_invoker): quem não vê o compromisso
-- não vê a conta. O handler do agente (service role) filtra por organization_id por conta própria.
-- calendar_waitlist.notes é texto livre da cliente/recepção: o agente só grava o que a cliente
-- disse; anonimização do contato apaga a linha (on delete cascade) e a LGPD anonimiza o contato.
--
-- Reverter: drop view public.contact_visit_stats; drop table public.calendar_waitlist;
--   drop index if exists public.calendar_appointments_org_contact_starts_idx;

set lock_timeout = '3s';

create index if not exists calendar_appointments_org_contact_starts_idx
  on public.calendar_appointments (organization_id, contact_id, starts_at desc)
  where contact_id is not null;

create or replace view public.contact_visit_stats
with (security_invoker = true) as
select
  a.organization_id,
  a.contact_id,
  count(*) filter (where a.status = 'no_show')                     as no_show_count,
  count(*) filter (where a.status = 'completed')                   as completed_count,
  max(a.starts_at) filter (where a.status = 'completed')           as last_completed_at,
  min(a.starts_at) filter (where a.status in ('pending', 'confirmed') and a.starts_at > now()) as next_at
from public.calendar_appointments a
where a.contact_id is not null
group by a.organization_id, a.contact_id;

comment on view public.contact_visit_stats is
  'Faltas e última visita por contato, derivadas de calendar_appointments. security_invoker: herda a RLS da tabela base. Migration 9085.';

revoke all on public.contact_visit_stats from anon, public;
grant select on public.contact_visit_stats to authenticated, service_role;

create table if not exists public.calendar_waitlist (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id      uuid not null references public.contacts(id) on delete cascade,
  event_type_id   uuid null references public.calendar_event_types(id) on delete cascade,
  owner_user_id   uuid null references auth.users(id) on delete set null,
  desired_window  text null check (desired_window is null or length(desired_window) <= 300),
  status          text not null default 'open',
  notes           text null check (notes is null or length(notes) <= 1000),
  created_by_kind text not null default 'user',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint calendar_waitlist_status_check
    check (status in ('open', 'offered', 'booked', 'cancelled')),
  constraint calendar_waitlist_created_by_kind_check
    check (created_by_kind in ('user', 'ai', 'system', 'contact'))
);

create index if not exists calendar_waitlist_org_fila_idx
  on public.calendar_waitlist (organization_id, event_type_id, created_at)
  where status = 'open';
create index if not exists calendar_waitlist_org_contact_idx
  on public.calendar_waitlist (organization_id, contact_id);
-- uma espera viva por contato e serviço (sem serviço, uma por contato)
create unique index if not exists calendar_waitlist_uma_viva_key
  on public.calendar_waitlist (organization_id, contact_id, coalesce(event_type_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status in ('open', 'offered');

alter table public.calendar_waitlist enable row level security;

drop policy if exists calendar_waitlist_select on public.calendar_waitlist;
create policy calendar_waitlist_select on public.calendar_waitlist
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );
drop policy if exists calendar_waitlist_insert on public.calendar_waitlist;
create policy calendar_waitlist_insert on public.calendar_waitlist
  for insert with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  );
drop policy if exists calendar_waitlist_update on public.calendar_waitlist;
create policy calendar_waitlist_update on public.calendar_waitlist
  for update using (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  ) with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  );
drop policy if exists calendar_waitlist_delete on public.calendar_waitlist;
create policy calendar_waitlist_delete on public.calendar_waitlist
  for delete using (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
  );
revoke all on public.calendar_waitlist from anon;

drop trigger if exists trg_calendar_waitlist_updated_at on public.calendar_waitlist;
create trigger trg_calendar_waitlist_updated_at
  before update on public.calendar_waitlist
  for each row execute function public.fn_set_updated_at();

create or replace trigger trg_organizacao_nao_muda
  before update of organization_id on public.calendar_waitlist
  for each row execute function public.fn_organizacao_da_linha_nao_muda();

notify pgrst, 'reload schema';
