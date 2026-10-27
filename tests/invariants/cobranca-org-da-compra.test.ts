import { afterAll, describe, expect, it } from "vitest";

import { motivoDoErro, sql } from "./psql-transporte";

/**
 * `fn_cobranca_org_da_compra` (migration 9081) cria a empresa e a assinatura de
 * uma compra por link de pagamento. É SERVER-SIDE ONLY (security definer, sem
 * execute para anon/authenticated) e REENTRANTE: a compra é travada com
 * `for update` e, já ligada a uma empresa, devolve a mesma.
 */

const ASSINATURA_FN = "public.fn_cobranca_org_da_compra(uuid, text, text, uuid, text, text, text)";
const SUF = Math.random().toString(36).slice(2, 10);
const PLANO = "00000000-0000-4000-8000-0000000090a1";
const COMPRA_A = "00000000-0000-4000-8000-0000000090b1";
const COMPRA_B = "00000000-0000-4000-8000-0000000090b2";
const CLIENTE_A = `cus_sonda_a_${SUF}`;

function chama(compra: string, slug: string, cliente: string): string {
  return `select public.fn_cobranca_org_da_compra('${compra}', 'Empresa Sonda ${SUF}', '${slug}', '${PLANO}', 'teste', '${cliente}', 'sub_${cliente}')`;
}

function erroDe(comando: string): string | null {
  try {
    sql(comando);
    return null;
  } catch (err) {
    return motivoDoErro(err);
  }
}

function erroSob(papel: string, comando: string): string | null {
  return erroDe(`set role ${papel};\n${comando};\nreset role;`);
}

function limpa(): void {
  sql(`
    delete from public.cobranca_assinaturas where organization_id in
      (select id from public.organizations where slug::text like 'sonda-compra-${SUF}%');
    delete from public.cobranca_compras where id in ('${COMPRA_A}', '${COMPRA_B}');
    delete from public.organizations where slug::text like 'sonda-compra-${SUF}%';
    delete from public.cobranca_planos where id = '${PLANO}';
  `);
}

describe("a compra por link de pagamento vira empresa, uma vez só", () => {
  afterAll(() => limpa());

  it("anon e authenticated não executam a função", () => {
    for (const papel of ["anon", "authenticated"]) {
      const erro = erroSob(papel, chama(COMPRA_A, `sonda-compra-${SUF}`, CLIENTE_A));
      expect(erro, `\`${papel}\` executou ${ASSINATURA_FN}`).not.toBeNull();
      expect(erro).toContain("permission denied");
    }
  });

  it("compra inexistente é erro", () => {
    const erro = erroDe(chama(COMPRA_A, `sonda-compra-${SUF}`, CLIENTE_A));
    expect(erro).not.toBeNull();
    expect(erro).toContain("compra_inexistente");
  });

  it("duas chamadas com a mesma compra devolvem a mesma empresa e criam uma só", () => {
    sql(`
      insert into public.cobranca_planos (id, nome, preco_cents, intervalo, trial_dias)
        values ('${PLANO}', 'Plano sonda', 1000, 'mes', 0);
      insert into public.cobranca_compras (id, provedor, evento_id)
        values ('${COMPRA_A}', 'stripe', 'evt_sonda_a_${SUF}');
    `);
    const a = sql(chama(COMPRA_A, `sonda-compra-${SUF}`, CLIENTE_A));
    const b = sql(chama(COMPRA_A, `sonda-compra-${SUF}`, CLIENTE_A));
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(b).toBe(a);
    expect(sql(`select count(*) from public.organizations where slug::text = 'sonda-compra-${SUF}';`)).toBe("1");
    expect(sql(`select count(*) from public.cobranca_assinaturas where provedor_cliente_id = '${CLIENTE_A}';`)).toBe("1");
    expect(
      sql(`select status || ':' || (organization_id = '${a}')::text from public.cobranca_compras where id = '${COMPRA_A}';`),
    ).toBe("criada:true");
    expect(sql(`select estado || ':' || provedor || ':' || modo from public.cobranca_assinaturas where organization_id = '${a}';`)).toBe(
      "ativa:stripe:teste",
    );
  });

  it("cliente do provedor já ligado a outra empresa é 23505 e nada fica gravado", () => {
    sql(`insert into public.cobranca_compras (id, provedor, evento_id) values ('${COMPRA_B}', 'stripe', 'evt_sonda_b_${SUF}');`);
    const erro = erroDe(chama(COMPRA_B, `sonda-compra-${SUF}-b`, CLIENTE_A));
    expect(erro).not.toBeNull();
    expect(erro).toMatch(/23505|duplicate key|cobranca_assinaturas_cliente/);
    expect(sql(`select count(*) from public.organizations where slug::text = 'sonda-compra-${SUF}-b';`)).toBe("0");
    expect(sql(`select coalesce(organization_id::text, 'NULO') || ':' || status from public.cobranca_compras where id = '${COMPRA_B}';`)).toBe(
      "NULO:recebida",
    );
  });

  it("slug de outra empresa é recusado", () => {
    const erro = erroDe(chama(COMPRA_B, `sonda-compra-${SUF}`, `cus_sonda_c_${SUF}`));
    expect(erro).not.toBeNull();
    expect(erro).toContain("slug_em_uso");
  });
});
