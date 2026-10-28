-- manifest: 9083 — atendimentos simultâneos por pessoa na agenda: attendant_availability.simultaneous_appointments (padrão 1); o índice único de mesmo início vira gatilho com advisory lock que respeita a capacidade; o commit do Google só acusa overlap quando estoura a capacidade. Apêndice igual no baseline.sql, ANTES da varredura de anon.
--
-- 9083: no salão a química age enquanto a profissional atende outra cliente, e a Camila
-- segura 4 a 5 pessoas ao mesmo tempo. Até aqui 1 pessoa = 1 cliente por vez: o motor
-- escondia o horário com qualquer compromisso e o índice 0182 vetava dois no mesmo início.
--
-- POR PESSOA, e não por tipo de agendamento: o limite é de quem atende (quantas cadeiras
-- a Camila dá conta), e a mesma pessoa mistura tipos no mesmo horário (progressiva às 13h,
-- mechas às 14h). Capacidade por tipo deixaria a soma sem dono.
--
-- `capacity` (padrão 5) NÃO serve: é o teto de CONVERSAS do roteamento, e reusá-lo
-- mudaria a agenda de toda org de uma vez.
--
-- CAPACIDADE 1 GUARDA A REGRA DA 0182 SEM MUDAR NADA: o banco veta só o mesmo instante, e
-- a sobreposição (encaixe) é decisão da rota. `tests/invariants/agenda-sem-duplicata.test.ts`
-- segue valendo. Acima de 1, o banco veta quando o PICO de simultâneos na faixa nova já
-- atinge a capacidade — contar só "quantos cruzam" recusaria 13h-14h + 14h-15h + 15h-16h
-- para uma faixa 13h-16h com capacidade 2, e nunca há dois ao mesmo tempo ali.
--
-- A CORRIDA: o índice único fechava a janela entre o motor validar e o INSERT. Contagem
-- não cabe em índice, então o gatilho pega `pg_advisory_xact_lock` por (org, dono) antes
-- de contar: duas reservas simultâneas da mesma pessoa entram em fila, e a segunda conta
-- já vendo a primeira. Reservas de pessoas diferentes não se esperam.
--
-- Reverter (antes, cancele ou desloque compromissos de mesmo início das orgs com
-- capacidade > 1, senão o índice único não volta):
--   drop trigger if exists trg_zzz_agenda_capacidade_insert on public.calendar_appointments;
--   drop trigger if exists trg_zzz_agenda_capacidade_update on public.calendar_appointments;
--   drop function if exists public.fn_agenda_respeita_capacidade();
--   -- reaplicar fn_google_appointment da migration 0654 (o bloco `exists(... other ...)`)
--   drop function if exists public.fn_agenda_lotada(uuid, uuid, uuid, timestamptz, timestamptz);
--   drop index if exists public.calendar_appointments_dono_inicio_idx;
--   create unique index calendar_appointments_sem_duplicata_idx on public.calendar_appointments
--     (organization_id, owner_user_id, starts_at) where status in ('pending','confirmed') and owner_user_id is not null;
--   alter table public.attendant_availability drop column if exists simultaneous_appointments;

set lock_timeout = '3s';

alter table public.attendant_availability
  add column if not exists simultaneous_appointments integer not null default 1
  constraint attendant_availability_simultaneous_appointments_check check (simultaneous_appointments between 1 and 20);

comment on column public.attendant_availability.simultaneous_appointments is
  'Quantos compromissos da AGENDA esta pessoa atende ao mesmo tempo (salão: a química age enquanto ela atende outra cliente). Padrão 1. Não confundir com capacity, que é o teto de conversas do roteamento. Evento do Google e bloqueio por exceção ocupam inteiro, sem capacidade.';

-- A conta única do pico, para o gatilho e para o commit do Google. `true` quando a faixa
-- [p_inicio, p_fim) já tem tantos compromissos ativos AO MESMO TEMPO quanto o dono comporta.
-- O pico de intervalos semiabertos só muda num início, então basta medir em p_inicio e em
-- cada início que cai dentro da faixa. Capacidade 1 ⇒ qualquer sobreposição lota.
create or replace function public.fn_agenda_lotada(
  p_org uuid, p_owner uuid, p_ignorar uuid, p_inicio timestamptz, p_fim timestamptz
) returns boolean
language sql stable security definer set search_path = public as $$
  with outros as (
    select starts_at, ends_at from public.calendar_appointments
     where organization_id = p_org and owner_user_id = p_owner and id is distinct from p_ignorar
       and status in ('pending', 'confirmed') and starts_at < p_fim and ends_at > p_inicio
  ), pontos as (
    select p_inicio as t union select starts_at from outros where starts_at > p_inicio
  )
  select coalesce(max((select count(*) from outros o where o.starts_at <= p.t and o.ends_at > p.t)), 0)
         >= coalesce((select simultaneous_appointments from public.attendant_availability
                       where organization_id = p_org and user_id = p_owner), 1)
    from pontos p;
$$;
revoke all on function public.fn_agenda_lotada(uuid, uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.fn_agenda_lotada(uuid, uuid, uuid, timestamptz, timestamptz) to service_role;

create or replace function public.fn_agenda_respeita_capacidade()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  cap integer;
begin
  -- Fila por (org, dono): a segunda reserva simultânea só conta depois que a primeira comitou.
  perform pg_advisory_xact_lock(hashtextextended('agenda:' || new.organization_id || ':' || new.owner_user_id, 0));
  select simultaneous_appointments into cap from public.attendant_availability
   where organization_id = new.organization_id and user_id = new.owner_user_id;
  if coalesce(cap, 1) = 1 then
    if exists (select 1 from public.calendar_appointments
                where organization_id = new.organization_id and owner_user_id = new.owner_user_id
                  and id <> new.id and status in ('pending', 'confirmed') and starts_at = new.starts_at) then
      raise exception 'agenda_mesmo_instante' using errcode = '23505',
        detail = 'Já há um compromisso desta pessoa neste mesmo instante.';
    end if;
  elsif public.fn_agenda_lotada(new.organization_id, new.owner_user_id, new.id, new.starts_at, new.ends_at) then
    raise exception 'agenda_capacidade_esgotada' using errcode = '23P01',
      detail = format('Esta pessoa já tem %s atendimentos simultâneos neste horário.', cap);
  end if;
  return new;
end;
$$;
revoke all on function public.fn_agenda_respeita_capacidade() from public, anon, authenticated;

-- `zzz`: gatilho BEFORE roda em ordem alfabética, e este conta por ÚLTIMO, depois de quem
-- ainda mexe no horário ou recusa por outro motivo (`trg_zz_meet_stamp`) — como o índice
-- único, que só era checado depois de todos.
drop trigger if exists trg_zzz_agenda_capacidade_insert on public.calendar_appointments;
create trigger trg_zzz_agenda_capacidade_insert
  before insert on public.calendar_appointments
  for each row when (new.status in ('pending', 'confirmed') and new.owner_user_id is not null)
  execute function public.fn_agenda_respeita_capacidade();

-- Só quando a OCUPAÇÃO muda: confirmar um pendente ou trocar a anotação de um compromisso
-- que já está de pé não recalcula nada (e não trava linha antiga sobreposta).
drop trigger if exists trg_zzz_agenda_capacidade_update on public.calendar_appointments;
create trigger trg_zzz_agenda_capacidade_update
  before update of starts_at, ends_at, owner_user_id, status on public.calendar_appointments
  for each row when (
    new.status in ('pending', 'confirmed') and new.owner_user_id is not null
    and (old.status not in ('pending', 'confirmed')
         or old.starts_at is distinct from new.starts_at
         or old.ends_at is distinct from new.ends_at
         or old.owner_user_id is distinct from new.owner_user_id)
  )
  execute function public.fn_agenda_respeita_capacidade();

-- O índice único sai (vetaria a 2ª cliente das 13h da Camila); a mesma chave volta sem
-- unicidade, porque é por ela que o gatilho e a coleta da agenda procuram.
drop index if exists public.calendar_appointments_sem_duplicata_idx;
create index if not exists calendar_appointments_dono_inicio_idx
  on public.calendar_appointments (organization_id, owner_user_id, starts_at)
  where status in ('pending', 'confirmed') and owner_user_id is not null;

-- fn_google_appointment: corpo da 0654, só a checagem de overlap do `apply_remote` trocada.
create or replace function public.fn_google_appointment(p_org uuid,p_id uuid,p_action text,p_args jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.calendar_appointments; c public.calendar_connection_calendars; conn public.calendar_connections;
 contact uuid; claim jsonb:=p_args->'claim'; result jsonb; b jsonb; changed boolean; remote jsonb;
begin
 select contact_id into contact from public.calendar_appointments where organization_id=p_org and id=p_id;
 if not found then raise exception 'appointment_not_found' using errcode='P0002';end if;
 if contact is not null then perform public.fn_service_lock(p_org,contact);end if;
 -- Seleção/reserva compartilham membership antes dos locks de calendário/appointment.
 perform 1 from public.user_organizations m join public.calendar_appointments x on x.organization_id=m.organization_id and x.owner_user_id=m.user_id
  where x.organization_id=p_org and x.id=p_id for update of m;
 if p_args?'calendar_fence' then
  perform public.fn_google_calendar_fence(p_org,(p_args->'calendar_fence'->>'id')::uuid,p_args->'calendar_fence'->'claim',p_args->'calendar_fence'->'cursor');
 end if;
 select * into a from public.calendar_appointments where organization_id=p_org and id=p_id for update;
 if a.contact_id is distinct from contact then raise exception 'appointment_stale' using errcode='PT409';end if;
 if contact is not null and exists(select 1 from public.contacts where organization_id=p_org and id=contact and is_anonymized) then
  if p_action='claim' then return jsonb_build_object('terminal','redacted');end if;
  raise exception 'google_contact_redacted' using errcode='42501';end if;
 if not exists(select 1 from public.user_organizations where organization_id=p_org and user_id=a.owner_user_id and revoked_at is null) then
  raise exception 'google_owner_unavailable' using errcode='42501';end if;
 if p_action='claim' then
  if a.google_claim_until>clock_timestamp() then return null;end if;
  if a.google_event_id is null and a.status<>'cancelled' then
   select k.* into c from public.calendar_connection_calendars k join public.calendar_connections x on x.id=k.connection_id and x.organization_id=k.organization_id
    where k.organization_id=p_org and x.user_id=a.owner_user_id and k.is_destination;
   if not found or (select count(*) from public.calendar_connection_calendars k join public.calendar_connections x on x.id=k.connection_id and x.organization_id=k.organization_id where k.organization_id=p_org and x.user_id=a.owner_user_id and k.is_destination)<>1 then
    update public.calendar_appointments set google_sync_error='Escolha uma agenda de destino nas configurações.',google_next_attempt_at=now()+interval '15 minutes' where organization_id=p_org and id=p_id;return null;
   end if;
   if not c.available or c.access_role not in ('owner','writer') then
    update public.calendar_appointments set google_sync_error='A agenda de destino não permite publicação. Confira o acesso nas configurações.',google_next_attempt_at=now()+interval '15 minutes' where organization_id=p_org and id=p_id;return null;end if;
   update public.calendar_appointments set google_connection_id=c.connection_id,google_calendar_id=c.external_calendar_id,
    google_event_id='deskcommapp'||replace(id::text,'-',''),google_pending_write='{"reservation":true}'::jsonb where organization_id=p_org and id=p_id returning * into a;
  end if;
  update public.calendar_appointments set google_claim_token=gen_random_uuid(),google_claim_epoch=google_claim_epoch+1,
   google_claim_until=clock_timestamp()+interval '90 seconds' where organization_id=p_org and id=p_id returning * into a;
 else
  if a.google_claim_token is distinct from (claim->>'token')::uuid or a.google_claim_epoch::text is distinct from claim->>'epoch'
   or a.google_claim_until is null or a.google_claim_until<=clock_timestamp() then raise exception 'google_stale' using errcode='PT409';end if;
  if p_action='renew' then
   if a.revision::text is distinct from p_args->>'revision' or a.google_local_revision::text is distinct from p_args->>'local_revision' then raise exception 'google_stale' using errcode='PT409';end if;
   if not exists(select 1 from public.calendar_connections x join public.calendar_connection_calendars k on k.organization_id=x.organization_id and k.connection_id=x.id
    where x.organization_id=p_org and x.id=a.google_connection_id and x.user_id=a.owner_user_id and x.status='healthy' and k.external_calendar_id=a.google_calendar_id and k.available and k.access_role in ('writer','owner')) then raise exception 'google_connection_unavailable' using errcode='42501';end if;
   update public.calendar_appointments set google_claim_until=clock_timestamp()+interval '90 seconds' where organization_id=p_org and id=p_id returning * into a;
  elsif p_action='release' then
   update public.calendar_appointments set google_claim_token=null,google_claim_until=null where organization_id=p_org and id=p_id;return 'true';
  else
   if a.revision::text is distinct from p_args->>'revision' or a.google_local_revision::text is distinct from p_args->>'local_revision'
    or a.google_event_id is distinct from p_args->>'event_id' or a.google_connection_id::text is distinct from p_args->>'connection_id'
    or a.google_calendar_id is distinct from p_args->>'calendar_id' then raise exception 'google_stale' using errcode='PT409';end if;
   if p_action='error' then
    update public.calendar_appointments set google_sync_error=left(p_args->>'message',200),google_next_attempt_at=now()+interval '15 minutes',
     meeting_state=case when meeting_state='pending' and meeting_attempts>=19 then 'failed' else meeting_state end,
     meeting_last_error=case when meeting_state='pending' then 'unknown' else meeting_last_error end,
     meeting_attempts=meeting_attempts+case when meeting_state='pending' then 1 else 0 end,
     meeting_next_attempt_at=case when meeting_state='pending' then now()+make_interval(secs=>least(900,15*power(2,least(meeting_attempts,6)))::double precision+floor(random()*5)) else meeting_next_attempt_at end
     where organization_id=p_org and id=p_id;return 'true';end if;
   if a.google_event_id is not null then
    select * into conn from public.calendar_connections where organization_id=p_org and id=a.google_connection_id and user_id=a.owner_user_id;
    select * into c from public.calendar_connection_calendars where organization_id=p_org and connection_id=a.google_connection_id and external_calendar_id=a.google_calendar_id;
    if conn.id is null or conn.status<>'healthy' or c.id is null or not c.available then raise exception 'google_connection_unavailable' using errcode='42501';end if;
   end if;
   if p_action='meet' then
    perform public.fn_meet_observe(p_org,p_id,p_args);
    select * into a from public.calendar_appointments where organization_id=p_org and id=p_id;
   elsif p_action='prepare' then
    if c.access_role not in ('owner','writer') or (a.google_pending_write is not null and a.google_pending_write<>'{"reservation":true}'::jsonb) or a.google_conflict is not null then raise exception 'google_write_unavailable' using errcode='PT409';end if;
    if p_args->'operation'?'conference_request_id' and (a.meeting_request_id is distinct from (p_args->'operation'->>'conference_request_id')::uuid or a.meeting_state<>'pending' or a.meeting_received_at is not null or a.status='cancelled') then raise exception 'meet_stale' using errcode='PT409';end if;
    update public.calendar_appointments set meeting_requested_at=case when p_args->'operation'?'conference_request_id' then coalesce(meeting_requested_at,now()) else meeting_requested_at end,google_pending_write=p_args->'operation' where organization_id=p_org and id=p_id;return 'true';
   elsif p_action='idle' then
   -- idle = convergente sem nada a fazer e sem falha nesta rodada: erro
   -- guardado aqui e de rodada passada e nao pode sobreviver (#2467).
    update public.calendar_appointments set google_sync_error=null,google_next_attempt_at=now()+interval '15 minutes' where organization_id=p_org and id=p_id;return 'true';
   elsif p_action='commit' then
    result:=p_args->'result'; b:=result->'base';remote:=result->'remote';
    if result?'operation_id' and a.google_pending_write->>'operation_id' is distinct from result->>'operation_id' then raise exception 'google_stale' using errcode='PT409';end if;
    if result?'apply_remote' then
     if a.status not in ('pending','confirmed') then raise exception 'google_outcome_protected' using errcode='PT409';end if;
     -- 9083: a sobreposição só é conflito quando estoura os atendimentos simultâneos do dono (capacidade 1 = qualquer sobreposição, como antes).
     if not coalesce((remote->>'cancelled')::boolean,false) and public.fn_agenda_lotada(p_org,a.owner_user_id,a.id,(remote->>'starts_at')::timestamptz,(remote->>'ends_at')::timestamptz) then
      return jsonb_build_object('overlap',true);end if;
     changed:=row(a.starts_at,a.ends_at,a.time_zone,a.status='cancelled') is distinct from row((remote->>'starts_at')::timestamptz,(remote->>'ends_at')::timestamptz,remote->>'time_zone',(remote->>'cancelled')::boolean);
     perform public.fn_appointment_change_core(p_org,p_id,a.revision,
      jsonb_build_object('starts_at',remote->>'starts_at','ends_at',remote->>'ends_at','time_zone',remote->>'time_zone')||
      case when (remote->>'cancelled')::boolean then '{"status":"cancelled","cancellation_reason":"Cancelado no Google"}'::jsonb else '{}'::jsonb end,true,b);
     if changed then
      insert into public.crm_lead_activities(organization_id,lead_id,contact_id,type,source_module,source_id,actor_kind,reason,payload)
       select p_org,l.lead_id,a.contact_id,case when (remote->>'cancelled')::boolean then 'appointment_cancelled' else 'appointment_rescheduled' end,
        'agenda',p_id,'system',case when (remote->>'cancelled')::boolean then 'Cancelado no Google' else 'Remarcado no Google' end,jsonb_build_object('origin','google','appointment_id',p_id,'resolution_actor_id',a.google_conflict->'resolution'->>'actor_id')
       from public.crm_lead_links l where l.organization_id=p_org and l.target_id=p_id and l.target_kind='appointment' group by l.lead_id;
     end if;
    end if;
    update public.calendar_appointments set
     google_base_projection=case when result?'base' then b else google_base_projection end,
     google_etag=case when result?'etag' then result->>'etag' else google_etag end,
     google_conflict=case when result?'conflict' then nullif(result->'conflict','null'::jsonb) else google_conflict end,
     google_pending_write=case when coalesce((result->>'retry_creation')::boolean,false) and a.google_base_projection is null and a.google_pending_write->>'method'='POST'
      then '{"reservation":true}'::jsonb when coalesce((result->>'clear_pending')::boolean,false) then null else google_pending_write end,
     google_synced_local_revision=case when coalesce((result->>'ack')::boolean,false) then a.google_local_revision else google_synced_local_revision end,
     google_synced_at=case when coalesce((result->>'ack')::boolean,false) then now() else google_synced_at end,
     google_sync_error=null,google_next_attempt_at=now()+interval '5 minutes'
     where organization_id=p_org and id=p_id returning * into a;
   else raise exception 'google_action_invalid' using errcode='22023';end if;
  end if;
 end if;
 return to_jsonb(a)||jsonb_build_object('revision',a.revision::text,'google_local_revision',a.google_local_revision::text,
  'google_synced_local_revision',a.google_synced_local_revision::text,'meeting_allowed_types',(select allowed_conference_types from public.calendar_connection_calendars where organization_id=p_org and connection_id=a.google_connection_id and external_calendar_id=a.google_calendar_id),'claim',jsonb_build_object('token',a.google_claim_token,'epoch',a.google_claim_epoch::text,'lease_until',a.google_claim_until));
end;$$;
revoke all on function public.fn_google_appointment(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.fn_google_appointment(uuid,uuid,text,jsonb) to service_role;

notify pgrst, 'reload schema';
