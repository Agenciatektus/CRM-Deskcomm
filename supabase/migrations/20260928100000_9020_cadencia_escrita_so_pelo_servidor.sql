-- 9020 — A CADÊNCIA SÓ SE ESCREVE PELO SERVIDOR.
--
-- As três tabelas do motor de follow-up (`followup_flow_pointers`,
-- `followup_flow_versions`, `followup_enrollments`) têm RLS por organização SEM
-- checagem de papel (`for all using (organization_id in fn_user_org_ids())`), e o
-- default privileges dá INSERT/UPDATE a `authenticated`. Qualquer membro — um
-- viewer — podia, direto pelo PostgREST:
--   * gravar `cadence_conducao` na versão ativa (trocar o agente/instrução da IA
--     sem ser admin e sem a validação de publicação/orçamento);
--   * inserir inscrição de cadência (furando a porta única: teto do dia, base
--     legal, prévia com confirmação);
--   * criar cadência ativa ou mexer em política/versão/status/número/funil de
--     uma cadência (o gatilho do sistema inscreveria gente nela).
--
-- Todo caminho legítimo de cadência escreve com o client de SERVIÇO (rotas
-- `/api/v1/cadencias*`, publicação, porta de inscrição, dreno) ou por função
-- SECURITY DEFINER. Estes três triggers recusam (42501) quando quem escreve é
-- `authenticated` ou `anon`:
--   * VERSÕES: toda escrita, de qualquer fluxo. Nenhum caminho legítimo escreve
--     versão pela sessão: publicar é `fn_publish_followup_flow_version` /
--     `fn_cadencia_publicar_versao` (SECURITY DEFINER, só service_role) e o
--     único DELETE pela sessão (apagar fluxo) passou a usar o client de serviço.
--     Versão é histórico imutável; bloquear tudo é o mais simples e fecha também
--     o fluxo comum sem mudar comportamento.
--   * INSCRIÇÕES de cadência: INSERT, UPDATE e DELETE. Exceção única no UPDATE:
--     CANCELAR uma régua viva (a cascata LGPD roda pela sessão de um admin e
--     tem de conseguir parar a cadência). Reativar, mover de nó, adiar etc.
--     só pelo servidor. INSERT fora da cadência exige ponteiro VISÍVEL da MESMA
--     organização (o que todo caminho legítimo já satisfaz).
--   * PONTEIROS de cadência: criar, e mudar política, versão ativa, status,
--     surface, número, funil, gatilho ou política de handoff.
-- Referência de FK em cascata roda como dono da tabela, não como a sessão.
--
-- DÍVIDA COM DONO (anotada no MANIFEST): o endurecimento geral das tabelas de
-- follow-up comum (policy por papel em vez de `for all`) não entra aqui.
--
-- Funções SECURITY INVOKER (leem `current_user`), search_path fixo, sem EXECUTE
-- para ninguém (só o trigger as chama). ⚠️ ENTRA ANTES DA VARREDURA anon: cria função.

create or replace function public.fn_cadencia_guarda_versao()
returns trigger language plpgsql security invoker set search_path = public as $cad_gv$
begin
  if current_user in ('authenticated', 'anon') then
    raise exception 'cadencia_escrita_so_pelo_servidor' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$cad_gv$;
revoke all on function public.fn_cadencia_guarda_versao() from public, anon, authenticated;

drop trigger if exists trg_cadencia_guarda_versao on public.followup_flow_versions;
create trigger trg_cadencia_guarda_versao
  before insert or update or delete on public.followup_flow_versions
  for each row execute function public.fn_cadencia_guarda_versao();

-- Inscrição. INSERT: `authenticated` só em ponteiro que ELE vê (RLS), da MESMA
-- organização e que NÃO é cadência — invisível também recusa (fail-closed).
-- UPDATE/DELETE de inscrição de cadência (old OU new): recusa, salvo o
-- cancelamento de uma régua viva (LGPD), que não pode mexer em mais nada.
create or replace function public.fn_cadencia_guarda_inscricao()
returns trigger language plpgsql security invoker set search_path = public as $cad_gi$
declare
  v_cadencia boolean;
begin
  if current_user not in ('authenticated', 'anon') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'INSERT' then
    if not exists (
      select 1 from followup_flow_pointers p
       where p.id = new.pointer_id
         and p.organization_id = new.organization_id
         and p.surface is distinct from 'cadence'
    ) then
      raise exception 'cadencia_escrita_so_pelo_servidor' using errcode = '42501';
    end if;
    return new;
  end if;

  -- Ponteiro invisível conta como cadência: fail-closed.
  select not exists (
           select 1 from followup_flow_pointers p
            where p.id = old.pointer_id and p.surface is distinct from 'cadence'
         )
      or (tg_op = 'UPDATE' and not exists (
           select 1 from followup_flow_pointers p
            where p.id = new.pointer_id and p.surface is distinct from 'cadence'
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

drop trigger if exists trg_cadencia_guarda_inscricao on public.followup_enrollments;
create trigger trg_cadencia_guarda_inscricao
  before insert or update or delete on public.followup_enrollments
  for each row execute function public.fn_cadencia_guarda_inscricao();

-- Ponteiro: `authenticated` não CRIA cadência e, numa cadência, não muda
-- política, versão ativa, status, surface, número, funil, gatilho nem política
-- de handoff. Nome e rascunho do grafo seguem graváveis pela sessão.
create or replace function public.fn_cadencia_guarda_ponteiro()
returns trigger language plpgsql security invoker set search_path = public as $cad_gp$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.surface = 'cadence' then
        raise exception 'cadencia_escrita_so_pelo_servidor' using errcode = '42501';
      end if;
    elsif old.surface = 'cadence' or new.surface = 'cadence' then
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

drop trigger if exists trg_cadencia_guarda_ponteiro on public.followup_flow_pointers;
create trigger trg_cadencia_guarda_ponteiro
  before insert or update on public.followup_flow_pointers
  for each row execute function public.fn_cadencia_guarda_ponteiro();
