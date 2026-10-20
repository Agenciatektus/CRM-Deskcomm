-- manifest: 9055 — Tektus: a subida do upstream 1.73 sem um lado apagar o outro. As 05xx do upstream e as nossas 9023..9054 se intercalam no tempo e redefinem os mesmos objetos; esta roda por último e deixa a versão INTEGRADA (copiada do baseline.sql): agent_inbox_items_kind_check com task_due (9043) e org_reativada (0501); fn_validate_lost_reason_required com opted_out_of_messages (0513) e motivo opcional por funil (9044); fn_solicitar_reenvio_conversao com MetaEtapa (0524) e a compra por etapa (9054); policies por comando 9028/9030 com escrita de platform admin em fn_is_platform_admin_full (0508/0529/0533), notas internas do autor ou manager (0509) e as for all que o upstream recriava derrubadas (tenant_isolation_contacts_write devolveria a viewer a escrita de contato). Idempotente.
--
-- 9055: a subida do upstream 1.73 sem apagar o que o fork fez, e sem que o fork apague o upstream.
--
-- ## O defeito de ordem (o mesmo da 9006 e da 9023, agora nos dois sentidos)
--
-- As migrations 05xx do upstream (30/09 a 05/10) e as nossas 9023..9054 (01/10 a
-- 19/10) se INTERCALAM no tempo. Cinco objetos são redefinidos pelos dois lados:
--
--   objeto                                   upstream   fork
--   agent_inbox_items_kind_check             0501       9043
--   fn_validate_lost_reason_required         0513       9044
--   fn_solicitar_reenvio_conversao           0524       9054
--   RLS de contacts/organizations            0508       9028/9030
--   RLS de channel_sessions/crm_pipelines    0529/0533  9028
--   RLS de conversation_notes                0509       9028
--
-- Numa instalação NOVA pela cadeia, quem tem o timestamp maior ganha (aqui, quase
-- sempre o fork: 9043 tira `org_reativada`, 9044 tira `opted_out_of_messages`,
-- 9054 tira o `MetaEtapa:`, 9028 tira o autor-ou-manager das notas). Em
-- PRODUÇÃO, que já aplicou as nossas, as do upstream entram DEPOIS e ganham: a
-- 0508 recriaria `tenant_isolation_contacts_write` (for all, só tenancy), que
-- devolve a viewer a escrita de contato que a 9030 tirou, e a 0529/0533 e a
-- 0508 recriariam as `for all` de escrita que a 9028 desmontou. Nos dois sentidos
-- a falha é calada: nada quebra na migration, e o sintoma aparece no uso.
--
-- ## A troca
--
-- Esta migration roda por último e deixa cada objeto na versão INTEGRADA, a
-- mesma do `baseline.sql` (o gerador copiou os trechos de lá: os dois não
-- divergem por construção):
--
--   1. a constraint de `kind` com `task_due` E `org_reativada`;
--   2. o motivo de perda com `opted_out_of_messages` E o motivo opcional por funil;
--   3. o reenvio que aceita `MetaEtapa:<uuid>` E a compra por etapa ligada;
--   4. as policies por comando da 9028/9030, com a ESCRITA de platform admin em
--      `fn_is_platform_admin_full()` (support_readonly lê, não escreve — a
--      intenção da 0508), as notas internas editadas/apagadas só pelo autor ou
--      manager+ e criadas no nome de quem cria (0509), e as `for all` do
--      upstream derrubadas (`channel_sessions_tenant_write`,
--      `crm_pipelines_manager_write`, `orgs_write_platform_admin`,
--      `tenant_isolation_contacts_read/write`).
--
-- Idempotente (`drop ... if exists` / `create or replace`). Prova:
-- tests/invariants/rls-por-comando-9028.test.ts, conversao-por-etapa-9054.test.ts
-- e tests/unit/kind-check-migration-x-baseline.test.ts.
-- Rollback: reverter o PR; as definições anteriores estão nas migrations citadas.

set local lock_timeout = '3s';

-- ---- 1. agent_inbox_items_kind_check: task_due (9043) + org_reativada (0501) ----
alter table public.agent_inbox_items
  drop constraint if exists agent_inbox_items_kind_check;

alter table public.agent_inbox_items
  add constraint agent_inbox_items_kind_check check (kind in (
    'appointment_outcome_required',
    'appointment_recovery_review',
    'qr_rescan',
    'routing_unassigned',
    'job_dead',
    'event_dead',
    'budget_exceeded',
    'handoff',
    'promotion_review',
    'judge_unaligned',
    'followup_dead',
    'snooze_expired',
    'next_action_ambiguous',
    'risk_backlog_seeded',
    'reactivation_expired',
    'capabilities_missing',
    -- (migration 0109, issue #129) Mensagem outbound nasce `sending` e, quando o
    -- envio nunca acontece, fica `sending` para sempre — o self-hoster vê uma
    -- mensagem eternamente "enviando", sinal de progresso para algo que não vai
    -- acontecer. O cron `recover-stuck-messages` marca `failed` e usa este kind
    -- para o defeito APARECER na Central de avisos.
    --
    -- Entra NESTA lista, e não num bloco novo no fim do arquivo: o #159 do @jmpo
    -- mostrou que reconstruir a mesma constraint em N blocos quebra o
    -- `update.sh` de todo clone que já tenha uma linha de vocabulário posterior
    -- — os blocos antigos rodam antes e falham em cadeia. Um bloco por
    -- constraint, vigiado por tests/unit/baseline-constraint-reconstruida.test.ts.
    'message_send_stuck',
    -- (migration 0129) O cliente manda foto/áudio e o agente age como se nada
    -- tivesse chegado. Acontece quando o modelo configurado não enxerga imagem,
    -- ou quando falta a chave de transcrição — e antes disto a derivação
    -- devolvia string vazia EM SILÊNCIO: nenhum erro, nenhum log, e o operador
    -- concluindo que o agente ignorou o cliente de propósito.
    'midia_nao_lida',
    'channel_template_review',
    'channel_number_alert',
    -- (migration 0111, spec 16 §3.2) O papel Operador declara promessa em aberto:
    -- o assistente prometeu algo ao cliente e o cumprimento não foi registrado.
    -- A invariante sagrada da spec é "nenhuma promessa deixa de ser cumprida", e
    -- uma promessa sem dono precisa aparecer onde o humano olha — não no log do
    -- worker. Entra NESTA lista pela mesma razão que a de cima.
    'promise_unfulfilled',
    -- (migration 0124, spec 17 §4b) Dado que o assistente ouviu na conversa e
    -- ninguém confirmou até o prazo. `info`, não `warn`: nada quebrou — uma
    -- informação não foi aproveitada, e tratar isso como falha ensinaria a
    -- ignorar os avisos que são falha de verdade. Entra NESTA lista pela mesma
    -- razão das de cima (bloco único por constraint, #159).
    'contact_proposal_expired',
    -- (migration 0159) O gasto passou do aviso que a pessoa definiu e a IA
    -- CONTINUA respondendo — `warn`, nunca `critical`, e um kind SEPARADO de
    -- `budget_exceeded`: colapsar os dois faria o alerta de "parou" perder o
    -- significado. É este kind que torna possível a condição do gate "ninguém é
    -- bloqueado sem ter sido avisado no mês" — sem ele, o salto de 79% para 101%
    -- entre duas chamadas calaria a IA sem nenhum sinal anterior.
    --
    -- Entra NESTA lista, e AQUI no fim, por duas razões distintas: bloco único
    -- por constraint (#159), e porque `tests/unit/midia-nao-lida.test.ts` procura
    -- `'midia_nao_lida'` nos primeiros 2000 caracteres a partir do `add
    -- constraint` — um valor comentado inserido ACIMA dele empurra-o para fora da
    -- janela e reprova um teste que não tem nada a ver com o kind novo (medido:
    -- offset 1532 -> 2275). Kind novo entra no fim da lista.
    'budget_warning',
    -- (migration 0181) O material que a pessoa enviou não entrou na base: falta
    -- chave de embedding, a extração do arquivo falhou, ou nenhum trecho foi
    -- gravado. Antes disto o worker devolvia `skipped` para o próprio log, o drain
    -- tratava `skipped` como sucesso, e a linha da fonte seguia dizendo `ready`.
    -- Irmão direto de `midia_nao_lida`: mesma chave, mesmo silêncio.
    'conhecimento_nao_indexado',
    -- (migration 0206, spec 18) Chamada de voz WhatsApp (WaCalls) recebida que
    -- nunca teve answered_at — o "chamou e ninguém atendeu" precisa de dono,
    -- mesma razão de midia_nao_lida/conhecimento_nao_indexado. Entra NESTA
    -- lista, não em bloco novo (#159, bloco único por constraint).
    'voice_call_missed',
    'case_stale',
    -- (migration 0292) O aviso de caso não chegou ao WhatsApp da equipe,
    -- em definitivo. Nasce com `ref_kind='agent_case'` para levar AO CASO —
    -- que continua esperando — e não a uma tela genérica. A fonte da verdade
    -- sobre "o aviso saiu?" continua sendo `entregas_de_aviso_de_caso`:
    -- qualquer membro apaga um item da Central pelo PostgREST hoje.
    'aviso_de_caso_nao_entregue',
    -- (migration 0312) O fluxo de follow-up publicado que NUNCA vai disparar:
    -- gatilho automático (silêncio, etapa, caso, falta) só cria inscrição se
    -- algum agente publicado arma o ponteiro, e sem esse vínculo os produtores
    -- saem por `pointers_armados = 0` em silêncio — `active` na tela, morto no
    -- motor. Entra NESTA lista e no FIM dela, pelas duas razões de sempre
    -- (bloco único por constraint, #159; e a janela de 2000 caracteres que
    -- `tests/unit/midia-nao-lida.test.ts` varre a partir do `add constraint`).
    'followup_sem_agente',
    -- (migration 0339, doc 11 decisão B) O canal de WhatsApp em modo de teste
    -- SEM número autorizado não responde a ninguém — e o esquecimento é o
    -- defeito: as mensagens chegam no Inbox e a IA nunca fala, então quem
    -- instalou conclui que o produto está quebrado. O cron canal-mudo-watcher
    -- abre este aviso depois de 3 dias e o FECHA quando deixa de valer.
    --
    -- Entra NESTA lista, e não num bloco novo no fim do arquivo: reconstruir a
    -- mesma constraint em N blocos quebra o `update.sh` de todo clone com
    -- vocabulário posterior (lição do #159).
    'canal_mudo_sem_numero',
    -- (migration 0464) a proposta comercial: vencimento sem decisão, queda da taxa
    -- de aceite e promessa de proposta que não virou proposta.
    'proposal_expired_notice', 'proposal_acceptance_rate_drop', 'proposal_promised_not_created',
    -- (migration 0466, D3) proposta presa em 'enviando' há mais de 5min — o
    -- mesmo padrão do 'message_send_stuck', cron próprio (proposta-travada).
    'proposta_travada',
    -- (migration 0475) a IA rascunhou uma proposta e falta confirmar o modelo
    -- sugerido (plano N1) ou falta preço de catálogo — a Central acompanha
    -- até as duas pendências sumirem, ou até a proposta ser enviada/descartada.
    'proposta_pronta_para_revisao',
    -- (migration 0501) a organização voltou de uma suspensão e há conversas que
    -- receberam mensagem enquanto ela estava parada: a IA não respondeu nem vai
    -- responder sozinha. Um item por reativação, aberto por fn_reativar_organizacao.
    'org_reativada',
    -- (migration 0500) O Jev percebeu, numa mensagem em que a regra de hoje não
    -- viu nada, um pedido para falar com uma pessoa ou para parar de receber
    -- mensagens, e a empresa escolheu "Avisar a equipe". Um kind por pedido, e
    -- não `other`: a Central dá rótulo e destino por kind, e o `other` não leva
    -- a uma conversa (lib/ai/inbox-destino.ts); e o aviso é um por CONVERSA e
    -- pedido. O Jev só abre o aviso — quem passa a conversa é a regra de hoje
    -- ou uma pessoa, e quem bloqueia é só o STOP do próprio cliente. NESTA
    -- lista pelas razões de sempre (#159; a janela do `midia-nao-lida.test.ts`).
    'jev_pedido_de_humano',
    'jev_parar_de_receber',
    -- (migration 9043) A tarefa chegou na hora: o cron `task-due-reminder`
    -- avisa o RESPONSÁVEL (Central + push só para ele). Kind próprio, e não
    -- `other`, porque o rótulo de `other` é "Aviso do assistente" — falso para
    -- uma tarefa que uma pessoa marcou. NESTA lista pelas razões de sempre (#159).
    'task_due',
    'other'
  ));

-- ---- 2. motivo de perda: opted_out_of_messages (0513) + motivo opcional por funil (9044) ----
create or replace function public.fn_validate_lost_reason_required() returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_canonical text[] := array['requested_by_customer','price','no_response','product_unavailable',
                              'cancelled_by_store','cancelled_by_customer','payment_failed','other',
                              'moved_to_another_pipeline',
                              -- migration 0513 (#2049): quem respondeu PARAR. Conta como perda.
                              'opted_out_of_messages'];
  v_pipeline_extra text[] := '{}'::text[];
  v_required boolean := true;
begin
  if new.status = 'lost' then
    -- #1537: `settings.lost_reasons` aceita texto puro E `{ label, categoria }`.
    -- O que o trigger compara é o RÓTULO nos dois formatos: `jsonb_array_elements_text`
    -- de um objeto devolveria o JSON inteiro e recusaria com 22023 um motivo que
    -- a própria tela acabou de oferecer. `#>> '{}'` desembrulha o string.
    select
      coalesce(settings->'lost_reason_required' <> 'false'::jsonb, true),
      coalesce(
        array(
          select case when jsonb_typeof(e) = 'object'
                      then nullif(e ->> 'label', '')
                      else nullif(e #>> '{}', '') end
            from jsonb_array_elements(settings->'lost_reasons') as t(e)
        ), '{}'::text[]
      )
      into v_required, v_pipeline_extra
      from public.crm_pipelines where id = new.pipeline_id;

    if new.lost_reason is null or length(btrim(new.lost_reason)) = 0 then
      if v_required then
        raise exception 'lost_reason_required' using errcode = '22023';
      end if;
      return new;
    end if;

    if not (new.lost_reason = any (v_canonical) or new.lost_reason = any (v_pipeline_extra)) then
      raise exception 'lost_reason_invalid: %', new.lost_reason using errcode = '22023';
    end if;
  end if;
  return new;
end$$;
revoke execute on function public.fn_validate_lost_reason_required() from public, anon;
grant execute on function public.fn_validate_lost_reason_required() to authenticated, service_role;

-- ---- 3. reenvio de conversão: MetaEtapa (0524) + a compra por etapa (9054) ----
create or replace function public.fn_solicitar_reenvio_conversao(p_org uuid, p_lead uuid, p_event text)
returns boolean language plpgsql set search_path = public as $$
declare v_linha public.ad_conversion_dispatches%rowtype;
begin
  -- 0524 (upstream): os eventos de etapa da Meta (`MetaEtapa:<uuid>`) também se
  -- reenviam, exigindo o retrato (quando + qual evento). A régua da compra é a
  -- da 9054 (ganho OU etapa ligada com `Purchase`). Integrado na 9055.
  if p_event is null or not (
    p_event in ('Purchase', 'QualifiedLead')
    or p_event ~ '^Etapa:[0-9a-f-]{36}$'
    or p_event ~ '^MetaEtapa:[0-9a-f-]{36}$'
  ) then
    return false;
  end if;
  select * into v_linha from public.ad_conversion_dispatches
    where organization_id = p_org and lead_id = p_lead and event_name = p_event for update;
  if not found or v_linha.status = 'sent' then return false; end if;
  if p_event ~ '^MetaEtapa:' then
    if v_linha.event_occurred_at is null or v_linha.meta_event_name is null then return false; end if;
  elsif p_event <> 'Purchase' and (v_linha.event_occurred_at is null or v_linha.google_action_id is null) then
    return false;
  end if;
  if p_event = 'Purchase' and v_linha.remote_request_id is null and not exists (
    select 1 from public.crm_leads l
      left join public.crm_stages s on s.id = l.stage_id and s.organization_id = l.organization_id
     where l.id = p_lead and l.organization_id = p_org
       and (l.status = 'won' or (s.envia_conversao and s.evento_de_conversao = 'Purchase'))
  ) then return false; end if;
  if exists (select 1 from public.event_log where organization_id = p_org and entity_id = p_lead
    and event_type = 'ad_conversion.retry_requested' and status in ('pending', 'processing')
    and coalesce(payload->>'event_name', 'Purchase') = p_event) then return false; end if;
  perform public.emit_event('ad_conversion.retry_requested', 'crm_lead', p_lead,
    jsonb_build_object('event_name', p_event), '{}'::jsonb, p_org);
  update public.ad_conversion_dispatches set reason = 'reprocessamento_solicitado', attempted_at = now()
    where id = v_linha.id and organization_id = p_org;
  return true;
end;
$$;
revoke execute on function public.fn_solicitar_reenvio_conversao(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.fn_solicitar_reenvio_conversao(uuid, uuid, text) to service_role;

-- ---- 4. RLS: a escrita de platform admin exige _full (0508/0529/0533), notas do autor ou manager (0509) ----
do $rls9028$ begin
  drop policy if exists channel_sessions_tenant_select on public.channel_sessions;
  create policy channel_sessions_tenant_select on public.channel_sessions
    for select using (
      organization_id in (select public.fn_user_org_ids())
      or (select public.fn_is_platform_admin())
    );
  drop policy if exists channel_sessions_tenant_write on public.channel_sessions;
  drop policy if exists channel_sessions_tenant_insert on public.channel_sessions;
  create policy channel_sessions_tenant_insert on public.channel_sessions
    for insert with check (
      (organization_id in (select public.fn_user_org_ids())
        and public.fn_role_at_least(organization_id, 'admin'))
      or public.fn_is_platform_admin_full()
    );
  drop policy if exists channel_sessions_tenant_update on public.channel_sessions;
  create policy channel_sessions_tenant_update on public.channel_sessions
    for update using (
      (organization_id in (select public.fn_user_org_ids())
        and public.fn_role_at_least(organization_id, 'admin'))
      or public.fn_is_platform_admin_full()
    ) with check (
      (organization_id in (select public.fn_user_org_ids())
        and public.fn_role_at_least(organization_id, 'admin'))
      or public.fn_is_platform_admin_full()
    );
  drop policy if exists channel_sessions_tenant_delete on public.channel_sessions;
  create policy channel_sessions_tenant_delete on public.channel_sessions
    for delete using (
      (organization_id in (select public.fn_user_org_ids())
        and public.fn_role_at_least(organization_id, 'admin'))
      or public.fn_is_platform_admin_full()
    );
end $rls9028$;
do $rls9028$ begin
  drop policy if exists "crm_pipelines_select" on public.crm_pipelines;
  create policy "crm_pipelines_select" on public.crm_pipelines
    for select using (
      (organization_id in (select public.fn_user_org_ids()))
      or (select public.fn_is_platform_admin())
    );
  drop policy if exists "crm_pipelines_manager_write" on public.crm_pipelines;
  drop policy if exists "crm_pipelines_manager_insert" on public.crm_pipelines;
  create policy "crm_pipelines_manager_insert" on public.crm_pipelines
    for insert with check (
      public.fn_is_platform_admin_full()
      or ((organization_id in (select public.fn_user_org_ids()))
          and public.fn_role_at_least(organization_id, 'manager'))
    );
  drop policy if exists "crm_pipelines_manager_update" on public.crm_pipelines;
  create policy "crm_pipelines_manager_update" on public.crm_pipelines
    for update using (
      public.fn_is_platform_admin_full()
      or ((organization_id in (select public.fn_user_org_ids()))
          and public.fn_role_at_least(organization_id, 'manager'))
    ) with check (
      public.fn_is_platform_admin_full()
      or ((organization_id in (select public.fn_user_org_ids()))
          and public.fn_role_at_least(organization_id, 'manager'))
    );
  drop policy if exists "crm_pipelines_manager_delete" on public.crm_pipelines;
  create policy "crm_pipelines_manager_delete" on public.crm_pipelines
    for delete using (
      public.fn_is_platform_admin_full()
      or ((organization_id in (select public.fn_user_org_ids()))
          and public.fn_role_at_least(organization_id, 'manager'))
    );
end $rls9028$;
do $rls9028$ begin
  drop policy if exists "conversation_notes_select_platform_admin" on public.conversation_notes;
  create policy "conversation_notes_select_platform_admin" on public.conversation_notes
    for select using ((select public.fn_is_platform_admin()));
  drop policy if exists "conversation_notes_write" on public.conversation_notes;
  drop policy if exists "conversation_notes_insert" on public.conversation_notes;
  create policy "conversation_notes_insert" on public.conversation_notes
    for insert with check (
      organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'agent')
      and created_by_user_id = auth.uid()
      and exists (
        select 1 from public.conversations c
        where c.organization_id = conversation_notes.organization_id
          and c.id = conversation_notes.conversation_id
          and public.fn_can_view_conversation(c.organization_id, c.assigned_to_user_id)
      )
    );
  drop policy if exists "conversation_notes_update" on public.conversation_notes;
  create policy "conversation_notes_update" on public.conversation_notes
    for update using (
      organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'agent')
      and (created_by_user_id = auth.uid() or public.fn_role_at_least(organization_id, 'manager'))
      and exists (
        select 1 from public.conversations c
        where c.organization_id = conversation_notes.organization_id
          and c.id = conversation_notes.conversation_id
          and public.fn_can_view_conversation(c.organization_id, c.assigned_to_user_id)
      )
    ) with check (
      organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'agent')
      and (created_by_user_id = auth.uid() or public.fn_role_at_least(organization_id, 'manager'))
      and exists (
        select 1 from public.conversations c
        where c.organization_id = conversation_notes.organization_id
          and c.id = conversation_notes.conversation_id
          and public.fn_can_view_conversation(c.organization_id, c.assigned_to_user_id)
      )
    );
  drop policy if exists "conversation_notes_delete" on public.conversation_notes;
  create policy "conversation_notes_delete" on public.conversation_notes
    for delete using (
      organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'agent')
      and (created_by_user_id = auth.uid() or public.fn_role_at_least(organization_id, 'manager'))
      and exists (
        select 1 from public.conversations c
        where c.organization_id = conversation_notes.organization_id
          and c.id = conversation_notes.conversation_id
          and public.fn_can_view_conversation(c.organization_id, c.assigned_to_user_id)
      )
    );
end $rls9028$;
do $rls9028$ begin
  drop policy if exists "orgs_select" on public.organizations;
  create policy "orgs_select" on public.organizations
    for select using (
      (id in (select public.fn_user_org_ids()))
      or (select public.fn_is_platform_admin())
    );
  drop policy if exists "orgs_write_platform_admin" on public.organizations;
  drop policy if exists "orgs_insert_platform_admin" on public.organizations;
  create policy "orgs_insert_platform_admin" on public.organizations
    for insert with check (public.fn_is_platform_admin_full());
  drop policy if exists "orgs_update_platform_admin" on public.organizations;
  create policy "orgs_update_platform_admin" on public.organizations
    for update using (public.fn_is_platform_admin_full()) with check (public.fn_is_platform_admin_full());
  drop policy if exists "orgs_delete_platform_admin" on public.organizations;
  create policy "orgs_delete_platform_admin" on public.organizations
    for delete using (public.fn_is_platform_admin_full());
end $rls9028$;

do $rls9030$ begin
  drop policy if exists "tenant_isolation_contacts_all" on public.contacts;
  -- 0508 do upstream: o par read/write (for all, só tenancy) reabriria a escrita
  -- de contato para viewer. A definição final é a de baixo (9030 + 9055).
  drop policy if exists "tenant_isolation_contacts_read" on public.contacts;
  drop policy if exists "tenant_isolation_contacts_write" on public.contacts;
  drop policy if exists "contacts_select" on public.contacts;
  create policy "contacts_select" on public.contacts
    for select using (
      (organization_id in (select public.fn_user_org_ids()))
      or (select public.fn_is_platform_admin())
    );
  drop policy if exists "contacts_insert" on public.contacts;
  create policy "contacts_insert" on public.contacts
    for insert with check (
      ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
      or public.fn_is_platform_admin_full()
    );
  drop policy if exists "contacts_update" on public.contacts;
  create policy "contacts_update" on public.contacts
    for update using (
      ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
      or public.fn_is_platform_admin_full()
    ) with check (
      ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
      or public.fn_is_platform_admin_full()
    );
  drop policy if exists "contacts_delete" on public.contacts;
  create policy "contacts_delete" on public.contacts
    for delete using (
      ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent'))
      or public.fn_is_platform_admin_full()
    );
end $rls9030$;
