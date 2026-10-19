-- 9053: levar o negócio para outro funil MOVE o mesmo card; a origem segue contando a passagem.
--
-- Prova: tests/invariants/troca-de-funil-move-o-card-9053.test.ts (mover não duplica, a
-- origem mantém o ganho na métrica, isolamento entre organizações, INVOKER sem anon).
-- Ordem do deploy: migration ANTES do app (o app novo chama fn_mover_lead_de_funil).
set lock_timeout = '3s';

-- ---- levar o negócio para outro funil MOVE o mesmo card (migration 9053) ----
--
-- Decisão do Peterson (19/10/2026), regra de produto: levar um negócio para outro
-- funil MOVE O MESMO CARD (o mesmo `crm_leads.id`) e nunca clona. O caso típico é o
-- ganho no funil de vendas que segue para o funil de pós-venda ou recompra: conversa,
-- atividades, linha do tempo, etiquetas e campos vão junto, e duplicata é proibida.
--
-- O funil de ORIGEM continua contando aquela passagem (ganhos, perdas, valor) depois
-- que o card sai. Como o card passa a ser trabalhado no destino (status volta a
-- `open`), a contagem não pode mais vir do `pipeline_id`/`status` atuais: vem desta
-- tabela, uma linha por saída, com o retrato do negócio NA HORA em que saiu
-- (funil, etapa, status, valor, motivo, responsável e `closed_at` da época).
--
-- `crm_desfechos_de_negocio` junta os dois lados (o desfecho atual de cada negócio e
-- os desfechos que ficaram para trás nas passagens) e é o que as métricas leem.
-- SECURITY INVOKER: a RLS das duas tabelas vale para quem consulta.
--
-- `fn_mover_lead_de_funil` faz a troca (UPDATE; o retrato vem do gatilho DEFINER), também
-- INVOKER: o usuário precisa poder atualizar o negócio pela RLS de `crm_leads`, como
-- no arrasto. O UPDATE de `stage_id` dispara `fn_crm_lead_close_on_stage`, que reabre
-- o negócio (`status = 'open'`, `closed_at` nulo) por ser a etapa de destino aberta:
-- won→open emite só `lead.reopened` (registro sem consumidor, 0239). Nenhum
-- `lead.won`, `lead.lost`, `lead.created` ou `lead.stage_changed` sai daqui, então
-- nenhuma conversão de anúncio e nenhuma cadência de lead novo.
--
-- Sem backfill: as trocas antigas foram clones (o par origem perdida
-- `moved_to_another_pipeline` + negócio novo), e os dois lados delas já contam
-- certo pelo `crm_leads`. Idempotente (`if not exists`, `create or replace`,
-- `drop policy if exists`).

create table if not exists public.crm_lead_passagens_de_funil (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  lead_id            uuid not null,
  -- FKs com `on delete set null` (lição da 9032: apagar funil ou etapa não pode
  -- ser recusado por um retrato; a referência zera e o desfecho segue na org).
  de_pipeline_id     uuid references public.crm_pipelines(id) on delete set null,
  de_stage_id        uuid references public.crm_stages(id) on delete set null,
  status_na_saida    text not null check (status_na_saida in ('open', 'won', 'lost')),
  value_cents        bigint,
  currency           text,
  lost_reason        text,
  lost_from_stage_id uuid,
  owner_user_id      uuid,
  closed_at          timestamptz,
  para_pipeline_id   uuid references public.crm_pipelines(id) on delete set null,
  para_stage_id      uuid references public.crm_stages(id) on delete set null,
  movido_em          timestamptz not null default now(),
  movido_por_user_id uuid,
  -- FK só no id (crm_leads não tem unique (organization_id, id)); a organização
  -- é a do negócio: a função copia a dele, e a policy de insert confere.
  constraint crm_lead_passagens_lead_fk
    foreign key (lead_id) references public.crm_leads (id) on delete cascade,
  constraint crm_lead_passagens_fechada_tem_data
    check (status_na_saida = 'open' or closed_at is not null)
);

comment on table public.crm_lead_passagens_de_funil is
  'Uma linha por vez que um negócio saiu de um funil para outro (o MESMO crm_leads.id, decisão do Peterson em 19/10/2026: mover não clona). Retrato do negócio na saída: funil, etapa, status, valor, motivo, responsável e closed_at da época. É o que mantém o ganho, a perda e o valor contados no funil de ORIGEM depois que o card sai. Escrita SÓ pelo gatilho trg_crm_leads_passagem_de_funil (SECURITY DEFINER, AFTER UPDATE OF pipeline_id, lendo OLD): authenticated/anon não inserem. Migration 9053.';

create index if not exists crm_lead_passagens_org_de_pipeline
  on public.crm_lead_passagens_de_funil (organization_id, de_pipeline_id, closed_at);
create index if not exists crm_lead_passagens_lead
  on public.crm_lead_passagens_de_funil (lead_id);

alter table public.crm_lead_passagens_de_funil enable row level security;

-- Quem vê a passagem é quem vê o negócio: o `exists` passa pela RLS de crm_leads de
-- quem consulta (agent em modo own só conta o que é dele).
drop policy if exists crm_lead_passagens_select on public.crm_lead_passagens_de_funil;
create policy crm_lead_passagens_select on public.crm_lead_passagens_de_funil
  for select using (
    (select public.fn_is_platform_admin())
    or (organization_id in (select public.fn_user_org_ids())
        and exists (select 1 from public.crm_leads l
                     where l.id = crm_lead_passagens_de_funil.lead_id
                       and l.organization_id = crm_lead_passagens_de_funil.organization_id))
  );

-- Ninguém do lado do cliente ESCREVE retrato (P1 do @Cassio_SecRev na #206: com
-- insert liberado, um agent gravava ganho falso e inflava as métricas). Sem policy
-- de insert/update/delete e sem o grant: quem grava é o gatilho abaixo, que lê o
-- OLD real do negócio.
drop policy if exists crm_lead_passagens_insert on public.crm_lead_passagens_de_funil;
revoke all on public.crm_lead_passagens_de_funil from anon, authenticated;
grant select on public.crm_lead_passagens_de_funil to authenticated;
grant all on public.crm_lead_passagens_de_funil to service_role;

-- O retrato da saída, gravado na troca de `pipeline_id` de QUALQUER caminho (a
-- função abaixo, ou um UPDATE direto que a RLS de crm_leads permita): o OLD é o
-- negócio como estava. `movido_por_user_id` = auth.uid(); sem sessão (service_role,
-- automação) vale o `app.movido_por` que fn_mover_lead_de_funil põe na transação,
-- e sem ele fica nulo (ator de sistema).
create or replace function public.fn_crm_leads_passagem_de_funil()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.crm_lead_passagens_de_funil (
    organization_id, lead_id, de_pipeline_id, de_stage_id, status_na_saida,
    value_cents, currency, lost_reason, lost_from_stage_id, owner_user_id, closed_at,
    para_pipeline_id, para_stage_id, movido_por_user_id
  ) values (
    old.organization_id, old.id, old.pipeline_id, old.stage_id, old.status,
    old.value_cents, old.currency,
    case when old.status = 'lost' then old.lost_reason end,
    case when old.status = 'lost' then old.lost_from_stage_id end,
    old.owner_user_id,
    case when old.status in ('won', 'lost') then old.closed_at end,
    new.pipeline_id, new.stage_id,
    coalesce(auth.uid(), nullif(current_setting('app.movido_por', true), '')::uuid)
  );
  return null;
end;
$$;

revoke all on function public.fn_crm_leads_passagem_de_funil() from public, anon, authenticated;

drop trigger if exists trg_crm_leads_passagem_de_funil on public.crm_leads;
create trigger trg_crm_leads_passagem_de_funil
  after update of pipeline_id on public.crm_leads
  for each row
  when (old.pipeline_id is distinct from new.pipeline_id)
  execute function public.fn_crm_leads_passagem_de_funil();

-- Os desfechos que as métricas contam: o atual de cada negócio fechado e os que
-- ficaram para trás nas passagens. `pipeline_id` é o funil DA ÉPOCA do desfecho.
create or replace view public.crm_desfechos_de_negocio
with (security_invoker = true) as
  select l.organization_id, l.id as lead_id, l.pipeline_id, l.stage_id,
         l.status, l.value_cents, l.currency, l.lost_reason, l.lost_from_stage_id,
         l.owner_user_id, l.closed_at, 'atual'::text as origem
    from public.crm_leads l
   where l.status in ('won', 'lost')
  union all
  select p.organization_id, p.lead_id, p.de_pipeline_id, p.de_stage_id,
         p.status_na_saida, p.value_cents, p.currency, p.lost_reason, p.lost_from_stage_id,
         p.owner_user_id, p.closed_at, 'passagem'::text
    from public.crm_lead_passagens_de_funil p
   where p.status_na_saida in ('won', 'lost');

comment on view public.crm_desfechos_de_negocio is
  'Ganhos e perdas para métrica: o desfecho atual de cada negócio (crm_leads) mais os desfechos que ficaram no funil de origem quando o card foi levado a outro funil (crm_lead_passagens_de_funil). pipeline_id é o funil da época. security_invoker: vale a RLS de quem consulta. Migration 9053.';

revoke all on public.crm_desfechos_de_negocio from anon, public;
grant select on public.crm_desfechos_de_negocio to authenticated, service_role;

create or replace function public.fn_mover_lead_de_funil(
  p_org uuid,
  p_lead uuid,
  p_pipeline uuid,
  p_stage uuid,
  p_ator uuid default null
) returns public.crm_leads
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_lead  public.crm_leads%rowtype;
  v_pos   numeric;
  v_saida public.crm_leads%rowtype;
begin
  select * into v_lead from public.crm_leads
   where id = p_lead and organization_id = p_org
   for update;
  if not found then
    raise exception 'lead_not_found' using errcode = 'P0002';
  end if;
  if v_lead.pipeline_id = p_pipeline then
    raise exception 'pipeline_unchanged' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.crm_stages s
     where s.id = p_stage and s.pipeline_id = p_pipeline and s.organization_id = p_org
       and not s.is_archived and not s.is_won and not s.is_lost
  ) then
    raise exception 'stage_pipeline_mismatch' using errcode = '22023';
  end if;

  -- O retrato é do gatilho trg_crm_leads_passagem_de_funil. `p_ator` só vale sem
  -- sessão (service_role/automação): com usuário logado, o ator é auth.uid() e o
  -- que o cliente mandar é ignorado (P2 do Cassio na #206).
  if auth.uid() is null and p_ator is not null then
    perform set_config('app.movido_por', p_ator::text, true);
  end if;

  select coalesce(max(position_in_stage), 0) + 1000 into v_pos
    from public.crm_leads where organization_id = p_org and stage_id = p_stage;

  -- O valor de um GANHO já foi contado na venda (e segue contado na origem pela
  -- passagem acima): no destino o card começa sem valor, senão a soma do funil de
  -- pós-venda mostraria a venda passada como negócio em aberto.
  update public.crm_leads
     set pipeline_id = p_pipeline,
         stage_id = p_stage,
         position_in_stage = v_pos,
         value_cents = case when v_lead.status = 'won' then null else value_cents end,
         updated_at = now()
   where id = v_lead.id and organization_id = p_org
  returning * into v_saida;

  return v_saida;
end;
$$;

comment on function public.fn_mover_lead_de_funil(uuid, uuid, uuid, uuid, uuid) is
  'Leva o MESMO negócio para outro funil (decisão do Peterson, 19/10/2026): atualiza pipeline_id/stage_id/posição; o retrato da saída é gravado na mesma transação pelo gatilho trg_crm_leads_passagem_de_funil. p_ator só vale sem auth.uid() (service_role). A etapa de destino é aberta, então fn_crm_lead_close_on_stage reabre o negócio no destino. Não emite lead.won/lost/created/stage_changed. SECURITY INVOKER. Migration 9053.';

revoke all on function public.fn_mover_lead_de_funil(uuid, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.fn_mover_lead_de_funil(uuid, uuid, uuid, uuid, uuid) to authenticated, service_role;

-- As duas métricas que contam ganho/perda pelo `status` atual passam a ler os
-- desfechos da época (corpo idêntico ao vigente, só a fonte do CTE muda): sem isso o
-- ganho levado ao pós-venda sumiria do ganho do responsável e da eficiência.
create or replace function public.fn_atrito_metrics(
  p_org uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_abandono_horas int default 72,
  p_repeticao_min float8 default 0.7,
  p_espera_horas int default 4
) returns jsonb
language sql stable
set search_path = public
as $$
  with
  -- DENOMINADOR DEFINITIVO: demandas encerradas na janela. Não mais os casos.
  demandas_j as (
    select d.id, d.agent_case_id, d.aberta_em, d.fechada_em, d.desfecho
      from public.demandas d
     where d.organization_id = p_org
       and d.fechada_em is not null
       and d.fechada_em >= p_from
       and d.fechada_em <  p_to
  ),
  -- Turnos: mensagens de TODAS as conversas da demanda (N:N), dentro da vida
  -- dela. Uma demanda que atravessou dois canais soma os dois.
  turnos as (
    select d.id,
           (select count(*)
              from public.demanda_conversas dc
              join public.messages m
                on m.conversation_id = dc.conversation_id
               and m.organization_id = p_org
               and m.sent_at >= d.aberta_em
               and m.sent_at <  d.fechada_em
             where dc.demanda_id = d.id) as n
      from demandas_j d
  ),
  -- Insistência: só existe onde houve caso. O payload declara o denominador
  -- próprio (`demandas_com_caso`) para o número não ser lido como se fosse
  -- sobre o total.
  insistencia as (
    select avg(c.followup_attempts)::float8 as media,
           max(c.followup_attempts)         as maximo,
           count(*)                         as base
      from demandas_j d
      join public.agent_cases c on c.id = d.agent_case_id
  ),
  humano as (
    select e.case_id, count(*) as intervencoes, min(e.created_at) as primeiro_toque
      from public.agent_case_events e
      join demandas_j d on d.agent_case_id = e.case_id
     where e.organization_id = p_org and e.actor_kind = 'human'
     group by e.case_id
  ),
  espera_fila as (
    select extract(epoch from (h.primeiro_toque - d.aberta_em)) as segundos
      from demandas_j d join humano h on h.case_id = d.agent_case_id
     where h.primeiro_toque > d.aberta_em
  ),
  retrabalho as (
    select count(distinct e.case_id) as n
      from public.agent_case_events e
      join demandas_j d on d.agent_case_id = e.case_id
     where e.organization_id = p_org
       and (e.kind = 'escalated' or e.human_action = 'escalate')
  ),
  abandono as (
    select
      count(*) filter (
        where cv.last_outbound_at >= p_from and cv.last_outbound_at < p_to
          and (cv.last_inbound_at is null or cv.last_outbound_at > cv.last_inbound_at)
          and cv.last_outbound_at < now() - make_interval(hours => p_abandono_horas)
          and cv.status not in ('resolved', 'closed')
      ) as abandonadas,
      count(*) filter (
        where cv.last_outbound_at >= p_from and cv.last_outbound_at < p_to
      ) as com_fala_nossa
      from public.conversations cv
     where cv.organization_id = p_org and cv.last_outbound_at is not null
  ),
  -- INVARIANTE 4, agora VERIFICÁVEL: demanda aberta sem próximo passo é o
  -- vazamento que a doutrina proíbe. Antes da 0119 isto não era enumerável.
  sem_proximo_passo as (
    select count(*) as n
      from public.demandas d
     where d.organization_id = p_org
       and d.fechada_em is null
       and d.proximo_passo is null
  ),
  demandas_abertas as (
    select count(*) as n from public.demandas d
     where d.organization_id = p_org and d.fechada_em is null
  ),
  inbounds as (
    select m.conversation_id, m.sent_at, m.body,
           lag(m.body)    over (partition by m.conversation_id order by m.sent_at) as body_anterior,
           lag(m.sent_at) over (partition by m.conversation_id order by m.sent_at) as sent_at_anterior
      from public.messages m
     where m.organization_id = p_org and m.direction = 'inbound' and m.body is not null
       and m.sent_at >= p_from and m.sent_at < p_to
  ),
  repeticao as (
    select
      count(*) filter (
        where i.body_anterior is not null
          and exists (select 1 from public.messages o
                       where o.organization_id = p_org and o.conversation_id = i.conversation_id
                         and o.direction = 'outbound'
                         and o.sent_at > i.sent_at_anterior and o.sent_at < i.sent_at)
          and public.fn_atrito_jaccard(i.body, i.body_anterior) >= p_repeticao_min
      ) as repetidas,
      count(*) filter (
        where i.body_anterior is not null
          and exists (select 1 from public.messages o
                       where o.organization_id = p_org and o.conversation_id = i.conversation_id
                         and o.direction = 'outbound'
                         and o.sent_at > i.sent_at_anterior and o.sent_at < i.sent_at)
      ) as com_resposta_no_meio
      from inbounds i
  ),
  espera_calada as (
    select count(*) filter (where prox.espera_s > p_espera_horas * 3600) as caladas,
           count(*) as com_resposta,
           percentile_cont(0.9) within group (order by prox.espera_s) as p90_s
      from (
        select extract(epoch from (
                 (select min(o.sent_at) from public.messages o
                   where o.organization_id = p_org and o.conversation_id = m.conversation_id
                     and o.direction = 'outbound' and o.sent_at > m.sent_at) - m.sent_at)) as espera_s
          from public.messages m
         where m.organization_id = p_org and m.direction = 'inbound'
           and m.sent_at >= p_from and m.sent_at < p_to
      ) prox
     where prox.espera_s is not null
  ),
  envios as (
    select count(*) filter (where m.sent_via = 'ai')              as por_ia,
           count(*) filter (where m.sent_via = 'automation')      as por_automacao,
           count(*) filter (where m.sent_via = 'system')          as por_integracao,
           count(*) filter (where m.sent_via = 'user')            as por_humano_no_sistema,
           count(*) filter (where m.sent_via = 'external_device') as por_humano_fora
      from public.messages m
     where m.organization_id = p_org and m.direction = 'outbound'
       and m.sent_at >= p_from and m.sent_at < p_to
  ),
  vetos as (
    select count(*) filter (where t.vetoed_gate is not null) as vetados,
           count(distinct t.job_id) as execucoes
      from public.before_send_traces t
     where t.organization_id = p_org and t.created_at >= p_from and t.created_at < p_to
  ),
  descadastros as (
    select count(*) as n from public.contacts c
     where c.organization_id = p_org and c.blocked_at is not null
       and c.blocked_at >= p_from and c.blocked_at < p_to
  ),
  pedidos_humano as (
    select count(*) as n from public.crm_lead_activities a
     where a.organization_id = p_org and a.type = 'handoff_triggered'
       and a.performed_at >= p_from and a.performed_at < p_to
  ),
  -- ─── O LAÇO DE RETORNO DA PASSAGEM (migration 0294) ──────────────────────
  -- A pergunta que mede se o briefing serviu para alguma coisa: DEPOIS de a IA
  -- passar a conversa, o cliente precisou repetir o que já tinha dito? Se o
  -- contexto chegou a quem assumiu, a repetição cai; se não chegou, ela não
  -- muda — e a feature é decoração.
  --
  -- A RÉGUA, escrita para o número não envelhecer:
  --   · limiar         = `p_repeticao_min` (0.7), o MESMO do índice de
  --                      repergunta — dois limiares para o mesmo fenômeno
  --                      fariam dois números incomparáveis na mesma tela;
  --   · janela         = 24 h depois da passagem. Mais que isso já é outra
  --                      conversa; menos deixaria de fora o atendente que
  --                      assumiu no dia seguinte;
  --   · denominador    = passagens em que o cliente VOLTOU A FALAR. Sem fala
  --                      nova não há repetição a medir, e contá-las como "não
  --                      repetiu" inflaria o número para o lado bonito. É a
  --                      mesma regra de `lib/metrics/atrito.ts`: ausência de
  --                      dado é `null`, nunca `0` — e é a razão de as DUAS
  --                      chaves saírem daqui (numerador e denominador), em vez
  --                      de uma razão já calculada.
  repeticao_pos_passagem as (
    select count(*) filter (where r.repetiu) as repetidas,
           count(*)                          as medidas
      from (
        select p.id,
               exists (
                 select 1
                   from public.messages depois
                   join public.messages antes
                     on antes.organization_id = depois.organization_id
                    and antes.conversation_id = depois.conversation_id
                    and antes.direction = 'inbound'
                    and antes.body is not null
                    and antes.sent_at < p.criado_em
                  where depois.organization_id = p.organization_id
                    and depois.conversation_id = p.conversation_id
                    and depois.direction = 'inbound'
                    and depois.body is not null
                    and depois.sent_at > p.criado_em
                    and depois.sent_at < p.criado_em + interval '24 hours'
                    and public.fn_atrito_jaccard(depois.body, antes.body) >= p_repeticao_min
               ) as repetiu
          from public.passagens_de_atendimento p
         where p.organization_id = p_org
           and p.criado_em >= p_from and p.criado_em < p_to
           and exists (
             select 1 from public.messages m
              where m.organization_id = p.organization_id
                and m.conversation_id = p.conversation_id
                and m.direction = 'inbound'
                and m.body is not null
                and m.sent_at > p.criado_em
                and m.sent_at < p.criado_em + interval '24 hours'
           )
      ) r
  ),
  eficiencia as (
    select count(*) filter (where status = 'won')  as ganhos,
           count(*) filter (
             where status = 'lost'
               -- A transferência entre funis não é perda comercial (migration 0266).
               and coalesce(lost_reason, '') <> 'moved_to_another_pipeline'
           ) as perdidos
      -- 9053: desfechos da época, inclusive os que ficaram no funil de origem.
      from public.crm_desfechos_de_negocio
     where organization_id = p_org and status in ('won', 'lost')
       and closed_at >= p_from and closed_at < p_to
  )
  select jsonb_build_object(
    'escopo', jsonb_build_object(
      'demandas',            (select count(*) from demandas_j),
      'demandas_com_caso',   (select base from insistencia),
      'demandas_abertas',    (select n from demandas_abertas),
      'de', p_from, 'ate', p_to,
      'abandono_horas', p_abandono_horas,
      'repeticao_min',  p_repeticao_min,
      'espera_horas',   p_espera_horas,
      -- Marca a régua do denominador: quem comparar dois períodos precisa saber
      -- se foram medidos sobre casos ou sobre demandas.
      'denominador', 'demandas'
    ),
    'cliente', jsonb_build_object(
      'turnos_p50',        (select percentile_cont(0.5) within group (order by n) from turnos),
      'turnos_p90',        (select percentile_cont(0.9) within group (order by n) from turnos),
      'insistencia_media', (select media  from insistencia),
      'insistencia_max',   (select maximo from insistencia),
      'pedidos_de_humano', (select n from pedidos_humano),
      'descadastros',      (select n from descadastros),
      'abandonos',         (select abandonadas   from abandono),
      'conversas_com_fala_nossa', (select com_fala_nossa from abandono),
      'reperguntas',              (select repetidas            from repeticao),
      'perguntas_com_resposta',   (select com_resposta_no_meio from repeticao),
      'esperas_caladas',          (select caladas      from espera_calada),
      'esperas_medidas',          (select com_resposta from espera_calada),
      'espera_resposta_p90_s',    (select p90_s        from espera_calada),
      -- As duas chaves do laço da passagem (0294). Numerador e denominador
      -- SEPARADOS de propósito: a razão é calculada na borda, que é onde
      -- mora a regra de devolver `null` quando o denominador é zero.
      'repeticao_pos_passagem',   (select repetidas from repeticao_pos_passagem),
      'passagens_medidas',        (select medidas   from repeticao_pos_passagem)
    ),
    'empresa', jsonb_build_object(
      'intervencoes_por_demanda', (select avg(coalesce(h.intervencoes, 0))::float8
                                     from demandas_j d left join humano h on h.case_id = d.agent_case_id),
      'espera_humana_p50_s',      (select percentile_cont(0.5) within group (order by segundos) from espera_fila),
      'espera_humana_p90_s',      (select percentile_cont(0.9) within group (order by segundos) from espera_fila),
      'retrabalho',               (select n from retrabalho),
      'vetos',                    (select vetados  from vetos),
      'execucoes_medidas',        (select execucoes from vetos),
      'envios_por_ia',            (select por_ia                from envios),
      'envios_por_automacao',     (select por_automacao         from envios),
      'envios_por_integracao',    (select por_integracao        from envios),
      'envios_humano_no_sistema', (select por_humano_no_sistema from envios),
      'envios_humano_fora',       (select por_humano_fora       from envios),
      -- O invariante 4 vira NÚMERO na tela: demanda aberta sem próximo passo é
      -- vazamento, e vazamento invisível é o que a doutrina inteira combate.
      'demandas_sem_proximo_passo', (select n from sem_proximo_passo)
    ),
    'eficiencia', jsonb_build_object(
      'ganhos',   (select ganhos   from eficiencia),
      'perdidos', (select perdidos from eficiencia)
    )
  );
$$;

revoke all     on function public.fn_atrito_metrics(uuid, timestamptz, timestamptz, int, float8, int) from public;
revoke execute on function public.fn_atrito_metrics(uuid, timestamptz, timestamptz, int, float8, int) from anon;
grant  execute on function public.fn_atrito_metrics(uuid, timestamptz, timestamptz, int, float8, int)
  to authenticated, service_role;

create or replace function public.fn_attendant_metrics(
  p_org uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_owner uuid default null
) returns jsonb
language sql stable
set search_path = public
as $$
  with
  lead_agg as (
    select
      owner_user_id as user_id,
      count(*) filter (where status = 'won')  as won,
      count(*) filter (
        where status = 'lost'
          -- A transferência entre funis não é perda comercial (migration 0266).
          and coalesce(lost_reason, '') <> 'moved_to_another_pipeline'
      ) as lost
    -- 9053: os desfechos da ÉPOCA, inclusive o ganho/perda que ficou no funil de
    -- origem quando o card foi levado a outro funil (o card reabre no destino).
    from public.crm_desfechos_de_negocio
    where organization_id = p_org
      and status in ('won', 'lost')
      and closed_at >= p_from and closed_at < p_to
      and owner_user_id is not null
      and (p_owner is null or owner_user_id = p_owner)
    group by owner_user_id
  ),
  conv_agg as (
    select
      assigned_to_user_id as user_id,
      count(*) as conversations_handled
    from public.conversations
    where organization_id = p_org
      and assigned_to_user_id is not null
      and assigned_at >= p_from and assigned_at < p_to
      and (p_owner is null or assigned_to_user_id = p_owner)
    group by assigned_to_user_id
  ),
  -- (0235) Chamada de voz ATENDIDA conta como trabalho.
  --
  -- Quem passa o dia ao telefone tinha produtividade zero nesta função: ela
  -- lia negócios fechados, conversas atribuídas e primeira resposta por
  -- MENSAGEM, e nenhuma das três enxerga uma ligação.
  --
  -- `owner_user_id` é quem esteve NA LINHA (a rota de atender grava; a ponte de
  -- eventos confirma pelo `owner` do upstream) — e não `created_by`, que só
  -- existe na chamada iniciada pelo CRM e diria zero para toda ligação
  -- recebida. `answered_at is not null` é o que separa trabalho de telefone
  -- tocando.
  voice_agg as (
    select
      owner_user_id as user_id,
      count(*) as calls_answered,
      coalesce(sum(duration_ms), 0)::bigint as call_ms
    from public.voice_calls
    where organization_id = p_org
      and owner_user_id is not null
      and answered_at is not null
      and answered_at >= p_from and answered_at < p_to
      and (p_owner is null or owner_user_id = p_owner)
    group by owner_user_id
  ),
  ttfr as (
    select
      c.assigned_to_user_id as user_id,
      avg(extract(epoch from (fr.first_human_out - fr.first_in))) as avg_first_response_seconds
    from public.conversations c
    cross join lateral (
      select
        min(m.sent_at) filter (where m.direction = 'inbound') as first_in,
        min(m.sent_at) filter (
          where m.direction = 'outbound' and m.sent_by_user_id is not null
        ) as first_human_out
      from public.messages m
      where m.conversation_id = c.id
    ) fr
    where c.organization_id = p_org
      and c.assigned_to_user_id is not null
      and (p_owner is null or c.assigned_to_user_id = p_owner)
      and fr.first_in is not null
      and fr.first_human_out is not null
      and fr.first_human_out > fr.first_in
      and fr.first_human_out >= p_from and fr.first_human_out < p_to
    group by c.assigned_to_user_id
  ),
  attendant_ids as (
    select user_id from lead_agg
    union select user_id from conv_agg
    union select user_id from ttfr
    union select user_id from voice_agg
  )
  select jsonb_build_object(
    'funnel', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'stage_id', s.id,
          'stage_name', s.name,
          'position', s.position,
          'count', coalesce(l.cnt, 0)
        ) order by s.position, s.name
      )
      from public.crm_stages s
      left join (
        select stage_id, count(*) as cnt
        from public.crm_leads
        where organization_id = p_org
          and status = 'open'
          and (p_owner is null or owner_user_id = p_owner)
        group by stage_id
      ) l on l.stage_id = s.id
      where s.organization_id = p_org
        and s.is_archived = false
    ), '[]'::jsonb),
    'attendants', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', a.user_id,
          'won', coalesce(la.won, 0),
          'lost', coalesce(la.lost, 0),
          'conversations_handled', coalesce(ca.conversations_handled, 0),
          'avg_first_response_seconds', tf.avg_first_response_seconds,
          'calls_answered', coalesce(va.calls_answered, 0),
          'call_seconds', (coalesce(va.call_ms, 0) / 1000)::bigint
        ) order by coalesce(la.won, 0) desc, a.user_id
      )
      from attendant_ids a
      left join lead_agg la on la.user_id = a.user_id
      left join conv_agg ca on ca.user_id = a.user_id
      left join ttfr tf on tf.user_id = a.user_id
      left join voice_agg va on va.user_id = a.user_id
    ), '[]'::jsonb)
  );
$$;
revoke all on function public.fn_attendant_metrics(uuid,timestamptz,timestamptz,uuid) from public, anon;
grant execute on function public.fn_attendant_metrics(uuid,timestamptz,timestamptz,uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
