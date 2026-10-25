import { describe, expect, it } from "vitest";

import { motivoDoErro, sql } from "./psql-transporte";

/**
 * `meta_alertas_enviados` (migration 9073) É SERVER-SIDE ONLY: o dedup dos
 * alertas de vencimento do token da Meta (o INSERT é o cadeado do cron
 * `meta-alerta-vencimento`). Mesmo desenho e mesma régua de
 * `credencial-de-mapas-e-server-side.test.ts`: RLS ligada, zero policies,
 * grants revogados de anon/authenticated. Não entra em `TABLES` do
 * rls-isolation: lá `authenticated` alcançaria a tabela e seria filtrado por
 * policy; aqui ele leva `permission denied`, e a "correção" natural (abrir
 * policy) deixaria uma organização apagar ou forjar o dedup dos avisos de outra pelo PostgREST.
 */

const TABELA = "meta_alertas_enviados";

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

describe("o PostgREST não serve o dedup dos alertas da Meta", () => {
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
        `select marco from public.${TABELA}`,
        `insert into public.${TABELA} (organization_id, marco, janela) values (gen_random_uuid(), 'd1', 'x')`,
        `update public.${TABELA} set marco = 'y'`,
        `delete from public.${TABELA}`,
      ]) {
        const erro = erroSob(papel, cmd);
        expect(erro, `\`${papel}\` executou "${cmd.slice(0, 30)}" sem erro`).not.toBeNull();
        expect(erro).toContain("permission denied");
      }
    }
  });

  it("RLS ligada e nenhuma policy", () => {
    expect(sql(`select relrowsecurity from pg_class where oid = 'public.${TABELA}'::regclass;`).trim()).toBe("t");
    expect(sql(`select count(*) from pg_policies where schemaname = 'public' and tablename = '${TABELA}';`).trim()).toBe("0");
  });

  it("o dedup é único por organização+marco+janela e some com a organização", () => {
    expect(
      sql(`select count(*) from pg_constraint where conrelid = 'public.${TABELA}'::regclass and contype = 'u' and conname = 'meta_alertas_enviados_uk';`).trim(),
    ).toBe("1");
    expect(
      sql(`select confdeltype from pg_constraint where conrelid = 'public.${TABELA}'::regclass and contype = 'f' and confrelid = 'public.organizations'::regclass;`).trim(),
    ).toBe("c");
  });
});
