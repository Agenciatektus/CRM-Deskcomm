-- manifest: 9040 — `crm_leads.fechado_alguma_vez_em` guarda, para sempre, QUANDO um negócio foi fechado pela primeira vez, e `fn_crm_lead_close_on_stage` passa a preenchê-la na transição para ganho ou perda sem nunca limpá-la na reabertura. Por quê: a entrada contínua da campanha (9039) não pode abordar com a copy de PRIMEIRO contato quem já comprou, e o gatilho de fechamento APAGA a memória do fechamento ao reabrir (`closed_at := null`, `lost_from_stage_id := null`). O veto por `from_stage_id` da 9039 fecha o salto de UM arrasto («Ganho» → etapa armada); não fecha o de DOIS («Ganho» → «Novo lead», e depois «Novo lead» → etapa armada), que é operação normal de triagem — no segundo evento a etapa de origem é aberta, o status já é `open` e nada na linha lembra que o negócio foi fechado. `event_log` não serve como memória: `fn_podar_event_log` (9021) apaga `done`/`dead` em 120 dias (piso de 90), então um ganho de março desaparece antes de outubro, e um veto que depende de linha podada volta a falhar em silêncio. `lost_reason` sobrevive à reabertura e cobre a PERDA, inclusive a histórica; `won_reason` é opcional e não serve. Coluna aditiva, nullable, sem CHECK (um CHECK que a exigisse faria o DELETE de etapa/funil falhar, pela lição da 9032) e sem índice novo (a leitura é pela PK do negócio, dentro de uma consulta que a 9039 já fazia). Backfill nos negócios HOJE fechados; quem já reabriu antes desta migration não tem como ser recuperado, e para esses a perda segue coberta por `lost_reason`.
--
-- 9040 — A MEMÓRIA DE QUE ESTE NEGÓCIO JÁ FOI FECHADO
--
-- ## ANTES DO DEPLOY: contar o que o backfill vai tocar
--
-- Esta migration REINTERPRETA dado existente: ela afirma, sobre negócios que já
-- estão no banco, que eles foram fechados — e a partir daí uma campanha contínua
-- deixa de abordá-los. Então a conta não é confirmação, é a medida do efeito:
--
--   select count(*) filter (where status in ('won','lost'))            as serao_marcados,
--          count(*) filter (where status in ('won','lost')
--                             and closed_at is null)                   as sem_closed_at,
--          count(*) filter (where status = 'open'
--                             and lost_reason is not null
--                             and length(lost_reason) > 0)             as reabertos_que_a_perda_pega,
--          count(*)                                                    as total
--     from public.crm_leads;
--
-- `serao_marcados` é quanta gente passa a ficar fora de uma campanha contínua
-- (nenhuma hoje, porque a 9039 ainda não foi usada em produção). `sem_closed_at`
-- é quanto do backfill cai no `updated_at` em vez da data real do fechamento —
-- aproximação declarada, nunca inventada: a coluna diz "foi fechado em algum
-- momento até aqui", e é só isso que o veto pergunta. `reabertos_que_a_perda_pega`
-- é o pedaço do passado que o backfill NÃO alcança e que `lost_reason` cobre
-- mesmo assim.
--
-- ## O buraco, com o código do banco na mão
--
-- `fn_crm_lead_close_on_stage` é o único escritor de `crm_leads.status`. No ramo
-- de reabertura (etapa de destino que não fecha, vindo de `won`/`lost`) ele faz:
--
--     new.status := 'open';
--     new.closed_at := null;
--     new.lost_from_stage_id := null;
--
-- Isto é, apaga as duas marcas de fechamento que existiam. Depois disso o negócio
-- é indistinguível de um que nunca fechou.
--
-- A sequência que passa por todos os vetos da 9039, e que é operação normal:
--
--   1. cliente ganho em março, card em etapa `is_won`;
--   2. outubro: arrasta «Ganho» → «Novo lead». O gatilho reabre e APAGA a
--      memória. Este evento é vetado pela 9039 (`from_stage_id` fecha) — e o veto
--      não serve de nada, porque não deixa rastro nenhum;
--   3. arrasta «Novo lead» → etapa armada. `from_stage_id` é etapa ABERTA,
--      `status` é `open`, `closed_at` é nulo, `lost_from_stage_id` é nulo. Nada
--      veta, e o cliente recebe a mensagem de primeiro contato.
--
-- ## Por que uma coluna, e não o `event_log`
--
-- `lead.won`/`lead.lost` existem no `event_log` (nascem em `fn_log_event`), mas
-- `fn_podar_event_log` (9021) apaga as linhas `done`/`dead` depois de 120 dias
-- (piso de 90). Um ganho de março não existe mais em outubro, e o veto voltaria a
-- falhar — pior do que não existir, porque funcionaria nos testes e nos primeiros
-- meses, e passaria a falhar sozinho, em silêncio, exatamente nos clientes mais
-- antigos. Memória de fato permanente não mora em tabela com poda.
--
-- Também não vira atividade de timeline: `ActivityType`
-- (`lib/leads/activity-vocabulary.ts`) não tem `won`/`lost`, e inventar um tipo
-- novo de atividade para ser lido por um veto usaria a timeline como índice.
--
-- ## Por que o gatilho, e não as rotas
--
-- Fechar acontece por cinco caminhos (arrasto no quadro, `moveLeadHandler`, os
-- dois lotes, `encerraDemanda`, o assistente). O gatilho é o ÚNICO escritor de
-- `status` — está escrito no comentário dele, como P-02 —, então é o único lugar
-- onde a marca não pode ser esquecida. A alternativa seria a mesma linha em cinco
-- rotas, e o esquecimento de uma delas é invisível.
--
-- ## Por que `coalesce`, e por que nunca se limpa
--
-- `coalesce(new.fechado_alguma_vez_em, now())` guarda o PRIMEIRO fechamento:
-- fechar, reabrir e fechar de novo não reescreve a data. E o ramo de reabertura
-- não a toca — é exatamente isso que a coluna existe para sobreviver. Quem quiser
-- saber se o negócio está fechado AGORA lê `status`, que continua sendo a verdade
-- do presente.
--
-- ## O que a coluna NÃO é
--
-- Não é regra de produto sobre quem pode ser abordado: é um FATO. Quem decide o
-- que fazer com ele é `lib/campanhas/entrada-por-etapa.ts`, e a decisão de hoje é
-- "campanha contínua não aborda negócio que já foi fechado" — com a saída pelo
-- modo LISTA, que o operador revisa pessoa por pessoa.
--
-- ## Idempotente
--
-- Coluna com `if not exists`, função com `create or replace`, backfill com
-- `where fechado_alguma_vez_em is null` (reaplicar não reescreve data nenhuma).
-- Sem CHECK e sem índice novo.

set local lock_timeout = '3s';

-- ───────────────────────────────────────────────────────────────────────────
-- 1. A coluna
-- ───────────────────────────────────────────────────────────────────────────

alter table public.crm_leads
  add column if not exists fechado_alguma_vez_em timestamptz;

comment on column public.crm_leads.fechado_alguma_vez_em is
  'QUANDO este negócio foi fechado (ganho ou perdido) pela PRIMEIRA vez. Preenchida por '
  'fn_crm_lead_close_on_stage e NUNCA limpa na reabertura — é a única memória de que o '
  'negócio já fechou, porque o mesmo gatilho apaga closed_at e lost_from_stage_id ao reabrir. '
  'Quem está fechado AGORA se lê em status; esta coluna responde "já foi fechado alguma vez?". '
  'Lida pela entrada contínua da campanha (9039), para não abordar quem já comprou com a copy '
  'de primeiro contato. Migration 9040.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2. O gatilho passa a gravar a marca
-- ───────────────────────────────────────────────────────────────────────────
-- Corpo idêntico ao da 0426, com DUAS linhas novas (uma no ramo de ganho, uma no
-- de perda) e NADA removido. O ramo de reabertura segue intocado de propósito.

create or replace function public.fn_crm_lead_close_on_stage() returns trigger
    language plpgsql
    set search_path to 'public', 'pg_temp'
    as $$
declare
  v_is_won  boolean;
  v_is_lost boolean;
begin
  if tg_op = 'UPDATE'
     and new.stage_id is not distinct from old.stage_id
     and new.status   is not distinct from old.status then
    return new;
  end if;

  select is_won, is_lost into v_is_won, v_is_lost
    from public.crm_stages where id = new.stage_id;

  if v_is_won then
    new.status := 'won';
    new.closed_at := coalesce(new.closed_at, now());
    -- 9040: a memória que a reabertura não apaga. `coalesce` guarda o PRIMEIRO
    -- fechamento — fechar, reabrir e fechar de novo não reescreve a data.
    new.fechado_alguma_vez_em := coalesce(new.fechado_alguma_vez_em, now());
  elsif v_is_lost then
    new.status := 'lost';
    new.closed_at := coalesce(new.closed_at, now());
    new.fechado_alguma_vez_em := coalesce(new.fechado_alguma_vez_em, now());
    -- #1537: a etapa ABERTA que este negócio deixou. Só na transição: um card
    -- já perdido movido entre etapas de perda mantém a origem verdadeira, e um
    -- INSERT direto na etapa de perda não tem origem de onde sair.
    if tg_op = 'UPDATE' and old.status is distinct from 'lost' then
      new.lost_from_stage_id := coalesce(new.lost_from_stage_id, old.stage_id);
    end if;
  else
    if tg_op = 'UPDATE' and old.status in ('won','lost') then
      new.status := 'open';
      new.closed_at := null;
      -- Reabriu: a origem da perda passada não pertence a um negócio aberto.
      -- Se morrer de novo, a nova transição grava a nova origem.
      new.lost_from_stage_id := null;
      -- ⚠️ `fechado_alguma_vez_em` NÃO é limpa aqui, e é o ponto da 9040: ela é
      -- a única coisa que sobrevive à reabertura e diz que este negócio já
      -- fechou. Limpá-la devolveria o buraco que esta migration tampa.
    end if;
  end if;
  return new;
end$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Backfill: quem está fechado AGORA já foi fechado
-- ───────────────────────────────────────────────────────────────────────────
-- `closed_at` quando existe (é a data real), `updated_at` como piso quando não —
-- aproximação declarada, e o veto só pergunta "já foi fechado?", não quando.
-- Quem já REABRIU antes desta migration não tem como ser recuperado: para esses,
-- a perda segue coberta por `lost_reason` (que sobrevive) e o ganho fica de fora,
-- conscientemente.

update public.crm_leads
   set fechado_alguma_vez_em = coalesce(closed_at, updated_at)
 where status in ('won', 'lost')
   and fechado_alguma_vez_em is null;

notify pgrst, 'reload schema';
