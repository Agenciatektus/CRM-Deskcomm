-- manifest: **A visibilidade de cada conversa vale também na atribuição e no registro de eventos.** `fn_conversation_assign` passa a responder conversa fora da visibilidade de quem chama como conversa inexistente (zero linhas); as rotas já tratam zero linhas (404 na transferência, 409 ao assumir). A policy `event_log_select` passa a exigir, para evento ligado a uma conversa (`entity_kind` `conversation`/`conversation_note` pelo `entity_id`, ou `payload.conversation_id` nos demais), que a conversa seja visível a quem lê (`fn_can_view_conversation`, molde de `conversation_notes`); demais eventos e workers (service role) inalterados. Parte da definição vigente (0667). Mesmo conteúdo no apêndice do `supabase/baseline.sql`, antes da VARREDURA anon.

CREATE OR REPLACE FUNCTION public.fn_conversation_assign(p_organization_id uuid, p_conversation_id uuid, p_to_user_id uuid, p_reason text, p_expected_assignee uuid DEFAULT NULL::uuid, p_enforce_expected boolean DEFAULT false)
 RETURNS SETOF conversations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_from uuid;
  v_conv public.conversations%rowtype;
begin
  if not public.fn_support_write_allowed(p_organization_id) then raise exception 'support_readonly' using errcode='42501'; end if;
  if auth.uid() is not null
     and not public.fn_role_at_least(p_organization_id, 'agent') then
    raise exception 'caller_not_authorized_for_org'
      using hint = 'caller must be an active agent+ member of the organization';
  end if;

  if p_to_user_id is not null then
    if coalesce(public.fn_member_role_in_org(p_to_user_id, p_organization_id), 'none')
         not in ('agent','manager','admin') then
      raise exception 'assignee_not_eligible_member'
        using hint = 'target must be an active agent+ member of the organization';
    end if;
  end if;

  -- Conversa fora da visibilidade de quem chama responde como conversa
  -- inexistente (zero linhas). A regra fica no WHERE, com o dono da própria
  -- linha (reavaliado na versão nova se houver espera), nunca um valor do
  -- corpo. Service role (sem auth.uid) segue.
  select assigned_to_user_id into v_from
    from public.conversations
   where id = p_conversation_id
     and organization_id = p_organization_id
     and (auth.uid() is null or public.fn_can_view_conversation(organization_id, assigned_to_user_id))
   for no key update;

  if not found then
    return;
  end if;

  if p_enforce_expected and v_from is distinct from p_expected_assignee then
    return;
  end if;

  update public.conversations
     set assigned_to_user_id = p_to_user_id,
         -- Desnormalizado JUNTO com o dono, na mesma transação: nunca existe
         -- uma janela em que id e nome discordam. NULL junto com o id quando
         -- a atribuição é removida (release) — nunca sobra um nome órfão de
         -- dono nenhum. Lido de auth.users porque quem chama esta função
         -- (RPC) não necessariamente tem acesso ao Admin API — a definer
         -- resolve por dentro.
         assigned_to_user_name = case
           when p_to_user_id is null then null
           else (select raw_user_meta_data ->> 'full_name' from auth.users where id = p_to_user_id)
         end,
         assigned_at = case when p_to_user_id is null then null else now() end,
         assignee_kind = case when p_to_user_id is null then null else 'user' end,
         status = case when p_to_user_id is null then 'open' else 'claimed' end,
         status_changed_at = now(),
         unread_count_for_assignee = 0,
         bot_silenced_until = case
           when p_reason = 'routing'  then bot_silenced_until
           when p_to_user_id is null  then (case when last_handoff_at is null
                                                 then null
                                                 else bot_silenced_until end)
           else 'infinity'::timestamptz
         end,
         updated_at = now()
   where id = p_conversation_id
   returning * into v_conv;

  insert into public.conversation_assignment_events
    (organization_id, conversation_id, from_user_id, to_user_id, changed_by, reason)
  values
    (p_organization_id, p_conversation_id, v_from, p_to_user_id, auth.uid(), p_reason);

  return next v_conv;
end;
$function$;

revoke all     on function public.fn_conversation_assign(uuid, uuid, uuid, text, uuid, boolean) from public, anon;
grant  execute on function public.fn_conversation_assign(uuid, uuid, uuid, text, uuid, boolean) to authenticated, service_role;

-- event_log: evento ligado a uma conversa segue a visibilidade da própria
-- conversa (mesmo molde de conversation_notes e ai_reply_drafts). Ligado =
-- entity_kind 'conversation' ou 'conversation_note' (o entity_id é o id da
-- conversa) ou, nos demais, payload.conversation_id com forma de uuid. Demais
-- eventos seguem só o pertencimento à organização, como antes. Workers usam a
-- service role e não passam por aqui. Troca de policy num bloco só: o update.sh
-- reaplica o baseline sem ON_ERROR_STOP, e drop/create soltos poderiam deixar
-- a tabela sem policy de leitura.
--
-- Custo: o ramo "visão ampla" é uma subconsulta SEM correlação — o Postgres a
-- avalia uma vez por consulta. Sem ele, a contagem de eventos das telas de
-- gestão (Evolução, Uso de IA) pagaria o exists por linha. A lista de papéis
-- repete a de fn_can_view_conversation (viewer/manager/admin liberam por papel):
-- se ela mudar, mude aqui também. O ramo do atendente (agent) paga o exists por
-- linha; nenhuma tela do produto lê event_log com sessão de agent.
do $$
begin
  drop policy if exists "event_log_select" on public.event_log;
  create policy "event_log_select" on public.event_log
    for select using (
      (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin())
      and (
        organization_id in (
          select o from public.fn_user_org_ids() o
           where public.fn_user_role_in_org(o) in ('viewer', 'manager', 'admin')
        )
        or exists (
          select 1
            from (select case
                    when event_log.entity_kind in ('conversation', 'conversation_note') then event_log.entity_id
                    when event_log.payload ->> 'conversation_id'
                         ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                      then (event_log.payload ->> 'conversation_id')::uuid
                  end as conversa) r
           where r.conversa is null
              or exists (
                select 1 from public.conversations c
                 where c.organization_id = event_log.organization_id
                   and c.id = r.conversa
                   and public.fn_can_view_conversation(c.organization_id, c.assigned_to_user_id)
              )
        )
      )
    );
end $$;
