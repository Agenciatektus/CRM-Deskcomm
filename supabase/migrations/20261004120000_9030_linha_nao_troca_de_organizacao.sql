-- 9030: a linha não troca de organização, e contato só é escrito por agent+.
--
-- ## O defeito (P1 pré-existente, achado no invariante da 9028)
--
-- As policies `for all` que só exigem tenancy (`organization_id in
-- (select fn_user_org_ids())`) valem também como WITH CHECK do UPDATE. Quem
-- tem vínculo em A e em B passava nas duas pontas: podia mover um contato (ou
-- uma demanda, uma nota de lead, um job…) de A para B com um UPDATE direto na
-- PostgREST. Em produção, conferido em 04/10/2026: 0 conversas com contato de
-- outra organização, nunca explorado.
--
-- ## A troca
--
-- 1. `fn_organizacao_da_linha_nao_muda()` + trigger `trg_organizacao_nao_muda`
--    (BEFORE UPDATE OF organization_id) recusa com 42501 quando a organização
--    da linha muda. Vale para qualquer papel, `service_role` inclusive: trigger
--    não depende de RLS. Upsert que regrava a MESMA organização passa (a
--    comparação é `is distinct from`).
--    Fluxos que mudariam a organização de uma linha: procurados no código
--    (`set organization_id`, `.update({ organization_id })`, upsert cujo
--    conflito não inclui a organização) e não há nenhum. Fusão de contatos,
--    importação e ferramentas de suporte trabalham dentro da mesma
--    organização; apagar organização é DELETE em cascata, que a trigger não
--    vê. Os três upserts sem a organização no conflito (`storage_redaction_queue`
--    por bucket+caminho, com caminho prefixado pela org; `crm_lead_risk_states`
--    e `crm_lead_scores` por `lead_id`) regravam a mesma organização.
--    Tabelas: TODA tabela com `organization_id` cuja policy `for all` só exige
--    tenancy, medida no `pg_policies` do baseline (52).
--    `tests/invariants/organizacao-nao-muda-9030.test.ts` reprova tabela nova
--    nessa condição sem a trigger.
-- 2. `contacts`: a `for all` (`tenant_isolation_contacts_all`) vira SELECT
--    (a mesma leitura de hoje) + insert/update/delete com papel `agent` ou
--    platform admin. Hoje um viewer gravava contato pela PostgREST. Toda rota
--    que escreve contato pelo client de sessão já exige `agent`
--    (`requireRole("agent")` em contacts, contacts/[id], import, person,
--    leads/import, retomada…); a ingestão dos canais e os crons usam o client
--    de serviço, que pula a RLS.
--
-- Rollback: reverter o PR e, no banco, `drop trigger if exists
-- trg_organizacao_nao_muda on public.<tabela>` nas 52, `drop function
-- public.fn_organizacao_da_linha_nao_muda()`, e recriar
-- `tenant_isolation_contacts_all` como na 9028 (texto em `ANTIGAS` de
-- tests/invariants/rls-por-comando-9028.test.ts) no lugar das quatro de
-- contacts.

set local lock_timeout = '3s';

create or replace function public.fn_organizacao_da_linha_nao_muda()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'a linha de % não muda de organização', tg_table_name
      using errcode = '42501',
            hint = 'Mover dado entre organizações não é uma operação do produto. Crie a linha na organização de destino.';
  end if;
  return new;
end;
$$;

revoke all on function public.fn_organizacao_da_linha_nao_muda() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'agent_inbox_items', 'ai_agent_runs', 'ai_invocations', 'ai_router_decisions',
    'before_send_traces', 'channel_knobs', 'channel_session_health', 'channel_session_warmup',
    'contact_field_proposals', 'contacts', 'crm_lead_reactivations', 'crm_lead_risk_states',
    'crm_lead_scores', 'cron_jobs', 'demanda_conversas', 'demandas',
    'disclosure_template_pointers', 'disclosure_template_versions', 'flywheel_distiller_proposals',
    'flywheel_judge_verdicts', 'idempotency_keys', 'job_queue', 'judge_alignment_pool',
    'knowledge_searches', 'lead_checkpoints', 'lead_notes', 'lead_state', 'lead_state_transitions',
    'llm_calls', 'meta_templates', 'metrics', 'nuvemshop_products', 'orders',
    'org_memory_entries', 'org_memory_pointers', 'org_memory_versions', 'outbound_copies',
    'pacing_ledger', 'phone_numbers', 'playbook_pointers', 'playbook_versions',
    'promise_table_pointers', 'promise_table_versions', 'reentry_knob_pointers',
    'reentry_knob_versions', 'reentry_template_pointers', 'reentry_template_versions',
    'send_ledger', 'skill_activations', 'skill_pointers', 'skill_versions',
    'storage_redaction_queue'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format(
        'create or replace trigger trg_organizacao_nao_muda before update of organization_id on public.%I '
        'for each row execute function public.fn_organizacao_da_linha_nao_muda()', t);
    end if;
  end loop;
end $$;

drop policy if exists "tenant_isolation_contacts_all" on public.contacts;
drop policy if exists "contacts_select" on public.contacts;
create policy "contacts_select" on public.contacts
  for select using (
    (organization_id in (select public.fn_user_org_ids()))
    or (select public.fn_is_platform_admin())
  );
drop policy if exists "contacts_insert" on public.contacts;
create policy "contacts_insert" on public.contacts
  for insert with check (
    ((organization_id in (select public.fn_user_org_ids()))
      and public.fn_role_at_least(organization_id, 'agent'))
    or public.fn_is_platform_admin()
  );
drop policy if exists "contacts_update" on public.contacts;
create policy "contacts_update" on public.contacts
  for update using (
    ((organization_id in (select public.fn_user_org_ids()))
      and public.fn_role_at_least(organization_id, 'agent'))
    or public.fn_is_platform_admin()
  ) with check (
    ((organization_id in (select public.fn_user_org_ids()))
      and public.fn_role_at_least(organization_id, 'agent'))
    or public.fn_is_platform_admin()
  );
drop policy if exists "contacts_delete" on public.contacts;
create policy "contacts_delete" on public.contacts
  for delete using (
    ((organization_id in (select public.fn_user_org_ids()))
      and public.fn_role_at_least(organization_id, 'agent'))
    or public.fn_is_platform_admin()
  );
