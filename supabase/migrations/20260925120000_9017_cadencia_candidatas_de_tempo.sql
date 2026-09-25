-- 9017 — CANDIDATOS DOS GATILHOS DE TEMPO DA CADÊNCIA (agent_sla / lead_idle).
--
-- A varredura roda a cada minuto. Buscando só pela janela de tempo e decidindo
-- o resto no código, ela reavaliava os MESMOS recusados todo minuto — contato
-- noutro fluxo, sem negócio no funil, bloqueado — e os 50 primeiros da fila
-- ocupavam o limite, deixando de fora quem violou o limiar depois. (Revisão
-- @Cassio_SecRev da PR 3b, P1-1.)
--
-- Esta função devolve só quem PODE entrar, já com o negócio e o instante da
-- violação. "Quem espera quem" (comparar `last_inbound_at` com
-- `last_outbound_at`) também mora aqui: o PostgREST não compara duas colunas.
--
-- A porta de inscrição (`lib/cadencia/inscrever.ts`) continua sendo a
-- autoridade: reconfere tudo, reserva a vaga do dia e aplica a LGPD. Esta
-- função só poupa o trabalho de levar à porta quem ela recusaria.
--
-- SECURITY INVOKER e só `service_role`: quem chama é o cron, com o client de
-- serviço. Criada ANTES da varredura anon.

create index if not exists idx_conversations_cadencia_espera_do_cliente
  on public.conversations (organization_id, channel_session_id, awaiting_since)
  where awaiting_since is not null;

create index if not exists idx_conversations_cadencia_espera_do_lead
  on public.conversations (organization_id, channel_session_id, last_outbound_at)
  where last_outbound_at is not null;

create or replace function public.fn_cadencia_candidatas_de_tempo(
  p_org uuid,
  p_pointer uuid,
  p_limite integer default 50
)
returns table (conversation_id uuid, contact_id uuid, lead_id uuid, evento_em timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  with cad as (
    select p.id,
           p.pipeline_id,
           p.channel_session_id,
           p.trigger_config->>'kind' as kind,
           make_interval(mins => (p.trigger_config->'params'->>'threshold_minutes')::int) as limiar
      from followup_flow_pointers p
     where p.organization_id = p_org
       and p.id = p_pointer
       and p.surface = 'cadence'
       and p.status = 'active'
       and p.trigger_config->>'kind' in ('agent_sla', 'lead_idle')
       and (p.trigger_config->'params'->>'threshold_minutes') ~ '^[0-9]+$'
  ),
  conv as (
    select cv.id,
           cv.contact_id,
           cad.id as pointer_id,
           cad.pipeline_id,
           case when cad.kind = 'agent_sla'
                then coalesce(cv.awaiting_since, cv.last_inbound_at)
                else cv.last_outbound_at
           end + cad.limiar as evento_em
      from cad
      join conversations cv
        on cv.organization_id = p_org
       and cv.channel_session_id = cad.channel_session_id
     where cv.status in ('open', 'pending', 'claimed', 'ai_handling')
       and cv.contact_id is not null
       and (
         -- agent_sla: o CLIENTE falou por último e espera além do limiar.
         (cad.kind = 'agent_sla'
          and cv.last_inbound_at is not null
          and (cv.last_outbound_at is null or cv.last_inbound_at > cv.last_outbound_at)
          and cv.awaiting_since is not null
          and cv.awaiting_since <= now() - cad.limiar
          and cv.awaiting_since >= now() - cad.limiar - interval '24 hours')
         or
         -- lead_idle: NÓS falamos por último e o lead não responde além do limiar.
         (cad.kind = 'lead_idle'
          and cv.last_outbound_at is not null
          and (cv.last_inbound_at is null or cv.last_inbound_at < cv.last_outbound_at)
          and cv.last_outbound_at <= now() - cad.limiar
          and cv.last_outbound_at >= now() - cad.limiar - interval '24 hours')
       )
  )
  select conv.id, conv.contact_id, neg.id, conv.evento_em
    from conv
    join contacts c
      on c.id = conv.contact_id
     and c.organization_id = p_org
    join lateral (
      select l.id
        from crm_leads l
       where l.organization_id = p_org
         and l.contact_id = conv.contact_id
         and l.pipeline_id = conv.pipeline_id
         and l.status = 'open'
       order by l.updated_at desc
       limit 1
    ) neg on true
   where not coalesce(c.is_blocked, false)
     and not coalesce(c.is_anonymized, false)
     and c.is_merged_into is null
     and not coalesce(c.force_human, false)
     and (c.consent->'marketing'->>'declined_at') is null
     -- um fluxo vivo por contato (a mesma lista do índice idx_followup_enrollments_one_live)
     and not exists (
       select 1 from followup_enrollments e
        where e.organization_id = p_org
          and e.contact_id = conv.contact_id
          and e.status in ('active', 'waiting_reply', 'paused_handoff', 'paused_manual')
     )
     -- o mesmo negócio não volta à mesma cadência em 30 dias
     and not exists (
       select 1 from followup_enrollments e
        where e.organization_id = p_org
          and e.pointer_id = conv.pointer_id
          and e.lead_id = neg.id
          and e.started_at >= now() - interval '30 days'
     )
   order by conv.evento_em
   limit greatest(1, least(coalesce(p_limite, 50), 200));
$$;

revoke all on function public.fn_cadencia_candidatas_de_tempo(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.fn_cadencia_candidatas_de_tempo(uuid, uuid, integer) to service_role;

notify pgrst, 'reload schema';
