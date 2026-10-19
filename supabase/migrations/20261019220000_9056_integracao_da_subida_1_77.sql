-- manifest: 9056 — Tektus: a subida do upstream 1.77 sem um lado apagar o outro. Roda por último e deixa a versão INTEGRADA (copiada do baseline.sql) de quatro objetos que os dois lados redefinem: agent_inbox_items_kind_check com canal_pausado (0589) e task_due (9043); fn_attendant_metrics com os desfechos da época (9053) e o recorte antes do lateral (0596, #2514); fn_contagens_da_caixa (9051) com o contato pessoal (0563) e o canal desativado (0545) fora das contagens, o mesmo corte da lista; fn_enfileirar_midia_vencida com a miniatura (9033) e o anexo de nota por idade (0572). Idempotente.
--
-- 9056: integração da subida do upstream 1.77 (etapa 2 de 4).
--
-- ## O defeito de ordem (o mesmo da 9055)
--
--   objeto                         upstream   fork
--   agent_inbox_items_kind_check   0589       9043/9055
--   fn_attendant_metrics           0596       9053
--   fn_contagens_da_caixa          (lista: 0545, 0563)   9029..9051
--   fn_enfileirar_midia_vencida    0557/0572  9033 (a miniatura conta como referência)
--
-- Na cadeia nova, 9053/9055 (19/10) vêm depois de 0589/0596 (07-08/10) e tiram
-- `canal_pausado` da constraint e o #2514 das métricas. Em produção, que já tem
-- as nossas, 0589/0596 entram depois e tiram `task_due` e os desfechos da época
-- (9053). A contagem da caixa é do fork (uma consulta, 9029) e não conhecia o
-- corte de pessoal e de canal desativado que o upstream pôs na LISTA: o badge
-- contaria conversa que a aba esconde.
--
-- Esta migration roda por último com a versão do baseline (os dois não divergem
-- por construção). As permissões das funções não mudam (mesma assinatura).
-- Prova: tests/unit/kind-check-migration-x-baseline.test.ts,
-- tests/invariants/contagens-da-caixa-9029.test.ts.
-- Rollback: reverter o PR; as definições anteriores estão nas migrations citadas.

set local lock_timeout = '3s';

-- ---- 1. agent_inbox_items_kind_check: canal_pausado (0589) + task_due (9043) ----
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
    'other'
  ));

-- ---- 2. fn_attendant_metrics: 9053 + 0596 (#2514) ----
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
  -- ─── #2514: o recorte ANTES do lateral, não depois dele ────────────────────
  --
  -- O `ttfr` media a 1ª resposta humana de TODA conversa atribuída da
  -- organização: o `cross join lateral` rodava uma vez por conversa e a janela
  -- só entrava no filtro do agregado. 1 dia e 90 dias faziam o mesmo trabalho
  -- (medido: 13,9 s contra 15,8 s), e o dashboard chama isso com janela curta a
  -- cada visita.
  --
  -- O candidato é EXATO, não uma margem: a média só pode nascer de conversa cuja
  -- 1ª resposta humana cai na janela (`fr.first_human_out >= p_from and <
  -- p_to`, predicado que já existia), e toda conversa assim tem UMA mensagem
  -- humana de saída na janela — é justamente ela a 1ª. O que
  -- `ttfr_candidatas` deixa de fora não passava daquele filtro de qualquer
  -- forma: não era contagem, não era vazamento, só pagava o lateral.
  --
  -- O custo do candidato acompanha a JANELA: `idx_messages_org_direction_sent`
  -- (0133) cobre o predicado inteiro, `(organization_id, direction, sent_at)`.
  ttfr_candidatas as (
    select distinct m.conversation_id
    from public.messages m
    where m.organization_id = p_org
      and m.direction = 'outbound'
      and m.sent_by_user_id is not null
      and m.sent_at >= p_from
      and m.sent_at < p_to
  ),
  ttfr as (
    select
      c.assigned_to_user_id as user_id,
      avg(extract(epoch from (fr.first_human_out - fr.first_in))) as avg_first_response_seconds
    from public.conversations c
    -- A linha de fora do candidato nunca entrou na média; ela só existia para
    -- ser varrida. O lateral e o filtro de baixo estão INTACTOS.
    join ttfr_candidatas k on k.conversation_id = c.id
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

-- ---- 3. fn_contagens_da_caixa: sem pessoal (0563) e sem canal desativado (0545) ----
create or replace function public.fn_contagens_da_caixa(
  p_organizacao uuid,
  p_comandos_da_fila text[],
  p_terminais text[],
  p_canal uuid default null,
  p_entrada text default null,
  p_so_nao_lidas boolean default false,
  p_marcadores text[] default null,
  p_modo text default 'e',
  p_sem_passo boolean default false,
  p_canal_tipo text default null,
  p_grupos boolean default null,
  p_funil uuid default null,
  p_etapas uuid[] default null,
  p_responsavel text default null,
  p_desde timestamptz default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with base as materialized (
    select c.status,
           c.assigned_to_user_id,
           public.fn_comando_da_conversa(
             c.status, c.assigned_to_user_id, c.bot_silenced_until,
             coalesce(ct.force_human, false), coalesce(ct.is_blocked, false),
             now(), coalesce(c.is_group, false)
           ) as comando
      from public.conversations c
      left join public.contacts ct
        on ct.id = c.contact_id and ct.organization_id = c.organization_id
     where c.organization_id = p_organizacao
       and (p_canal is null or c.channel_session_id = p_canal)
       and (p_entrada is null or c.instagram_entrada = p_entrada)
       and (
         not coalesce(p_so_nao_lidas, false)
         or c.unread_count_for_assignee > 0
         -- 9042: a conversa que ESTA pessoa marcou como não lida.
         or exists (
           select 1 from public.conversation_user_state s
            where s.conversation_id = c.id
              and s.user_id = (select auth.uid())
              and s.marked_unread_at is not null
         )
       )
       and (
         coalesce(cardinality(p_marcadores), 0) = 0
         or case
              when p_modo = 'ou' and cardinality(p_marcadores) > 1
                then c.tags && p_marcadores or ct.tags && p_marcadores
              else c.tags @> p_marcadores or ct.tags @> p_marcadores
            end
       )
       -- 9047: o MESMO campo calculado que a lista filtra.
       and (not coalesce(p_sem_passo, false) or public.passo_da_conversa(c) = 'sem_passo')
       -- 9049: o TIPO de canal é a coluna da própria conversa (whatsapp, instagram,
       -- facebook: o CHECK de `conversations.channel`), então não há sessão de outra
       -- organização a resolver: a linha já é da organização filtrada acima. Valor
       -- fora da lista não casa nada (a rota valida antes, contra a lista fixa).
       and (p_canal_tipo is null or c.channel = p_canal_tipo)
       -- 9049: o MESMO filtro `is_group` da lista, nos três estados: nulo = todas,
       -- true = só grupos, false = sem grupos (P2 do Cassio na #179).
       and (p_grupos is null or coalesce(c.is_group, false) = p_grupos)
       -- 9051: FUNIL e ETAPAS pelos MESMOS campos calculados que a lista filtra
       -- (`funis_da_conversa`, `etapas_da_conversa`: o negócio do contato da conversa,
       -- com a RLS de crm_leads de quem chama). Etapa escolhida decide sozinha (a
       -- etapa é de um funil só); sem etapa, vale o funil.
       and (
         case
           when coalesce(cardinality(p_etapas), 0) > 0
             then public.etapas_da_conversa(c) && p_etapas
           when p_funil is not null
             then public.funis_da_conversa(c) @> array[p_funil]
           else true
         end
       )
       -- 9051: o RESPONSÁVEL como a lista: 'ninguem' = sem atendente; senão o id.
       and (
         p_responsavel is null
         or (p_responsavel = 'ninguem' and c.assigned_to_user_id is null)
         or c.assigned_to_user_id::text = p_responsavel
       )
       -- 9051: PERÍODO da última mensagem; o corte vem calculado do TypeScript, o
       -- mesmo valor que a lista aplica em `last_message_at`.
       and (p_desde is null or c.last_message_at >= p_desde)
       -- 9056 (subida 1.77): o MESMO corte da lista do upstream. Contato PESSOAL
       -- (0563, spec 21) não soma em aba nenhuma, e canal DESATIVADO (0545,
       -- `channel_sessions.metadata.disabled = true`) nunca entra na inbox. Sem
       -- isto o badge contaria o que a aba esconde.
       and not coalesce(ct.is_personal, false)
       and not exists (
         select 1 from public.channel_sessions s
          where s.id = c.channel_session_id
            and s.organization_id = c.organization_id
            and s.metadata -> 'disabled' = 'true'::jsonb
       )
  )
  select jsonb_build_object(
    'fila',       count(*) filter (where comando = any (p_comandos_da_fila)),
    'automatico', count(*) filter (where comando = 'automatico'),
    'mine',       count(*) filter (where assigned_to_user_id = (select auth.uid())
                                     and not (status::text = any (p_terminais))),
    'all',        count(*),
    'closed',     count(*) filter (where status::text = 'closed'),
    'archived',   count(*) filter (where status::text = 'archived')
  )
  from base;
$$;

comment on function public.fn_contagens_da_caixa(uuid, text[], text[], uuid, text, boolean, text[], text, boolean, text, boolean, uuid, uuid[], text, timestamptz) is
  'As seis contagens das abas da caixa de entrada numa varredura (migration 9029). SECURITY INVOKER: a RLS de conversations vale para quem chama. As regras (fila, terminais, etiquetas limpas) vêm do TypeScript por parâmetro. Desde a 9042, "só não lidas" inclui a conversa que a pessoa marcou como não lida; desde a 9047, p_sem_passo aplica o filtro "Sem próximo passo" (passo_da_conversa); desde a 9049, p_canal_tipo (conversations.channel) e p_grupos (is_group: nulo, só grupos ou sem grupos), os filtros da folha do celular; desde a 9051, p_funil/p_etapas (funis_da_conversa/etapas_da_conversa), p_responsavel (id ou ninguem) e p_desde (last_message_at); desde a 9056, fora o contato pessoal (0563) e o canal desativado (0545).';

revoke execute on function public.fn_contagens_da_caixa(uuid, text[], text[], uuid, text, boolean, text[], text, boolean, text, boolean, uuid, uuid[], text, timestamptz) from public, anon;
grant  execute on function public.fn_contagens_da_caixa(uuid, text[], text[], uuid, text, boolean, text[], text, boolean, text, boolean, uuid, uuid[], text, timestamptz) to authenticated, service_role;

-- ---- 4. fn_enfileirar_midia_vencida: 9033 + 0557/0572 ----
create or replace function public.fn_enfileirar_midia_vencida(p_limite integer default 500)
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_lim integer := greatest(1, least(coalesce(p_limite, 500), 5000));
  v_vencidas integer := 0;
  v_orfas integer := 0;
  -- Órfãos do bucket PRÓPRIO da nota interna (0483). Contam em `v_orfas`:
  -- é a mesma categoria — arquivo sem ponteiro — e a chave de retorno não
  -- muda (o `toEqual` congelado de `poda-de-midia.test.ts` mede as três).
  v_orfas_nota integer := 0;
  -- Anexo de nota VIVO que já passou da retenção (#1887). Conta em
  -- `v_vencidas`: é a MESMA categoria — arquivo vencido por idade — e a chave
  -- congelada do retorno (0435) não muda de nome nem de número.
  v_vencidas_nota integer := 0;
  -- O que o expurgo apagou NESTA chamada (#1765). Começa em 0 para que a
  -- rodada sem nada a expurgar devolva 0 — e não null, que o cron somaria
  -- como se fosse apagado.
  v_expurgadas integer := 0;
  -- Janela do expurgo, em UM lugar só: é a constante que se muda amanhã.
  v_janela_deleted interval := interval '90 days';
begin
  -- 0. EXPURGO: a linha `deleted` da RETENÇÃO já cumpriu o papel (o arquivo
  --    saiu do bucket) e nada mais precisa dela — sem isto a fila cresce sem
  --    teto (#1739, item 2). Só `deleted`: `skipped` é «o objeto já não
  --    existe», `failed` é a prova de uma remoção que nunca passou das 3
  --    tentativas, e a issue manda não mexer em nenhuma das duas.
  --    E só a de retenção (`request_id is null`): a linha de pedido LGPD é o
  --    ÚNICO registro por objeto de que a mídia do titular saiu do bucket — o
  --    worker só troca o `status` e nada audita a remoção física. Ela sai
  --    sozinha se o pedido for apagado (FK `on delete set null`).
  --    O `GET DIAGNOSTICS` conta o que o DELETE apagou NESTA chamada (#1765):
  --    sem ele a rodada que só expurgou é indistinguível, na trilha, da rodada
  --    que não tinha o que fazer.
  delete from public.storage_redaction_queue
   where status = 'deleted'
     and request_id is null
     and coalesce(processed_at, enqueued_at) < now() - v_janela_deleted;
  get diagnostics v_expurgadas = row_count;

  -- 1. VENCIDAS: arquivo de mensagem mais velho que a retenção da organização —
  --    SÓ de organização com o interruptor LIGADO (`media_retention_enforced`,
  --    0557/#1534) e que NÃO está com pedido LGPD em andamento: um pedido de
  --    acesso/eliminação em curso (`lgpd_requests` em `received`/`processing`)
  --    não pode ter o objeto destruído no meio do atendimento — a suspensão é
  --    da ORGANIZAÇÃO INTEIRA, o lado conservador de um prazo legal. O índice
  --    `lgpd_requests_org_status_idx` (organization_id, status) cobre a
  --    anti-join. A mensagem fica (texto, status, horário); o arquivo sai, a
  --    `media_url` também (a rota não busca de novo do provedor), a transcrição
  --    some junto (`media_derived_text`) e a tela mostra o aviso via
  --    `metadata.media_status='expired'`. O piso de 30 dias é o mesmo do
  --    formulário, mesmo com valor menor gravado no banco.
  with alvo as (
    select m.id, m.organization_id, m.media_storage_path as caminho,
           greatest(coalesce(o.media_retention_days, 365), 30) as retencao_dias
      from public.messages m
      join public.organizations o on o.id = m.organization_id
     where m.media_storage_path is not null
       and o.media_retention_enforced
       and m.created_at < now() - make_interval(days => greatest(coalesce(o.media_retention_days, 365), 30))
       and not exists (
         select 1 from public.lgpd_requests r
          where r.organization_id = m.organization_id
            and r.status in ('received', 'processing')
       )
     order by m.created_at
     limit v_lim
     for update of m skip locked
  ), fila as (
    -- O arquivo só vai para a fila quando nenhuma OUTRA mensagem o usa: a foto
    -- de catálogo tem caminho fixo por conversa e é reaproveitada a cada
    -- reenvio (`fotos-do-produto.ts`), então a mensagem de ontem pode apontar
    -- para o mesmo arquivo da vencida. A vencida perde o caminho do mesmo
    -- jeito; o arquivo sai quando a última referência vencer (aqui) ou no
    -- passo 2, como órfão.
    --
    -- O `do update` é o conserto do #1739: se aquele caminho já saiu da fila
    -- (`deleted`) ou o objeto já nem existia (`skipped`), um arquivo NOVO pode
    -- estar gravado ali agora — e o `do nothing` da 0432 engolia este pedido
    -- silenciosamente, deixando o arquivo novo fora da retenção PARA SEMPRE.
    -- O `where` é a outra metade do conserto: `pending`/`failed` em curso não
    -- são interrompidos (uma remoção em andamento não perde a tentativa).
    insert into public.storage_redaction_queue (organization_id, bucket, object_path)
    select distinct a.organization_id, 'whatsapp-media', a.caminho
      from alvo a
     where not exists (
       select 1 from public.messages m2
        where m2.media_storage_path = a.caminho
          and m2.id not in (select id from alvo)
     )
    on conflict (bucket, object_path) do update
      set status = 'pending',
          attempts = 0,
          enqueued_at = now(),
          processed_at = null,
          error_message = null
      where storage_redaction_queue.status in ('deleted', 'skipped')
    returning 1
  ), limpas as (
    update public.messages m
       set media_storage_path = null,
           media_url = null,
           media_derived_text = null,
           metadata = coalesce(m.metadata, '{}'::jsonb)
             || jsonb_build_object(
                  'media_status', 'expired',
                  'media_expired_at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                  'media_retention_days', alvo.retencao_dias
                ),
           updated_at = now()
      from alvo
     where m.id = alvo.id
    returning 1
  )
  select count(*) into v_vencidas from limpas;

  -- 2. ÓRFÃOS: arquivo que nada no banco aponta — o rastro de conversa apagada.
  --    Só as duas pastas que o CRM grava por mensagem e por contato:
  --    `org/<conversa>/…` e `org/avatars/…`. `org/templates/…` (cabeçalho de
  --    modelo) NUNCA entra: quem o usa guarda o link, não o caminho. Um dia de
  --    carência cobre o envio que sobe o arquivo antes de gravar a mensagem.
  with orfaos as (
    select o.name as caminho, split_part(o.name, '/', 1)::uuid as org
      from storage.objects o
     where o.bucket_id = 'whatsapp-media'
       and o.created_at < now() - interval '1 day'
       and split_part(o.name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and exists (select 1 from public.organizations g where g.id::text = split_part(o.name, '/', 1))
       and (
         split_part(o.name, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         or split_part(o.name, '/', 2) = 'avatars'
         -- Miniatura da imagem (9033): `org/miniaturas/<conversa>/…`. Conta como
         -- referência o `media_thumb_path`, e não a pasta inteira ignorada:
         -- miniatura sem ponteiro (upload sem a linha gravada) é órfã como
         -- qualquer outra (P2-3 do @Cassio_SecRev na #75).
         or (split_part(o.name, '/', 2) = 'miniaturas'
             and split_part(o.name, '/', 3) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
       )
       and not exists (select 1 from public.messages m where m.media_storage_path = o.name)
       and not exists (select 1 from public.messages m where m.media_thumb_path = o.name)
       and not exists (select 1 from public.contacts c where c.avatar_storage_path = o.name)
       -- Só linha EM CURSO segura o caminho (`pending`, ou `failed` que ainda
       -- é o registro de uma remoção não feita). Linha `deleted`/`skipped`
       -- NÃO bloqueia mais: é justamente o caso do avatar reaproveitado
       -- (#1739) — o objeto novo no caminho antigo tinha de chegar no conflito
       -- lá embaixo para ser reaberto, e este `not exists` o engolia antes.
       and not exists (
         select 1 from public.storage_redaction_queue q
          where q.bucket = 'whatsapp-media' and q.object_path = o.name
            and q.status not in ('deleted', 'skipped')
       )
     limit v_lim
  ), fila as (
    insert into public.storage_redaction_queue (organization_id, bucket, object_path)
    select org, 'whatsapp-media', caminho from orfaos
    on conflict (bucket, object_path) do update
      set status = 'pending',
          attempts = 0,
          enqueued_at = now(),
          processed_at = null,
          error_message = null
      where storage_redaction_queue.status in ('deleted', 'skipped')
    returning 1
  )
  select count(*) into v_orfas from fila;


  -- 2b. ÓRFÃOS DA NOTA INTERNA (migration 0483): o passo 2 varre SÓ o bucket
  --     `whatsapp-media` (filtro `bucket_id`), então um anexo de nota nunca
  --     entraria na conta — e a nota que o atendente apagou deixaria o arquivo
  --     para sempre no `internal-media`, custo que só cresce. Mesmo desenho do
  --     passo 2, com as duas pontas certas: bucket `internal-media` e
  --     `conversation_notes.media_storage_path` como a referência que segura o
  --     caminho. Um dia de carência cobre o upload que sobe ANTES de a nota ser
  --     gravada (é a ordem do composer), como o passo 2 cobre o envio.
  --     Uma linha `pending`/`failed` em curso segura o caminho; `deleted`/
  --     `skipped` não, pelo mesmo motivo escrito no passo 2 (caminho reuso).
  with orfaos_da_nota as (
    select o.name as caminho, split_part(o.name, '/', 1)::uuid as org
      from storage.objects o
     where o.bucket_id = 'internal-media'
       and o.created_at < now() - interval '1 day'
       and split_part(o.name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and exists (select 1 from public.organizations g where g.id::text = split_part(o.name, '/', 1))
       and split_part(o.name, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and not exists (
         select 1 from public.conversation_notes n where n.media_storage_path = o.name
       )
       and not exists (
         select 1 from public.storage_redaction_queue q
          where q.bucket = 'internal-media' and q.object_path = o.name
            and q.status not in ('deleted', 'skipped')
       )
     limit v_lim
  ), fila_da_nota as (
    insert into public.storage_redaction_queue (organization_id, bucket, object_path)
    select org, 'internal-media', caminho from orfaos_da_nota
    on conflict (bucket, object_path) do update
      set status = 'pending',
          attempts = 0,
          enqueued_at = now(),
          processed_at = null,
          error_message = null
      where storage_redaction_queue.status in ('deleted', 'skipped')
    returning 1
  )
  select count(*) into v_orfas_nota from fila_da_nota;
  v_orfas := v_orfas + v_orfas_nota;

  -- 2c. RETENÇÃO POR IDADE DO ANEXO DA NOTA VIVA (#1887). Até aqui o bucket
  --     `internal-media` só era alcançado quando a nota SUMIA (passo 2b) ou
  --     sob pedido LGPD (passo 6d da 0483): uma nota que CONTINUA EXISTINDO
  --     segurava o anexo para sempre, e numa cota de 1 GB dividida com
  --     `whatsapp-media` o bucket crescia sem teto — anexos de até 50 MB
  --     (issue #1887; opção A, decisão do mantenedor no PR #2309).
  --     O anexo interno passa a seguir a MESMA regra da mídia de conversa:
  --     mesmo knob (`organizations.media_retention_days`, piso de 30 dias),
  --     MESMO interruptor (`media_retention_enforced`, 0557) e MESMA pausa
  --     enquanto a organização tem pedido LGPD em andamento — sem os dois, o
  --     anexo de nota seria a ÚNICA coisa apagada numa organização que
  --     desligou a limpeza, ou no meio de um atendimento LGPD. Mesmo desenho
  --     do passo 1 — a idade é a da NOTA, a mesma
  --     medida que a da mensagem, e o arquivo só sai DEPOIS do knob. Nota
  --     viva dentro da retenção não é tocada; é esta linha que o teste de
  --     #1887 cobra (e que reprova se a condição de idade sumir).
  --     Os três ponteiros são zerados como no passo 6d da 0483: a nota fica
  --     com o texto e sem card apontando para arquivo que já saiu do bucket.
  --     Arquivo já removido à mão não quebra a rodada: a linha entra como
  --     `pending` e o worker a fecha como `skipped`, como no passo 1.
  --     Aqui não existe o "nenhuma OUTRA mensagem usa" do passo 1: o caminho
  --     de anexo é único por upload (`note-<uuid>.<ext>`). A rota de nota só
  --     confere que o caminho é da mesma conversa, então duas notas PODEM
  --     apontar para o mesmo arquivo por chamada direta à API (pela tela não
  --     acontece); nesse caso a mais nova perde o anexo quando a mais velha
  --     vence — caso raro, aceito na decisão.
  with vencidas_da_nota as (
    select n.id, n.organization_id, n.media_storage_path as caminho
      from public.conversation_notes n
      join public.organizations o on o.id = n.organization_id
     where n.media_storage_path is not null
       and o.media_retention_enforced
       and n.created_at < now() - make_interval(days => greatest(coalesce(o.media_retention_days, 365), 30))
       and not exists (
         select 1 from public.lgpd_requests r
          where r.organization_id = n.organization_id
            and r.status in ('received', 'processing')
       )
     order by n.created_at
     limit v_lim
     for update of n skip locked
  ), fila_da_retencao as (
    insert into public.storage_redaction_queue (organization_id, bucket, object_path)
    select distinct v.organization_id, 'internal-media', v.caminho
      from vencidas_da_nota v
    on conflict (bucket, object_path) do update
      set status = 'pending',
          attempts = 0,
          enqueued_at = now(),
          processed_at = null,
          error_message = null
      where storage_redaction_queue.status in ('deleted', 'skipped')
    returning 1
  ), limpas_da_nota as (
    update public.conversation_notes n
       set media_storage_path = null, media_mime = null, media_size_bytes = null
      from vencidas_da_nota v
     where n.id = v.id
    returning 1
  )
  select count(*) into v_vencidas_nota from limpas_da_nota;
  v_vencidas := v_vencidas + v_vencidas_nota;
  return jsonb_build_object('vencidas', v_vencidas, 'orfas', v_orfas, 'expurgadas', v_expurgadas);
end;
$$;

revoke execute on function public.fn_enfileirar_midia_vencida(integer) from public, anon, authenticated;
grant execute on function public.fn_enfileirar_midia_vencida(integer) to service_role;

notify pgrst, 'reload schema';
