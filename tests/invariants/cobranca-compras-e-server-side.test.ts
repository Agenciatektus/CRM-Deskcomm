import { describe, expect, it } from "vitest";

import { motivoDoErro, sql } from "./psql-transporte";

/**
 * `cobranca_compras` (migration 9080) É SERVER-SIDE ONLY: compra por link de
 * pagamento registrada antes de a empresa existir (e-mail e nome do pagador).
 * RLS ligada, zero policies, grants revogados de anon/authenticated. Não entra
 * em `TABLES` do rls-isolation: lá `authenticated` levaria `permission denied`
 * em vez de `0`, e a "correção" natural (abrir policy) exporia o pagador.
 */

const TABELA = "cobranca_compras";

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

describe("o PostgREST não serve as compras por link de pagamento", () => {
  it("a tabela EXISTE no baseline, com RLS ligada e zero policies", () => {
    expect(sql(`select count(*) from information_schema.tables where table_schema = 'public' and table_name = '${TABELA}';`).trim()).toBe("1");
    expect(sql(`select relrowsecurity::text from pg_class where oid = 'public.${TABELA}'::regclass;`).trim()).toBe("true");
    expect(sql(`select count(*) from pg_policy where polrelid = 'public.${TABELA}'::regclass;`).trim()).toBe("0");
  });

  it("`anon` e `authenticated` não têm privilégio NENHUM; `service_role` continua com ele", () => {
    expect(privilegiosDe("anon")).toBe("NENHUM");
    expect(privilegiosDe("authenticated")).toBe("NENHUM");
    const p = privilegiosDe("service_role");
    for (const priv of ["SELECT", "INSERT", "UPDATE", "DELETE"]) expect(p).toContain(priv);
  });

  it("ler e escrever sob `anon` e `authenticated` é BARRADO com permission denied", () => {
    for (const papel of ["anon", "authenticated"]) {
      for (const cmd of [
        `select email from public.${TABELA}`,
        `insert into public.${TABELA} (provedor, evento_id) values ('stripe', 'evt_sonda')`,
        `update public.${TABELA} set status = 'criada'`,
        `delete from public.${TABELA}`,
      ]) {
        const erro = erroSob(papel, cmd);
        expect(erro, `\`${papel}\` executou "${cmd.slice(0, 30)}" sem erro`).not.toBeNull();
        expect(erro).toContain("permission denied");
      }
    }
  });

  it("a forma: evento_id e sessao_id únicos, status e client_reference_id validados, reentrega ignorada", () => {
    sql(`delete from public.${TABELA} where evento_id like 'evt_9080_%';`);
    sql(`insert into public.${TABELA} (provedor, evento_id) values ('stripe', 'evt_9080_a');`);
    expect(erroSob("service_role", `insert into public.${TABELA} (provedor, evento_id) values ('stripe', 'evt_9080_a')`)).toContain("23505");
    expect(sql(`insert into public.${TABELA} (provedor, evento_id) values ('stripe', 'evt_9080_a') on conflict (evento_id) do nothing returning 1;`).trim()).toBe("");
    expect(erroSob("service_role", `insert into public.${TABELA} (provedor, evento_id, status) values ('stripe', 'evt_9080_b', 'inventado')`)).toContain("cobranca_compras_status_check");
    expect(erroSob("service_role", `insert into public.${TABELA} (provedor, evento_id, client_reference_id) values ('stripe', 'evt_9080_c', 'a b;')`)).toContain("client_reference_id");
    sql(`update public.${TABELA} set sessao_id = 'cs_9080' where evento_id = 'evt_9080_a';`);
    expect(erroSob("service_role", `insert into public.${TABELA} (provedor, evento_id, sessao_id) values ('stripe', 'evt_9080_d', 'cs_9080')`)).toContain("23505");
    sql(`delete from public.${TABELA} where evento_id like 'evt_9080_%';`);
  });
});
