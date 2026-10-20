-- manifest: 9058 — Tektus: a subida do upstream 1.81 sem um lado apagar o outro. Roda por último e deixa a versão INTEGRADA do que os dois lados redefinem: agent_inbox_items_kind_check com cobranca (0601), email_de_login_trocado (0614), task_due (9043) e canal_pausado (0589); webhook_events_log_provider_check com stripe/asaas (0601) e verdash/instagram (9002/9004/9023); emit_event da 0670 (contact.phone_added, revogação do turno, desfecho do negócio reservado) com o ad_conversion.* só do servidor e o lead.* só de agent+ (9054); fn_lgpd_cascade_redact_contact da 0620 com a identidade do Instagram e a transcrição da ligação (9023); fn_tags_normalizar e fn_vocabulario_de_tags_operar da 9038 (guarda, travas e reserva de `cliente`; o conserto do excluir da 0673 já estava nela); financeiro: a `_write` (for all) das 9 tabelas e a da provisionadora (0619) com o papel no USING — DELETE só lê o using e o viewer apagava a linha — e as policies por comando da 9007 com fn_is_platform_admin_full; Idempotente.
--
-- 9058: integração da subida do upstream 1.81 (etapa 3 de 4).
--
-- ## O defeito de ordem (o mesmo da 9055/9056)
--
--   objeto                              upstream          fork
--   agent_inbox_items_kind_check        0601, 0614        9043/9055/9056
--   webhook_events_log_provider_check   0601              9002/9004/9023
--   emit_event                          0594, 0670        9054
--   fn_lgpd_cascade_redact_contact      0620              9023
--   fn_tags_normalizar / _operar        0673              9038
--   fn_financeiro_provisionar           0619 (_write)     9007 (por comando)
--
-- Na cadeia nova as 9054/9055/9056 (19/10) vêm depois das 06xx (08-17/10) e
-- tiram o que elas acrescentaram (cobranca, stripe/asaas, contact.phone_added,
-- o desfecho do negócio reservado da 0581). Em produção, que já tem as nossas,
-- as 06xx entram depois e tiram o nosso: o task_due, o verdash/instagram, o
-- `lead.*` só de agent+, o Instagram e a transcrição da anonimização, e a
-- guarda/travas das etiquetas.
--
-- ## Financeiro: o papel no USING (achado desta subida)
--
-- A 0533 (etapa 1) e a provisionadora da 0619 criam `tenant_isolation_<t>_write`
-- `for all` com `using (vínculo or _full)` e o papel só no `with check`. Em
-- `for all`, DELETE consulta APENAS o `using`, e as policies permissivas se
-- somam por OR: a `_write` sozinha deixava o viewer apagar conta, comanda e
-- lançamento, o defeito que a 9007 tinha fechado. Aqui o papel entra no USING
-- (o mais restritivo dos dois lados, por comando) e a provisionadora é
-- redefinida com o mesmo USING, para o reaplicar do módulo não reabrir.
--
-- Prova: tests/unit/kind-check-migration-x-baseline.test.ts,
-- tests/unit/migrations-nao-encolhem-vocabulario.test.ts,
-- tests/invariants/financeiro-viewer-nao-apaga-9058.test.ts.
-- Rollback: reverter o PR; as definições anteriores estão nas migrations citadas.

set local lock_timeout = '3s';

-- ---- 1. agent_inbox_items_kind_check: cobranca (0601) + email_de_login_trocado (0614) + task_due (9043) + canal_pausado (0589) ----
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
    -- (migration 0589, issue #2389) A pausa de uma conexão era silenciosa para
    -- todo mundo menos para quem clicou. O audit registrava `channel.disabled`
    -- / `channel.enabled`, mas audit é histórico para quem procura, não
    -- comunicação — a Central é onde a operação inteira olha. O item nasce na
    -- pausa e se resolve sozinho na retomada ou no arquivamento, com o motivo
    -- no corpo (laço do canal-mudo-watcher, só que instantâneo).
    'canal_pausado',
    -- (migration 0601) a cobrança do revendedor fala com a empresa: os avisos
    -- da régua (teste acabando, venceu, suspende em breve, suspensa) nascem sem
    -- referência, e o de 80% do teto de IA do plano nasce com ref_kind plano. Os
    -- dois abrem Configurações › Plano e cobrança, só para quem administra.
    'cobranca',
    -- (migration 0614) o admin da plataforma trocou o e-mail de login de uma
    -- pessoa da equipe (PATCH .../members/[userId]/email): a empresa fica
    -- sabendo pela Central — com o nome e a data, nunca o endereço.
    'email_de_login_trocado',
    'other'
  ));

-- ---- 2. webhook_events_log_provider_check: stripe/asaas (0601) + verdash/instagram (fork) ----
alter table public.webhook_events_log
  drop constraint if exists webhook_events_log_provider_check;

alter table public.webhook_events_log
  add constraint webhook_events_log_provider_check check (provider in (
    'waha', 'nuvemshop', 'generic', 'meta_cloud', 'zernio', 'datafy', 'verdash', 'instagram',
    -- (migration 0601) os provedores de cobrança do revendedor. A linha deles
    -- nasce com organization_id nulo e corpo {id,type}: é ponteiro, nunca o
    -- corpo do provedor, e fica invisível ao tenant pela própria policy.
    'stripe', 'asaas'
  ));

-- ---- 3. emit_event: 0670 + ad_conversion.* do servidor e lead.* de agent+ (9054) ----
CREATE OR REPLACE FUNCTION public.emit_event(p_event_type text, p_entity_kind text, p_entity_id uuid, p_payload jsonb DEFAULT '{}'::jsonb, p_metadata jsonb DEFAULT '{}'::jsonb, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id uuid;
  v_event_id uuid;
  v_contact uuid;
  v_origin jsonb;
begin
  -- message.received nasce somente do INSERT inbound interno. Um chamador
  -- público não pode reapresentar uma mensagem existente como evento novo.
  -- `ai.case_opened`/`ai.case_closed` entram pela mesma razão (0279): o caso é
  -- do motor, e um evento de caso forjado por login move o funil e acorda o
  -- agente em nome de uma decisão que ninguém tomou.
  -- `contact.birthday` entra pela 0551: só o cron (`contact-birthdays`, sem
  -- sessão) o emite, e a partir desta migration ele alcança a origem e manda
  -- WhatsApp de verdade — forjado por login, seria envio em nome de um
  -- aniversário que ninguém fez.
  -- `contact.phone_added` entra pela 0670, pela mesma razão do aniversário:
  -- quem o emite é o servidor (o PATCH de contatos, com a chave de serviço,
  -- depois de gravar o número), e ele alcança a origem e manda WhatsApp.
  -- Revogação do turno é fato da tomada nativa, nunca um pedido do login.
  if auth.uid() is not null and p_event_type in (
    'message.received','appointment.outcome_confirmed',
    'ai.case_opened','ai.case_closed','contact.birthday','contact.phone_added',
    'conversation.autonomous_turn_revoked'
  ) then
    raise exception 'reserved_message_received' using errcode='42501';
  end if;
  -- Desfecho e responsável do negócio só nascem do gatilho de `crm_leads`
  -- (`fn_emit_event_on_lead_change`), quando a linha muda de fato. Nenhum
  -- emissor do app os pede por RPC; os consumidores produzem efeito real
  -- (push, webhook de saída, conversão de anúncio).
  if auth.uid() is not null
     and p_event_type in ('lead.won','lead.lost','lead.reopened','lead.assigned')
     and coalesce(current_setting('deskcomm.desfecho_pelo_negocio', true), '') <> 'on' then
    raise exception 'reserved_message_received' using errcode='42501';
  end if;
  -- 9054: o reenvio de conversão nasce só do servidor (RPC como service_role).
  if auth.uid() is not null and p_event_type like 'ad\_conversion.%' then
    raise exception 'reserved_server_event' using errcode='42501';
  end if;
  -- Estes campos autorizam efeitos operacionais; não são payload público.
  if auth.uid() is not null and (
    coalesce(p_payload,'{}'::jsonb) ?| array['service_origin','service_boundary']
    or coalesce(p_metadata,'{}'::jsonb) ?| array['service_origin','service_boundary']
  ) then raise exception 'reserved_service_origin' using errcode='42501'; end if;
  v_org_id := coalesce(p_organization_id, (public.fn_support_context()->>'organization_id')::uuid);
  if v_org_id is null then
    select organization_id into v_org_id
      from public.user_organizations
      where user_id = auth.uid() and revoked_at is null
      limit 1;
  end if;
  if v_org_id is null then
    raise exception 'emit_event: organization_id obrigatorio';
  end if;

  if auth.uid() is not null
     and not public.fn_role_at_least(v_org_id, 'viewer') then
    raise exception 'caller_not_authorized_for_org'
      using hint = 'emit_event: caller must be an active member of the organization';
  end if;

  -- 9054: `lead.*` dispara conversão de anúncio, automação e cadência. Quem só lê
  -- (viewer) não emite; agent+ e o servidor (sem sessão) seguem emitindo.
  if auth.uid() is not null and p_event_type like 'lead.%'
     and not public.fn_role_at_least(v_org_id, 'agent') then
    raise exception 'caller_not_authorized_for_event' using errcode='42501',
      hint = 'emit_event: lead.* exige agent+';
  end if;

  if not public.fn_support_write_allowed(v_org_id) then raise exception 'support_readonly' using errcode='42501'; end if;

  -- A ORIGEM E RESERVADA AO SERVIDOR — ENTAO O SERVIDOR TEM DE ESCREVE-LA.
  --
  -- O bloco acima recusa `service_origin` vindo de chamador autenticado (42501,
  -- e com razao: e o campo que AUTORIZA efeito operacional, nao payload
  -- publico). So que ninguem o escrevia no lugar dele. Efeito medido: quem move
  -- o negocio pela IA carimba a origem no servidor (`agent-stage-sync`,
  -- `appointment-stage-move`, `handoff-stage-move`) e o follow-up nasce; quem
  -- move PELO QUADRO — o operador, pela rota HTTP autenticada — emitia um
  -- evento SEM origem, `fn_service_event_origin` caia no `service_stale` final
  -- (40001), `serviceForEvent` engolia como `stale_origin` e o follow-up nunca
  -- nascia. Sem erro em lugar nenhum: o gatilho de etapa era inalcancavel pelo
  -- caminho que o produto oferece na tela.
  --
  -- O retrato e tirado AQUI, no instante da emissao, que e exatamente a
  -- semantica de procedencia que a 0223 quer: "quando este evento nasceu, o
  -- atendimento estava assim". A resolucao do contato vem da mesma tabela de
  -- `fn_service_event_contact` — se ela nao souber resolver o tipo, nao ha o que
  -- carimbar e o evento segue sem origem, como antes.
  if not (coalesce(p_payload,'{}'::jsonb) ? 'service_origin')
     and not (coalesce(p_metadata,'{}'::jsonb) ? 'service_origin') then
    select f.contact_id into v_contact
      from public.fn_service_event_contact(v_org_id, p_event_type, p_entity_kind, p_entity_id) f;
    if v_contact is not null
       and exists(select 1 from public.contacts
                   where organization_id=v_org_id and id=v_contact
                     and not is_anonymized and is_merged_into is null) then
      v_origin := jsonb_build_object('kind','command',
        'observed', public.fn_service_observe_command(v_org_id, v_contact));
    end if;
  end if;

  insert into public.event_log
    (organization_id, event_type, entity_kind, entity_id, payload, metadata)
  values
    (v_org_id, p_event_type, p_entity_kind, p_entity_id,
     coalesce(p_payload, '{}'::jsonb)
       || case when v_origin is null then '{}'::jsonb else jsonb_build_object('service_origin', v_origin) end,
     coalesce(p_metadata, '{}'::jsonb)
       || jsonb_build_object('emitted_at', extract(epoch from now())))
  returning id into v_event_id;

  return v_event_id;
end $function$;

revoke execute on function public.emit_event(text, text, uuid, jsonb, jsonb, uuid) from public, anon;
grant  execute on function public.emit_event(text, text, uuid, jsonb, jsonb, uuid) to authenticated, service_role;

-- ---- 4. fn_lgpd_cascade_redact_contact: 0620 + Instagram e transcrição (9023) ----
create or replace function public.fn_lgpd_cascade_redact_contact(p_organization_id uuid, p_contact_id uuid, p_request_id uuid) returns jsonb
    language plpgsql security definer
    set search_path to 'public', 'extensions', 'pg_temp'
    as $$
declare
  v_already bool;
  v_counts jsonb := '{}'::jsonb;
  v_media_paths text[] := '{}';
  v_anon_label text;
  v_count int;
  v_variantes text[] := '{}';
  v_secao record;
  v_secoes jsonb := '{}'::jsonb;
begin
  perform public.fn_service_lock(p_organization_id,p_contact_id);
  select is_anonymized into v_already
    from contacts
    where id = p_contact_id and organization_id = p_organization_id;

  if not found then
    raise exception 'contact not found' using errcode = 'P0002';
  end if;

  if v_already then
    return jsonb_build_object('already_anonymized', true, 'counts', v_counts, 'media_paths', v_media_paths);
  end if;

  v_anon_label := 'Cliente Anonimizado #' || substring(p_contact_id::text from 1 for 8);

  -- Seções de módulo (D8, 0485): a redação delas é do gatilho
  -- `trg_lgpd_secoes_de_modulo`, que não devolve contagem — mas a contagem é
  -- EVIDÊNCIA (vai para `cascaded_to` no audit e no retorno). Uma chave por
  -- seção declarada, com o nome da tabela, contando pela MESMA `ligacao` do
  -- gatilho ($1 = organização, $2 = contato). Conta ANTES do passo 1 (que
  -- dispara o gatilho): a seção que soltar a própria ligação seguiria contada.
  -- Sem o módulo a tabela não existe e a chave não aparece. Seção com ligação
  -- vazia não é contada: o erro nomeado (`modulo_secao_invalida`) é do gatilho.
  for v_secao in
    select tabela, ligacao from public.modulo_secoes_lgpd order by modulo, tabela
  loop
    if to_regclass(format('public.%I', v_secao.tabela)) is not null
       and btrim(v_secao.ligacao) <> '' then
      execute format('select count(*) from public.%I where (%s)', v_secao.tabela, v_secao.ligacao)
        into v_count using p_organization_id, p_contact_id;
      v_secoes := v_secoes || jsonb_build_object(v_secao.tabela, v_count);
    end if;
  end loop;

  select coalesce(public.fn_telefone_variantes(phone_number), '{}')
    into v_variantes
    from contacts
    where id = p_contact_id and organization_id = p_organization_id;

  select coalesce(array_agg(distinct media_storage_path) filter (where media_storage_path is not null), '{}')
    into v_media_paths
    from messages
    where organization_id = p_organization_id
      and conversation_id in (
        select id from conversations
          where contact_id = p_contact_id and organization_id = p_organization_id
      );

  -- 1. contacts (irreversible)
  update contacts set
    name = v_anon_label,
    display_name = v_anon_label,
    email = null,
    phone_number = null,
    -- 9023/9058: a identidade de Instagram do fork (o `@` e o id estável que a
    -- Meta emite para a pessoa). A 0620 reemitiu a função sem ela.
    instagram_igsid = null,
    instagram_username = null,
    cpf_encrypted = null,
    cpf_hash = null,
    birthdate = null,
    is_anonymized = true,
    anonymized_at = now(),
    consent = '{}'::jsonb,
    source_metadata = '{}'::jsonb,
    tags = '{}'::text[],
    updated_at = now()
  where id = p_contact_id and organization_id = p_organization_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('contacts', v_count);

  -- 2. conversations metadata + preview strip
  update conversations set
    metadata = '{}'::jsonb,
    last_message_preview = null,
    last_handoff_reason = null,
    updated_at = now()
  where contact_id = p_contact_id and organization_id = p_organization_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('conversations', v_count);

  -- 3. messages: redact body + null media + strip metadata (preserve status/timestamps/conversation_id)
  update messages set
    body = '[mensagem anonimizada]',
    media_url = null,
    media_mime = null,
    media_size_bytes = null,
    media_storage_path = null,
    media_derived_text = null,
    metadata = '{}'::jsonb,
    updated_at = now()
  where organization_id = p_organization_id
    and conversation_id in (
      select id from conversations
        where contact_id = p_contact_id and organization_id = p_organization_id
    );
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('messages', v_count);

  -- 4. crm_lead_activities — strip payload, metadata E reason (migration 0071).
  update crm_lead_activities set
    payload = '{}'::jsonb,
    metadata = '{}'::jsonb,
    reason = null
  where organization_id = p_organization_id
    and (
      contact_id = p_contact_id
      or lead_id in (
        select lead_id from crm_lead_links
          where target_kind = 'contact'
            and target_id = p_contact_id
            and organization_id = p_organization_id
      )
      or lead_id in (
        select id from crm_leads
          where contact_id = p_contact_id and organization_id = p_organization_id
      )
    );
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('activities', v_count);

  -- 5. crm_leads — strip title/description/custom_fields/source_metadata/tags but PRESERVE pipeline/stage/value
  update crm_leads set
    title = v_anon_label,
    description = null,
    custom_fields = '{}'::jsonb,
    source_metadata = '{}'::jsonb,
    tags = '{}'::text[],
    updated_at = now()
  where organization_id = p_organization_id
    and (
      contact_id = p_contact_id
      or id in (
        select lead_id from crm_lead_links
          where target_kind = 'contact'
            and target_id = p_contact_id
            and organization_id = p_organization_id
      )
    );
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('leads', v_count);

  -- 6. orders — PRESERVE values + status + timestamps. Strip personal fields from payload jsonb
  --    and replace customer_external_id with null (FK-safe; soft de-link). Keep contact_id null.
  update orders set
    payload = (coalesce(payload, '{}'::jsonb))
      - 'customer'
      - 'customer_name'
      - 'customer_email'
      - 'customer_phone'
      - 'shipping_address'
      - 'billing_address'
      - 'contact_identification',
    customer_external_id = null,
    contact_id = null,
    is_anonymized = true,
    updated_at = now()
  where organization_id = p_organization_id
    and contact_id = p_contact_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('orders', v_count);

  -- 6b. crm_proposals (migration 0477, #1504) — PRESERVA número, valores,
  -- itens, datas e status; redige só o que identifica a PESSOA. Ver o
  -- cabeçalho desta migration para o porquê de cada coluna.
  -- O PDF que o cliente recebeu (bucket `propostas`, `<org>/<proposta>.pdf`)
  -- tem o nome dele impresso: redigir as colunas e deixar o arquivo seria
  -- anonimizar a linha e manter o documento. Vai para a mesma fila de expurgo
  -- da mídia (passo 7), com o bucket CERTO — a mensagem que levou o PDF
  -- aponta para o mesmo caminho, mas o passo 7 só enfileira `whatsapp-media`.
  -- Lido ANTES de o passo seguinte zerar `pdf_path`.
  insert into storage_redaction_queue (organization_id, request_id, bucket, object_path)
  select p_organization_id, p_request_id, 'propostas', pdf_path
    from crm_proposals
   where organization_id = p_organization_id
     and contact_id = p_contact_id
     and pdf_path is not null and length(pdf_path) > 0
     -- só arquivo DESTA organização: o expurgo nunca alcança o PDF de outra
     and pdf_path like p_organization_id::text || '/%'
  on conflict (bucket, object_path) do nothing;
  update crm_proposals set
    destinatario_nome = v_anon_label,
    briefing_json = '{}'::jsonb,
    resumo_comercial = null,
    -- o texto do documento como foi montado e como foi editado à mão: é o
    -- conteúdo do PDF, com o mesmo nome dentro.
    rendered_snapshot = null,
    secoes_editadas = null,
    pdf_path = null,
    updated_at = now()
  where organization_id = p_organization_id
    and contact_id = p_contact_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('crm_proposals', v_count);

  -- CAMPANHAS: o que foi DITO à pessoa e o endereço para onde foi.
  update campaign_recipients set
    rendered_body = null,
    recipient_address = null,
    variables = '{}'::jsonb,
    last_error_detail = null,
    updated_at = now()
  where organization_id = p_organization_id
    and contact_id = p_contact_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('campaign_recipients', v_count);

  -- LISTA DE EXCLUSÃO: solta o vínculo e apaga a cauda do telefone.
  update campaign_suppressions set
    address_tail = null,
    reason = null,
    contact_id = null
  where organization_id = p_organization_id
    and contact_id = p_contact_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('campaign_suppressions', v_count);

  -- 6c. sales — a comanda SAIU desta cascata (PR #1907, item 1).
  -- Este passo alterava a comanda pelo NOME, e as cinco tabelas da comanda
  -- saíram do baseline para nascerem só na instalação do módulo (ADR-0002
  -- D2/D3): sem o módulo a tabela não existe e a alteração abortava a
  -- ANONIMIZAÇÃO INTEIRA com `relation "sales" does not exist` — 68
  -- ocorrências no CI do #1907 — além de violar a D8 (migration 0485), que
  -- proíbe o núcleo nomear tabela de módulo. A redação da comanda acontece
  -- agora pela SEÇÃO declarada `financeiro/sales` em `modulo_secoes_lgpd`,
  -- que `trg_lgpd_secoes_de_modulo` aplica nos DOIS caminhos de anonimização
  -- (a cascata e a virada `is_anonymized` de `fn_lgpd_anonymize_contact`) —
  -- e pula, sem erro, onde o módulo não está instalado (`to_regclass`), que é
  -- exatamente o contrato.
  -- 6d. conversation_notes (migration 0483, F3 da #1863) — a nota interna é
  -- texto escrito SOBRE a pessoa durante o atendimento, e o anexo dela é mídia
  -- ancorada na conversa: os dois entram no alcance do titular. A 0477 já
  -- mostrou o desenho (arquivo vai para a fila ANTES de a coluna ser zerada).
  -- O bucket é `internal-media`, e não o do passo 7: a nota nunca sobe no
  -- `whatsapp-media` (é o bucket do canal do CLIENTE), e enfileirar o caminho
  -- num bucket onde ele não está deixaria a remoção apontando para o nada —
  -- a mesma falha de não ter anonimizado, um endereço mais para a direita.
  -- Por isso os caminhos de nota também NÃO entram em `v_media_paths`: essa
  -- lista só existe para o passo 7, que enfileira `whatsapp-media`.
  insert into storage_redaction_queue (organization_id, request_id, bucket, object_path)
  select p_organization_id, p_request_id, 'internal-media', n.media_storage_path
    from conversation_notes n
   where n.organization_id = p_organization_id
     and n.conversation_id in (
       select id from conversations
        where contact_id = p_contact_id and organization_id = p_organization_id
     )
     and n.media_storage_path is not null and length(n.media_storage_path) > 0
     and n.media_storage_path like p_organization_id::text || '/%'
  on conflict (bucket, object_path) do nothing;
  update conversation_notes set
    body = '[nota interna anonimizada]',
    media_storage_path = null,
    media_mime = null,
    media_size_bytes = null
  where organization_id = p_organization_id
    and conversation_id in (
      select id from conversations
       where contact_id = p_contact_id and organization_id = p_organization_id
    );
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('conversation_notes', v_count);

  -- 7. enqueue media for async deletion (idempotent via unique (bucket, object_path))
  if array_length(v_media_paths, 1) > 0 then
    insert into storage_redaction_queue (organization_id, request_id, bucket, object_path)
    select p_organization_id, p_request_id, 'whatsapp-media', path
      from unnest(v_media_paths) as path
      where path is not null and length(path) > 0
    on conflict (bucket, object_path) do nothing;
  end if;

  -- 7b. voice_calls — o TELEFONE de quem falou ao telefone (migration 0235).
  update voice_calls set
    peer_phone = v_anon_label,
    -- 9008/9023/9058: O QUE FOI DITO na chamada (quase sempre o nome da pessoa).
    -- A 0620 reemitiu a função sem esta linha, como a 0497 antes dela.
    transcript = null,
    owner_user_id = null,
    created_by = null,
    updated_at = now()
  where organization_id = p_organization_id
    and contact_id = p_contact_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('voice_calls', v_count);

  update prospecting_candidates set suppression_salt = gen_random_bytes(32)
  where organization_id = p_organization_id
    and (contact_id = p_contact_id
         or (phone is not null
             and regexp_replace(phone, '\D', '', 'g') = any (v_variantes)))
    and suppression_salt is null;
  update prospecting_candidates set
    suppression_place = hmac(convert_to(place_id, 'UTF8'), suppression_salt, 'sha256'),
    suppression_phone = case when phone is null then null
      else hmac(convert_to(phone, 'UTF8'), suppression_salt, 'sha256') end,
    place_id = 'redacted:' || id::text,
    phone = null,
    data = jsonb_build_object('key', 'redacted:' || id::text,
      'name', v_anon_label, 'phone', null, 'website', null,
      'category', null, 'address', null, 'maps_url', null,
      'rating', null, 'reviews', null, 'emails', '[]'::jsonb, 'socials', '[]'::jsonb),
    status = 'skipped', service_boundary = null, error = null, updated_at = now()
  where organization_id = p_organization_id
    and (contact_id = p_contact_id
         or (phone is not null
             and regexp_replace(phone, '\D', '', 'g') = any (v_variantes)));
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('prospecting_candidates', v_count);

  -- agent_cases — o que a IA escreveu SOBRE a pessoa quando travou (migration 0280).
  update agent_cases set
    title = v_anon_label,
    summary = '[resumo anonimizado]',
    blocker = '[bloqueio anonimizado]',
    context_snapshot = '{}'::jsonb
  where organization_id = p_organization_id
    and conversation_id in (
      select id from conversations
        where contact_id = p_contact_id and organization_id = p_organization_id
    );
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('agent_cases', v_count);

  -- agent_case_events — a linha do tempo do caso (migration 0280).
  update agent_case_events set
    body = null,
    metadata = '{}'::jsonb
  where organization_id = p_organization_id
    and case_id in (
      select id from agent_cases
        where organization_id = p_organization_id
          and conversation_id in (
            select id from conversations
              where contact_id = p_contact_id and organization_id = p_organization_id
          )
    );
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('agent_case_events', v_count);

  -- demandas — o assunto do pedido (migration 0280).
  update demandas set
    assunto = null
  where organization_id = p_organization_id
    and contact_id = p_contact_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('demandas', v_count);

  -- agent_inbox_items — o aviso que leva o texto do caso para a Central (migration 0280/0292).
  update agent_inbox_items set
    status = 'resolved',
    resolved_at = now(),
    body = 'Contato anonimizado.',
    ref_id = null
  where organization_id = p_organization_id
    and kind in ('handoff', 'case_stale', 'aviso_de_caso_nao_entregue')
    and (
      (ref_kind = 'contact' and ref_id = p_contact_id)
      or (ref_kind = 'conversation' and ref_id in (
            select id from conversations
              where contact_id = p_contact_id and organization_id = p_organization_id
          ))
      or (ref_kind = 'agent_case' and ref_id in (
            select id from agent_cases
              where organization_id = p_organization_id
                and conversation_id in (
                  select id from conversations
                    where contact_id = p_contact_id and organization_id = p_organization_id
                )
          ))
    );
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('agent_inbox_items', v_count);

  -- agent_case_chat_messages — a consulta interna da equipe à IA SOBRE o caso (migration 0281).
  update agent_case_chat_messages set
    body = null,
    redacted_at = now()
  where organization_id = p_organization_id
    and contact_id = p_contact_id
    and redacted_at is null;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('agent_case_chat_messages', v_count);

  -- passagens_de_atendimento — o BRIEFING é sobre a pessoa (migration 0291).
  update passagens_de_atendimento set
    body       = v_anon_label,
    title      = null,
    notes      = null,
    content    = null,
    tentativas = '[]'::jsonb
  where organization_id = p_organization_id and contact_id = p_contact_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('passagens_de_atendimento', v_count);

  -- entregas_de_aviso_de_caso — o registro do aviso ao suporte (migration 0292).
  update entregas_de_aviso_de_caso set
    erro_detalhe = null
  where organization_id = p_organization_id
    and case_id in (
      select id from agent_cases
        where organization_id = p_organization_id
          and conversation_id in (
            select id from conversations
              where contact_id = p_contact_id and organization_id = p_organization_id
          )
    );
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('entregas_de_aviso_de_caso', v_count);

  -- channel_session_groups.subject — o NOME do grupo, e a FK contact_id aponta
  -- para o placeholder do grupo (contacts.kind = 'whatsapp_group'), nunca para
  -- o titular real sendo anonimizado neste caminho — mas a FK para contacts e o
  -- nome da coluna casam o padrão automático do escopo (migration 0482), e
  -- nulificar não perde nada operacional: número, conversa e liga/desliga ficam.
  update public.channel_session_groups set
    subject = null
  where organization_id = p_organization_id
    and contact_id = p_contact_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('channel_session_groups', v_count);

  -- 7z. as contagens das seções de módulo (calculadas antes do passo 1); o
  --     núcleo vence numa colisão de nome.
  v_counts := v_secoes || v_counts;

  -- 8. dense audit row
  insert into api_audit_log (organization_id, action, actor_user_id, resource_type, resource_id, metadata, bypassed_rls)
  values (
    p_organization_id,
    'lgpd.redact_executed',
    null,
    'contact',
    p_contact_id,
    jsonb_build_object(
      'cascaded_to', v_counts,
      'media_queued', coalesce(array_length(v_media_paths, 1), 0),
      'request_id', p_request_id
    ),
    true
  );

  return jsonb_build_object(
    'already_anonymized', false,
    'counts', v_counts,
    'media_paths', v_media_paths
  );
end;
$$;

revoke all on function public.fn_lgpd_cascade_redact_contact(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.fn_lgpd_cascade_redact_contact(uuid,uuid,uuid) to service_role;

-- ---- 5. etiquetas: a versão da 9038 (o conserto do excluir da 0673 incluído) ----
create or replace function public.fn_tags_normalizar(
  p_tags text[],
  p_de text,
  p_para text,
  p_remover boolean
)
returns text[]
language sql
immutable
security invoker
set search_path = public
as $$
  -- `distinct on` pela chave canônica DO RESULTADO, e não da entrada.
  --
  -- ⚠️ Deduplicar pela entrada parece a mesma coisa e não é: no `juntar`, os dois
  -- nomes têm chaves DIFERENTES por definição (é o que os torna duas etiquetas),
  -- e depois da substituição viram o MESMO nome. Medido num Postgres real:
  -- `{VIP, obra}` juntando `obra` em `VIP` devolvia `{VIP, VIP}` — a etiqueta
  -- duplicada no array, e `fn_vocabulario_de_tags` conta OCORRÊNCIAS, então o
  -- registro passava a pesar 2 na própria tela que deveria arrumá-lo. O caso
  -- `{vip, VIP}` do teste passava por acidente: ali as duas chaves já eram
  -- iguais ANTES da substituição.
  select coalesce(array_agg(n.tag order by n.ord), '{}'::text[])
  from (
    select distinct on (lower(s.tag)) s.tag, s.ord
    from (
      select case
               -- 9038 (6): só a etiqueta excluída vira nula. Sem casar o nome, o
               -- excluir apagava TODAS as etiquetas do registro (ver a 9038).
               when p_remover and lower(btrim(e.valor)) = lower(btrim(coalesce(p_de, ''))) then null
               when lower(btrim(e.valor)) = lower(btrim(coalesce(p_de, ''))) then btrim(p_para)
               else btrim(e.valor)
             end as tag,
             e.ord
      from unnest(coalesce(p_tags, '{}'::text[])) with ordinality as e(valor, ord)
      where btrim(coalesce(e.valor, '')) <> ''
    ) s
    where s.tag is not null and s.tag <> ''
    order by lower(s.tag), s.ord
  ) as n;
$$;

create or replace function public.fn_vocabulario_de_tags_operar(
  p_org uuid,
  p_acao text,
  p_tag text,
  p_destino text,
  p_cor text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_tag     text := btrim(coalesce(p_tag, ''));
  v_destino text := btrim(coalesce(p_destino, ''));
  -- A cor entra normalizada (minúscula, sem espaço). A rota valida com Zod antes;
  -- esta linha defende o caminho que NÃO passa por ela — RPC direta, psql, um
  -- cliente futuro. Sem isso, `#FFF` gravaria e a comparação por igualdade da
  -- tela (que compara o que o servidor devolveu) passaria a mentir.
  v_cor     text := lower(btrim(coalesce(p_cor, '')));
  v_remover boolean;
  v_so_cor  boolean;
  v_contatos integer := 0;
  v_leads integer := 0;
  v_conversas integer := 0;
  v_regras integer := 0;
  v_id uuid;
  v_ids uuid[];
  v_settings jsonb;
  v_antes jsonb;
  v_depois jsonb;
  v_definido boolean := false;
  -- 9038: as quatro listas de sugestão (0244/9005) e os dois escopos.
  v_chave text;
  v_escopo text;
  v_sugeridas jsonb;
  v_arquivadas jsonb;
begin
  -- Portão de papel ANTES de qualquer escrita. Definer com p_org vindo da rota:
  -- é esta linha que separa o tenant de quem chama.
  if p_org is null or not public.fn_role_at_least(p_org, 'manager') then
    raise exception using errcode = '42501', message = 'insufficient_role';
  end if;
  -- 9038 (7): a MESMA guarda das escritas da 9005 — sessão de suporte em modo
  -- leitura e MFA provado nesta sessão (e `auth.uid()` presente). O papel acima
  -- continua respondendo `insufficient_role`, como sempre; a guarda acrescenta
  -- o que só a rota conferia, e a RPC é alcançável direto pelo PostgREST.
  perform public.fn_tags_guarda(p_org, 'manager');

  if p_acao is null or p_acao not in ('renomear', 'juntar', 'excluir', 'definir_cor') then
    raise exception using errcode = '22023', message = 'acao_invalida';
  end if;
  if v_tag = '' then
    raise exception using errcode = '22023', message = 'tag_obrigatoria';
  end if;
  v_remover := (p_acao = 'excluir');
  v_so_cor  := (p_acao = 'definir_cor');
  if not v_remover and not v_so_cor and v_destino = '' then
    raise exception using errcode = '22023', message = 'destino_obrigatorio';
  end if;
  -- `v_cor` vazio é pedido legítimo ("sem cor"): limpa. O que não passa é cor
  -- malformada — gravar `#12` e devolver `#12` para a tela pintar deixaria o
  -- chip sem cor sem ninguém saber por quê.
  if v_so_cor and v_cor <> '' and v_cor !~ '^#[0-9a-f]{6}$' then
    raise exception using errcode = '22023', message = 'cor_invalida';
  end if;

  -- ── POR QUE NÃO SAI EVENTO DAQUI ──────────────────────────────────────────
  --
  -- Os laços abaixo CONTAM as linhas alteradas e não emitem nada em `event_log`.
  -- A primeira versão emitia `contact.tags_changed` / `lead.tags_changed` /
  -- `conversation.tags_changed` POR LINHA, e nenhum desses tipos tem consumidor:
  -- `lib/event-log/register-handlers.ts` registra 13 handlers e nenhum os
  -- declara; o motor de automação ouve `lead.tag_added`/`contact.tag_added`, que
  -- é outro tipo (e disparar automação num renomear em lote seria pior que não
  -- disparar). Evento sem consumidor é o anti-pattern 3 do CLAUDE.md, e aqui
  -- custava milhares de linhas dentro de UMA transação, num log que nada drena e
  -- nada expurga.
  --
  -- Quem registra a operação é o AUDIT LOG, na borda: `tag_vocabulary.changed`
  -- em `app/api/v1/tags/vocabulario/route.ts`, com os contadores que este corpo
  -- devolve. E a tela aberta se atualiza pelo Realtime das próprias tabelas.

  -- ── (z) A COR SAI ANTES DOS LAÇOS, E NÃO É OTIMIZAÇÃO ─────────────────────
  --
  -- Cor é atributo do VOCABULÁRIO, não das linhas: `contacts.tags`,
  -- `crm_leads.tags` e `conversations.tags` continuam `text[]` de nomes, porque
  -- automação, webhook (`lead.tag_added`) e MCP (`*.tags_changed`) falam em
  -- string há versões (contrato da fatia S4). Então a ação `definir_cor` não tem
  -- o que reescrever em contatos, leads nem conversas — e os laços abaixo, se
  -- rodassem, custariam uma varredura das três tabelas para devolver zero.
  --
  -- O bloco das listas de sugestão (mais abaixo) é pior que inútil aqui: ele
  -- troca o nome da semente por `v_destino` e descarta o que sobra vazio — com
  -- `destino` nulo nesta ação, a semente seria APAGADA. Daí o `return` cedo:
  -- nesta ação, só o vocabulário curado muda.
  if v_so_cor then
    -- 9038 (3): trava da curadoria e da linha — ver o cabeçalho da migration.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text, 9005));
    select coalesce(o.settings, '{}'::jsonb) into v_settings
    from public.organizations o where o.id = p_org
    for no key update;
    if v_settings is null then
      v_settings := '{}'::jsonb;
    end if;

    -- (a) tolera `settings.tags` torto (escalar/objeto): a leitura já tolera com
    -- `jsonb_typeof`, e sem esta guarda o `jsonb_array_elements` levantava
    -- `cannot extract elements from a scalar` e derrubava a tela inteira numa
    -- organização com o dado malformado. Lista que não é lista é lista vazia.
    v_antes := case
      when jsonb_typeof(v_settings -> 'tags') = 'array' then v_settings -> 'tags'
      else '[]'::jsonb
    end;
    v_depois := coalesce(
      (
        select jsonb_agg(entrada.valor order by entrada.ord)
        from (
          -- Uma entrada por chave canônica, agora acrescentando a cor na que
          -- casar. A entrada que era string vira objeto — a mesma forma que o
          -- rename já grava (mais abaixo, `jsonb_build_object('tag', …)`) — e
          -- `descricao` que já existia é PRESERVADA: esta ação fala de cor.
          --
          -- ⚠️ O desempate é o MESMO da função de leitura
          -- (`fn_vocabulario_de_tags`, `order by … (cor is not null or descricao
          -- is not null) desc`), e de propósito: onde a lista curada já tiver a
          -- mesma etiqueta duas vezes (uma como string, outra como objeto com
          -- cor), quem sobrevive é a entrada que carrega o metadado. Ordenar só
          -- por `ord` apagaria a cor na primeira vez que a ação rodasse sobre um
          -- vocabulário nesse estado, e a tela mostraria "sem cor" logo depois de
          -- alguém ter escolhido uma.
          select distinct on (lower(x.chave)) x.valor, x.ord
          from (
            select btrim(coalesce(e.valor ->> 'tag', e.valor #>> '{}')) as chave,
                   case
                     when lower(btrim(coalesce(e.valor ->> 'tag', e.valor #>> '{}'))) = lower(v_tag)
                     then case
                            when nullif(v_cor, '') is null
                            then (case when jsonb_typeof(e.valor) = 'string'
                                       then jsonb_build_object('tag', e.valor #>> '{}')
                                       else e.valor end) - 'cor'
                            else jsonb_set(
                                   case when jsonb_typeof(e.valor) = 'string'
                                        then jsonb_build_object('tag', e.valor #>> '{}')
                                        else e.valor end,
                                   '{cor}', to_jsonb(v_cor))
                          end
                     else case when jsonb_typeof(e.valor) = 'string'
                               then jsonb_build_object('tag', e.valor #>> '{}')
                               else e.valor end
                   end as valor,
                   e.ord
            from jsonb_array_elements(v_antes) with ordinality as e(valor, ord)
            where btrim(coalesce(e.valor ->> 'tag', e.valor #>> '{}')) <> ''
          ) x
          where x.valor is not null
          order by lower(x.chave),
                   ((x.valor ->> 'cor') is not null or (x.valor ->> 'descricao') is not null) desc,
                   x.ord
        ) as entrada
      ),
      '[]'::jsonb
    );

    -- A etiqueta que ainda não tinha entrada no vocabulário curado — semente, ou
    -- nome que só existe em uso (`no_vocabulario = false` na leitura) — GANHA
    -- uma. É deliberado: dar cor é curar. Sem isto, a tela ofereceria cor para
    -- uma etiqueta que continuaria marcada como "em uso, fora do vocabulário", e
    -- a leitura devolveria a cor de uma linha que não está na lista curada.
    if nullif(v_cor, '') is not null and not exists (
      select 1 from jsonb_array_elements(v_depois) as e(valor)
      where lower(btrim(coalesce(e.valor ->> 'tag', e.valor #>> '{}'))) = lower(v_tag)
    ) then
      v_depois := v_depois || jsonb_build_array(jsonb_build_object('tag', v_tag, 'cor', v_cor));
    end if;

    if v_depois <> v_antes then
      v_settings := jsonb_set(v_settings, '{tags}', v_depois);
      update public.organizations o
         set settings = v_settings,
             updated_at = now()
       where o.id = p_org;
      v_definido := true;
    end if;

    return jsonb_build_object(
      'acao', p_acao,
      'tag', v_tag,
      'destino', null,
      'cor', nullif(v_cor, ''),
      'contatos', 0,
      'leads', 0,
      'conversas', 0,
      'regras', 0,
      'alterou', v_definido
    );
  end if;

  -- 9038 (2): a etiqueta `cliente` de CONTATO, com a regra da agenda ligada, não
  -- é renomeada, juntada (como origem ou destino) nem excluída por aqui. A
  -- reserva é a da 9005 e compara em minúsculas, a régua de `fn_tags_normalizar`.
  --
  -- ⚠️ `array_remove(..., null)`: no excluir não há destino, e `'cliente' = any`
  -- de uma lista com nulo dá NULO, não falso. A reserva leria "talvez seja
  -- cliente" e recusaria a exclusão de QUALQUER etiqueta com a regra ligada.
  perform public.fn_tags_reserva(
    p_org, 'contato', array_remove(array[lower(v_tag), lower(nullif(v_destino, ''))], null)
  );

  -- 9038 (3): a ordem de travas é 262 compartilhada (reserva, só quando envolve
  -- `cliente`) → advisory 9005 (a mesma de criar/arquivar) → linha da
  -- organização → contatos, leads, conversas. `settings` é lido UMA vez, aqui,
  -- antes dos laços. `for no key update` e não `for update`: não bloqueia os
  -- INSERTs com FK para `organizations` (mensagens, event_log) enquanto a
  -- operação termina.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text, 9005));
  select coalesce(o.settings, '{}'::jsonb) into v_settings
  from public.organizations o where o.id = p_org
  for no key update;

  if v_settings is null then
    v_settings := '{}'::jsonb;
  end if;

  -- (a) contatos
  for v_id in
    with alvo as (
      select c.id, public.fn_tags_normalizar(c.tags, v_tag, v_destino, v_remover) as novas
      from public.contacts c
      where c.organization_id = p_org
        and exists (
          select 1 from unnest(coalesce(c.tags, '{}'::text[])) as x(valor)
          where lower(btrim(x.valor)) = lower(v_tag)
        )
    ), mudou as (
      update public.contacts c
         set tags = a.novas
        from alvo a
       where c.id = a.id
         and c.tags is distinct from a.novas
      returning c.id
    )
    select id from mudou
  loop
    v_contatos := v_contatos + 1;
  end loop;

  -- (b) leads
  for v_id in
    with alvo as (
      select l.id, public.fn_tags_normalizar(l.tags, v_tag, v_destino, v_remover) as novas
      from public.crm_leads l
      where l.organization_id = p_org
        and exists (
          select 1 from unnest(coalesce(l.tags, '{}'::text[])) as x(valor)
          where lower(btrim(x.valor)) = lower(v_tag)
        )
    ), mudou as (
      update public.crm_leads l
         set tags = a.novas
        from alvo a
       where l.id = a.id
         and l.tags is distinct from a.novas
      returning l.id
    )
    select id from mudou
  loop
    v_leads := v_leads + 1;
  end loop;

  -- (c) conversas
  for v_id in
    with alvo as (
      select v.id, public.fn_tags_normalizar(v.tags, v_tag, v_destino, v_remover) as novas
      from public.conversations v
      where v.organization_id = p_org
        and exists (
          select 1 from unnest(coalesce(v.tags, '{}'::text[])) as x(valor)
          where lower(btrim(x.valor)) = lower(v_tag)
        )
    ), mudou as (
      update public.conversations v
         set tags = a.novas
        from alvo a
       where v.id = a.id
         and v.tags is distinct from a.novas
      returning v.id
    )
    select id from mudou
  loop
    v_conversas := v_conversas + 1;
  end loop;

  -- (d) as regras dos agentes — o ponto da issue.
  --
  -- `excluir` NÃO apaga a regra: quem exclui a etiqueta é avisado de quantas
  -- regras a escrevem (o número volta no jsonb e a tela pede confirmação), mas
  -- apagar `add_tag` de um agente em produção é decisão de outra tela. Aqui a
  -- lista da regra só é reescrita quando o nome muda ou quando ele sai.
  --
  -- 9038 (3): `v_settings` já foi lido (e a linha travada) antes dos laços.

  if not v_remover then
    with alvo as (
      select r.id,
             jsonb_agg(
               case
                 when a.valor ->> 'type' = 'add_tag'
                  and jsonb_typeof(a.valor -> 'config' -> 'tags') = 'array'
                 then jsonb_set(
                        a.valor,
                        '{config,tags}',
                        to_jsonb(public.fn_tags_normalizar(
                          array(select jsonb_array_elements_text(a.valor -> 'config' -> 'tags')),
                          v_tag, v_destino, false
                        ))
                      )
                 else a.valor
               end
               order by a.ord
             ) as novas
      from public.automation_rules r
      cross join lateral jsonb_array_elements(coalesce(r.actions, '[]'::jsonb))
        with ordinality as a(valor, ord)
      where r.organization_id = p_org
      -- ⚠️ `group by r.id` E SÓ. Agrupar também pelo TIPO da ação devolvia uma
      -- linha por (regra, tipo), cada uma com `novas` = só o subconjunto daquele
      -- tipo; o `update ... from alvo` casava as duas linhas, o Postgres usava
      -- UMA arbitrária, e `is distinct from` é sempre verdadeiro num subconjunto
      -- — então a regra com ações de dois tipos era TRUNCADA a um tipo só, em
      -- toda organização, mesmo que ela nunca tenha citado a etiqueta renomeada.
      -- Medido num Postgres real: regra com `add_tag` + `assign_owner` ficava com
      -- uma ação, e a tela dizia "atualizada em 1 regra(s) de agente".
      group by r.id
    ), mudou as (
      update public.automation_rules r
         set actions = alvo.novas,
             updated_at = now()
        from alvo
       where r.id = alvo.id
         and r.actions is distinct from alvo.novas
      returning r.id
    )
    select count(*) into v_regras from mudou;
  else
    -- Exclusão: conta as regras que ainda escrevem a etiqueta, sem tocar nelas.
    select count(distinct r.id) into v_regras
    from public.automation_rules r
    cross join lateral jsonb_array_elements(coalesce(r.actions, '[]'::jsonb)) as a(valor)
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(a.valor -> 'config' -> 'tags') = 'array'
           then a.valor -> 'config' -> 'tags' else '[]'::jsonb end
    ) as e(valor)
    where r.organization_id = p_org
      and a.valor ->> 'type' = 'add_tag'
      and lower(btrim(e.valor #>> '{}')) = lower(v_tag);
  end if;

  -- (e) o vocabulário da organização, nos lugares onde ele mora.
  --
  -- 9038 (5): no EXCLUIR, só a entrada da etiqueta excluída vira nula. A 0336
  -- escrevia `when v_remover then null` sem casar o nome, e excluir UMA etiqueta
  -- esvaziava `settings.tags` inteiro (todas as cores) e todas as sugestões de
  -- conversa da organização. Medido no invariante desta migration.
  -- Mesma guarda do ramo de renomear: `settings.tags` malformado não pode
  -- derrubar a cor (a leitura tolera; a escrita agora também).
  v_antes := case
    when jsonb_typeof(v_settings -> 'tags') = 'array' then v_settings -> 'tags'
    else '[]'::jsonb
  end;
  v_depois := coalesce(
    (
      select jsonb_agg(entrada.valor order by entrada.ord)
      from (
        -- Dedupe pela chave DEPOIS da substituição (mesma razão de
        -- `fn_tags_normalizar`): juntar duas entradas de chaves diferentes num
        -- nome só deixava as duas no vocabulário, agora com o mesmo `tag`.
        --
        -- ⚠️ `cor` e `descricao` da entrada sobrevivem ao rename: o `jsonb_set`
        -- mexe só em `{tag}`. Renomear não é perder a cor que alguém escolheu.
        select distinct on (lower(x.chave)) x.valor, x.ord
        from (
          select case
                   when v_remover and lower(btrim(coalesce(e.valor ->> 'tag', e.valor #>> '{}'))) = lower(v_tag) then null
                   when lower(btrim(coalesce(e.valor ->> 'tag', e.valor #>> '{}'))) = lower(v_tag)
                     then v_destino
                   else btrim(coalesce(e.valor ->> 'tag', e.valor #>> '{}'))
                 end as chave,
                 case
                   when v_remover and lower(btrim(coalesce(e.valor ->> 'tag', e.valor #>> '{}'))) = lower(v_tag) then null
                   when lower(btrim(coalesce(e.valor ->> 'tag', e.valor #>> '{}'))) = lower(v_tag)
                     then jsonb_set(
                            case when jsonb_typeof(e.valor) = 'string' then jsonb_build_object('tag', e.valor #>> '{}')
                                 else e.valor end,
                            '{tag}', to_jsonb(v_destino))
                   else case when jsonb_typeof(e.valor) = 'string' then jsonb_build_object('tag', e.valor #>> '{}')
                             else e.valor end
                 end as valor,
                 e.ord
          from jsonb_array_elements(v_antes) with ordinality as e(valor, ord)
          where btrim(coalesce(e.valor ->> 'tag', e.valor #>> '{}')) <> ''
        ) x
        where x.valor is not null and coalesce(x.chave, '') <> ''
        order by lower(x.chave), x.ord
      ) as entrada
      where entrada.valor is not null
    ),
    '[]'::jsonb
  );
  if v_depois <> v_antes then
    v_settings := jsonb_set(v_settings, '{tags}', v_depois);
    v_definido := true;
  end if;

  -- 9038 (1): as QUATRO listas de sugestão passam pela substituição que a 0336
  -- fazia só em `canonical_conversation_tags`. Cada uma é `array de text`
  -- (formato da 0244, mantido pela 9005); lista que não é lista é lista vazia,
  -- a mesma tolerância de `settings.tags` acima.
  foreach v_chave in array array[
    'canonical_conversation_tags',
    'archived_conversation_tags',
    'canonical_contact_tags',
    'archived_contact_tags'
  ]
  loop
    v_antes := case
      when jsonb_typeof(v_settings -> v_chave) = 'array' then v_settings -> v_chave
      else '[]'::jsonb
    end;
    v_depois := coalesce(
      (
        select jsonb_agg(semente.valor order by semente.ord)
        from (
          -- Dedupe pela chave DEPOIS da substituição, como acima.
          select distinct on (lower(y.valor)) y.valor, y.ord
          from (
            select case
                     when v_remover and lower(btrim(s.valor #>> '{}')) = lower(v_tag) then null
                     when lower(btrim(s.valor #>> '{}')) = lower(v_tag) then v_destino
                     else btrim(s.valor #>> '{}')
                   end as valor,
                   s.ord
            from jsonb_array_elements(v_antes) with ordinality as s(valor, ord)
            where btrim(s.valor #>> '{}') <> ''
          ) y
          where coalesce(y.valor, '') <> ''
          order by lower(y.valor), y.ord
        ) as semente
        where semente.valor is not null
      ),
      '[]'::jsonb
    );
    -- Só grava a chave que existia ou que mudou: organização que nunca teve a
    -- lista continua sem ela, em vez de ganhar quatro `[]` a cada operação.
    if v_depois <> v_antes and (v_settings ? v_chave or v_depois <> '[]'::jsonb) then
      v_settings := jsonb_set(v_settings, array[v_chave], v_depois);
      v_definido := true;
    end if;
  end loop;

  -- 9038 (1): sugerida vence arquivada no mesmo escopo — ver o cabeçalho.
  foreach v_escopo in array array['conversation', 'contact']
  loop
    v_sugeridas := case
      when jsonb_typeof(v_settings -> ('canonical_' || v_escopo || '_tags')) = 'array'
      then v_settings -> ('canonical_' || v_escopo || '_tags') else '[]'::jsonb
    end;
    v_arquivadas := case
      when jsonb_typeof(v_settings -> ('archived_' || v_escopo || '_tags')) = 'array'
      then v_settings -> ('archived_' || v_escopo || '_tags') else '[]'::jsonb
    end;
    v_depois := coalesce(
      (
        select jsonb_agg(a.valor order by a.ord)
        from jsonb_array_elements(v_arquivadas) with ordinality as a(valor, ord)
        where not exists (
          select 1 from jsonb_array_elements(v_sugeridas) as c(valor)
          where lower(btrim(c.valor #>> '{}')) = lower(btrim(a.valor #>> '{}'))
        )
      ),
      '[]'::jsonb
    );
    if v_depois <> v_arquivadas then
      v_settings := jsonb_set(v_settings, array['archived_' || v_escopo || '_tags'], v_depois);
      v_definido := true;
    end if;
  end loop;

  if v_definido then
    update public.organizations o
       set settings = v_settings,
           updated_at = now()
     where o.id = p_org;
  end if;

  return jsonb_build_object(
    'acao', p_acao,
    'tag', v_tag,
    'destino', nullif(v_destino, ''),
    'cor', null,
    'contatos', v_contatos,
    'leads', v_leads,
    'conversas', v_conversas,
    'regras', v_regras,
    'alterou', (v_contatos + v_leads + v_conversas + v_regras > 0 or v_definido)
  );
end;
$$;

revoke execute on function public.fn_tags_normalizar(text[], text, text, boolean) from public, anon;
grant  execute on function public.fn_tags_normalizar(text[], text, text, boolean) to authenticated, service_role;
revoke execute on function public.fn_vocabulario_de_tags_operar(uuid, text, text, text, text) from public, anon;
grant  execute on function public.fn_vocabulario_de_tags_operar(uuid, text, text, text, text) to authenticated, service_role;

-- ---- 6a. fn_financeiro_provisionar: a 0619 com o papel no USING da _write ----
create or replace function public.fn_financeiro_provisionar()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $f$
begin
-- ─── a comanda ───────────────────────────────────────────────────────────────
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  -- Número visível, por organização. `bigint` e não `serial`: a sequência é
  -- própria de cada tenant (ver `fn_proximo_numero_de_comanda`), e um serial
  -- global vazaria o volume de um cliente para outro.
  number bigint not null,

  contact_id uuid references public.contacts(id) on delete set null,
  -- Quem atendeu. `set null` porque a pessoa pode sair da equipe e a venda
  -- continua tendo acontecido.
  attendant_user_id uuid references auth.users(id) on delete set null,
  appointment_id uuid references public.calendar_appointments(id) on delete set null,

  status text not null default 'open'
    check (status in ('open', 'finalized', 'cancelled')),

  -- Desconto da COMANDA, separado do desconto de item. Fidelidade e comissão
  -- incidem sobre o item, nunca sobre este — senão um desconto de caixa
  -- reduziria o prêmio de quem atendeu.
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  total_cents bigint not null default 0,
  currency text not null default 'BRL' check (char_length(currency) = 3),

  payment_method_id uuid references public.payment_methods(id) on delete restrict,

  notes text,
  finalized_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  -- Estornada: a comanda continua finalizada e ganha o contra-lançamento.
  reversed_at timestamptz,
  reverse_reason text,

  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Finalizar exige forma de pagamento: é ela que diz em que conta o dinheiro
  -- cai. Sem isso, a entrada não teria destino — e o CHECK diz isso no schema,
  -- não numa validação que alguém pode esquecer de chamar.
  constraint sales_finalizada_tem_forma
    check (status <> 'finalized' or payment_method_id is not null)
);

create unique index if not exists sales_org_numero_key on public.sales (organization_id, number);
create index if not exists sales_org_status_idx on public.sales (organization_id, status, created_at desc);
create index if not exists sales_org_contato_idx on public.sales (organization_id, contact_id);
create index if not exists sales_appointment_idx on public.sales (appointment_id)
  where appointment_id is not null;

-- ─── o item ──────────────────────────────────────────────────────────────────
create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- `cascade` aqui e só aqui: item não existe fora da comanda, e comanda não é
  -- apagada (cancela). O cascade só dispara se a ORGANIZAÇÃO inteira sair.
  sale_id uuid not null references public.sales(id) on delete cascade,

  -- O que foi feito. `event_type_id` porque, neste produto, o catálogo de
  -- serviços JÁ é `calendar_event_types` — criar uma tabela de serviços ao lado
  -- seria a segunda fonte da mesma verdade.
  event_type_id uuid references public.calendar_event_types(id) on delete restrict,
  -- Congelado na inclusão: o nome muda, a linha da venda não.
  description text not null,

  attendant_user_id uuid references auth.users(id) on delete set null,

  quantity integer not null default 1 check (quantity > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  total_cents bigint not null,

  -- ⚠️ RESOLVIDA NA INCLUSÃO e gravada aqui. A finalização não recalcula:
  -- mudar a regra amanhã não mexe no que já foi combinado ontem.
  commission_percent numeric(5, 2) not null default 0
    check (commission_percent >= 0 and commission_percent <= 100),

  created_at timestamptz not null default now()
);

create index if not exists sale_items_sale_idx on public.sale_items (sale_id);
create index if not exists sale_items_org_idx on public.sale_items (organization_id, created_at desc);

-- ─── a regra de comissão ─────────────────────────────────────────────────────
--
-- Precedência: (pessoa + serviço) → (pessoa) → (serviço). A mais específica
-- vence, e é por isso que as três colunas são nullable com um índice único por
-- combinação — não há linha "curinga" mágica, há ausência.
create table if not exists public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  attendant_user_id uuid references auth.users(id) on delete cascade,
  event_type_id uuid references public.calendar_event_types(id) on delete cascade,

  percent numeric(5, 2) not null check (percent >= 0 and percent <= 100),

  created_at timestamptz not null default now(),

  -- Pelo menos um dos dois: uma regra sem pessoa E sem serviço seria a regra
  -- "de tudo", que é o default da organização e mora em outro lugar.
  constraint commission_rules_tem_alvo
    check (attendant_user_id is not null or event_type_id is not null)
);

-- `coalesce` no índice: NULL não colide com NULL numa UNIQUE, e sem isto duas
-- regras "só para a Ana" passariam as duas, em silêncio.
create unique index if not exists commission_rules_alvo_key on public.commission_rules (
  organization_id,
  coalesce(attendant_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(event_type_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

-- ─── a comissão gerada ───────────────────────────────────────────────────────
create table if not exists public.commissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sale_item_id uuid not null references public.sale_items(id) on delete cascade,
  attendant_user_id uuid not null references auth.users(id) on delete restrict,

  percent numeric(5, 2) not null,
  amount_cents bigint not null,

  status text not null default 'pending' check (status in ('pending', 'paid', 'reversed')),
  paid_at timestamptz,
  reversed_at timestamptz,

  created_at timestamptz not null default now()
);

create unique index if not exists commissions_item_key on public.commissions (sale_item_id);
create index if not exists commissions_org_pessoa_idx
  on public.commissions (organization_id, attendant_user_id, status);

-- ─── o livro-razão da fidelidade ─────────────────────────────────────────────
--
-- LEDGER, não saldo. O saldo do cliente é `sum(points)` e nunca uma coluna:
-- guardar o saldo faria o primeiro estorno divergir em silêncio.
create table if not exists public.loyalty_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,

  -- Assinado: ganhar é positivo, resgatar é negativo. Uma coluna de "tipo" ao
  -- lado seria a segunda forma de dizer o mesmo sinal.
  points integer not null,
  reason text not null,

  sale_id uuid references public.sales(id) on delete set null,
  sale_item_id uuid references public.sale_items(id) on delete set null,

  -- Idempotência do ganho: finalizar a mesma comanda duas vezes não dá ponto
  -- em dobro. A UNIQUE parcial é a garantia, não a boa intenção de quem chama.
  idempotency_key text,

  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists loyalty_ledger_idem_key
  on public.loyalty_ledger (organization_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists loyalty_ledger_contato_idx
  on public.loyalty_ledger (organization_id, contact_id, created_at desc);
-- 0354 — a regra de comissão entra no catálogo, e para isso INATIVA em vez de
-- sumir: o percentual já aplicado está congelado no item, então apagar perderia
-- a resposta a "por que aquela comanda saiu com este percentual".
alter table public.commission_rules
  add column if not exists name text not null default 'Regra de comissão';

alter table public.commission_rules
  add column if not exists is_active boolean not null default true;

comment on column public.commission_rules.is_active is
  'Regra em vigor. Inativa em vez de apagar: o percentual já aplicado está congelado no item, e o que se perderia é a resposta a "por que aquela comanda saiu com este percentual".';

create index if not exists commission_rules_org_ativas_idx
  on public.commission_rules (organization_id, event_type_id, attendant_user_id)
  where is_active;

-- 0352 — uma comanda por agendamento. PARCIAL nas duas condições: comanda avulsa
-- é a maioria e não se exclui de comanda de agendamento, e comanda cancelada
-- deixa de valer (sem isto, cancelar por engano trancaria o agendamento para
-- sempre, sem conserto pela tela).
create unique index if not exists sales_agendamento_unico_idx
  on public.sales (organization_id, appointment_id)
  where appointment_id is not null and status <> 'cancelled';

-- Os comentários das tabelas da comanda moram AQUI, e não no bloco do RLS do
-- núcleo: `comment on table` no baseline recriaria as tabelas num banco onde o
-- módulo não está instalado — que é exatamente o que a D2 proíbe.
comment on table public.sales is
  'A comanda. Cancela, nunca apaga. `number` é sequencial por organização e não reinicia.';
comment on table public.loyalty_ledger is
  'Livro-razão de fidelidade. O saldo do cliente é sum(points) — NUNCA uma coluna.';

-- A FK que o caixa perdeu (`financial_entries.sale_id → sales.id`, `on delete set
-- null`) SAIU do corpo desta função: `financial_entries` é tabela do NÚCLEO, e o
-- molde da onda 10 (`tests/invariants/provisionadora-de-modulo.test.ts`) não deixa
-- o corpo de uma provisionadora alterar tabela do núcleo — a regra é o inverso,
-- "FK do módulo para o núcleo", e vale para a FK nascer na tabela do módulo
-- (`sale_items.sale_id → sales.id` está aqui embaixo).
--
-- A criação dela agora é rotina própria, `fn_financeiro_ligar_caixa_a_comanda()`,
-- definida no fim desta migration: a provisionadora CHAMA a rotina (a FK continua
-- nascendo no provisionamento) e o topo também, já na passada do kit onde a
-- comanda já existe. Em ambos, o `not exists` passou a olhar QUALQUER FK de
-- `financial_entries.sale_id → sales` em vez de um nome fixo — a 0351 trazia
-- `financeiro_sale_id_fkey` e a main traz `financial_entries_sale_id_fkey`, e
-- conferir um nome só criaria a segunda FK (item 5 do PR #1907).

  -- ── RLS das cinco tabelas, declarada por ESTA função (#1906 + D5) ──────────
  -- A rotina 0325 (`fn_proteger_tabelas_de_organizacao`) só enxerga tabela com
  -- RLS DESLIGADA: ligando aqui a decisão do módulo prevalece, e o `revoke` de
  -- `anon` vem junto porque é a MESMA rotina que o faria — se ela não enxerga a
  -- tabela, ela não faz por nós.
  --
  -- Cada `create policy` deste corpo ocupa DUAS linhas de propósito (issue
  -- #1906): a conferência antiga do `update.sh` (v1.39.0 a v1.63.0) casava o
  -- nome da policy e o `on public.` na MESMA linha e abortava a atualização
  -- de quem tem o módulo instalado. É a quebra entre as duas linhas que tira
  -- a regra do olhar daquela varredura sem tirar a regra da tabela.
  --
  -- 0533 (#2115): o `tenant_isolation_<t>_all` virou o PAR `_read`/`_write`,
  -- o mesmo desenho que o baseline dá a `financial_entries` no núcleo. Leitura
  -- com a função pura (o `support_readonly` continua LENDO a comanda); escrita
  -- com `scope='full'` e papel `agent+` — era isso que a política larga escondia:
  -- sem o par, quem só lê escrevia a comanda inteira. O `drop ... _all` fica em
  -- cada bloco para o reaplicar (D6) converter banco provisionado pela versão
  -- antiga do corpo, e o par nasce AQUI porque a rotina 0325 só enxerga tabela
  -- com RLS DESLIGADA — estas já nascem ligadas.
  alter table public.sales enable row level security;
  revoke all on public.sales from anon;
  drop policy if exists tenant_isolation_sales_all on public.sales;
  drop policy if exists tenant_isolation_sales_read on public.sales;
  create policy tenant_isolation_sales_read
    on public.sales for select
    using (organization_id in (select public.fn_user_org_ids())
           or public.fn_is_platform_admin());
  drop policy if exists tenant_isolation_sales_write on public.sales;
  create policy tenant_isolation_sales_write
    on public.sales for all
    -- 9058: o papel também no USING. Em `for all`, DELETE só consulta o
    -- `using`: sem o papel aqui, um viewer apagava a linha.
    using (
      public.fn_is_platform_admin_full()
      or (organization_id in (select public.fn_user_org_ids())
          and public.fn_role_at_least(organization_id, 'agent'))
    )
    with check (
      public.fn_is_platform_admin_full()
      or (organization_id in (select public.fn_user_org_ids())
          and public.fn_role_at_least(organization_id, 'agent'))
    );

  alter table public.sale_items enable row level security;
  revoke all on public.sale_items from anon;
  drop policy if exists tenant_isolation_sale_items_all on public.sale_items;
  drop policy if exists tenant_isolation_sale_items_read on public.sale_items;
  create policy tenant_isolation_sale_items_read
    on public.sale_items for select
    using (organization_id in (select public.fn_user_org_ids())
           or public.fn_is_platform_admin());
  drop policy if exists tenant_isolation_sale_items_write on public.sale_items;
  create policy tenant_isolation_sale_items_write
    on public.sale_items for all
    -- 9058: o papel também no USING. Em `for all`, DELETE só consulta o
    -- `using`: sem o papel aqui, um viewer apagava a linha.
    using (
      public.fn_is_platform_admin_full()
      or (organization_id in (select public.fn_user_org_ids())
          and public.fn_role_at_least(organization_id, 'agent'))
    )
    with check (
      public.fn_is_platform_admin_full()
      or (organization_id in (select public.fn_user_org_ids())
          and public.fn_role_at_least(organization_id, 'agent'))
    );

  alter table public.commission_rules enable row level security;
  revoke all on public.commission_rules from anon;
  drop policy if exists tenant_isolation_commission_rules_all on public.commission_rules;
  drop policy if exists tenant_isolation_commission_rules_read on public.commission_rules;
  create policy tenant_isolation_commission_rules_read
    on public.commission_rules for select
    using (organization_id in (select public.fn_user_org_ids())
           or public.fn_is_platform_admin());
  drop policy if exists tenant_isolation_commission_rules_write on public.commission_rules;
  create policy tenant_isolation_commission_rules_write
    on public.commission_rules for all
    -- 9058: o papel também no USING. Em `for all`, DELETE só consulta o
    -- `using`: sem o papel aqui, um viewer apagava a linha.
    using (
      public.fn_is_platform_admin_full()
      or (organization_id in (select public.fn_user_org_ids())
          and public.fn_role_at_least(organization_id, 'agent'))
    )
    with check (
      public.fn_is_platform_admin_full()
      or (organization_id in (select public.fn_user_org_ids())
          and public.fn_role_at_least(organization_id, 'agent'))
    );

  alter table public.commissions enable row level security;
  revoke all on public.commissions from anon;
  drop policy if exists tenant_isolation_commissions_all on public.commissions;
  drop policy if exists tenant_isolation_commissions_read on public.commissions;
  create policy tenant_isolation_commissions_read
    on public.commissions for select
    using (organization_id in (select public.fn_user_org_ids())
           or public.fn_is_platform_admin());
  drop policy if exists tenant_isolation_commissions_write on public.commissions;
  create policy tenant_isolation_commissions_write
    on public.commissions for all
    -- 9058: o papel também no USING. Em `for all`, DELETE só consulta o
    -- `using`: sem o papel aqui, um viewer apagava a linha.
    using (
      public.fn_is_platform_admin_full()
      or (organization_id in (select public.fn_user_org_ids())
          and public.fn_role_at_least(organization_id, 'agent'))
    )
    with check (
      public.fn_is_platform_admin_full()
      or (organization_id in (select public.fn_user_org_ids())
          and public.fn_role_at_least(organization_id, 'agent'))
    );

  alter table public.loyalty_ledger enable row level security;
  revoke all on public.loyalty_ledger from anon;
  drop policy if exists tenant_isolation_loyalty_ledger_all on public.loyalty_ledger;
  drop policy if exists tenant_isolation_loyalty_ledger_read on public.loyalty_ledger;
  create policy tenant_isolation_loyalty_ledger_read
    on public.loyalty_ledger for select
    using (organization_id in (select public.fn_user_org_ids())
           or public.fn_is_platform_admin());
  drop policy if exists tenant_isolation_loyalty_ledger_write on public.loyalty_ledger;
  create policy tenant_isolation_loyalty_ledger_write
    on public.loyalty_ledger for all
    -- 9058: o papel também no USING. Em `for all`, DELETE só consulta o
    -- `using`: sem o papel aqui, um viewer apagava a linha.
    using (
      public.fn_is_platform_admin_full()
      or (organization_id in (select public.fn_user_org_ids())
          and public.fn_role_at_least(organization_id, 'agent'))
    )
    with check (
      public.fn_is_platform_admin_full()
      or (organization_id in (select public.fn_user_org_ids())
          and public.fn_role_at_least(organization_id, 'agent'))
    );

  -- D5: a proteção na MESMA transação. Sem esta linha a tabela nasce com a anon
  -- key podendo ler tudo — `baseline.sql:4748` dá, por
  -- `alter default privileges`, privilégio total a `anon` no que nasce depois.
  perform public.fn_proteger_modulo_provisionado();

  -- ── A comanda alcançada por SEÇÃO, não por passo escrito na cascata ────────
  -- `notes`, `cancel_reason` e `reverse_reason` são texto da pessoa, e a comanda
  -- é alcançada por `contact_id`. O que a D8 (migration 0485) cobra é a SEÇÃO
  -- declarada em `modulo_secoes_lgpd`: daí em diante a redação acontece no
  -- gatilho `trg_lgpd_secoes_de_modulo`, nos DOIS caminhos de anonimização (a
  -- cascata e a virada `is_anonymized` de `fn_lgpd_anonymize_contact`), e sem o
  -- núcleo nomear `sales` — o `update sales set` fixo saiu da cascata por isto.
  perform public.fn_financeiro_declarar_secoes_lgpd();

  -- A FK do caixa, que o molde não deixa o corpo criar (núcleo alterando núcleo):
  -- sai daqui para a rotina própria que a migration define no fim, com o mesmo
  -- guarda de `to_regclass` e a conferência de qualquer FK já existente.
  perform public.fn_financeiro_ligar_caixa_a_comanda();
end
$f$;

revoke execute on function public.fn_financeiro_provisionar() from public, anon, authenticated;
grant execute on function public.fn_financeiro_provisionar() to service_role;

-- ---- 6b. financeiro: a _write com o papel no USING e as por comando com _full (9007) ----
do $$
declare
  t text;
  papel text;
  tabelas_e_papeis text[][] := array[
    array['financial_accounts', 'manager'],
    array['payment_methods',    'manager'],
    array['account_plans',      'manager'],
    array['sales',             'agent'],
    array['sale_items',        'agent'],
    array['commission_rules',  'agent'],
    array['commissions',       'agent'],
    array['financial_entries', 'agent'],
    array['loyalty_ledger',    'agent']
  ];
  i integer;
begin
  for i in 1 .. array_length(tabelas_e_papeis, 1) loop
    t := tabelas_e_papeis[i][1];
    papel := tabelas_e_papeis[i][2];
    if to_regclass('public.' || quote_ident(t)) is null then
      continue;  -- instalação sem o módulo
    end if;

    execute format('drop policy if exists tenant_isolation_%I_all on public.%I', t, t);

    -- O par da 0533/0619 fica (o `_read` é a leitura de sempre), mas a `_write`
    -- ganha o papel no USING: em `for all`, DELETE só consulta o `using`.
    execute format('drop policy if exists tenant_isolation_%I_write on public.%I', t, t);
    execute format($f$
      create policy tenant_isolation_%I_write on public.%I
        for all
        using (
          public.fn_is_platform_admin_full()
          or (organization_id in (select public.fn_user_org_ids())
              and public.fn_role_at_least(organization_id, %L))
        )
        with check (
          public.fn_is_platform_admin_full()
          or (organization_id in (select public.fn_user_org_ids())
              and public.fn_role_at_least(organization_id, %L))
        )
    $f$, t, t, papel, papel);

    -- As três de escrita da 9007, agora com `_full` (a pura aceitava o suporte
    -- só leitura, que só a policy restritiva do suporte segurava).
    execute format('drop policy if exists tenant_isolation_%I_insert on public.%I', t, t);
    execute format($f$
      create policy tenant_isolation_%I_insert on public.%I
        for insert
        with check (
          public.fn_is_platform_admin_full()
          or (organization_id in (select public.fn_user_org_ids())
              and public.fn_role_at_least(organization_id, %L))
        )
    $f$, t, t, papel);
    execute format('drop policy if exists tenant_isolation_%I_update on public.%I', t, t);
    execute format($f$
      create policy tenant_isolation_%I_update on public.%I
        for update
        using (
          public.fn_is_platform_admin_full()
          or (organization_id in (select public.fn_user_org_ids())
              and public.fn_role_at_least(organization_id, %L))
        )
        with check (
          public.fn_is_platform_admin_full()
          or (organization_id in (select public.fn_user_org_ids())
              and public.fn_role_at_least(organization_id, %L))
        )
    $f$, t, t, papel, papel);
    execute format('drop policy if exists tenant_isolation_%I_delete on public.%I', t, t);
    execute format($f$
      create policy tenant_isolation_%I_delete on public.%I
        for delete
        using (
          public.fn_is_platform_admin_full()
          or (organization_id in (select public.fn_user_org_ids())
              and public.fn_role_at_least(organization_id, %L))
        )
    $f$, t, t, papel);

    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
