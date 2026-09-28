/**
 * A CADÊNCIA SÓ SE ESCREVE PELO SERVIDOR (migration 9020) — contra Postgres real.
 *
 * As tabelas do motor de follow-up têm RLS por organização SEM papel, e
 * `authenticated` tem INSERT/UPDATE. Sem os triggers da 9020, um viewer gravava a
 * condução da IA na versão ativa, inseria inscrição de cadência ou mexia na
 * cadência direto pelo PostgREST. Aqui:
 *   - viewer e manager (via JWT) recebem 42501 COM a mensagem do trigger nos três
 *     casos — a mensagem distingue o trigger do 42501 da própria RLS;
 *   - `service_role` passa;
 *   - CONTROLE: o fluxo comum (surface `followup`) continua gravável pelo mesmo
 *     usuário, e o que a rota genérica pode mudar numa cadência (nome) também.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT ?? 54329}/postgres`,
});

const MENSAGEM = /cadencia_escrita_so_pelo_servidor/;

const f = {
  org: randomUUID(),
  viewer: randomUUID(),
  manager: randomUUID(),
  cadPointer: "",
  cadVersion: "",
  comPointer: "",
  comVersion: "",
};

type Papel = "authenticated" | "anon" | "service_role";

async function como(role: Papel, user: string | null, query: string, values: unknown[] = []) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${role}`);
    await client.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ role, ...(user ? { sub: user } : {}) }),
    ]);
    const r = await client.query(query, values);
    await client.query("commit");
    return r;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function contato(): Promise<string> {
  const id = randomUUID();
  await pool.query("insert into contacts(id,organization_id,display_name) values($1,$2,'Lead')", [id, f.org]);
  return id;
}

async function recusa(p: Promise<unknown>) {
  const erro = (await p.then(
    () => null,
    (e: unknown) => e,
  )) as { code?: string; message?: string } | null;
  expect(erro, "a escrita deveria ter sido recusada").not.toBeNull();
  expect(erro!.code).toBe("42501");
  expect(erro!.message).toMatch(MENSAGEM);
}

beforeAll(async () => {
  await pool.query(
    "insert into organizations(id,slug,legal_name,display_name) values($1::uuid,$1::text,'Escrita cadência','Escrita cadência')",
    [f.org],
  );
  for (const [user, role] of [
    [f.viewer, "viewer"],
    [f.manager, "manager"],
  ] as const) {
    await pool.query("insert into auth.users(id,email) values($1,$2)", [user, `${user}@invariant.test`]);
    await pool.query(
      "insert into user_organizations(user_id,organization_id,role,accepted_at) values($1,$2,$3,now())",
      [user, f.org, role],
    );
  }
  f.cadPointer = (
    await pool.query(
      "insert into followup_flow_pointers (organization_id, name, surface) values ($1,$2,'cadence') returning id",
      [f.org, `cad-${randomUUID()}`],
    )
  ).rows[0].id;
  f.cadVersion = (
    await pool.query(
      "insert into followup_flow_versions (organization_id, pointer_id, graph, cadence_conducao) values ($1,$2,'{}'::jsonb,$3) returning id",
      [f.org, f.cadPointer, { quem_atende: "atendente" }],
    )
  ).rows[0].id;
  f.comPointer = (
    await pool.query(
      "insert into followup_flow_pointers (organization_id, name, surface) values ($1,$2,'followup') returning id",
      [f.org, `com-${randomUUID()}`],
    )
  ).rows[0].id;
  f.comVersion = (
    await pool.query(
      "insert into followup_flow_versions (organization_id, pointer_id, graph) values ($1,$2,'{}'::jsonb) returning id",
      [f.org, f.comPointer],
    )
  ).rows[0].id;
});
afterAll(() => pool.end());

const inscricao = `insert into followup_enrollments
  (organization_id, pointer_id, version_id, contact_id, current_node_id, status, next_eval_at)
  values ($1,$2,$3,$4,'a1','active', now() + interval '1 hour') returning id`;

describe.each([
  ["viewer", () => f.viewer],
  ["manager", () => f.manager],
])("%s via JWT", (_papel, user) => {
  it("1) não grava cadence_conducao na versão (UPDATE e INSERT)", async () => {
    await recusa(
      como("authenticated", user(), "update followup_flow_versions set cadence_conducao = $2 where id = $1", [
        f.cadVersion,
        { quem_atende: "ia", agent_id: randomUUID() },
      ]),
    );
    await recusa(
      como(
        "authenticated",
        user(),
        "insert into followup_flow_versions (organization_id, pointer_id, graph, cadence_conducao) values ($1,$2,'{}'::jsonb,$3)",
        [f.org, f.cadPointer, { quem_atende: "ia" }],
      ),
    );
  });

  it("2) não insere inscrição de cadência", async () => {
    await recusa(como("authenticated", user(), inscricao, [f.org, f.cadPointer, f.cadVersion, await contato()]));
  });

  it("3) não cria cadência nem muda status/política/versão ativa dela", async () => {
    await recusa(
      como("authenticated", user(), "update followup_flow_pointers set status = 'disabled' where id = $1", [f.cadPointer]),
    );
    await recusa(
      como("authenticated", user(), "update followup_flow_pointers set cadence_settings = '{}'::jsonb where id = $1", [
        f.cadPointer,
      ]),
    );
    await recusa(
      como("authenticated", user(), "update followup_flow_pointers set active_version_id = $2 where id = $1", [
        f.cadPointer,
        f.cadVersion,
      ]),
    );
    await recusa(
      como("authenticated", user(), "update followup_flow_pointers set surface = 'cadence' where id = $1", [f.comPointer]),
    );
    await recusa(
      como(
        "authenticated",
        user(),
        "insert into followup_flow_pointers (organization_id, name, surface) values ($1,$2,'cadence')",
        [f.org, `forjada-${randomUUID()}`],
      ),
    );
  });
});

describe("controles", () => {
  it("anon não altera a versão da cadência (a RLS nem deixa ver a linha)", async () => {
    await expect(
      como("anon", null, "update followup_flow_versions set cadence_conducao = '{}'::jsonb where id = $1", [f.cadVersion]),
    ).resolves.toBeDefined(); // RLS: anon não enxerga a linha → 0 linhas, sem escrita
    const r = await pool.query("select cadence_conducao from followup_flow_versions where id = $1", [f.cadVersion]);
    expect(r.rows[0].cadence_conducao).toEqual({ quem_atende: "atendente" });
  });

  it("service_role passa nos três", async () => {
    await como("service_role", null, "update followup_flow_versions set cadence_conducao = $2 where id = $1", [
      f.cadVersion,
      { quem_atende: "atendente" },
    ]);
    await como("service_role", null, inscricao, [f.org, f.cadPointer, f.cadVersion, await contato()]);
    await como("service_role", null, "update followup_flow_pointers set cadence_settings = '{}'::jsonb where id = $1", [
      f.cadPointer,
    ]);
  });

  it("fluxo COMUM continua gravável pelo manager (inscrição, status, versão)", async () => {
    const r = await como("authenticated", f.manager, inscricao, [f.org, f.comPointer, f.comVersion, await contato()]);
    expect(r.rows).toHaveLength(1);
    await como("authenticated", f.manager, "update followup_flow_pointers set status = 'disabled' where id = $1", [
      f.comPointer,
    ]);
    await como("authenticated", f.manager, "update followup_flow_versions set graph = '{\"a\":1}'::jsonb where id = $1", [
      f.comVersion,
    ]);
    const p = await pool.query("select status from followup_flow_pointers where id = $1", [f.comPointer]);
    expect(p.rows[0].status).toBe("disabled");
  });

  it("numa cadência, o nome (o que a rota genérica muda) continua gravável", async () => {
    const r = await como("authenticated", f.manager, "update followup_flow_pointers set name = $2 where id = $1 returning id", [
      f.cadPointer,
      `renomeada-${randomUUID()}`,
    ]);
    expect(r.rows).toHaveLength(1);
  });
});
