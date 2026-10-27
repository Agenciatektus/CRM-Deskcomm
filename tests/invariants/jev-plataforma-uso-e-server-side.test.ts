import { describe, expect, it } from "vitest";

import { motivoDoErro, sql } from "./psql-transporte";

/**
 * `jev_plataforma_uso` (migration 9078) É SERVER-SIDE ONLY: o gasto do Jev com a
 * chave da PLATAFORMA, por empresa e mês. RLS ligada, zero policies, grants
 * revogados de anon/authenticated. Não entra em `TABLES` do rls-isolation: lá
 * `authenticated` levaria `permission denied` em vez de `0`, e a "correção"
 * natural (abrir policy) exporia pelo PostgREST o consumo de cada empresa à outra.
 */

const TABELA = "jev_plataforma_uso";
const FN = "fn_jev_plataforma_registrar(uuid, numeric)";

function erroSob(papel: string, comando: string): string | null {
  try {
    sql(`set role ${papel};
${comando};
reset role;`);
    return null;
  } catch (err) {
    return motivoDoErro(err);
  }
}

function privilegiosDe(papel: string): string {
  return sql(`
    select coalesce(string_agg(distinct privilege_type, ',' order by privilege_type), 'NENHUM')
      from information_schema.role_table_grants
     where table_schema = 'public' and table_name = '${TABELA}' and grantee = '${papel}';
  `).trim();
}

describe("o PostgREST não serve o gasto do Jev com a chave da plataforma", () => {
  it("a tabela EXISTE no baseline — controle positivo da sonda", () => {
    expect(
      sql(`select count(*) from information_schema.tables where table_schema = 'public' and table_name = '${TABELA}';`).trim(),
    ).toBe("1");
  });

  it("`anon` e `authenticated` não têm privilégio NENHUM", () => {
    expect(privilegiosDe("anon")).toBe("NENHUM");
    expect(privilegiosDe("authenticated")).toBe("NENHUM");
  });

  it("`service_role` CONTINUA com privilégio — controle positivo do papel que usa", () => {
    const p = privilegiosDe("service_role");
    for (const priv of ["SELECT", "INSERT", "UPDATE", "DELETE"]) expect(p).toContain(priv);
  });

  it("ler e escrever sob `anon` e `authenticated` é BARRADO com permission denied", () => {
    for (const papel of ["anon", "authenticated"]) {
      for (const cmd of [
        `select custo_usd_cents from public.${TABELA}`,
        `insert into public.${TABELA} (organization_id, mes) values (gen_random_uuid(), current_date)`,
        `update public.${TABELA} set chamadas = 0`,
        `delete from public.${TABELA}`,
      ]) {
        const erro = erroSob(papel, cmd);
        expect(erro, `\`${papel}\` executou "${cmd.slice(0, 30)}" sem erro`).not.toBeNull();
        expect(erro).toContain("permission denied");
      }
    }
  });

  it("a função de soma é barrada a `anon` e `authenticated`", () => {
    for (const papel of ["anon", "authenticated"]) {
      const erro = erroSob(papel, `select public.fn_jev_plataforma_registrar(gen_random_uuid(), 1)`);
      expect(erro, `\`${papel}\` executou ${FN}`).not.toBeNull();
      expect(erro).toContain("permission denied");
    }
  });

  it("RLS ligada e nenhuma policy", () => {
    expect(sql(`select relrowsecurity from pg_class where oid = 'public.${TABELA}'::regclass;`).trim()).toBe("t");
    expect(sql(`select count(*) from pg_policies where schemaname = 'public' and tablename = '${TABELA}';`).trim()).toBe("0");
  });

  it("a linha é por organização+mês e some com a organização", () => {
    expect(
      sql(`select count(*) from pg_constraint where conrelid = 'public.${TABELA}'::regclass and contype = 'p';`).trim(),
    ).toBe("1");
    expect(
      sql(`select confdeltype from pg_constraint where conrelid = 'public.${TABELA}'::regclass and contype = 'f' and confrelid = 'public.organizations'::regclass;`).trim(),
    ).toBe("c");
  });
});
