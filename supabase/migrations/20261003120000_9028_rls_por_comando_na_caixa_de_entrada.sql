-- 9028: policies POR COMANDO e chamada sem argumento avaliada uma vez, nas
-- tabelas que a caixa de entrada e a conversa leem.
--
-- ## O defeito
--
-- Policies permissivas somam com OR, e uma policy `for all` vale também para o
-- SELECT. Quando a tabela tem uma policy de SELECT barata E uma `for all` de
-- escrita com `fn_role_at_least(organization_id, …)`, toda leitura paga as duas:
-- o Postgres avalia a de escrita POR LINHA (é `security definer` com
-- `search_path` fixo, nunca é inlineada) mesmo sem nada para escrever. E
-- `fn_is_platform_admin()` solto numa policy também roda por linha. Embrulhado
-- em `(select …)`, vira InitPlan e roda uma vez por consulta.
--
-- Medido no Postgres 16 local, com o baseline do `dev` e 100 mil conversas
-- e contatos em 20 organizações (5 mil na org do manager). A consulta da página
-- da caixa de entrada (conversas + contato + canal, `limit 51`, como a
-- PostgREST monta) levou 513 ms, dos quais 464 ms na varredura de `contacts`.
-- O filtro `(hashed SubPlan) OR fn_is_platform_admin()` chamava a função nas
-- 95 mil linhas de outras organizações. Em `channel_sessions` o filtro saía
-- `((hashed SubPlan) AND fn_role_at_least(...)) OR fn_is_platform_admin() OR
-- (hashed SubPlan) OR fn_is_platform_admin()`, com a policy de escrita na frente.
-- O antes e depois completo está no texto da PR.
--
-- ## A troca (só leitura muda de forma; a regra de escrita é a MESMA)
--
-- * `channel_sessions`, `crm_pipelines`, `conversation_notes` e `organizations`:
--   a `for all` de escrita vira três policies (insert/update/delete) com o
--   texto de USING/WITH CHECK copiado sem mudança. A leitura passa a ter só a
--   policy de SELECT. Isso não muda quem lê, porque, nas quatro, o predicado de
--   escrita já está contido no de leitura:
--   - `fn_role_at_least(org, x)` só é verdadeiro com vínculo ativo ou suporte
--     ativo na org, e os dois põem a org em `fn_user_org_ids()`;
--   - o ramo `fn_is_platform_admin()` da escrita está na leitura, ou numa
--     policy de SELECT própria (`conversation_notes_select_platform_admin`);
--   - em `conversation_notes`, a escrita exige a mesma conversa visível que a
--     leitura exige, e ainda papel `agent`.
--   Então (leitura OR escrita) = leitura, para todo papel.
-- * `fn_is_platform_admin()` passa a `(select public.fn_is_platform_admin())`
--   nas policies de LEITURA: `channel_sessions_tenant_select`,
--   `crm_pipelines_select`, `conversation_notes_select_platform_admin`,
--   `messages_select`, `orgs_select` e a `for all` de `contacts`
--   (`tenant_isolation_contacts_all`, que é ao mesmo tempo leitura e escrita e
--   continua `for all`: dividir não mudaria custo nenhum). A função é `stable`
--   e sem argumento, então o valor é o mesmo para toda linha da consulta.
--
-- ## `comando_da_conversa` NÃO vira inlineável, e por quê
--
-- Para a função ser inlineada, o corpo não pode ter subconsulta, e o
-- `comando_da_conversa` lê `force_human` e `is_blocked` de `contacts` com duas
-- subconsultas escalares. Medido no mesmo banco: uma cópia `invoker`, sem
-- `set search_path`, não foi inlineada (o plano continua chamando
-- `cmd2(c.*)`) e levou 3,9 a 4,0 s na contagem das 5 mil conversas da org,
-- contra 179 a 217 ms da versão `security definer` de hoje. Como invoker, cada
-- chamada executa as duas leituras de `contacts` com RLS dentro do executor de
-- função SQL, que é exatamente o custo que a 0404 do upstream (issue #1571)
-- tirou ao fazê-la `security definer`. A função fica como está.
--
-- ## Rollback
--
-- Reverter o PR (baseline + esta migration) e recriar as definições
-- anteriores, que estão literalmente em
-- `tests/invariants/rls-por-comando-9028.test.ts` (constante `ANTIGAS`).
-- Só o rollback no banco não basta, porque o `baseline.sql` é reaplicado a
-- cada deploy e recria o bloco da 9028.
--
-- `drop/create policy` pega ACCESS EXCLUSIVE por um instante; com prazo curto,
-- a DDL desiste em vez de enfileirar atrás de leitura longa. O runner envolve a
-- migration em transação, então o `set local` vale só para ela, e a troca de
-- cada tabela é atômica.

set local lock_timeout = '3s';

-- ---- channel_sessions ----
drop policy if exists channel_sessions_tenant_select on public.channel_sessions;
create policy channel_sessions_tenant_select on public.channel_sessions
  for select using (
    organization_id in (select public.fn_user_org_ids())
    or (select public.fn_is_platform_admin())
  );
drop policy if exists channel_sessions_tenant_write on public.channel_sessions;
drop policy if exists channel_sessions_tenant_insert on public.channel_sessions;
create policy channel_sessions_tenant_insert on public.channel_sessions
  for insert with check (
    (organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'admin'))
    or public.fn_is_platform_admin()
  );
drop policy if exists channel_sessions_tenant_update on public.channel_sessions;
create policy channel_sessions_tenant_update on public.channel_sessions
  for update using (
    (organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'admin'))
    or public.fn_is_platform_admin()
  ) with check (
    (organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'admin'))
    or public.fn_is_platform_admin()
  );
drop policy if exists channel_sessions_tenant_delete on public.channel_sessions;
create policy channel_sessions_tenant_delete on public.channel_sessions
  for delete using (
    (organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'admin'))
    or public.fn_is_platform_admin()
  );

-- ---- crm_pipelines ----
drop policy if exists "crm_pipelines_select" on public.crm_pipelines;
create policy "crm_pipelines_select" on public.crm_pipelines
  for select using (
    (organization_id in (select public.fn_user_org_ids()))
    or (select public.fn_is_platform_admin())
  );
drop policy if exists "crm_pipelines_manager_write" on public.crm_pipelines;
drop policy if exists "crm_pipelines_manager_insert" on public.crm_pipelines;
create policy "crm_pipelines_manager_insert" on public.crm_pipelines
  for insert with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  );
drop policy if exists "crm_pipelines_manager_update" on public.crm_pipelines;
create policy "crm_pipelines_manager_update" on public.crm_pipelines
  for update using (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  ) with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  );
drop policy if exists "crm_pipelines_manager_delete" on public.crm_pipelines;
create policy "crm_pipelines_manager_delete" on public.crm_pipelines
  for delete using (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  );

-- ---- conversation_notes ----
drop policy if exists "conversation_notes_select_platform_admin" on public.conversation_notes;
create policy "conversation_notes_select_platform_admin" on public.conversation_notes
  for select using ((select public.fn_is_platform_admin()));
drop policy if exists "conversation_notes_write" on public.conversation_notes;
drop policy if exists "conversation_notes_insert" on public.conversation_notes;
create policy "conversation_notes_insert" on public.conversation_notes
  for insert with check (
    organization_id in (select public.fn_user_org_ids())
    and public.fn_role_at_least(organization_id, 'agent')
    and exists (
      select 1 from public.conversations c
      where c.organization_id = conversation_notes.organization_id
        and c.id = conversation_notes.conversation_id
        and public.fn_can_view_conversation(c.organization_id, c.assigned_to_user_id)
    )
  );
drop policy if exists "conversation_notes_update" on public.conversation_notes;
create policy "conversation_notes_update" on public.conversation_notes
  for update using (
    organization_id in (select public.fn_user_org_ids())
    and public.fn_role_at_least(organization_id, 'agent')
    and exists (
      select 1 from public.conversations c
      where c.organization_id = conversation_notes.organization_id
        and c.id = conversation_notes.conversation_id
        and public.fn_can_view_conversation(c.organization_id, c.assigned_to_user_id)
    )
  ) with check (
    organization_id in (select public.fn_user_org_ids())
    and public.fn_role_at_least(organization_id, 'agent')
    and exists (
      select 1 from public.conversations c
      where c.organization_id = conversation_notes.organization_id
        and c.id = conversation_notes.conversation_id
        and public.fn_can_view_conversation(c.organization_id, c.assigned_to_user_id)
    )
  );
drop policy if exists "conversation_notes_delete" on public.conversation_notes;
create policy "conversation_notes_delete" on public.conversation_notes
  for delete using (
    organization_id in (select public.fn_user_org_ids())
    and public.fn_role_at_least(organization_id, 'agent')
    and exists (
      select 1 from public.conversations c
      where c.organization_id = conversation_notes.organization_id
        and c.id = conversation_notes.conversation_id
        and public.fn_can_view_conversation(c.organization_id, c.assigned_to_user_id)
    )
  );

-- ---- organizations ----
drop policy if exists "orgs_select" on public.organizations;
create policy "orgs_select" on public.organizations
  for select using (
    (id in (select public.fn_user_org_ids()))
    or (select public.fn_is_platform_admin())
  );
drop policy if exists "orgs_write_platform_admin" on public.organizations;
drop policy if exists "orgs_insert_platform_admin" on public.organizations;
create policy "orgs_insert_platform_admin" on public.organizations
  for insert with check (public.fn_is_platform_admin());
drop policy if exists "orgs_update_platform_admin" on public.organizations;
create policy "orgs_update_platform_admin" on public.organizations
  for update using (public.fn_is_platform_admin()) with check (public.fn_is_platform_admin());
drop policy if exists "orgs_delete_platform_admin" on public.organizations;
create policy "orgs_delete_platform_admin" on public.organizations
  for delete using (public.fn_is_platform_admin());

-- ---- contacts (continua for all: leitura e escrita são a mesma regra) ----
drop policy if exists "tenant_isolation_contacts_all" on public.contacts;
create policy "tenant_isolation_contacts_all" on public.contacts
  using (
    (organization_id in (select public.fn_user_org_ids()))
    or (select public.fn_is_platform_admin())
  ) with check (
    (organization_id in (select public.fn_user_org_ids()))
    or (select public.fn_is_platform_admin())
  );

-- ---- messages (só a leitura; insert/update/delete não mudam) ----
drop policy if exists "messages_select" on public.messages;
create policy "messages_select" on public.messages
  for select using (
    (select public.fn_is_platform_admin())
    or exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
    )
  );
