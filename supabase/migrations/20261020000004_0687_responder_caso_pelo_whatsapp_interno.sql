-- manifest: Permite que o número interno responda a um caso pelo WhatsApp e retome a IA.

-- A mensagem recebida é idempotente por organização e id de mensagem do canal.
-- O valor fica em metadata, junto do evento que já registra a resposta humana;
-- a cascata LGPD já limpa metadata de agent_case_events.
create unique index if not exists agent_case_events_whatsapp_message_unica
  on public.agent_case_events (organization_id, (metadata->>'whatsapp_message_key'))
  where kind = 'human_replied' and metadata ? 'whatsapp_message_key';

create or replace function public.fn_responder_caso_por_whatsapp(
  p_org uuid,
  p_case uuid,
  p_session uuid,
  p_phone_variants text[],
  p_action text,
  p_body text,
  p_message_key text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_contact_id uuid;
  v_delivery_id uuid;
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role'
  );
begin
  if coalesce(v_role, '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('resolved', 'need_lead_info') then
    raise exception 'invalid_case_reply_action' using errcode = '22023';
  end if;
  if p_body is null or char_length(btrim(p_body)) not between 1 and 4000 then
    raise exception 'invalid_case_reply_body' using errcode = '22023';
  end if;
  if p_message_key is null or char_length(p_message_key) not between 1 and 300 then
    raise exception 'invalid_case_reply_message_key' using errcode = '22023';
  end if;

  -- Serializa a reentrega do mesmo webhook. Se o mesmo id chegar depois que o
  -- caso for reaberto para uma pergunta nova, continua sendo a mesma resposta.
  perform pg_advisory_xact_lock(hashtextextended(p_org::text || ':' || p_message_key, 0));
  if exists (
    select 1 from public.agent_case_events e
     where e.organization_id = p_org
       and e.kind = 'human_replied'
       and e.metadata->>'whatsapp_message_key' = p_message_key
  ) then
    return 'duplicate';
  end if;

  -- O telefone e o canal precisam continuar sendo os configurados agora, e o
  -- caso precisa ter sido efetivamente avisado por essa mesma conexão e destino.
  -- A entrega enviada é a prova que a pessoa recebeu autorização para responder.
  if not exists (
    select 1
      from public.config_aviso_de_caso cfg
     where cfg.organization_id = p_org
       and cfg.ligado = true
       and cfg.channel_session_id = p_session
       and cfg.telefone_destino = any(p_phone_variants)
     for update
  ) then
    return 'unauthorized';
  end if;

  select conv.contact_id, entrega.id
    into v_contact_id, v_delivery_id
    from public.agent_cases caso
    join public.conversations conv
      on conv.organization_id = caso.organization_id
     and conv.id = caso.conversation_id
    join public.entregas_de_aviso_de_caso entrega
      on entrega.organization_id = caso.organization_id
     and entrega.case_id = caso.id
   where caso.organization_id = p_org
     and caso.id = p_case
     and caso.status = 'awaiting_human'
     and entrega.status = 'enviado'
     and entrega.channel_session_id = p_session
     and entrega.destino = any(p_phone_variants)
   for update of caso;

  if v_delivery_id is null or v_contact_id is null then
    return 'case_unavailable';
  end if;

  if p_action = 'resolved' then
    update public.agent_cases
       set status = 'resolved', closed_at = now(), updated_at = now()
     where organization_id = p_org and id = p_case and status = 'awaiting_human';
    if not found then return 'case_unavailable'; end if;

    insert into public.agent_case_events
      (organization_id, case_id, kind, actor_kind, human_action, body, metadata)
    values
      (p_org, p_case, 'human_replied', 'human', 'resolved', p_body,
       jsonb_build_object('source', 'whatsapp', 'whatsapp_message_key', p_message_key,
                          'channel_session_id', p_session)),
      (p_org, p_case, 'resolved', 'human', null, null,
       jsonb_build_object('source', 'whatsapp', 'channel_session_id', p_session));
  else
    update public.agent_cases
       set status = 'awaiting_lead', updated_at = now()
     where organization_id = p_org and id = p_case and status = 'awaiting_human';
    if not found then return 'case_unavailable'; end if;

    insert into public.agent_case_events
      (organization_id, case_id, kind, actor_kind, human_action, body, metadata)
    values
      (p_org, p_case, 'human_replied', 'human', 'need_lead_info', p_body,
       jsonb_build_object('source', 'whatsapp', 'whatsapp_message_key', p_message_key,
                          'channel_session_id', p_session)),
      (p_org, p_case, 'lead_asked', 'human', null, null,
       jsonb_build_object('source', 'whatsapp', 'channel_session_id', p_session));
  end if;

  -- A transição, os eventos e a retomada entram no mesmo commit. Se a fila não
  -- aceitar o job, o webhook pode ser reentregue e nenhum caso fica sem retomada.
  insert into public.job_queue (organization_id, contact_id, kind, payload)
  values (
    p_org,
    v_contact_id,
    'case_reply_turn',
    jsonb_build_object('case_id', p_case, 'action', p_action, 'body', p_body)
  );

  return 'accepted';
end;
$$;

revoke all on function public.fn_responder_caso_por_whatsapp(uuid, uuid, uuid, text[], text, text, text)
  from public, anon, authenticated;
grant execute on function public.fn_responder_caso_por_whatsapp(uuid, uuid, uuid, text[], text, text, text)
  to service_role;
