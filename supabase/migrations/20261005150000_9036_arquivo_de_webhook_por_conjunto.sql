-- 9036: a leitura do arquivo de webhook pergunta o papel UMA vez por consulta.
--
-- ## O defeito
--
-- A 9035 pôs o gate de papel em `webhook_events_log_tenant_read` com
-- `public.fn_role_at_least(organization_id, 'manager')` POR LINHA. É uma
-- `security definer` com `search_path` fixo (nunca inlineada) que chama
-- `fn_user_role_in_org` → `fn_support_context` + leitura de
-- `user_organizations`: N chamadas para N linhas. O arquivo é a tabela mais
-- volumosa do banco, e a contagem direta como manager passou de 2 minutos em
-- produção.
--
-- ## A troca
--
-- Mesmo padrão da 9027: `fn_escopo_orgs()` devolve, uma vez por consulta, o
-- conjunto (organização, papel efetivo) de quem consulta, e a policy pergunta
-- "a org da linha está no conjunto com papel manager+?" — um semi-join com
-- o conjunto calculado uma vez (hashed SubPlan), em vez de N chamadas.
--
-- ## Semântica: idêntica à 9035
--
-- * `fn_role_at_least(org, 'manager')` é `nível(fn_user_role_in_org(org)) >= 3`
--   na escala viewer 1, agent 2, manager 3, admin 4. Papel fora da escala dá
--   `false`. Aqui: `papel in ('manager', 'admin')` — o mesmo conjunto.
-- * `fn_escopo_orgs()` calcula o papel efetivo como `fn_user_role_in_org`
--   (0220): sessão de suporte ATIVA manda (`full` → admin, `support_readonly`
--   → viewer), vínculo revogado não conta. Equivalência medida na 9027.
-- * platform admin continua passando por `(select fn_is_platform_admin())`.
-- * `organization_id is null` continua de fora (`null in (...)` não é true).
--
-- Prova: tests/invariants/arquivo-de-webhook-por-conjunto-9036.test.ts —
-- mesmas linhas antes/depois por papel, e `fn_role_at_least` com ZERO chamadas
-- (contra uma por linha na policy antiga, no controle negativo).
--
-- ## Rollback
--
--   drop policy if exists "webhook_events_log_tenant_read" on public.webhook_events_log;
--   create policy "webhook_events_log_tenant_read" on public.webhook_events_log
--     for select using ((select public.fn_is_platform_admin())
--       or (organization_id is not null and public.fn_role_at_least(organization_id, 'manager')));
--
-- O baseline é reaplicado a cada deploy: reverter = reverter o PR (baseline +
-- esta migration) e aplicar o SQL acima.

set local lock_timeout = '3s';

-- drop/create num `do` só: em lock timeout depois do drop a tabela ficaria sem
-- policy de SELECT. Dentro do `do`, a troca é inteira ou não acontece.
do $arquivo9036$ begin
  drop policy if exists "webhook_events_log_tenant_read" on public.webhook_events_log;
  create policy "webhook_events_log_tenant_read" on public.webhook_events_log
    for select
    using (
      (select public.fn_is_platform_admin())
      or organization_id in (
        select e.organization_id from public.fn_escopo_orgs() e
         where e.papel in ('manager', 'admin'))
    );
end $arquivo9036$;

notify pgrst, 'reload schema';
