/**
 * 9058 — no financeiro, o papel também no USING da `_write`.
 *
 * A 0533 (e a provisionadora da 0619) criam `tenant_isolation_<t>_write`
 * `for all` com `using (vínculo or _full)` e o papel só no `with check`. Em
 * `for all`, DELETE consulta APENAS o `using`, e as policies permissivas se
 * somam por OR com as da 9007: a `_write` sozinha deixava o viewer apagar a
 * conta. A 9058 põe o papel no USING (e redefine a provisionadora igual).
 *
 * Previsão escrita antes de rodar (sabotagem): devolvida a `_write` da 0533
 * (`using (organization_id in (select public.fn_user_org_ids()) or
 * public.fn_is_platform_admin_full())`), o primeiro `it` acusa as 9 tabelas e o
 * segundo devolve 1 para o viewer.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { GOV_AGENT_A, GOV_MANAGER, GOV_ORG, GOV_VIEWER, seedGov, sql, writeCountAs } from "./gov-helpers";

const CONTA = "cccccccc-9058-4000-8000-000000000001";

const TABELAS = [
  "financial_accounts",
  "payment_methods",
  "account_plans",
  "sales",
  "sale_items",
  "commission_rules",
  "commissions",
  "financial_entries",
  "loyalty_ledger",
] as const;

beforeAll(() => {
  // As cinco da comanda nascem na provisionadora (0619): sem a chamada, elas
  // não existem e o catálogo mediria só as quatro do núcleo.
  sql("select public.fn_financeiro_provisionar();");
  seedGov();
  sql(`
    delete from public.financial_accounts where id = '${CONTA}';
    insert into public.financial_accounts (id, organization_id, name)
      values ('${CONTA}', '${GOV_ORG}', 'Conta 9058');
  `);
});

describe("9058 — o viewer não apaga dado do financeiro", () => {
  it("catálogo: toda _write tem o papel no USING, e a provisionadora também", () => {
    const sem: string[] = [];
    for (const t of TABELAS) {
      const qual = sql(
        `select coalesce(qual, '') from pg_policies where schemaname = 'public' and tablename = '${t}' and policyname = 'tenant_isolation_${t}_write';`,
      );
      if (!qual.includes("fn_role_at_least")) sem.push(t);
    }
    expect(sem, "_write sem papel no USING (DELETE passa por ela)").toEqual([]);
    const corpo = sql("select prosrc from pg_proc where proname = 'fn_financeiro_provisionar';");
    expect((corpo.match(/9058: o papel também no USING/g) ?? []).length).toBe(5);
  });

  it("financial_accounts: viewer e agent apagam 0; manager apaga 1 (controle)", () => {
    expect(writeCountAs(GOV_VIEWER, `delete from public.financial_accounts where id = '${CONTA}'`)).toBe(0);
    expect(writeCountAs(GOV_AGENT_A, `delete from public.financial_accounts where id = '${CONTA}'`)).toBe(0);
    expect(writeCountAs(GOV_MANAGER, `delete from public.financial_accounts where id = '${CONTA}'`)).toBe(1);
  });
});
