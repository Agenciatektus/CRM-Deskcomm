-- manifest: 9079 — cria inbox_filtros_salvos (filtros nomeados do Inbox por usuario e organizacao): RLS pelo proprio usuario, sem update, teto de 20 por usuario e nome unico. Aditiva e idempotente. Apendice igual no baseline.sql.
--
-- 9079: o filtro do Inbox sumia ao trocar de pagina e nao havia onde guardar um filtro de uso diario.
-- Reverter: drop table if exists public.inbox_filtros_salvos; drop function if exists public.fn_inbox_filtros_salvos_limite();

set lock_timeout = '3s';

create table if not exists public.inbox_filtros_salvos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  filtros jsonb not null,
  created_at timestamptz not null default now(),
  constraint inbox_filtros_salvos_nome_tam check (char_length(nome) between 1 and 40),
  constraint inbox_filtros_salvos_filtros_obj check (jsonb_typeof(filtros) = 'object' and pg_column_size(filtros) <= 4096)
);

create unique index if not exists inbox_filtros_salvos_nome_uq
  on public.inbox_filtros_salvos (organization_id, user_id, lower(nome));

comment on table public.inbox_filtros_salvos is
  'Filtros nomeados do Inbox, por usuario e organizacao (vale em qualquer aparelho). Maximo 20 por usuario (trigger). A forma de filtros e validada por zod na rota. Sem update: renomear = apagar e criar. Migration 9079.';

create or replace function public.fn_inbox_filtros_salvos_limite()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Serializa os inserts do mesmo usuario: sem o lock, dois pedidos juntos passam do teto.
  perform pg_advisory_xact_lock(hashtextextended('inbox_filtros_salvos:' || new.user_id::text, 0));
  if (select count(*) from public.inbox_filtros_salvos
       where organization_id = new.organization_id and user_id = new.user_id) >= 20 then
    raise exception 'limite de 20 filtros salvos por usuario' using errcode = 'FS020';
  end if;
  return new;
end
$$;

revoke execute on function public.fn_inbox_filtros_salvos_limite() from public, anon;

drop trigger if exists trg_inbox_filtros_salvos_limite on public.inbox_filtros_salvos;
create trigger trg_inbox_filtros_salvos_limite
  before insert on public.inbox_filtros_salvos
  for each row execute function public.fn_inbox_filtros_salvos_limite();

alter table public.inbox_filtros_salvos enable row level security;

revoke all on public.inbox_filtros_salvos from anon, authenticated;
grant select, insert, delete on public.inbox_filtros_salvos to authenticated;
grant select, insert, update, delete on public.inbox_filtros_salvos to service_role;

drop policy if exists "inbox_filtros_salvos_select" on public.inbox_filtros_salvos;
create policy "inbox_filtros_salvos_select" on public.inbox_filtros_salvos
  for select to authenticated
  using (user_id = (select auth.uid()) and organization_id in (select public.fn_user_org_ids()));

drop policy if exists "inbox_filtros_salvos_insert" on public.inbox_filtros_salvos;
create policy "inbox_filtros_salvos_insert" on public.inbox_filtros_salvos
  for insert to authenticated
  with check (user_id = (select auth.uid()) and organization_id in (select public.fn_user_org_ids()));

drop policy if exists "inbox_filtros_salvos_delete" on public.inbox_filtros_salvos;
create policy "inbox_filtros_salvos_delete" on public.inbox_filtros_salvos
  for delete to authenticated
  using (user_id = (select auth.uid()) and organization_id in (select public.fn_user_org_ids()));

create or replace trigger trg_organizacao_nao_muda before update of organization_id on public.inbox_filtros_salvos
  for each row execute function public.fn_organizacao_da_linha_nao_muda();

notify pgrst, 'reload schema';
