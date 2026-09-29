-- 9018 — A IA ASSUME QUANDO O LEAD RESPONDE À CADÊNCIA E CONDUZ ATÉ A ETAPA-ALVO.
--
-- A cadência ganha uma escolha: quando o lead responde, quem atende é uma
-- pessoa (como hoje) ou um agente de IA, que conduz a conversa até uma etapa do
-- funil. A escolha mora em `cadence_settings.conducao` (rascunho, editado pela
-- tela) e é copiada, IMUTÁVEL, para a versão publicada
-- (`followup_flow_versions.cadence_conducao`) na MESMA transação da publicação.
-- O runtime nunca lê o rascunho: lê a versão da inscrição.
--
-- `cadencia_conducoes` é a âncora ÚNICA da condução: agente, modo (automático ou
-- assistido), objetivo, etapa-alvo, instrução, funil, expiração e contador de
-- turnos — um snapshot copiado da versão no instante em que o lead respondeu.
-- Uma condução viva por conversa (índice único parcial).
--
-- Agente × modo: `automatico` exige agente com `operation_mode='automatic'`;
-- `assistido` aceita os dois (a pessoa aprova cada resposta). O modo vem SEMPRE
-- da condução, nunca de `ai_agents.operation_mode`.
--
-- As três funções são SECURITY DEFINER e só `service_role`: quem chama é o
-- motor (reatividade, dreno, handler de objetivo) e a rota de publicação, com o
-- client de serviço. Nenhuma é executável por `authenticated`.
--
-- ⚠️ ENTRA ANTES DO BLOCO DA VARREDURA anon: cria função.
-- Aditiva e idempotente, sem backfill.

alter table public.followup_flow_versions
  add column if not exists cadence_conducao jsonb;

comment on column public.followup_flow_versions.cadence_conducao is
  'Snapshot IMUTÁVEL de cadence_settings.conducao no instante da publicação (migration 9018). Só cadência; null = atendente humano. Validado por lib/cadencia/conducao/settings.ts. Gravado só por fn_cadencia_publicar_versao.';

create table if not exists public.cadencia_conducoes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  contact_id      uuid not null references public.contacts(id) on delete cascade,
  lead_id         uuid references public.crm_leads(id) on delete set null,
  pointer_id      uuid not null references public.followup_flow_pointers(id) on delete cascade,
  version_id      uuid not null references public.followup_flow_versions(id),
  enrollment_id   uuid references public.followup_enrollments(id) on delete set null,
  agent_id        uuid not null references public.ai_agents(id),
  pipeline_id     uuid not null references public.crm_pipelines(id),
  modo            text not null default 'automatico'
                    check (modo in ('automatico', 'assistido')),
  preset          text not null
                    check (preset in ('agendar_reuniao', 'agendar_visita', 'vender', 'qualificar')),
  etapa_alvo_id   uuid not null references public.crm_stages(id),
  instrucao       text check (instrucao is null or length(instrucao) <= 2000),
  turnos          integer not null default 0 check (turnos >= 0),
  aberta_em       timestamptz not null default now(),
  expira_em       timestamptz not null default now() + interval '14 days',
  encerrada_em    timestamptz,
  motivo          text check (motivo is null or motivo in (
                    'objetivo_atingido', 'handoff', 'teto_de_turnos', 'expirou',
                    'agente_indisponivel', 'cancelada_manual')),
  check (expira_em <= aberta_em + interval '14 days'),
  check ((encerrada_em is null) = (motivo is null))
);

comment on table public.cadencia_conducoes is
  'Condução da conversa por um agente de IA depois que o lead respondeu à cadência (migration 9018). Âncora ÚNICA: o turno lê agente, modo, objetivo, etapa-alvo e instrução DAQUI (nunca do payload do job). Uma viva por conversa. Só service_role.';

-- UMA condução viva por conversa.
create unique index if not exists cadencia_conducoes_uma_viva_por_conversa
  on public.cadencia_conducoes (conversation_id) where encerrada_em is null;
create index if not exists cadencia_conducoes_viva_por_lead
  on public.cadencia_conducoes (organization_id, lead_id) where encerrada_em is null;
create index if not exists cadencia_conducoes_viva_por_contato
  on public.cadencia_conducoes (organization_id, contact_id) where encerrada_em is null;
create index if not exists cadencia_conducoes_expiracao
  on public.cadencia_conducoes (expira_em) where encerrada_em is null;

-- Só service_role (motor, dreno e rotas com admin client): RLS ligada e SEM policy.
alter table public.cadencia_conducoes enable row level security;
revoke all on table public.cadencia_conducoes from anon, authenticated;

-- O LEAD RESPONDEU À CADÊNCIA. Numa transação só: cancela a inscrição e, se a
-- versão manda a IA atender e tudo está em ordem, abre a condução, fixa o agente
-- na conversa e autoriza o contato. Qualquer pré-condição que falha devolve
-- `modo='atendente'` com o motivo — quem chamou passa a conversa para uma pessoa.
-- Idempotente: a segunda chamada para a mesma inscrição devolve `ja_encerrada`.
create or replace function public.fn_cadencia_lead_respondeu(p_org uuid, p_enrollment uuid, p_event_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $cad_resp$
declare
  r        record;
  conf     jsonb;
  v_modo   text;
  v_modo_conducao text;
  v_motivo text;
  v_id     uuid;
  v_agent  uuid;
  v_etapa  uuid;
  v_conv   record;
  v_ct     record;
  v_uuid   constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  select fe.id, fe.status, fe.conversation_id, fe.contact_id, fe.lead_id, fe.version_id,
         fe.current_node_id, p.id as pointer_id, p.pipeline_id, v.cadence_conducao
    into r
    from followup_enrollments fe
    join followup_flow_pointers p on p.id = fe.pointer_id and p.organization_id = fe.organization_id
    join followup_flow_versions v on v.id = fe.version_id
   where fe.organization_id = p_org and fe.id = p_enrollment and p.surface = 'cadence'
   for update of fe;
  if not found then
    raise exception 'cadencia_inscricao_nao_encontrada' using errcode = 'P0002';
  end if;
  if r.status not in ('active', 'waiting_reply', 'dormente', 'paused_handoff', 'paused_manual') then
    return jsonb_build_object('ja_encerrada', true);
  end if;

  conf := case when jsonb_typeof(r.cadence_conducao) = 'object' then r.cadence_conducao else '{}'::jsonb end;
  v_modo := case when conf->>'quem_atende' = 'ia' then 'ia' else 'atendente' end;
  v_modo_conducao := case when conf->>'modo' = 'assistido' then 'assistido' else 'automatico' end;

  update followup_enrollments
     set status = 'cancelled', outcome = 'replied',
         cancel_reason = 'lead_respondeu:' || v_modo,
         next_eval_at = null, claimed_until = null,
         completed_at = now(), updated_at = now()
   where id = r.id;

  if v_modo = 'ia' then
    if coalesce(conf->>'agent_id', '') !~ v_uuid
       or coalesce(conf->>'etapa_alvo_id', '') !~ v_uuid
       or coalesce(conf->>'preset', '') not in ('agendar_reuniao', 'agendar_visita', 'vender', 'qualificar')
       or r.pipeline_id is null then
      v_modo := 'atendente'; v_motivo := 'config_invalida';
    end if;
  end if;

  if v_modo = 'ia' then
    select c.id, c.is_group, c.status, c.bot_silenced_until, c.assignee_kind
      into v_conv
      from conversations c
     where c.organization_id = p_org and c.id = r.conversation_id;
    if not found then
      v_modo := 'atendente'; v_motivo := 'conversa_indisponivel';
    elsif coalesce(v_conv.is_group, false)
       or v_conv.status not in ('open', 'pending', 'claimed', 'ai_handling')
       or (v_conv.bot_silenced_until is not null and v_conv.bot_silenced_until > now())
       or v_conv.assignee_kind is not distinct from 'user' then
      v_modo := 'atendente'; v_motivo := 'conversa_indisponivel';
    end if;
  end if;

  if v_modo = 'ia' then
    select ct.id, ct.is_blocked, ct.force_human, ct.is_anonymized, ct.is_merged_into, ct.consent
      into v_ct
      from contacts ct
     where ct.organization_id = p_org and ct.id = r.contact_id;
    if not found then
      v_modo := 'atendente'; v_motivo := 'contato_indisponivel';
    elsif coalesce(v_ct.is_blocked, false)
       or coalesce(v_ct.force_human, false)
       or coalesce(v_ct.is_anonymized, false)
       or v_ct.is_merged_into is not null
       or (v_ct.consent->'marketing'->>'declined_at') is not null then
      v_modo := 'atendente'; v_motivo := 'contato_indisponivel';
    end if;
  end if;

  if v_modo = 'ia' then
    -- Automático exige agente automático; assistido aceita os dois.
    select a.id into v_agent
      from ai_agents a
      join ai_agent_versions av
        on av.id = a.published_version_id and av.agent_id = a.id and av.organization_id = a.organization_id
     where a.organization_id = p_org
       and a.id = (conf->>'agent_id')::uuid
       and a.archived_at is null
       and a.paused_at is null
       and av.status = 'published'
       and (a.operation_mode = 'automatic' or v_modo_conducao = 'assistido');
    if v_agent is null then
      v_modo := 'atendente'; v_motivo := 'agente_indisponivel';
    end if;
  end if;

  if v_modo = 'ia' then
    select s.id into v_etapa
      from crm_stages s
     where s.organization_id = p_org
       and s.id = (conf->>'etapa_alvo_id')::uuid
       and s.pipeline_id = r.pipeline_id
       and not coalesce(s.is_archived, false)
       and not coalesce(s.is_lost, false);
    if v_etapa is null then
      v_modo := 'atendente'; v_motivo := 'etapa_alvo_invalida';
    end if;
  end if;

  if v_modo = 'ia' then
    insert into cadencia_conducoes (organization_id, conversation_id, contact_id, lead_id, pointer_id, version_id,
                                    enrollment_id, agent_id, pipeline_id, modo, preset, etapa_alvo_id, instrucao)
    values (p_org, r.conversation_id, r.contact_id, r.lead_id, r.pointer_id, r.version_id,
            r.id, v_agent, r.pipeline_id, v_modo_conducao, conf->>'preset', v_etapa,
            left(nullif(btrim(conf->>'instrucao'), ''), 2000))
    on conflict (conversation_id) where encerrada_em is null do nothing
    returning id into v_id;
    if v_id is null then
      -- Outra condução já está viva nesta conversa: ela continua valendo.
      select cc.id into v_id
        from cadencia_conducoes cc
       where cc.conversation_id = r.conversation_id and cc.encerrada_em is null;
    else
      update conversations
         set active_ai_agent_id = v_agent, active_intent = null, active_agent_set_at = now()
       where organization_id = p_org and id = r.conversation_id;
      -- Autoriza só quem não tem autorização de outra origem: a de outra origem
      -- vale por si e não pode ser apagada quando a condução acabar.
      update contacts
         set ai_authorized_at = now(), ai_authorized_reason = 'cadencia:' || r.pointer_id::text
       where organization_id = p_org and id = r.contact_id
         and (ai_authorized_at is null or ai_authorized_reason like 'cadencia:%');
    end if;
  end if;

  insert into followup_enrollment_events (organization_id, enrollment_id, node_id, event_type, payload, idempotency_key)
  values (p_org, r.id, r.current_node_id, 'cadencia_lead_respondeu',
          jsonb_build_object('modo', v_modo, 'motivo', v_motivo, 'conducao_id', v_id, 'event_log_id', p_event_id),
          'cadencia-resposta:' || r.id::text)
  on conflict do nothing;

  return jsonb_build_object(
    'ja_encerrada', false,
    'modo', v_modo,
    'modo_conducao', case when v_modo = 'ia' then v_modo_conducao end,
    'motivo', v_motivo,
    'conducao_id', v_id,
    'conversation_id', r.conversation_id,
    'lead_id', r.lead_id,
    'contact_id', r.contact_id,
    'pointer_id', r.pointer_id);
end;
$cad_resp$;

revoke all on function public.fn_cadencia_lead_respondeu(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.fn_cadencia_lead_respondeu(uuid, uuid, uuid) to service_role;

-- ENCERRA a condução (CAS em `encerrada_em is null`): solta o agente da conversa
-- (só se ainda for o dela) e revoga a autorização (só se ainda for da cadência).
-- Devolve false quando já estava encerrada ou é de outra organização.
create or replace function public.fn_cadencia_encerrar_conducao(p_org uuid, p_conducao uuid, p_motivo text)
returns boolean language plpgsql security definer set search_path = public as $cad_enc$
declare
  c record;
begin
  update cadencia_conducoes
     set encerrada_em = now(), motivo = p_motivo
   where organization_id = p_org and id = p_conducao and encerrada_em is null
  returning conversation_id, contact_id, agent_id, pointer_id into c;
  if not found then
    return false;
  end if;
  update conversations
     set active_ai_agent_id = null, active_intent = null, active_agent_set_at = null
   where organization_id = p_org and id = c.conversation_id and active_ai_agent_id = c.agent_id;
  update contacts
     set ai_authorized_at = null, ai_authorized_reason = null
   where organization_id = p_org and id = c.contact_id
     and ai_authorized_reason = 'cadencia:' || c.pointer_id::text;
  return true;
end;
$cad_enc$;

revoke all on function public.fn_cadencia_encerrar_conducao(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.fn_cadencia_encerrar_conducao(uuid, uuid, text) to service_role;

-- PUBLICAR CADÊNCIA = publicar o grafo + gravar o snapshot da condução na MESMA
-- versão, na mesma transação. `p_conducao` null = atendente humano.
create or replace function public.fn_cadencia_publicar_versao(
  p_org uuid, p_pointer uuid, p_graph jsonb, p_created_by uuid, p_conducao jsonb
)
returns uuid language plpgsql security definer set search_path = public as $cad_pub$
declare
  v uuid;
begin
  if not exists (
    select 1 from followup_flow_pointers
     where organization_id = p_org and id = p_pointer and surface = 'cadence'
  ) then
    raise exception 'pointer_not_found' using errcode = 'P0001';
  end if;
  if p_conducao is not null and jsonb_typeof(p_conducao) <> 'object' then
    raise exception 'conducao_invalida' using errcode = '22023';
  end if;
  v := public.fn_publish_followup_flow_version(p_org, p_pointer, p_graph, p_created_by);
  update followup_flow_versions
     set cadence_conducao = p_conducao
   where organization_id = p_org and id = v;
  return v;
end;
$cad_pub$;

revoke all on function public.fn_cadencia_publicar_versao(uuid, uuid, jsonb, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.fn_cadencia_publicar_versao(uuid, uuid, jsonb, uuid, jsonb) to service_role;

notify pgrst, 'reload schema';
