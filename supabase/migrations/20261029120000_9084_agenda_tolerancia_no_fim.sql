-- manifest: 9084 — tolerância no fim do atendimento por pessoa na agenda: attendant_availability.overlap_tolerance_minutes (0 a 120, padrão 0); fn_agenda_lotada encurta o fim de cada compromisso do CRM pela tolerância do dono antes de contar o pico. Apêndice igual no baseline.sql, ANTES da varredura de anon.
--
-- 9084: no salão, os últimos 30 minutos de um procedimento de 2 horas já admitem a próxima
-- cliente (Salão Fabiana Lopes, 29/10). Com a tolerância T, um compromisso do CRM passa a
-- ocupar [início, fim − T) para efeito de colisão, nunca menos que a METADE da sua duração.
--
-- O ENCURTAMENTO VALE PARA OS DOIS LADOS (o compromisso novo e os que já existem): é a mesma
-- relação física vista de cada ponta. Encurtar só o existente faria a validade do mesmo par de
-- compromissos depender da ORDEM em que foram marcados (10h-12h e depois 11h30 entra; 11h30
-- primeiro e depois 10h-12h seria recusado), e remarcar o primeiro em um minuto travaria.
--
-- "Nunca menos que a metade": com piso de 1 minuto, um serviço de 30 min com T = 30 ocuparia
-- [s, s+1min) e quem atende 1 por vez receberia cliente de minuto em minuto (revisão da PR
-- #446). Com a metade, capacidade 1 nunca passa de duas clientes reais sobrepostas, e o mesmo
-- instante continua colidindo. `greatest(fim − 0, meio)` deixa T = 0 idêntico a antes.
--
-- Padrão 0 = nenhuma org muda. Evento do Google e bloqueio por exceção continuam ocupando
-- inteiro: não passam por esta função (o motor em TS aplica a mesma régua só a `doCrm`).
-- O gatilho de capacidade não muda: chama esta função, que agora já desconta a tolerância.
--
-- Reverter: reaplicar fn_agenda_lotada da migration 9083 e
--   alter table public.attendant_availability drop column if exists overlap_tolerance_minutes;

set lock_timeout = '3s';

alter table public.attendant_availability
  add column if not exists overlap_tolerance_minutes integer not null default 0
  constraint attendant_availability_overlap_tolerance_minutes_check check (overlap_tolerance_minutes between 0 and 120);

comment on column public.attendant_availability.overlap_tolerance_minutes is
  'Minutos no fim de um compromisso da AGENDA em que esta pessoa já aceita o próximo (salão: o fim do procedimento). Padrão 0. Vale entre compromissos do CRM; evento do Google e bloqueio por exceção ocupam inteiro.';

-- A conta única do pico (9083), agora com a tolerância do dono nos dois lados.
create or replace function public.fn_agenda_lotada(
  p_org uuid, p_owner uuid, p_ignorar uuid, p_inicio timestamptz, p_fim timestamptz
) returns boolean
language sql stable security definer set search_path = public as $$
  with dono as (
    select coalesce(max(simultaneous_appointments), 1) as cap,
           make_interval(mins => coalesce(max(overlap_tolerance_minutes), 0)) as tol
      from public.attendant_availability where organization_id = p_org and user_id = p_owner
  ), novo as (
    select greatest(p_fim - d.tol, p_inicio + (p_fim - p_inicio) / 2) as fim from dono d
  ), outros as (
    select a.starts_at, greatest(a.ends_at - d.tol, a.starts_at + (a.ends_at - a.starts_at) / 2) as ends_at
      from public.calendar_appointments a, dono d
     where a.organization_id = p_org and a.owner_user_id = p_owner and a.id is distinct from p_ignorar
       and a.status in ('pending', 'confirmed') and a.starts_at < p_fim and a.ends_at > p_inicio
  ), cruzam as (
    select o.* from outros o, novo n where o.starts_at < n.fim and o.ends_at > p_inicio
  ), pontos as (
    select p_inicio as t union select starts_at from cruzam where starts_at > p_inicio
  )
  select coalesce(max((select count(*) from cruzam o where o.starts_at <= p.t and o.ends_at > p.t)), 0)
         >= (select cap from dono)
    from pontos p;
$$;
revoke all on function public.fn_agenda_lotada(uuid, uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.fn_agenda_lotada(uuid, uuid, uuid, timestamptz, timestamptz) to service_role;

notify pgrst, 'reload schema';
