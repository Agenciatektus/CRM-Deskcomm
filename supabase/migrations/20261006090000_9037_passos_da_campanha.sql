-- manifest: 9037 — a campanha ganha PASSOS (espera, mensagem adicional, mover de etapa, etiquetar) sem motor novo: `campaigns.passos` (jsonb, até 20) guarda a lista do 2º toque em diante e `campaigns.followup_pointer_id` aponta para a régua publicada como pointer de follow-up com `surface='campaign'` — a mesma máquina da cadência (9016). Por quê: hoje a campanha manda UMA mensagem e acaba, e quem não responde na primeira nunca é tocado de novo; escrever um segundo motor de espera/retomada seria a terceira régua do produto. As guardas de escrita da cadência (9020/9024), o teto de inscrições por dia e as vagas do dia passam a valer para as DUAS superfícies de prospecção. A inscrição ABRE o card no funil da campanha (decisão do dono, 05/10/2026): sem negócio, os passos "mover de etapa" e "etiquetar" não têm em que agir, e eles existem para quem NÃO respondeu. Negócio aberto do contato nesse funil é reusado; campanha SEM passos não cria card nenhum.
--
-- 9037 — A CAMPANHA GANHA PASSOS (e nenhum motor novo)
--
-- ## ANTES DO DEPLOY: contar o nome que a régua vai querer usar
--
-- A régua de uma campanha nasce como linha de `followup_flow_pointers`, que tem
-- `unique (organization_id, name)`, com o nome «Campanha · <nome> (<8 chars do
-- id>)». Um fluxo comum chamado exatamente assim faria a primeira publicação da
-- régua falhar com 23505 — e o operador veria "não foi possível criar a régua"
-- sem saber de onde veio.
--
--   select organization_id, id, name, surface
--   from public.followup_flow_pointers
--   where name like 'Campanha · %';
--
-- Medido na instalação da Tektus em 05/10/2026: 0 linhas. O prefixo é novo
-- (nenhuma tela o escrevia), então o esperado é zero em qualquer instalação;
-- vindo linha, renomeie o fluxo comum antes de aplicar.
--
-- A contagem da OUTRA metade (a que o CHECK de superfície alcança) é só
-- confirmação de que a união nova é mais larga que a antiga, nunca mais estreita:
--
--   select surface, count(*) from public.followup_flow_pointers group by 1;
--
-- ## Por que a campanha não ganha motor próprio
--
-- A cadência de prospecção (9016) já resolveu "manda, espera, manda de novo,
-- move de etapa" SEM motor próprio: ela é um pointer de follow-up com
-- `surface='cadence'`, e `lib/regua/timeline.ts` é só uma ponte PURA que
-- converte a lista de passos num grafo linear. Quem executa é o motor de
-- follow-up, com o claim por SKIP LOCKED, o CAS por `revision`, a janela de
-- envio, o espaçamento sob o lock do número e o cancelamento na resposta.
--
-- A campanha passa a fazer o MESMO caminho, com `surface='campaign'`. Um motor
-- de espera dedicado seria a terceira régua do produto (agente, cadência,
-- campanha) e, pela experiência das duas primeiras, o lugar onde cada conserto
-- precisa ser feito duas vezes — e é feito uma.
--
-- ## A inscrição ABRE O CARD no funil (decisão do dono, 05/10/2026)
--
-- Campanha COM passos põe no funil escolhido todo mundo que ela abordar, não só
-- quem responder. O motivo é que sem card os passos "mover de etapa" e
-- "etiquetar" não têm negócio em que agir: eles falham, entram em backoff e
-- matam a inscrição — e existem justamente para alcançar quem NÃO respondeu.
-- O custo é aceito e explícito: uma campanha de 500 pessoas cria 500 cards.
--
-- Quem abre o card é `lib/campanhas/card-da-abordagem.ts`, chamado de dentro de
-- `inscreverContatoNaRegua` DEPOIS de todos os freios (anti-laço, bloqueio,
-- anonimização, recusa de marketing, supressão por telefone, teto do dia).
-- Negócio já ABERTO do contato naquele funil é reusado, nunca duplicado:
-- repreparar, retomar ou repetir a rodada não criam um segundo card. Funil e
-- etapa saem de `destinoDaCampanha` (`lib/leads/nascimento-do-lead.ts`), a
-- MESMA função que a resposta usa — com duas regras, o card nasceria numa etapa
-- na abordagem e a resposta o quereria noutra, sem efeito e calada.
--
-- O card nasce com `source = 'campanha'` e o `source_metadata` da campanha (a
-- marca COMPARTILHADA com o card que nasce da resposta), mais
-- `campaign_recipient_id` e `nasceu_na = 'abordagem'`: sem isso, a lista
-- inteira entraria no funil como lead que chegou sozinho e a métrica de origem
-- passaria a mentir. E o `lead.created` vai marcado como criação em LOTE
-- (`lib/leads/criacao-em-lote.ts`, onde a importação de planilha já estava),
-- senão o gatilho de follow-up "Lead criado" mandaria uma mensagem proativa por
-- card — centenas, no mesmo minuto em que a campanha acabou de falar com essas
-- pessoas.
--
-- Campanha SEM passos não chega a nada disso: não publica régua, não inscreve e
-- não cria card. Segue idêntica ao comportamento anterior à 9037.
--
-- ## Por que a 1ª mensagem NÃO é um passo
--
-- Ela continua sendo o `rendered_body` congelado na preparação e enviado pelo
-- `campaign-worker`: é esse congelamento que faz o operador ver, destinatário
-- por destinatário, o texto exato antes de apertar Iniciar. Transformá-la no
-- primeiro nó do grafo jogaria a prévia fora para ganhar simetria. Então a
-- lista de `passos` é o 2º toque em diante, e o destinatário é INSCRITO na
-- régua (e ganha o card no funil) quando a 1ª mensagem sai com sucesso
-- (`lib/campanhas/rodada.ts`).
--
-- ## Por que a lista mora na CAMPANHA, e o grafo no pointer
--
-- `campaigns.passos` é o que o operador edita; o grafo publicado é o que o motor
-- executa. São representações da mesma coisa, e o conversor é determinístico nos
-- dois sentidos — mas o rascunho precisa sobreviver a campanha sem régua (quem
-- tem zero passos não publica pointer nenhum) e a campanha duplicada precisa
-- levar a lista sem levar a régua. Guardar só o grafo obrigaria a publicar um
-- pointer para gravar um rascunho.
--
-- ## Por que `followup_pointer_id` é FK composta com `set null (coluna)`
--
-- Mesmo molde dos FKs de funil/etapa/agente da campanha (P2-3 da 9032): sem a
-- lista de colunas no `on delete set null`, apagar o pointer zeraria também
-- `organization_id` (NOT NULL) e o DELETE falharia com 23502.
--
-- ## As guardas da cadência passam a valer para a campanha
--
-- As três triggers da 9020 (estreitadas pela 9024) recusam escrita de
-- `authenticated`/`anon` em pointer, versão e inscrição DE CADÊNCIA — é o que
-- impede um manager de, pela PostgREST com o próprio JWT, publicar versão,
-- trocar a política ou fabricar inscrição por fora do servidor. Uma superfície
-- de prospecção nova que não entrasse nelas nasceria com esse buraco aberto:
-- `campaign` passa a contar como cadência para as três, com a MESMA exceção de
-- CANCELAR uma régua viva pela sessão (cascata de LGPD).
--
-- O mesmo para `fn_cadencia_reservar_inscricoes` e `fn_cadencia_vagas_de_hoje`:
-- elas filtravam `surface = 'cadence'` e devolveriam 0 vagas para toda régua de
-- campanha — o teto do dia não seria "respeitado", seria INTRANSPONÍVEL, e
-- nenhum destinatário entraria na régua. Falha fechada, mas silenciosa.
--
-- ## Idempotente
--
-- CHECK de conjunto por drop/add (é o padrão da coluna `surface` desde a 9016),
-- colunas com `if not exists`, CHECK de dado com guarda em `pg_constraint`
-- (nunca drop+add, que deixaria a tabela sem a constraint se o update morresse
-- no meio), funções com `create or replace` e índice com `if not exists`.

set local lock_timeout = '3s';

-- ───────────────────────────────────────────────────────────────────────────
-- 1. A superfície nova
-- ───────────────────────────────────────────────────────────────────────────

alter table public.followup_flow_pointers
  drop constraint if exists followup_flow_pointers_surface_check;
alter table public.followup_flow_pointers
  add constraint followup_flow_pointers_surface_check
  check (surface in ('followup', 'crm_automation', 'atendimento', 'cadence', 'campaign'));

comment on column public.followup_flow_pointers.surface is
  'Onde o fluxo aparece: followup = /app/ai/followups; crm_automation = CRM Automação; '
  'atendimento = roteiro conduzido no turno (0394); cadence = cadência de prospecção do funil '
  '(9016); campaign = os passos de uma campanha, do 2º toque em diante (9037). '
  'Vocabulário cobrado por tests/invariants/vocabulario-banco-x-typescript.test.ts '
  '(par: lib/followup/api-schemas.ts → FOLLOWUP_FLOW_SURFACES).';

-- Régua de prospecção PUBLICADA tem número, funil e política — nas duas
-- superfícies, pelo mesmo motivo: `move_stage` precisa do funil, a conversa
-- precisa do número e `lib/cadencia/envio.ts` recusa enviar sem a política.
-- Rascunho pode nascer vazio.
alter table public.followup_flow_pointers
  drop constraint if exists followup_flow_pointers_cadencia_completa;
alter table public.followup_flow_pointers
  add constraint followup_flow_pointers_cadencia_completa
  check (
    surface not in ('cadence', 'campaign')
    or status <> 'active'
    or (
      channel_session_id is not null
      and pipeline_id is not null
      and cadence_settings is not null
      and jsonb_typeof(cadence_settings) = 'object'
    )
  );

-- ───────────────────────────────────────────────────────────────────────────
-- 2. A lista de passos e o ponteiro para a régua
-- ───────────────────────────────────────────────────────────────────────────

-- Cardinalidade e forma de cada elemento numa função `immutable`, porque `check`
-- não aceita subconsulta e o teto POR ELEMENTO precisa de `jsonb_array_elements`
-- (mesmo molde da 0329 e da 9034). A forma COMPLETA de cada passo é validada
-- pelo Zod de `lib/campanhas/passos.ts`, com o operador na tela; aqui fica a
-- segunda tranca, para o INSERT direto pela PostgREST com service_role também
-- parar nela.
create or replace function public.fn_passos_da_campanha_validos(p_passos jsonb)
returns boolean
language sql
immutable
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

revoke execute on function public.fn_passos_da_campanha_validos(jsonb) from public, anon;
grant execute on function public.fn_passos_da_campanha_validos(jsonb) to authenticated, service_role;

alter table public.campaigns
  add column if not exists passos jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'campaigns_passos_validos'
       and conrelid = 'public.campaigns'::regclass
  ) then
    alter table public.campaigns
      add constraint campaigns_passos_validos
      check (public.fn_passos_da_campanha_validos(passos));
  end if;
end $$;

comment on column public.campaigns.passos is
  'A régua da campanha do 2º toque em diante: lista de {id, tipo} (mensagem | espera | '
  'mover_etapa | etiqueta), convertida em grafo linear por lib/regua/timeline.ts e publicada '
  'no pointer de followup_pointer_id. Vazia = campanha de uma mensagem só, idêntica ao '
  'comportamento anterior à 9037. Até 20 passos (campaigns_passos_validos).';

alter table public.campaigns
  add column if not exists followup_pointer_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'campaigns_followup_pointer_fk'
       and conrelid = 'public.campaigns'::regclass
  ) then
    alter table public.campaigns
      add constraint campaigns_followup_pointer_fk
      foreign key (organization_id, followup_pointer_id)
      references public.followup_flow_pointers (organization_id, id)
      on delete set null (followup_pointer_id);
  end if;
end $$;

comment on column public.campaigns.followup_pointer_id is
  'A régua publicada desta campanha (followup_flow_pointers com surface=campaign). NULL = '
  'campanha sem passos, ou que nunca foi preparada depois de ganhá-los. Migration 9037.';

-- `lib/cadencia/envio.ts` vai do POINTER para a campanha (para achar o pool de
-- números do rodízio) a cada passo enviado: sem índice, isso é varredura de
-- `campaigns` no caminho quente do worker.
create index if not exists campaigns_followup_pointer_id
  on public.campaigns (organization_id, followup_pointer_id)
  where followup_pointer_id is not null;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. As vagas do dia valem para as duas superfícies
-- ───────────────────────────────────────────────────────────────────────────
-- Corpo idêntico ao da 9016, com `surface = 'cadence'` → `in ('cadence','campaign')`.

create or replace function public.fn_cadencia_reservar_inscricoes(p_org uuid, p_pointer uuid, p_n integer)
returns integer language plpgsql security definer set search_path = public as $cad_vagas$
declare v_max integer; v_tz text; v_dia date; v_ja integer; v_dar integer;
begin
  if p_n is null or p_n < 0 then raise exception 'cadencia_reserva_invalida' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('cadencia:' || p_pointer::text));
  select (p.cadence_settings ->> 'max_inscricoes_dia')::integer,
         coalesce(nullif(o.timezone, ''), 'America/Sao_Paulo')
    into v_max, v_tz
    from public.followup_flow_pointers p
    join public.organizations o on o.id = p.organization_id
   where p.organization_id = p_org and p.id = p_pointer and p.surface in ('cadence', 'campaign');
  if v_max is null then return 0; end if;
  v_dia := (now() at time zone v_tz)::date;
  select reservadas into v_ja from public.cadencia_inscricoes_do_dia where pointer_id = p_pointer and dia = v_dia;
  v_dar := greatest(0, least(p_n, v_max - coalesce(v_ja, 0)));
  if v_dar > 0 then
    insert into public.cadencia_inscricoes_do_dia (organization_id, pointer_id, dia, reservadas)
    values (p_org, p_pointer, v_dia, v_dar)
    on conflict (pointer_id, dia)
    do update set reservadas = public.cadencia_inscricoes_do_dia.reservadas + excluded.reservadas;
  end if;
  return v_dar;
end; $cad_vagas$;

create or replace function public.fn_cadencia_vagas_de_hoje(p_org uuid, p_pointer uuid)
returns integer language sql stable security definer set search_path = public as $cad_vagas_hoje$
  select greatest(0, (p.cadence_settings ->> 'max_inscricoes_dia')::integer - coalesce((
           select d.reservadas from public.cadencia_inscricoes_do_dia d
            where d.pointer_id = p.id
              and d.dia = (now() at time zone coalesce(nullif(o.timezone, ''), 'America/Sao_Paulo'))::date), 0))
    from public.followup_flow_pointers p
    join public.organizations o on o.id = p.organization_id
   where p.organization_id = p_org and p.id = p_pointer and p.surface in ('cadence', 'campaign');
$cad_vagas_hoje$;

revoke all on function public.fn_cadencia_reservar_inscricoes(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.fn_cadencia_reservar_inscricoes(uuid, uuid, integer) to service_role;
revoke all on function public.fn_cadencia_vagas_de_hoje(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fn_cadencia_vagas_de_hoje(uuid, uuid) to service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. As guardas de escrita (9020/9024) alcançam a régua de campanha
-- ───────────────────────────────────────────────────────────────────────────
-- Corpos idênticos aos da 9024, com `p.surface = 'cadence'` →
-- `p.surface in ('cadence','campaign')` e, no ponteiro, o mesmo para `new`/`old`.
-- Sem isto, um manager publicaria versão, trocaria a política ou fabricaria
-- inscrição numa régua de campanha direto pela PostgREST, por fora do servidor.

create or replace function public.fn_cadencia_guarda_ponteiro()
returns trigger language plpgsql security invoker set search_path = public as $cad_gp$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.surface in ('cadence', 'campaign') then
        raise exception 'cadencia_escrita_so_pelo_servidor' using errcode = '42501';
      end if;
    elsif old.surface in ('cadence', 'campaign') or new.surface in ('cadence', 'campaign') then
      if new.cadence_settings is distinct from old.cadence_settings
         or new.active_version_id is distinct from old.active_version_id
         or new.status is distinct from old.status
         or new.surface is distinct from old.surface
         or new.channel_session_id is distinct from old.channel_session_id
         or new.pipeline_id is distinct from old.pipeline_id
         or new.trigger_config is distinct from old.trigger_config
         or new.handoff_policy is distinct from old.handoff_policy then
        raise exception 'cadencia_escrita_so_pelo_servidor' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$cad_gp$;
revoke all on function public.fn_cadencia_guarda_ponteiro() from public, anon, authenticated;

create or replace function public.fn_cadencia_guarda_versao()
returns trigger language plpgsql security invoker set search_path = public as $cad_gv$
begin
  if current_user in ('authenticated', 'anon')
     and exists (
       select 1 from followup_flow_pointers p
        where p.surface in ('cadence', 'campaign')
          and p.id in (
            case when tg_op = 'DELETE' then old.pointer_id else new.pointer_id end,
            case when tg_op = 'UPDATE' then old.pointer_id end
          )
     ) then
    raise exception 'cadencia_escrita_so_pelo_servidor' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$cad_gv$;
revoke all on function public.fn_cadencia_guarda_versao() from public, anon, authenticated;

create or replace function public.fn_cadencia_guarda_inscricao()
returns trigger language plpgsql security invoker set search_path = public as $cad_gi$
declare
  v_cadencia boolean;
begin
  if current_user not in ('authenticated', 'anon') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'INSERT' then
    if exists (
      select 1 from followup_flow_pointers p
       where p.id = new.pointer_id and p.surface in ('cadence', 'campaign')
    ) then
      raise exception 'cadencia_escrita_so_pelo_servidor' using errcode = '42501';
    end if;
    return new;
  end if;
  select exists (
           select 1 from followup_flow_pointers p
            where p.id = old.pointer_id and p.surface in ('cadence', 'campaign')
         )
      or (tg_op = 'UPDATE' and exists (
           select 1 from followup_flow_pointers p
            where p.id = new.pointer_id and p.surface in ('cadence', 'campaign')
         ))
    into v_cadencia;
  if not v_cadencia then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'UPDATE'
     and new.status = 'cancelled'
     and old.status in ('active', 'waiting_reply', 'dormente', 'paused_handoff', 'paused_manual')
     and new.pointer_id = old.pointer_id
     and new.version_id = old.version_id
     and new.organization_id = old.organization_id
     and new.contact_id = old.contact_id
     and new.current_node_id = old.current_node_id then
    return new;
  end if;
  raise exception 'cadencia_escrita_so_pelo_servidor' using errcode = '42501';
end;
$cad_gi$;
revoke all on function public.fn_cadencia_guarda_inscricao() from public, anon, authenticated;

notify pgrst, 'reload schema';
