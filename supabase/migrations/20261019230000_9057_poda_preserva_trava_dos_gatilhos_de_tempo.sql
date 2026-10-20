-- 9057: a poda do event_log (9021) não apaga a TRAVA dos gatilhos por tempo, e a chave em claro do MCP externo sai do settings.
--
-- ═══ 1. POR QUE A PODA NÃO PODE APAGAR `lead.silent_for` / `lead.stage_stale` ═══
--
-- `app/api/v1/cron/lead-time-triggers` trava o redisparo LENDO o `event_log`:
-- procura `event_type = regra.trigger_event` com `payload->>rule_id = regra.id`
-- e `entity_id` do negócio, e compara a `payload.ancora`. SEM janela de tempo.
-- E o candidato não tem teto: um card parado na etapa (ou contato em silêncio)
-- continua candidato para sempre. A única coisa que segura o segundo disparo é
-- essa linha `done`. A 9021 apagava `done/dead` com mais de 120 dias sem olhar o
-- tipo — ~120 dias depois o mesmo card receberia WhatsApp/follow-up de novo
-- (parecer do @Cassio_SecRev no PR #213, P1).
--
-- O corte é pelos dois TIPOS (e não por `payload ? 'rule_id'`): `contact.birthday`
-- e `lead.date_field_due` também levam `rule_id`, mas travam por janela própria
-- (26 h / dia exato) e podem sair. O volume que fica é pequeno: no máximo uma
-- linha por (regra, negócio, âncora).
--
-- Na data desta migration o evento mais antigo da produção é de 15/09/2026, então
-- a poda ainda não apagou nenhuma trava: sem backfill.
--
-- ═══ 2. A CHAVE DO MCP EXTERNO EM CLARO NO `settings` ═══
--
-- A 0580 cifra a chave nova nas colunas `mcp_externo_chave_*`, mas uma org que
-- tivesse registrado ANTES ficaria com `settings.mcp_externo.chave` em claro,
-- lida por qualquer membro (inclusive viewer). O código já não lê nem grava esse
-- campo (`lib/mcp/servidor-externo/registro.ts` grava só `{ endpoint }`;
-- `carregar.ts` abre só as colunas cifradas), então removê-lo não desliga nada
-- que funcione. Na produção hoje nenhuma org tem o campo. Idempotente.
--
-- Idempotente: `create index if not exists` + `drop index if exists` +
-- `create or replace function` + `update ... where ? 'chave'`.

-- O índice parcial da poda passa a deixar as travas de fora: elas crescem sem
-- teto (nunca saem) e, dentro do índice, cada rodada as varreria em vão. O
-- predicado é o mesmo do `where` da função para o planner casar os dois. Nome
-- NOVO porque `create index if not exists` casa por nome: redefinir com o nome
-- antigo seria no-op onde a 9021 já rodou. `event_log` é pequena (16 mil linhas
-- na medição de 29/09) e o `lock_timeout` impede que o DDL trave a fila.
set local lock_timeout = '3s';
create index if not exists idx_event_log_poda_sem_travas
  on public.event_log (created_at)
  where status in ('done', 'dead')
    and event_type not in ('lead.silent_for', 'lead.stage_stale');
drop index if exists public.idx_event_log_poda;

create or replace function public.fn_podar_event_log(
  p_retencao_dias int default null,
  p_limite int default null
) returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dias int := greatest(coalesce(p_retencao_dias, 120), 90);
  v_limite int := least(greatest(coalesce(p_limite, 1000), 1), 10000);
  v_apagados int;
begin
  with vencidos as (
    select e.id
      from public.event_log e
     where e.status in ('done', 'dead')
       and e.created_at < now() - make_interval(days => v_dias)
       -- A TRAVA dos gatilhos por tempo (9057): o lead-time-triggers não redispara
       -- só porque acha esta linha, sem janela. Apagá-la rearma a regra.
       and e.event_type not in ('lead.silent_for', 'lead.stage_stale')
     order by e.created_at
     limit v_limite
  )
  delete from public.event_log e
   using vencidos v
   where e.id = v.id;
  get diagnostics v_apagados = row_count;
  return v_apagados;
end;
$$;

revoke execute on function public.fn_podar_event_log(int, int)
  from public, anon, authenticated;
grant execute on function public.fn_podar_event_log(int, int) to service_role;

update public.organizations
   set settings = settings #- '{mcp_externo,chave}'
 where settings->'mcp_externo' ? 'chave';

notify pgrst, 'reload schema';
