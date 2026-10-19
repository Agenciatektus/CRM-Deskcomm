-- 9032: a trava de organização fica leve no deploy, e os P2 do Cassio na #70.
--
-- ## P2-3: zero lock na reaplicação, um lock por vez na primeira
--
-- O laço do fim do baseline (9031) fazia `create or replace trigger` nas 169
-- tabelas com organization_id a CADA reaplicação, num `do` só: cada uma pega
-- SHARE ROW EXCLUSIVE, os locks se acumulam até o fim do bloco, e com
-- lock_timeout de 3 s uma tabela em uso derrubava o bloco inteiro segurando as
-- escritas das que já tinham sido travadas. Agora o laço PULA a tabela que já
-- tem a trigger certa (nome, função, BEFORE UPDATE OF organization_id FOR EACH
-- ROW): reaplicar não toma lock nenhum dessas tabelas. Na primeira aplicação (o
-- release que leva 9030/9031 a produção), o baseline faz COMMIT depois de cada
-- CREATE TRIGGER (o baseline roda em autocommit), então só uma tabela fica
-- travada por vez; a que estiver em disputa fica para a próxima passada, e o
-- bloco termina com 55P03 para `reaplicar_baseline` repetir. O laço literal das
-- 52 tabelas da 9030 saiu do baseline: o do fim cobre todas.
--
-- Esta migration roda em transação (o runner a envolve), então o laço AQUI não
-- faz COMMIT: só cria as que faltam, num banco que já recebeu a 9031.
--
-- ## P2-1: a troca para NULL vale só em api_audit_log
--
-- A exceção `pg_trigger_depth() > 1` (FK `on delete set null`) passa a valer só
-- para `api_audit_log`. Em `skill_versions`/`skill_pointers`, organização NULL é
-- o catálogo GLOBAL.
--
-- ## Campanha: FK com lista de colunas
--
-- `campaigns` (pipeline, etapa, agente) e `campaign_recipients` (canal) tinham
-- FK composto `(organization_id, x) on delete set null` SEM lista de colunas:
-- apagar o canal/funil/etapa/agente zerava também organization_id (NOT NULL) e
-- falhava com 23502. Agora `on delete set null (x)`.
--
-- ## P2-2: fn_update_last_activity_at nunca carimba no futuro
--
-- `least(new.performed_at, now())`: performed_at vem de quem registra.
--
-- Rollback: reverter o PR; no banco, recriar as duas funções com o corpo da
-- 9031 e os FKs sem a lista de colunas. As triggers ficam (são as mesmas).

set local lock_timeout = '3s';

create or replace function public.fn_organizacao_da_linha_nao_muda()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- A ÚNICA troca aceita é para NULL, vinda de dentro de outro gatilho (é como
  -- o Postgres executa um FK `on delete set null`), e SÓ em `api_audit_log`:
  -- apagar a organização zera a coluna da trilha (9031). Lista explícita desde a
  -- 9032 (P2-1 do Cassio na #70): em `skill_versions`/`skill_pointers`, por
  -- exemplo, organização NULL é o catálogo GLOBAL, e uma cascata qualquer não
  -- pode transformar dado de uma organização em dado de todas. UPDATE direto, de
  -- qualquer papel, para NULL ou para outra org, continua recusado.
  if new.organization_id is distinct from old.organization_id
     and not (new.organization_id is null
              and pg_trigger_depth() > 1
              and tg_table_name in ('api_audit_log')) then
    raise exception 'a linha de % não muda de organização', tg_table_name
      using errcode = '42501',
            hint = 'Mover dado entre organizações não é uma operação do produto. Crie a linha na organização de destino.';
  end if;
  return new;
end;
$$;

revoke all on function public.fn_organizacao_da_linha_nao_muda() from public, anon, authenticated;

create or replace function public.fn_update_last_activity_at()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $function$
begin
  -- SECURITY DEFINER desde a 9031 (P2-1 do Cassio na #69): como invoker, o
  -- UPDATE abaixo passava pela RLS de quem inseriu a atividade, e para um
  -- viewer (ou agent que não enxerga o negócio) o relógio não andava, em
  -- silêncio. O escopo é o mínimo: só last_activity_at, só da linha
  -- referenciada E da mesma organização da atividade. E nunca no futuro (9032,
  -- P2-2 do Cassio na #70): performed_at vem de quem registra, e um carimbo
  -- adiante deixaria o negócio "em dia" até lá.
  -- LISTA POSITIVA: só isto conta como "alguém tocou este negócio". Tipo que
  -- não está aqui NÃO quebra o silêncio — inclusive tipo que ainda não existe.
  -- Ver o cabeçalho da 0079 antes de acrescentar linha nesta lista.
  if new.type not in (
    'ai_turn',              -- a IA falou com o cliente
    'note',                 -- alguém registrou trabalho no negócio
    'lead_edited',          -- humano mexeu nos dados
    'stage_changed',        -- humano moveu o negócio
    'next_action_approved', -- humano decidiu agir
    -- (0235) Uma ligação ATENDIDA é interação, e das mais fortes: alguém falou
    -- com o cliente. Sem esta linha o Radar de Risco seguia marcando como frio
    -- quem tinha acabado de passar vinte minutos ao telefone, e a IA propunha
    -- "retomar contato" com quem nunca ficou sem contato.
    --
    -- `voice_call_missed` NÃO entra, e a ausência é a regra e não esquecimento:
    -- telefone que tocou sem resposta é constatação de silêncio, não quebra
    -- dele. É exatamente a assimetria que a 0079 existe para preservar.
    'voice_call'
  ) then
    return new;
  end if;

  update public.crm_leads
     set last_activity_at = greatest(coalesce(last_activity_at, '-infinity'::timestamptz), least(new.performed_at, now()))
   where id = new.lead_id
     and organization_id = new.organization_id;

  if new.contact_id is not null then
    update public.contacts
       set last_activity_at = greatest(coalesce(last_activity_at, '-infinity'::timestamptz), least(new.performed_at, now()))
     where id = new.contact_id
       and organization_id = new.organization_id;
  end if;
  return new;
end$function$;

revoke all on function public.fn_update_last_activity_at() from public, anon, authenticated;

do $$
declare
  fk record;
begin
  for fk in
    select * from (values
      ('campaign_recipients', 'campaign_recipients_channel_org_fk', 'channel_session_id', 'channel_sessions'),
      ('campaigns', 'campaigns_pipeline_org_fk', 'pipeline_id', 'crm_pipelines'),
      ('campaigns', 'campaigns_stage_org_fk', 'stage_id', 'crm_stages'),
      ('campaigns', 'campaigns_agent_org_fk', 'agent_id', 'ai_agents')
    ) v(tabela, nome, coluna, alvo)
  loop
    if exists (
      select 1 from pg_constraint
       where conname = fk.nome
         and conrelid = format('public.%I', fk.tabela)::regclass
         and confdelsetcols is null
    ) then
      execute format(
        'alter table public.%I drop constraint %I, add constraint %I foreign key (organization_id, %I) '
        'references public.%I (organization_id, id) on delete set null (%I)',
        fk.tabela, fk.nome, fk.nome, fk.coluna, fk.alvo, fk.coluna);
    end if;
  end loop;
end $$;


do $$
declare
  t record;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_attribute a
        on a.attrelid = c.oid and a.attname = 'organization_id' and not a.attisdropped
     where c.relnamespace = 'public'::regnamespace
       and c.relkind in ('r', 'p')
       and not exists (
         select 1 from pg_trigger g
          where g.tgrelid = c.oid
            and g.tgname = 'trg_organizacao_nao_muda'
            and not g.tgisinternal
            and g.tgfoid = 'public.fn_organizacao_da_linha_nao_muda()'::regprocedure
            and g.tgenabled in ('O', 'A')              -- desabilitada não protege nada
            and g.tgqual is null                     -- nem com WHEN que a restrinja
            and g.tgtype = 19
            and g.tgattr::text = a.attnum::text      -- int2vector de UMA coluna: organization_id
       )
     order by c.relname
  loop
    execute format(
      'create or replace trigger trg_organizacao_nao_muda before update of organization_id on public.%I '
      'for each row execute function public.fn_organizacao_da_linha_nao_muda()', t.relname);
  end loop;
end $$;
