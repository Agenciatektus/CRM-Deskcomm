-- 9024 — as guardas da cadência (9020) passam a valer SÓ para a cadência.
--
-- A 9020 pôs três triggers BEFORE em `followup_flow_versions`,
-- `followup_enrollments` e `followup_flow_pointers` que recusam, com exceção
-- 42501 `cadencia_escrita_so_pelo_servidor`, escrita de `authenticated`/`anon`.
-- Duas delas eram mais largas que a cadência:
--
--  * a de VERSÃO recusava toda escrita de versão — inclusive de fluxo comum;
--  * a de INSCRIÇÃO, no INSERT, recusava quando NÃO via um ponteiro comum da
--    mesma org — ou seja, recusava também o ponteiro que a sessão não enxerga.
--
-- Na subida para o upstream v1.69, as 0489/0490 do upstream trocaram as
-- policies desses fluxos por RLS POR OPERAÇÃO (leitura para membro, escrita
-- para manager+, a trilha append-only, DELETE de versão permitido ao manager —
-- é como a rota apaga o fluxo). Com as guardas largas por cima, a decisão do
-- upstream deixava de valer: o manager não conseguia apagar o fluxo comum, e a
-- recusa por RLS (que as provas do upstream medem como "0 linhas") virava uma
-- exceção da cadência numa escrita que nem era de cadência.
--
-- Agora as duas guardas olham se o ponteiro É de cadência (`surface =
-- 'cadence'`, lido pela própria sessão). Fluxo comum: decide a RLS do
-- upstream. Cadência: a régua da 9020 continua igual — só o servidor escreve,
-- com a única exceção de CANCELAR uma régua viva (cascata de LGPD pela sessão).
--
-- ⚠️ A RLS NÃO confere a organização do PONTEIRO (P1 do @Cassio_SecRev na #56).
-- A policy de insert das 0489/0490 olha só a org da LINHA e o papel; o ponteiro
-- de outra organização é invisível à guarda da cadência, então passava. Um
-- manager da org A gravaria inscrição (ou versão) com `organization_id = A`
-- apontando para o fluxo — ou a cadência — da org B, e o worker executaria o
-- fluxo de B num contato de A. A 9020 recusava isso de carona (exigia ver um
-- ponteiro comum da MESMA org); ao estreitar a guarda, a conferência tem de
-- existir por si:
--
-- `fn_followup_mesma_organizacao` (security definer: enxerga o ponteiro e a
-- versão de qualquer org, sem depender do que a sessão vê) recusa com 42501,
-- para QUALQUER papel — service_role inclusive —, a inscrição cujo ponteiro ou
-- versão não seja da org da inscrição, e a versão cujo ponteiro não seja da
-- org da versão. INSERT e UPDATE das colunas que ligam as linhas.
--
-- A guarda do PONTEIRO (fn_cadencia_guarda_ponteiro) já olhava só a cadência e
-- não muda.

create or replace function public.fn_cadencia_guarda_versao()
returns trigger language plpgsql security invoker set search_path = public as $cad_gv$
begin
  if current_user in ('authenticated', 'anon')
     and exists (
       select 1 from followup_flow_pointers p
        where p.surface = 'cadence'
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
       where p.id = new.pointer_id and p.surface = 'cadence'
    ) then
      raise exception 'cadencia_escrita_so_pelo_servidor' using errcode = '42501';
    end if;
    return new;
  end if;
  select exists (
           select 1 from followup_flow_pointers p
            where p.id = old.pointer_id and p.surface = 'cadence'
         )
      or (tg_op = 'UPDATE' and exists (
           select 1 from followup_flow_pointers p
            where p.id = new.pointer_id and p.surface = 'cadence'
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

create or replace function public.fn_followup_mesma_organizacao()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $fmo$
begin
  if new.pointer_id is not null and not exists (
    select 1 from public.followup_flow_pointers p
     where p.id = new.pointer_id and p.organization_id = new.organization_id
  ) then
    raise exception 'followup_fora_da_organizacao: o fluxo % não é da organização desta linha', new.pointer_id
      using errcode = '42501';
  end if;
  if tg_table_name = 'followup_enrollments' then
    if new.version_id is not null and not exists (
      select 1 from public.followup_flow_versions v
       where v.id = new.version_id and v.organization_id = new.organization_id
    ) then
      raise exception 'followup_fora_da_organizacao: a versão % não é da organização desta inscrição', new.version_id
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$fmo$;
revoke all on function public.fn_followup_mesma_organizacao() from public, anon, authenticated;

drop trigger if exists trg_followup_mesma_organizacao on public.followup_enrollments;
create trigger trg_followup_mesma_organizacao
  before insert or update of organization_id, pointer_id, version_id on public.followup_enrollments
  for each row execute function public.fn_followup_mesma_organizacao();

drop trigger if exists trg_followup_mesma_organizacao on public.followup_flow_versions;
create trigger trg_followup_mesma_organizacao
  before insert or update of organization_id, pointer_id on public.followup_flow_versions
  for each row execute function public.fn_followup_mesma_organizacao();

notify pgrst, 'reload schema';
