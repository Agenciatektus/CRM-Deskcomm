-- 9007 — o isolamento do financeiro precisa checar PAPEL na leitura e no apagar.
--
-- ─── O defeito ──────────────────────────────────────────────────────────────
-- As nove tabelas do módulo financeiro nasceram (0351) com uma policy única
-- `FOR ALL` desta forma:
--
--   using (organization_id in (select public.fn_user_org_ids()) or fn_is_platform_admin())
--   with check (... and public.fn_role_at_least(organization_id, 'agent'))
--
-- No Postgres, `SELECT` e `DELETE` sob `FOR ALL` consultam APENAS o `using`. O
-- `with check` governa só `INSERT` e `UPDATE`. Logo o papel — a única coisa que
-- separa quem pode mexer em dinheiro de quem só olha — não era consultado no
-- caminho do `DELETE`.
--
-- E `fn_user_org_ids()` devolve TODAS as organizações em que a pessoa tem
-- vínculo vivo, não a organização ativa da sessão. Somando as duas coisas:
--
--   DELETE /api/v1/financeiro/lancamentos/<id-de-outra-organizacao>
--
-- O `requireRole('agent')` da rota mede o papel na organização ATIVA e aprova;
-- a policy encontra a linha da OUTRA organização por vínculo e libera. Apaga
-- lançamento de uma organização onde a pessoa talvez seja apenas `viewer`.
--
-- ─── Por que não basta mover o papel para dentro do `using` ─────────────────
-- Porque isso levaria o papel também para o `SELECT`, e o desenho declarado
-- destas tabelas é "leitura para quem é da organização, escrita para quem tem
-- papel" (o comentário da 0351 diz isso em letras). Exigir `manager` no `using`
-- de `account_plans` tiraria o plano de contas da tela do `viewer` — conserto
-- que quebra o produto não é conserto.
--
-- A forma certa é deixar de usar UMA policy para quatro comandos diferentes:
-- `select` com vínculo, `insert`/`update`/`delete` com vínculo E papel. É mais
-- verboso e diz a verdade sobre o que cada comando exige.
--
-- ─── A outra metade do conserto está nas rotas ──────────────────────────────
-- As rotas do financeiro passaram a filtrar `organization_id` da SESSÃO em toda
-- query, em vez de delegar o recorte à RLS. Esta migration é a segunda camada:
-- sem ela, a próxima rota do módulo escrita sem o filtro repete o defeito
-- inteiro. Sem as rotas, a leitura continuaria misturando organizações para
-- quem tem vínculo em mais de uma — porque para o SELECT o vínculo BASTA, e é
-- assim que o multi-org deve funcionar.

do $$
declare
  t text;
  papel text;
  tabelas_e_papeis text[][] := array[
    -- configuração de dinheiro: quem atende não define plano de contas
    array['financial_accounts', 'manager'],
    array['payment_methods',    'manager'],
    array['account_plans',      'manager'],
    -- movimento do dia a dia: quem atende lança
    array['sales',             'agent'],
    array['sale_items',        'agent'],
    array['commission_rules',  'agent'],
    array['commissions',       'agent'],
    array['financial_entries', 'agent'],
    array['loyalty_ledger',    'agent']
  ];
  i integer;
begin
  for i in 1 .. array_length(tabelas_e_papeis, 1) loop
    t := tabelas_e_papeis[i][1];
    papel := tabelas_e_papeis[i][2];

    if to_regclass('public.' || quote_ident(t)) is null then
      continue;  -- instalação que ainda não tem o módulo
    end if;

    execute format('alter table public.%I enable row level security', t);

    -- A policy antiga sai INTEIRA. Deixá-la conviver com as novas manteria o
    -- buraco aberto: policies permissivas se somam por OR, e a antiga sozinha
    -- já autoriza o delete.
    execute format('drop policy if exists tenant_isolation_%I_all on public.%I', t, t);
    execute format('drop policy if exists tenant_isolation_%I_select on public.%I', t, t);
    execute format('drop policy if exists tenant_isolation_%I_insert on public.%I', t, t);
    execute format('drop policy if exists tenant_isolation_%I_update on public.%I', t, t);
    execute format('drop policy if exists tenant_isolation_%I_delete on public.%I', t, t);

    -- LER: basta o vínculo. É o desenho do multi-org — a pessoa enxerga as
    -- organizações dela. O recorte pela organização ATIVA é da rota.
    execute format($f$
      create policy tenant_isolation_%I_select on public.%I
        for select
        using (organization_id in (select public.fn_user_org_ids())
               or public.fn_is_platform_admin())
    $f$, t, t);

    execute format($f$
      create policy tenant_isolation_%I_insert on public.%I
        for insert
        with check (
          public.fn_is_platform_admin()
          or (organization_id in (select public.fn_user_org_ids())
              and public.fn_role_at_least(organization_id, %L))
        )
    $f$, t, t, papel);

    -- UPDATE precisa dos dois lados: `using` escolhe a linha que pode ser
    -- alterada, `with check` valida como ela fica. Só o segundo deixaria alterar
    -- uma linha de organização onde a pessoa não tem papel, desde que o
    -- resultado ficasse válido.
    execute format($f$
      create policy tenant_isolation_%I_update on public.%I
        for update
        using (
          public.fn_is_platform_admin()
          or (organization_id in (select public.fn_user_org_ids())
              and public.fn_role_at_least(organization_id, %L))
        )
        with check (
          public.fn_is_platform_admin()
          or (organization_id in (select public.fn_user_org_ids())
              and public.fn_role_at_least(organization_id, %L))
        )
    $f$, t, t, papel, papel);

    -- DELETE: é aqui que o defeito morava.
    execute format($f$
      create policy tenant_isolation_%I_delete on public.%I
        for delete
        using (
          public.fn_is_platform_admin()
          or (organization_id in (select public.fn_user_org_ids())
              and public.fn_role_at_least(organization_id, %L))
        )
    $f$, t, t, papel);

    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
