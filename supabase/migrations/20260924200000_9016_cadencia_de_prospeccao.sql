-- ---- cadência de prospecção ativa (migration 9016) ----
--
-- UM MOTOR, TRÊS LISTAS. A cadência é um fluxo de follow-up com `surface =
-- 'cadence'`: reusa o grafo versionado, o claim com SKIP LOCKED, o CAS por
-- `revision` e o cancelamento na resposta (`cancel_on_reply`). O que ela tem
-- de próprio mora aqui:
--
--   * `channel_session_id` — o NÚMERO pelo qual a régua sai (a conversa de cada
--     lead nasce nele, na inscrição);
--   * `pipeline_id` — o funil ao qual a régua pertence (a tela do Kanban a lista
--     por funil, e `move_stage` só aceita etapa DESTE funil);
--   * `cadence_settings` — política de envio (janela, espaçamento, base legal,
--     teto de inscrições/dia), validada por zod em `lib/cadencia/settings.ts`;
--   * `followup_enrollments.lead_id` — o NEGÓCIO da inscrição: um contato com
--     dois negócios deixava `loadLeadFacts` escolher pelo `updated_at`.
--
-- Aditiva e idempotente: colunas nullable, CHECK por conjunto (drop/add) e
-- índices parciais. Sem backfill: pointer existente continua `followup`.

alter table public.followup_flow_pointers
  drop constraint if exists followup_flow_pointers_surface_check;
alter table public.followup_flow_pointers
  add constraint followup_flow_pointers_surface_check
  check (surface in ('followup', 'crm_automation', 'cadence'));

alter table public.followup_flow_pointers
  add column if not exists channel_session_id uuid
    references public.channel_sessions(id) on delete set null;
alter table public.followup_flow_pointers
  add column if not exists pipeline_id uuid
    references public.crm_pipelines(id) on delete set null;
alter table public.followup_flow_pointers
  add column if not exists cadence_settings jsonb;

-- Cadência PUBLICADA tem número, funil e política. Rascunho pode nascer vazio
-- (a tela preenche aos poucos); o que não pode é ir ao ar sem eles.
alter table public.followup_flow_pointers
  drop constraint if exists followup_flow_pointers_cadencia_completa;
alter table public.followup_flow_pointers
  add constraint followup_flow_pointers_cadencia_completa
  check (
    surface <> 'cadence'
    or status <> 'active'
    or (
      channel_session_id is not null
      and pipeline_id is not null
      and cadence_settings is not null
      and jsonb_typeof(cadence_settings) = 'object'
    )
  );

comment on column public.followup_flow_pointers.surface is
  'Onde o fluxo aparece: followup = /app/ai/followups; crm_automation = CRM Automação; '
  'cadence = cadência de prospecção do funil (migration 9016). '
  'Vocabulário cobrado por tests/invariants/vocabulario-banco-x-typescript.test.ts.';

create index if not exists followup_flow_pointers_cadencia_por_funil
  on public.followup_flow_pointers (organization_id, pipeline_id)
  where surface = 'cadence';

alter table public.followup_enrollments
  add column if not exists lead_id uuid
    references public.crm_leads(id) on delete set null;

create index if not exists followup_enrollments_lead_id
  on public.followup_enrollments (lead_id)
  where lead_id is not null;

-- Etiqueta do negócio, ATÔMICA. O caminho de tela (`updateLeadHandler`) e a
-- ação de automação (`add-tag.ts`) regravam o array inteiro a partir do valor
-- lido antes — dois passos simultâneos perdem um ao outro. Aqui a operação é
-- feita no próprio UPDATE. `null` = negócio não é desta organização.
create or replace function public.fn_cadencia_etiqueta_do_lead(
  p_org uuid, p_lead uuid, p_op text, p_tag text
) returns text[] language plpgsql security definer set search_path = public as $cad_tag$
declare v_tags text[]; v_tag text := btrim(p_tag);
begin
  if p_op not in ('add', 'remove') then
    raise exception 'cadencia_etiqueta_op_invalida' using errcode = '22023';
  end if;
  if v_tag is null or v_tag = '' or length(v_tag) > 60 then
    raise exception 'cadencia_etiqueta_invalida' using errcode = '22023';
  end if;
  update public.crm_leads
     set tags = case
       when p_op = 'add' then
         case when v_tag = any(coalesce(tags, '{}')) then tags
              else coalesce(tags, '{}') || v_tag end
       else array_remove(coalesce(tags, '{}'), v_tag)
     end
   where organization_id = p_org and id = p_lead
  returning tags into v_tags;
  return v_tags;
end; $cad_tag$;

-- Só `service_role`: quem chama é o motor da cadência. Sessão de usuário tem o
-- PATCH do negócio, que passa por auditoria e RLS.
revoke all on function public.fn_cadencia_etiqueta_do_lead(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.fn_cadencia_etiqueta_do_lead(uuid, uuid, text, text) to service_role;

-- Base legal do contato frio, gravada NA INSCRIÇÃO (o ato autorizado por um
-- gestor) — o mesmo que a prospecção nativa faz ao criar o contato. ATÔMICA e
-- conservadora: só preenche `legitimate_interest` quando o contato ainda não tem
-- NENHUMA base, e NUNCA quando há recusa de marketing (`marketing.declined_at`).
-- Ler-mesclar-gravar pelo app poderia apagar um opt-out gravado no mesmo
-- instante; aqui a condição e a escrita são o mesmo UPDATE. Devolve true só
-- quando gravou.
create or replace function public.fn_cadencia_registrar_base_legal(
  p_org uuid, p_contact uuid, p_ref text
) returns boolean language plpgsql security definer set search_path = public as $cad_lia$
declare v_ok boolean;
begin
  if p_ref is null or length(btrim(p_ref)) < 3 then
    raise exception 'cadencia_base_legal_invalida' using errcode = '22023';
  end if;
  update public.contacts
     set consent = coalesce(consent, '{}'::jsonb) || jsonb_build_object(
           'legitimate_interest',
           jsonb_build_object('ref', btrim(p_ref), 'source', 'cadencia', 'registered_at', now())
         )
   where organization_id = p_org
     and id = p_contact
     and not coalesce(is_anonymized, false)
     and coalesce(consent -> 'marketing' ->> 'declined_at', '') = ''
     and coalesce(consent -> 'marketing' ->> 'granted_at', '') = ''
     and coalesce(consent -> 'legitimate_interest' ->> 'ref', '') = ''
  returning true into v_ok;
  return coalesce(v_ok, false);
end; $cad_lia$;

revoke all on function public.fn_cadencia_registrar_base_legal(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.fn_cadencia_registrar_base_legal(uuid, uuid, text) to service_role;

-- KILL SWITCH de todas as cadências da organização (`settings.cadencias_pausadas`).
-- O worker o lê ANTES de cada envio (`lib/cadencia/envio.ts`): pausado, o passo
-- é ADIADO, não perdido. Mesmo guarda de `fn_definir_colegas_podem_mexer_na_agenda`:
-- Gerente ou acima, suporte de escrita e MFA, conferidos pelo `auth.uid()` — pela
-- sessão de um Gerente, um `update organizations` direto casaria zero linhas e
-- devolveria sucesso. Grava por merge (`||`): as outras chaves de settings ficam.
create or replace function public.fn_definir_cadencias_pausadas(p_org uuid, p_pausadas boolean)
returns jsonb language plpgsql security definer set search_path = public as $cad_pausa$
declare v_atual boolean; v_linhas int;
begin
  if p_pausadas is null then raise exception 'cadencias_pausadas_invalido' using errcode = '22023'; end if;
  if auth.uid() is null
     or not public.fn_role_at_least(p_org, 'manager')
     or not public.fn_support_write_allowed(p_org) then
    raise exception 'cadencias_pausadas_forbidden' using errcode = '42501';
  end if;
  if not public.fn_session_mfa_proven() then raise exception 'mfa_required' using errcode = '42501'; end if;
  select coalesce((settings ->> 'cadencias_pausadas')::boolean, false) into v_atual
    from public.organizations where id = p_org;
  if v_atual is not distinct from p_pausadas then
    return jsonb_build_object('pausadas', v_atual, 'mudou', false);
  end if;
  update public.organizations
     set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('cadencias_pausadas', to_jsonb(p_pausadas))
   where id = p_org;
  get diagnostics v_linhas = row_count;
  if v_linhas = 0 then raise exception 'cadencias_pausadas_sem_organizacao' using errcode = 'P0002'; end if;
  return jsonb_build_object('pausadas', p_pausadas, 'mudou', true);
end; $cad_pausa$;

revoke all on function public.fn_definir_cadencias_pausadas(uuid, boolean) from public, anon;
grant execute on function public.fn_definir_cadencias_pausadas(uuid, boolean) to authenticated, service_role;

-- VAGAS DE INSCRIÇÃO POR DIA, reservadas ATOMICAMENTE (P1-4 da revisão).
-- Contar as inscrições de hoje e depois inserir deixava dois lotes simultâneos
-- (ou um lote e o gatilho) estourarem o teto até o dobro. A reserva trava a
-- cadência, lê o que já foi concedido NO DIA (fuso da organização) e concede o
-- que cabe, numa transação só. Vaga reservada e não usada (inscrição recusada
-- depois) conta contra o teto: erra para o lado de mandar MENOS.
create table if not exists public.cadencia_inscricoes_do_dia (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pointer_id uuid not null references public.followup_flow_pointers(id) on delete cascade,
  dia date not null,
  reservadas integer not null default 0 check (reservadas >= 0),
  primary key (pointer_id, dia)
);
-- Só service_role (o motor e as rotas da cadência): RLS ligada e SEM policy.
alter table public.cadencia_inscricoes_do_dia enable row level security;
revoke all on table public.cadencia_inscricoes_do_dia from anon, authenticated;

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
   where p.organization_id = p_org and p.id = p_pointer and p.surface = 'cadence';
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

-- Leitura do que ainda cabe HOJE (a prévia da inscrição em lote). Não reserva.
create or replace function public.fn_cadencia_vagas_de_hoje(p_org uuid, p_pointer uuid)
returns integer language sql stable security definer set search_path = public as $cad_vagas_hoje$
  select greatest(0, (p.cadence_settings ->> 'max_inscricoes_dia')::integer - coalesce((
           select d.reservadas from public.cadencia_inscricoes_do_dia d
            where d.pointer_id = p.id
              and d.dia = (now() at time zone coalesce(nullif(o.timezone, ''), 'America/Sao_Paulo'))::date), 0))
    from public.followup_flow_pointers p
    join public.organizations o on o.id = p.organization_id
   where p.organization_id = p_org and p.id = p_pointer and p.surface = 'cadence';
$cad_vagas_hoje$;

revoke all on function public.fn_cadencia_reservar_inscricoes(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.fn_cadencia_reservar_inscricoes(uuid, uuid, integer) to service_role;
revoke all on function public.fn_cadencia_vagas_de_hoje(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fn_cadencia_vagas_de_hoje(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
