-- Backfill da atribuição de anúncio a partir do arquivo de webhooks.
--
-- Por que existe: até a PR #284 o canal Verdash descartava o `externalAdReply`,
-- então nenhum contato nasceu com marca de anúncio. O arquivo `webhook_events_log`
-- ainda guarda o payload das últimas ~7 dias (a retenção D+7 zera o resto), e é a
-- única cópia do bloco para esses contatos. Quanto antes rodar, mais sobra.
--
-- O que faz: para cada contato que ainda NÃO tem `ad_platform`, estampa a
-- atribuição do PRIMEIRO evento de entrada (menor `received_at`) com
-- `externalAdReply` de `sourceType = 'ad'`. Mesmas chaves de
-- `estamparAtribuicaoDoContato`, `ad_captured_at` = hora do evento original.
-- Só preenche: nunca sobrescreve contato já estampado, nunca toca etapa de lead
-- nem dispara conversão.
--
-- Casamento do contato: `wa_lid` (quando o chat é @lid) ou `phone_number` (com e
-- sem o nono dígito), sempre dentro da MESMA organização do evento.
--
-- Uso (SIMULA por padrão; só grava com -v aplicar=1):
--   psql "$SUPABASE_DB_URL" -v aplicar=0 -f scripts/backfill-atribuicao-do-arquivo-de-webhook.sql
--   psql "$SUPABASE_DB_URL" -v aplicar=1 -f scripts/backfill-atribuicao-do-arquivo-de-webhook.sql

-- Desfazer (os contatos tocados levam `ad_backfill` com o `source` anterior):
--   update public.contacts
--      set source = coalesce(source_metadata #>> '{ad_backfill,source_anterior}', source),
--          source_metadata = source_metadata - 'ad_platform' - 'ad_source_id' - 'ad_id' - 'ad_title'
--                            - 'ad_body' - 'ad_source_url' - 'ad_raw' - 'ad_captured_at' - 'ad_backfill'
--    where source_metadata ? 'ad_backfill' and source = 'meta_ads';

\set ON_ERROR_STOP on
\if :{?aplicar}
\else
  \set aplicar 0
\endif

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Só o que a INGESTÃO aceitou (assinatura válida e processado) e só o bloco do
-- caminho direto da mensagem: `quotedMessage` fica de fora, porque o anúncio da
-- mensagem CITADA não é o de onde a pessoa veio (mesma regra do extrator do app,
-- `lib/channels/verdash/atribuicao-de-anuncio.ts`).
create temporary table _eventos on commit drop as
select
  w.id                                         as evento_id,
  w.organization_id,
  w.received_at,
  b                                            as bloco,
  e #>> '{Info,Sender}'                        as sender,
  e #>> '{Info,SenderAlt}'                     as sender_alt,
  e #>> '{Info,Chat}'                          as chat
from public.webhook_events_log w
cross join lateral (select w.payload_parsed -> 'event' as e) ev
cross join lateral jsonb_path_query(w.payload_parsed, 'lax $.event.Message.*.contextInfo.externalAdReply') b
where w.provider = 'verdash'
  and w.organization_id is not null
  and w.valid_signature is true
  and w.status = 'processed'
  and w.payload_parsed ->> 'type' in ('Message', 'AutomationMessage')
  and (e #>> '{Info,IsFromMe}') is distinct from 'true'
  and (e #>> '{Info,IsGroup}')  is distinct from 'true'
  and coalesce(e #>> '{Info,Chat}', '') not like '%@broadcast'
  and coalesce(e #>> '{Info,Chat}', '') not like '%@newsletter'
  and lower(b ->> 'sourceType') = 'ad';

-- Identidade do remetente: lid do `Sender`/`Chat` quando é @lid; telefone do
-- `SenderAlt`/`Sender`/`Chat` quando é @s.whatsapp.net.
create temporary table _identidades on commit drop as
select
  *,
  nullif(regexp_replace(case when coalesce(sender, chat) like '%@lid'
                             then split_part(split_part(coalesce(sender, chat), '@', 1), ':', 1) end, '\D', '', 'g'), '') as lid,
  nullif(regexp_replace(split_part(split_part(
    coalesce(case when sender_alt like '%@s.whatsapp.net' then sender_alt end,
             case when sender like '%@s.whatsapp.net' then sender end,
             case when chat like '%@s.whatsapp.net' then chat end), '@', 1), ':', 1), '\D', '', 'g'), '') as digitos
from _eventos;

-- As duas grafias do número BR (com e sem o nono dígito), no formato do cadastro (+E.164).
create temporary table _eventos_com_telefone on commit drop as
select i.*,
  case when digitos is null then null else '+' || digitos end as tel_a,
  case
    when digitos ~ '^55\d{2}9\d{8}$' then '+' || substr(digitos, 1, 4) || substr(digitos, 6)
    when digitos ~ '^55\d{2}[6-9]\d{7}$' then '+' || substr(digitos, 1, 4) || '9' || substr(digitos, 5)
  end as tel_b
from _identidades i;

create temporary table _alvos on commit drop as
select distinct on (c.id)
  c.id as contact_id,
  c.source as source_anterior,
  c.organization_id,
  x.received_at,
  x.bloco
from _eventos_com_telefone x
join public.contacts c
  on c.organization_id = x.organization_id
 and c.is_merged_into is null
 and ( (x.lid is not null and c.wa_lid = x.lid)
    or (c.phone_number is not null and c.phone_number in (x.tel_a, x.tel_b)) )
where coalesce(c.source_metadata ->> 'ad_platform', '') = ''
  and c.is_anonymized is not true
order by c.id, x.received_at asc, x.evento_id;

\echo '--- Simulação: contatos que receberiam a atribuição, por organização'
select o.slug, count(*) as contatos, count(*) filter (where a.bloco ? 'ctwaClid') as com_clique
from _alvos a join public.organizations o on o.id = a.organization_id
group by 1 order by 2 desc;

\if :aplicar
  update public.contacts c
  set source = 'meta_ads',
      source_metadata = c.source_metadata || jsonb_strip_nulls(jsonb_build_object(
        'ad_platform',   'meta_ads',
        'ad_source_id',  left(a.bloco ->> 'ctwaClid', 500),
        'ad_id',         left(coalesce(a.bloco ->> 'sourceID', a.bloco ->> 'sourceId'), 500),
        'ad_title',      left(a.bloco ->> 'title', 500),
        'ad_body',       left(a.bloco ->> 'body', 500),
        'ad_source_url', left(coalesce(a.bloco ->> 'sourceURL', a.bloco ->> 'sourceUrl'), 500),
        'ad_raw',        (select jsonb_object_agg(left(k, 64), left(v #>> '{}', 500))
                            from (select k, v from jsonb_each(a.bloco) as t(k, v)
                                   where jsonb_typeof(v) = 'string'
                                     and k not in ('thumbnail', 'JPEGThumbnail')
                                   limit 40) s),
        'ad_backfill',   jsonb_build_object('em', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'source_anterior', a.source_anterior),
        'ad_captured_at', to_char(a.received_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )),
      updated_at = now()
  from _alvos a
  where c.id = a.contact_id
    and c.organization_id = a.organization_id
    and coalesce(c.source_metadata ->> 'ad_platform', '') = '';
  \echo '--- APLICADO'
  commit;
\else
  \echo '--- SIMULAÇÃO: nada foi gravado (use -v aplicar=1)'
  rollback;
\endif
