/**
 * KILL SWITCH DAS CADÊNCIAS (`fn_definir_cadencias_pausadas`) — quem pode.
 *
 * A função é executável por `authenticated` DE PROPÓSITO (a rota chama pela
 * sessão), e é ela mesma quem decide: manager da própria organização, suporte de
 * escrita e MFA comprovado. Este arquivo é a prova que a razão escrita em
 * `hardening-definer-varredura.test.ts` cita.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT ?? 54329}/postgres`,
});
const tenants = [0, 1].map(() => ({
  org: randomUUID(),
  manager: randomUUID(),
  agent: randomUUID(),
  viewer: randomUUID(),
}));

async function asRole(role: "anon" | "authenticated", user: string | null, query: string, values: unknown[], aal = "aal1") {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${role}`);
    await client.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ role, aal, ...(user ? { sub: user } : {}) }),
    ]);
    const result = await client.query(query, values);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  for (const tenant of tenants) {
    await pool.query(
      "insert into organizations(id,slug,legal_name,display_name) values($1::uuid,$1::text,'ACL cadência','ACL cadência')",
      [tenant.org],
    );
    for (const role of ["manager", "agent", "viewer"] as const) {
      const user = tenant[role];
      await pool.query("insert into auth.users(id,email) values($1,$2)", [user, `${user}@invariant.test`]);
      await pool.query(
        "insert into user_organizations(user_id,organization_id,role,accepted_at) values($1,$2,$3,now())",
        [user, tenant.org, role],
      );
    }
  }
});
afterAll(() => pool.end());

const q = "select fn_definir_cadencias_pausadas($1,$2) as r";
const pausadas = async (org: string) =>
  (await pool.query("select coalesce((settings->>'cadencias_pausadas')::boolean,false) as p from organizations where id=$1", [org]))
    .rows[0].p as boolean;

describe("kill switch das cadências", () => {
  it("manager da própria org com MFA pausa e retoma", async () => {
    const [a] = tenants;
    const r = await asRole("authenticated", a!.manager, q, [a!.org, true], "aal2");
    expect(r.rows[0].r).toEqual({ pausadas: true, mudou: true });
    expect(await pausadas(a!.org)).toBe(true);
    await asRole("authenticated", a!.manager, q, [a!.org, false], "aal2");
    expect(await pausadas(a!.org)).toBe(false);
  });

  it("recusa agent, viewer, anon e manager de OUTRA org — sem mudar nada", async () => {
    const [a, b] = tenants;
    // Em série: cada tentativa numa transação própria, e o estado conferido no fim.
    await expect(asRole("authenticated", a!.agent, q, [a!.org, true], "aal2")).rejects.toThrow();
    await expect(asRole("authenticated", a!.viewer, q, [a!.org, true], "aal2")).rejects.toThrow();
    await expect(asRole("anon", null, q, [a!.org, true])).rejects.toThrow();
    await expect(asRole("authenticated", b!.manager, q, [a!.org, true], "aal2")).rejects.toThrow();
    expect(await pausadas(a!.org)).toBe(false);
  });

  it("manager COM fator TOTP cadastrado precisa da sessão aal2 (aal1 é recusada)", async () => {
    // `fn_session_mfa_proven` exige aal2 só de quem tem fator verificado — quem
    // nunca cadastrou MFA passa em aal1, regra do produto inteiro. Com o fator:
    const [a] = tenants;
    const fator = randomUUID();
    await pool.query(
      "insert into auth.mfa_factors(id,user_id,status,factor_type) values($1,$2,'verified','totp')",
      [fator, a!.manager],
    );
    try {
      await expect(asRole("authenticated", a!.manager, q, [a!.org, true], "aal1")).rejects.toThrow(/mfa_required/);
      expect(await pausadas(a!.org)).toBe(false);
      // Controle: a MESMA pessoa em aal2 passa.
      await asRole("authenticated", a!.manager, q, [a!.org, false], "aal2");
    } finally {
      await pool.query("delete from auth.mfa_factors where id=$1", [fator]);
    }
  });

  it("grava por merge: as outras chaves de settings ficam", async () => {
    const [, b] = tenants;
    await pool.query("update organizations set settings = coalesce(settings,'{}'::jsonb) || '{\"outra_chave\":42}' where id=$1", [b!.org]);
    await asRole("authenticated", b!.manager, q, [b!.org, true], "aal2");
    const { rows } = await pool.query("select settings from organizations where id=$1", [b!.org]);
    expect(rows[0].settings).toMatchObject({ outra_chave: 42, cadencias_pausadas: true });
  });
});
