/**
 * 9045 — a porta de SERVIÇO das etiquetas da conversa:
 * `fn_conversa_tags_alterar_servico` (revisão do @Cassio_SecRev, P2).
 *
 * A `crm_manage_tags` (MCP, client de service role) lia, montava no app e
 * regravava a lista: a mesma corrida do PATCH, do lado da IA. Aqui se prova:
 *   - só `service_role` executa (authenticated e anon não);
 *   - service_role com a organização errada é recusado sem tocar a conversa;
 *   - humano (porta da sessão) × IA (porta de serviço) concorrentes preservam as
 *     duas etiquetas, e a IA de fato esperou a trava;
 *   - o núcleo não é executável direto por ninguém.
 * O resto (normalização, remoção só do pedido, teto, guardas da sessão) é de
 * `tags-da-conversa-por-delta-9045.test.ts`.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT ?? 54329}/postgres`,
  max: 4,
});

const org = randomUUID();
const vizinha = randomUUID();
const manager = randomUUID();
const agente = randomUUID();
let canal = "";
let contato = "";

const SQL = "select public.fn_conversa_tags_alterar($1,$2,$3::text[],$4::text[]) as tags";
const SQL_SERVICO =
  "select public.fn_conversa_tags_alterar_servico($1,$2,$3::text[],$4::text[]) as tags";

type Papel = "authenticated" | "service_role" | "anon";

async function abrir(role: Papel, user: string | null) {
  const client = await pool.connect();
  await client.query("begin");
  await client.query(`set local role ${role}`);
  await client.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ role, aal: "aal1", ...(user ? { sub: user } : {}) }),
  ]);
  return client;
}

async function servico(
  role: Papel,
  user: string | null,
  conversa: string,
  adicionar: string[],
  remover: string[] = [],
  o = org,
) {
  const client = await abrir(role, user);
  try {
    const r = await client.query(SQL_SERVICO, [o, conversa, adicionar, remover]);
    await client.query("commit");
    return r.rows[0].tags as string[];
  } catch (erro) {
    await client.query("rollback");
    throw erro;
  } finally {
    client.release();
  }
}

async function tagsDe(conversa: string): Promise<string[]> {
  const { rows } = await pool.query("select tags from conversations where id=$1", [conversa]);
  return rows[0].tags as string[];
}

async function conversa(tags: string[]): Promise<string> {
  const id = randomUUID();
  // Um contato por conversa: a unicidade uniq_conversations_1to1_per_contact_session
  // barra a segunda conversa aberta do mesmo contato no mesmo canal.
  const doContato = randomUUID();
  await pool.query(
    "insert into contacts(id,organization_id,name,display_name,tags) values($1,$2,'9045sc','9045sc','{}')",
    [doContato, org],
  );
  await pool.query(
    "insert into conversations(id,organization_id,contact_id,channel_session_id,status,tags) values($1,$2,$3,$4,'open',$5)",
    [id, org, doContato, canal, tags],
  );
  return id;
}

beforeAll(async () => {
  for (const o of [org, vizinha]) {
    await pool.query(
      "insert into organizations(id,slug,legal_name,display_name) values($1::uuid,$1::text,'9045s','9045s')",
      [o],
    );
  }
  for (const [user, papel] of [
    [manager, "manager"],
    [agente, "agent"],
  ] as const) {
    await pool.query("insert into auth.users(id,email) values($1,$2)", [
      user,
      `${user}@invariant.test`,
    ]);
    await pool.query(
      "insert into user_organizations(user_id,organization_id,role,accepted_at) values($1,$2,$3,now())",
      [user, org, papel],
    );
  }
  canal = (
    await pool.query(
      "insert into channel_sessions(organization_id,waha_session_name,status,webhook_secret_encrypted) values($1,gen_random_uuid()::text,'WORKING',decode('00','hex')) returning id",
      [org],
    )
  ).rows[0].id;
  contato = randomUUID();
  await pool.query(
    "insert into contacts(id,organization_id,name,display_name,tags) values($1,$2,'9045s','9045s','{}')",
    [contato, org],
  );
});

afterAll(() => pool.end());

describe("9045 — porta de serviço das etiquetas da conversa", () => {
  it("porta de serviço: authenticated e anon não executam; service_role aplica na própria org", async () => {
    const id = await conversa(["vip"]);
    await expect(servico("authenticated", manager, id, ["x"])).rejects.toThrow(
      /permission denied for function/,
    );
    await expect(servico("anon", null, id, ["x"])).rejects.toThrow(
      /permission denied for function/,
    );
    expect(await tagsDe(id)).toEqual(["vip"]);
    expect(await servico("service_role", null, id, ["da-ia"], ["vip"])).toEqual(["da-ia"]);
  });

  it("porta de serviço com a org errada é recusada e a conversa não muda", async () => {
    const id = await conversa(["vip"]);
    await expect(servico("service_role", null, id, ["invasao"], [], vizinha)).rejects.toThrow(
      /conversa_nao_encontrada/,
    );
    expect(await tagsDe(id)).toEqual(["vip"]);
  });

  it("humano × IA concorrentes preservam as duas etiquetas", async () => {
    const id = await conversa(["base"]);
    const humano = await abrir("authenticated", agente);
    const ia = await abrir("service_role", null);
    try {
      await humano.query(SQL, [org, id, ["do-humano"], []]);
      let iaTerminou = false;
      const pendente = ia.query(SQL_SERVICO, [org, id, ["da-ia"], []]).then((r) => {
        iaTerminou = true;
        return r;
      });
      // A IA tem de esperar a trava da linha que o humano segura.
      await new Promise((r) => setTimeout(r, 300));
      expect(iaTerminou).toBe(false);
      await humano.query("commit");
      const r = await pendente;
      await ia.query("commit");
      expect(r.rows[0].tags).toEqual(["base", "do-humano", "da-ia"]);
    } finally {
      humano.release();
      ia.release();
    }
    expect(await tagsDe(id)).toEqual(["base", "do-humano", "da-ia"]);
  });

  it("o núcleo não é executável direto por authenticated, anon nem service_role", async () => {
    const { rows } = await pool.query(
      "select has_function_privilege('authenticated',$1,'execute') as auth, has_function_privilege('anon',$1,'execute') as anon, has_function_privilege('service_role',$1,'execute') as servico",
      ["public.fn_conversa_tags_gravar(uuid,uuid,text[],text[],boolean)"],
    );
    expect(rows[0]).toEqual({ auth: false, anon: false, servico: false });
  });
});
