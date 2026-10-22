/**
 * KILL SWITCH DAS CADÊNCIAS (`fn_definir_cadencias_pausadas`) — quem pode.
 *
 * Era executável por `authenticated` porque a rota de pausa chamava pela
 * sessão; a 9065 revogou o grant quando a rota saiu (#254). Este arquivo prova
 * que a superfície fechou.
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
  // Desde a 9065 a função perdeu o EXECUTE de `authenticated`: a rota de pausa
  // (o único call site pela sessão) saiu com a remoção da cadência (#254), e
  // definer volátil sem call site de sessão não fica executável. O que se prova
  // agora é que NENHUMA sessão alcança a escrita — nem o manager com MFA, que
  // antes podia. O corpo da função (MFA, papel, merge) fica para quem a
  // ressuscitar, e volta a ser vigiado junto com o grant.
  it("nem o manager da própria org com MFA executa pela sessão — e nada muda", async () => {
    const [a] = tenants;
    await expect(asRole("authenticated", a!.manager, q, [a!.org, true], "aal2")).rejects.toThrow(/permission denied/);
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
});
