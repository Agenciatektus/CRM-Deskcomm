/**
 * A CADÊNCIA SÓ SE ESCREVE PELO SERVIDOR (migration 9020) — contra Postgres real.
 *
 * As tabelas do motor de follow-up têm RLS por organização SEM papel, e
 * `authenticated` tem INSERT/UPDATE. Sem os triggers da 9020, um viewer gravava a
 * condução da IA na versão ativa, inseria inscrição de cadência ou mexia na
 * cadência direto pelo PostgREST. Aqui:
 *   - viewer e manager (via JWT) recebem 42501 COM a mensagem do trigger — a
 *     mensagem distingue o trigger do 42501 da própria RLS:
 *       · versões: QUALQUER escrita (cadência ou não — versão é histórico e só o
 *         servidor publica);
 *       · inscrição de cadência: INSERT, UPDATE (reativar, mover) e DELETE; só o
 *         cancelamento de régua viva passa (a cascata LGPD roda pela sessão);
 *       · ponteiro de cadência: criar, status, política, versão ativa, surface,
 *         gatilho, política de handoff;
 *   - `service_role` passa;
 *   - CONTROLE: o fluxo comum continua PUBLICÁVEL pelo caminho oficial
 *     (`fn_publish_followup_flow_version` como service_role) e gravável pelo
 *     manager no que não é versão (inscrição, status); o nome de uma cadência
 *     também.
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

async function inscricaoDeCadencia(status: "active" | "cancelled"): Promise<string> {
  return (
    await pool.query(
      `insert into followup_enrollments
         (organization_id, pointer_id, version_id, contact_id, current_node_id, status, next_eval_at, completed_at)
       values ($1,$2,$3,$4,'a1',$5,
               case when $5 = 'active' then now() + interval '1 hour' end,
               case when $5 = 'cancelled' then now() end)
       returning id`,
      [f.org, f.cadPointer, f.cadVersion, await contato(), status],
    )
  ).rows[0].id as string;
}

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

  it("1b) nenhuma escrita de versão: graph da cadência, versão nova, versão comum, DELETE", async () => {
    await recusa(
      como("authenticated", user(), "update followup_flow_versions set graph = '{\"x\":1}'::jsonb where id = $1", [
        f.cadVersion,
      ]),
    );
    await recusa(
      como(
        "authenticated",
        user(),
        "insert into followup_flow_versions (organization_id, pointer_id, graph) values ($1,$2,'{}'::jsonb)",
        [f.org, f.cadPointer],
      ),
    );
    await recusa(
      como("authenticated", user(), "update followup_flow_versions set graph = '{\"x\":1}'::jsonb where id = $1", [
        f.comVersion,
      ]),
    );
    await recusa(como("authenticated", user(), "delete from followup_flow_versions where id = $1", [f.comVersion]));
  });

  it("2) não insere inscrição de cadência", async () => {
    await recusa(como("authenticated", user(), inscricao, [f.org, f.cadPointer, f.cadVersion, await contato()]));
  });

  it("2b) não reativa inscrição de cadência cancelada, não a move de nó, não a apaga", async () => {
    const cancelada = await inscricaoDeCadencia("cancelled");
    await recusa(
      como(
        "authenticated",
        user(),
        "update followup_enrollments set status = 'active', next_eval_at = now(), completed_at = null where id = $1",
        [cancelada],
      ),
    );
    const viva = await inscricaoDeCadencia("active");
    await recusa(
      como("authenticated", user(), "update followup_enrollments set current_node_id = 'b2' where id = $1", [viva]),
    );
    await recusa(como("authenticated", user(), "delete from followup_enrollments where id = $1", [viva]));
  });

  it("2c) EXCEÇÃO: cancelar uma régua viva de cadência passa (cascata LGPD pela sessão)", async () => {
    const viva = await inscricaoDeCadencia("active");
    const r = await como(
      "authenticated",
      user(),
      `update followup_enrollments
          set status = 'cancelled', cancel_reason = 'lgpd', completed_at = now(), next_eval_at = null, claimed_until = null
        where id = $1 returning id`,
      [viva],
    );
    expect(r.rows).toHaveLength(1);
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
        `update followup_flow_pointers set trigger_config = '{"kind":"manual","cancel_on_reply":false}'::jsonb where id = $1`,
        [f.cadPointer],
      ),
    );
    await recusa(
      como("authenticated", user(), "update followup_flow_pointers set handoff_policy = 'allow' where id = $1", [
        f.cadPointer,
      ]),
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
  it("anon não altera a versão da cadência (recusado antes de tocar a linha)", async () => {
    // O que importa é a linha INTACTA, não o jeito da recusa: medido no gate,
    // anon nem chega a 0 linhas — a policy chama `fn_user_org_ids()`, que anon
    // não executa, e o Postgres recusa com "permission denied for function".
    await como("anon", null, "update followup_flow_versions set cadence_conducao = '{}'::jsonb where id = $1", [
      f.cadVersion,
    ]).catch((e: { code?: string }) => {
      expect(e.code).toBe("42501");
    });
    const r = await pool.query("select cadence_conducao from followup_flow_versions where id = $1", [f.cadVersion]);
    expect(r.rows[0].cadence_conducao).toEqual({ quem_atende: "atendente" });
  });

  it("service_role passa em todos", async () => {
    await como("service_role", null, "update followup_flow_versions set cadence_conducao = $2 where id = $1", [
      f.cadVersion,
      { quem_atende: "atendente" },
    ]);
    await como("service_role", null, "update followup_flow_versions set graph = '{}'::jsonb where id = $1", [f.cadVersion]);
    const cancelada = await inscricaoDeCadencia("cancelled");
    await como(
      "service_role",
      null,
      "update followup_enrollments set status = 'active', next_eval_at = now() + interval '1 hour', completed_at = null where id = $1",
      [cancelada],
    );
    await como(
      "service_role",
      null,
      `update followup_flow_pointers set trigger_config = '{"kind":"manual","cancel_on_reply":true}'::jsonb where id = $1`,
      [f.cadPointer],
    );
    await como("service_role", null, inscricao, [f.org, f.cadPointer, f.cadVersion, await contato()]);
    await como("service_role", null, "update followup_flow_pointers set cadence_settings = '{}'::jsonb where id = $1", [
      f.cadPointer,
    ]);
  });

  it("fluxo COMUM continua gravável pelo manager no que não é versão (inscrição, status, gatilho)", async () => {
    const r = await como("authenticated", f.manager, inscricao, [f.org, f.comPointer, f.comVersion, await contato()]);
    expect(r.rows).toHaveLength(1);
    await como("authenticated", f.manager, "update followup_enrollments set current_node_id = 'b2' where id = $1", [
      r.rows[0].id,
    ]);
    await como("authenticated", f.manager, "update followup_flow_pointers set status = 'disabled' where id = $1", [
      f.comPointer,
    ]);
    await como("authenticated", f.manager, "update followup_flow_pointers set handoff_policy = 'cancel' where id = $1", [
      f.comPointer,
    ]);
    const p = await pool.query("select status, handoff_policy from followup_flow_pointers where id = $1", [f.comPointer]);
    expect(p.rows[0]).toEqual({ status: "disabled", handoff_policy: "cancel" });
  });

  it("fluxo COMUM continua PUBLICÁVEL pelo caminho oficial (fn_publish_followup_flow_version como service_role)", async () => {
    const r = await como(
      "service_role",
      null,
      "select fn_publish_followup_flow_version($1,$2,'{}'::jsonb,null) as v",
      [f.org, f.comPointer],
    );
    const v = r.rows[0].v as string;
    const p = await pool.query("select active_version_id from followup_flow_pointers where id = $1", [f.comPointer]);
    expect(p.rows[0].active_version_id).toBe(v);
  });

  it("numa cadência, o nome (o que a rota genérica muda) continua gravável", async () => {
    const r = await como("authenticated", f.manager, "update followup_flow_pointers set name = $2 where id = $1 returning id", [
      f.cadPointer,
      `renomeada-${randomUUID()}`,
    ]);
    expect(r.rows).toHaveLength(1);
  });
});
