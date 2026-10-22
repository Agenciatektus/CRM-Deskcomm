-- 9066 — dois defeitos que o CI religado (21/10/2026) acusou no banco.
--
-- (1) Os validadores de CHECK da campanha (9034, 9037) nasceram sem
--     `search_path` fixo: o aviso `function_search_path_mutable` do Security
--     Advisor, vigiado por tests/invariants/avisos-do-security-advisor.test.ts.
--     São `sql immutable` que só chamam funções do pg_catalog; o risco prático é
--     baixo, mas a régua da 0521 vale para toda função de public. O corpo é o
--     mesmo, só ganha `set search_path = ''`.
--
-- (2) fn_validate_lost_reason_required (9044) revalidava o motivo de quem JÁ
--     estava perdido. A 9044 pôs `stage_id` e `pipeline_id` no `update of` do
--     gatilho (para validar a perda que nasce da troca de etapa), e com isso
--     todo UPDATE de etapa de um card perdido passou pela checagem do
--     vocabulário. Um card perdido com um motivo que depois saiu da
--     configuração do funil deixou de poder ser movido: o lote para a etapa de
--     perda que o incluísse falhava inteiro com 22023, e o mesmo valia para o
--     arrasto entre etapas de perda. É o defeito que a 0263 (#917) e a 0674
--     (#2887) fecharam e a 9044 reabriu. Agora: perdido que segue perdido com o
--     MESMO motivo não é revalidado; motivo novo, perda nova e INSERT seguem
--     validados como na 9044. Provas: tests/invariants/lote-de-perda-grava-o-motivo
--     e lote-nao-sobrescreve-o-motivo-de-quem-ja-estava-perdido.
--
-- Trocar de funil mantendo o motivo segue validado: o vocabulário que vale é
-- o do funil de destino.
--
-- Idempotente (create or replace, mesma assinatura): o ACL e as CHECKs que
-- usam os validadores ficam como estão. O corpo do gatilho é o do baseline
-- (o bloco da 0266, que a 9044 editou), com o `opted_out_of_messages` da 0513
-- que o arquivo da 9044 tinha deixado de fora.

-- Convenção da 9034/9037. Não há lock de tabela aqui, mas a linha não custa.
set local lock_timeout = '3s';

create or replace function public.fn_variacoes_da_campanha_validas(p_variacoes text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_variacoes is not null
     and coalesce(cardinality(p_variacoes), 0) <= 5
     and coalesce((
       select bool_and(t.v is not null and length(t.v) <= 1000)
       from unnest(p_variacoes) as t(v)
     ), true);
$$;

create or replace function public.fn_passos_da_campanha_validos(p_passos jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_passos is not null
     and jsonb_typeof(p_passos) = 'array'
     and jsonb_array_length(p_passos) <= 20
     and coalesce((
       select bool_and(
                    jsonb_typeof(e.v) = 'object'
                and (e.v ->> 'id') is not null
                and length(e.v ->> 'id') between 1 and 40
                and (e.v ->> 'tipo') in ('mensagem', 'espera', 'mover_etapa', 'etiqueta')
              )
       from jsonb_array_elements(p_passos) as e(v)
     ), true);
$$;

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
    -- Já estava perdido, no MESMO funil e com o MESMO motivo: nada novo a
    -- validar. Sem isto, a troca de etapa de um card perdido revalidava um
    -- motivo aposentado (9066). Trocar de FUNIL valida de novo: o vocabulário
    -- é do funil de destino.
    if tg_op = 'UPDATE' and old.status = 'lost'
       and new.pipeline_id is not distinct from old.pipeline_id
       and new.lost_reason is not distinct from old.lost_reason then
      return new;
    end if;

    -- #1537: `settings.lost_reasons` aceita texto puro E `{ label, categoria }`.
    -- O que o trigger compara é o RÓTULO nos dois formatos.
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
      from public.crm_pipelines
     where id = new.pipeline_id;

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
