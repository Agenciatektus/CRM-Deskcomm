-- 9026 — RLS de CONJUNTO para conversations, crm_leads e user_organizations.
--
-- ## O defeito
--
-- As policies de SELECT de `conversations` (0035/9014) e `crm_leads` (0036)
-- chamam `fn_can_view_conversation(org, assigned)` / `fn_can_view_lead(org,
-- owner)` POR LINHA. Cada chamada é uma `security definer` com `search_path`
-- fixo (nunca inlineada), que por sua vez chama `fn_user_role_in_org` →
-- `fn_support_context` + uma leitura de `user_organizations` (+ uma de
-- `organizations` para o `visibility_mode`). A `user_orgs_select` (0044) faz o
-- mesmo via `fn_role_at_least` por linha.
--
-- Medido na produção da Tektus pelo @Nuno_Arquiteto (01/10/2026, plano
-- `_Infra/planos/2026-10-01-banco-crm-otimizacoes-postgres-elite.md` §2.1):
-- `count(*)` de conversations como manager 2.217 ms / 30.836 buffers, contra
-- 1,7 ms / 54 com o predicado de conjunto; crm_leads 4.611 ms → 2,3 ms;
-- user_organizations 72 ms → 1,3 ms. Equivalência medida em 6 identidades
-- reais (diff 0 nas quatro tabelas).
--
-- ## A troca
--
-- `fn_escopo_orgs()` devolve, UMA vez por consulta, o conjunto
-- (organização, papel efetivo, visibility_mode) de quem consulta. As policies
-- passam a perguntar "a org da linha está no conjunto?" — um semi-join com o
-- conjunto calculado num InitPlan, em vez de N chamadas de função.
--
-- O papel efetivo é o MESMO de `fn_user_role_in_org` (0220): a sessão de
-- suporte ATIVA sobre a org manda (`full` → admin, `support_readonly` →
-- viewer), por cima do vínculo físico se houver; sem suporte ativo, vale o
-- vínculo NÃO revogado. Org de suporte sem vínculo entra pelo segundo ramo do
-- `union`.
--
-- ## Regra inegociável: o ramo "próprio" exige vínculo ATIVO
--
-- `assigned_to_user_id` / `owner_user_id` referenciam `auth.users`, e revogar
-- o membro não limpa a atribuição. Um predicado `assigned_to_user_id =
-- auth.uid()` SOLTO deixaria o ex-membro ainda atribuído ler a conversa (e,
-- por herança do `messages_select`, as mensagens dela) e o lead. Aqui o ramo
-- próprio só vale para org em que a pessoa é `agent` no conjunto — e o
-- conjunto só tem vínculo com `revoked_at is null`. Provado em
-- `tests/invariants/rls-de-conjunto-9026.test.ts` (caso c), com controle
-- positivo antes da revogação.
--
-- ## O que NÃO muda
--
-- * `messages_select` continua `exists (conversa visível)`: herda o escopo e
--   fica barata junto com `conversations_select`.
-- * Policies de ESCRITA (insert/update/delete) seguem chamando
--   `fn_can_view_*`/`fn_role_at_least`: as duas funções continuam existindo,
--   inalteradas.
-- * O ramo de platform admin (`fn_is_platform_admin()`), agora avaliado uma vez
--   por consulta (`(select …)`) em vez de por linha.
--
-- ## Rollback
--
--   drop policy if exists "conversations_select" on public.conversations;
--   create policy "conversations_select" on public.conversations
--     for select using (public.fn_can_view_conversation(organization_id, assigned_to_user_id));
--   drop policy if exists "crm_leads_select" on public.crm_leads;
--   create policy "crm_leads_select" on public.crm_leads
--     for select using (public.fn_can_view_lead(organization_id, owner_user_id));
--   drop policy if exists "user_orgs_select" on public.user_organizations;
--   create policy "user_orgs_select" on public.user_organizations
--     for select using ((user_id = auth.uid())
--       or public.fn_role_at_least(organization_id, 'manager')
--       or public.fn_is_platform_admin());
--   drop function if exists public.fn_escopo_orgs();
--
-- ⚠️ O rollback no banco NÃO basta sozinho: o `baseline.sql` é reaplicado a
-- cada deploy e recria o que estiver no bloco da 9026. Reverter = reverter o
-- PR (baseline + esta migration) e aplicar o SQL acima.
--
-- `drop policy`/`create policy` pegam ACCESS EXCLUSIVE na tabela por um
-- instante; com tráfego, sem prazo, a DDL enfileira atrás de leitura longa e
-- trava quem chega depois. O runner envolve a migration em transação, então o
-- `set local` vale só para ela.

set local lock_timeout = '3s';

create or replace function public.fn_escopo_orgs()
returns table (organization_id uuid, papel text, modo text)
language sql stable security definer
set search_path = public
as $$
  with sup as (
    select (s.j->>'organization_id')::uuid as org,
           case when s.j->>'access_mode' = 'full' then 'admin' else 'viewer' end as papel
      from (select public.fn_support_context() as j) s
     where s.j->>'status' = 'active'
  )
  select uo.organization_id,
         coalesce(sup.papel, uo.role),
         coalesce(o.settings->>'visibility_mode', 'own_and_unassigned')
    from public.user_organizations uo
    join public.organizations o on o.id = uo.organization_id
    left join sup on sup.org = uo.organization_id
   where uo.user_id = auth.uid()
     and uo.revoked_at is null
  union
  select sup.org, sup.papel, 'all'
    from sup
   where not exists (
     select 1 from public.user_organizations uo
      where uo.user_id = auth.uid()
        and uo.organization_id = sup.org
        and uo.revoked_at is null
   );
$$;

revoke all on function public.fn_escopo_orgs() from public, anon;
grant execute on function public.fn_escopo_orgs() to authenticated, service_role;

-- Cada par drop/create vai num `do` próprio: o baseline roda em autocommit
-- (psql -f, sem --single-transaction) e com lock_timeout curto. Se o create
-- caísse em lock timeout depois do drop, a tabela ficaria sem policy de SELECT
-- (deny-all) até a próxima passada. Dentro do `do`, o par é uma instrução só:
-- a troca acontece inteira ou não acontece, e a policy anterior fica de pé.
do $rls9026$ begin
  drop policy if exists "conversations_select" on public.conversations;
  create policy "conversations_select" on public.conversations
    for select using (
      (select public.fn_is_platform_admin())
      or organization_id in (
        select e.organization_id from public.fn_escopo_orgs() e
         where e.papel in ('viewer', 'manager', 'admin')
            or (e.papel = 'agent' and e.modo = 'all'))
      or (assigned_to_user_id = (select auth.uid())
          and organization_id in (
            select e.organization_id from public.fn_escopo_orgs() e
             where e.papel = 'agent'))
      or (assigned_to_user_id is null
          and organization_id in (
            select e.organization_id from public.fn_escopo_orgs() e
             where e.papel = 'agent' and e.modo = 'own_and_unassigned'))
    );
end $rls9026$;

do $rls9026$ begin
  drop policy if exists "crm_leads_select" on public.crm_leads;
  create policy "crm_leads_select" on public.crm_leads
    for select using (
      (select public.fn_is_platform_admin())
      or organization_id in (
        select e.organization_id from public.fn_escopo_orgs() e
         where e.papel in ('viewer', 'manager', 'admin')
            or (e.papel = 'agent' and e.modo = 'all'))
      or (owner_user_id = (select auth.uid())
          and organization_id in (
            select e.organization_id from public.fn_escopo_orgs() e
             where e.papel = 'agent'))
      or (owner_user_id is null
          and organization_id in (
            select e.organization_id from public.fn_escopo_orgs() e
             where e.papel = 'agent' and e.modo = 'own_and_unassigned'))
    );
end $rls9026$;

do $rls9026$ begin
  drop policy if exists "user_orgs_select" on public.user_organizations;
  create policy "user_orgs_select" on public.user_organizations
    for select using (
      user_id = (select auth.uid())
      or organization_id in (
        select e.organization_id from public.fn_escopo_orgs() e
         where e.papel in ('manager', 'admin'))
      or (select public.fn_is_platform_admin())
    );
end $rls9026$;
