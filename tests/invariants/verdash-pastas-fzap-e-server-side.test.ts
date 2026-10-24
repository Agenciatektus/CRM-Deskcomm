import { describe, expect, it } from "vitest";

import { motivoDoErro, sql } from "./psql-transporte";

/**
 * `verdash_fzap_pastas` (migration 9067) É SERVER-SIDE ONLY: guarda o token da
 * PASTA do FZAP de cada organização, cifrado. Mesmo desenho e mesma régua de
 * `credencial-de-mapas-e-server-side.test.ts`: RLS ligada, zero policies,
 * grants revogados de anon/authenticated. Não entra em `TABLES` do
 * rls-isolation: lá `authenticated` alcançaria a tabela e seria filtrado por
 * policy; aqui ele leva `permission denied`, e a "correção" natural (abrir
 * policy) serviria o token da pasta pelo PostgREST.
 */

const TABELA = "verdash_fzap_pastas";

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

describe("o PostgREST não serve o token da pasta do FZAP", () => {
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
        `select folder_token_encrypted from public.${TABELA}`,
        `insert into public.${TABELA} (organization_id, fzap_folder_id, folder_token_encrypted) values (gen_random_uuid(), 'x', '\\x00')`,
        `update public.${TABELA} set fzap_folder_id = 'y'`,
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

  it("uma pasta por organização (PK) e uma organização por pasta (índice único)", () => {
    expect(
      sql(`select count(*) from pg_indexes where schemaname = 'public' and tablename = '${TABELA}' and indexdef ilike '%unique%(fzap_folder_id)%';`).trim(),
    ).toBe("1");
    expect(
      sql(`select confdeltype from pg_constraint where conrelid = 'public.${TABELA}'::regclass and contype = 'f' and confrelid = 'public.organizations'::regclass;`).trim(),
    ).toBe("c");
  });
});
