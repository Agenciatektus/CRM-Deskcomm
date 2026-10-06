/**
 * 9044 — ETIQUETAS DA CONVERSA POR DELTA: `fn_conversa_tags_alterar`.
 *
 * O PATCH da conversa gravava a lista inteira e quem gravava por último vencia
 * (achado do @Cassio_SecRev). A função aplica acrescentar/remover sobre o valor
 * ATUAL com a linha travada. Este arquivo prova, com JWT real (papel de sessão +
 * claims, o caminho do PostgREST — medir como `postgres` não provaria nada numa
 * `security definer`):
 *
 *   1. duas alterações CONCORRENTES de etiquetas diferentes preservam as duas, e
 *      a segunda de fato esperou a primeira (a trava existe, não foi sorte);
 *   2. remover tira SÓ a etiqueta pedida (controle do LRN da 9038, em que o
 *      excluir apagava todas as etiquetas do registro);
 *   3. `cliente` segue a MESMA regra de `fn_tags_reserva`, que hoje só reserva no
 *      escopo de contato — o controle mostra a regra ligada recusando no contato;
 *   4. outra organização, viewer, service_role e anon são barrados;
 *   5. sessão de suporte em modo leitura é barrada (controle: a mesma em `full`
 *      passa);
 *   6. atendente fora do escopo de visibilidade não alcança a conversa de outro;
 *   7. o teto de 20 recusa crescer (contado sobre a lista JÁ normalizada), e não
 *      impede tirar de uma lista legada;
 *
 * A porta de SERVIÇO (`crm_manage_tags`) está em
 * `tags-da-conversa-servico-9044.test.ts`.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT ?? 54329}/postgres`,
  max: 6,
});

const org = randomUUID();
const vizinha = randomUUID();
const u = {
  manager: randomUUID(),
  agenteA: randomUUID(),
  agenteB: randomUUID(),
  viewer: randomUUID(),
  adminVizinha: randomUUID(),
  suporte: randomUUID(),
};
const sessaoDeSuporte = randomUUID();
const idDoSuporte = randomUUID();
let canal = "";
let contato = "";

const SQL = "select public.fn_conversa_tags_alterar($1,$2,$3::text[],$4::text[]) as tags";

interface Quem {
  role?: "authenticated" | "service_role" | "anon";
  user: string | null;
  sessao?: string;
}

async function abrir(quem: Quem) {
  const client = await pool.connect();
  const role = quem.role ?? "authenticated";
  await client.query("begin");
  await client.query(`set local role ${role}`);
  await client.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({
      role,
      aal: "aal1",
      ...(quem.user ? { sub: quem.user } : {}),
      ...(quem.sessao ? { session_id: quem.sessao } : {}),
    }),
  ]);
  return client;
}

async function alterar(quem: Quem, conversa: string, adicionar: string[], remover: string[] = [], o = org) {
  const client = await abrir(quem);
  try {
    const r = await client.query(SQL, [o, conversa, adicionar, remover]);
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

async function conversa(tags: string[], dono: string | null = null): Promise<string> {
  const id = randomUUID();
  await pool.query(
    "insert into conversations(id,organization_id,contact_id,channel_session_id,status,tags,assigned_to_user_id,assignee_kind) values($1,$2,$3,$4,'open',$5,$6,$7)",
    [id, org, contato, canal, tags, dono, dono ? "user" : null],
  );
  return id;
}

beforeAll(async () => {
  for (const o of [org, vizinha]) {
    await pool.query(
      "insert into organizations(id,slug,legal_name,display_name) values($1::uuid,$1::text,'9044','9044')",
      [o],
    );
  }
  const vinculos: Array<[string, string, string]> = [
    [u.manager, org, "manager"],
    [u.agenteA, org, "agent"],
    [u.agenteB, org, "agent"],
    [u.viewer, org, "viewer"],
    [u.adminVizinha, vizinha, "admin"],
  ];
  for (const id of Object.values(u)) {
    await pool.query("insert into auth.users(id,email) values($1,$2)", [id, `${id}@invariant.test`]);
  }
  for (const [user, o, papel] of vinculos) {
    await pool.query(
      "insert into user_organizations(user_id,organization_id,role,accepted_at) values($1,$2,$3,now())",
      [user, o, papel],
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
    "insert into contacts(id,organization_id,name,display_name,tags) values($1,$2,'9044','9044','{}')",
    [contato, org],
  );
  // Suporte de plataforma SEM vínculo com a organização, começando em leitura.
  await pool.query("insert into auth.sessions(id,user_id,aal) values($1,$2,'aal1')", [sessaoDeSuporte, u.suporte]);
  await pool.query(
    "insert into platform_admins(user_id,granted_by,scope,mfa_required,reason) values($1,$1,'full',false,'9044') on conflict(user_id) do update set scope='full',revoked_at=null,mfa_required=false",
    [u.suporte],
  );
  await pool.query(
    "insert into platform_support_sessions(id,organization_id,actor_user_id,auth_session_id,access_mode,expires_at) values($1,$2,$3,$4,'support_readonly',now()+interval '30 minutes')",
    [idDoSuporte, org, u.suporte, sessaoDeSuporte],
  );
});

afterAll(() => pool.end());

describe("9044 — etiquetas da conversa por delta", () => {
  it("duas alterações concorrentes de etiquetas diferentes preservam as duas", async () => {
    const id = await conversa(["base"]);
    const a = await abrir({ user: u.manager });
    const b = await abrir({ user: u.agenteA });
    try {
      await a.query(SQL, [org, id, ["de-a"], []]);
      let bTerminou = false;
      const pendente = b.query(SQL, [org, id, ["de-b"], []]).then((r) => {
        bTerminou = true;
        return r;
      });
      // B tem de ESPERAR a trava da linha. Se terminasse antes do commit de A,
      // teria lido a lista sem `de-a` — e a prova de concorrência seria sorte.
      await new Promise((r) => setTimeout(r, 300));
      expect(bTerminou).toBe(false);
      await a.query("commit");
      const rb = await pendente;
      await b.query("commit");
      expect(rb.rows[0].tags).toEqual(["base", "de-a", "de-b"]);
    } finally {
      a.release();
      b.release();
    }
    expect(await tagsDe(id)).toEqual(["base", "de-a", "de-b"]);
  });

  it("remover tira SÓ a etiqueta pedida (controle do LRN da 9038)", async () => {
    const id = await conversa(["cliente", "vip", "inadimplente"]);
    expect(await alterar({ user: u.manager }, id, [], ["vip"])).toEqual(["cliente", "inadimplente"]);
    expect(await tagsDe(id)).toEqual(["cliente", "inadimplente"]);
  });

  it("remover casa sem caixa e acrescentar normaliza e não duplica", async () => {
    const id = await conversa(["VIP", "Frio"]);
    expect(await alterar({ user: u.manager }, id, [" Quente ", "frio"], ["vip"])).toEqual(["frio", "quente"]);
    expect(await tagsDe(id)).toEqual(["frio", "quente"]);
  });

  it("acrescentar e remover a mesma etiqueta, ou delta vazio, é recusado", async () => {
    const id = await conversa(["vip"]);
    await expect(alterar({ user: u.manager }, id, ["vip"], ["vip"])).rejects.toThrow(/tags_delta_invalido/);
    await expect(alterar({ user: u.manager }, id, [], [])).rejects.toThrow(/tags_delta_invalido/);
    await expect(alterar({ user: u.manager }, id, ["a".repeat(41)])).rejects.toThrow(/tags_delta_invalido/);
    expect(await tagsDe(id)).toEqual(["vip"]);
  });

  it("`cliente` segue a regra de fn_tags_reserva: reservada no contato, livre na conversa", async () => {
    await pool.query(
      "update organizations set settings = jsonb_set(coalesce(settings,'{}'::jsonb),'{crm}', '{\"cliente_pela_agenda\": true}'::jsonb) where id=$1",
      [org],
    );
    try {
      // Controle: a regra está LIGADA, e a reserva recusa no escopo de contato.
      await expect(
        pool.query("select public.fn_tags_reserva($1,'contato',array['cliente'])", [org]),
      ).rejects.toThrow(/tags_etiqueta_do_sistema/);
      // A mesma reserva, no escopo da conversa, não recusa — e a função também não.
      await pool.query("select public.fn_tags_reserva($1,'conversa',array['cliente'])", [org]);
      const id = await conversa(["vip"]);
      expect(await alterar({ user: u.agenteA }, id, ["cliente"])).toEqual(["vip", "cliente"]);
      expect(await alterar({ user: u.agenteA }, id, [], ["cliente"])).toEqual(["vip"]);
      // E o contato (onde a posse de `cliente` mora) não foi tocado.
      const { rows } = await pool.query("select tags, client_tag_by_system from contacts where id=$1", [contato]);
      expect(rows[0]).toEqual({ tags: [], client_tag_by_system: null });
    } finally {
      await pool.query("update organizations set settings = settings - 'crm' where id=$1", [org]);
    }
  });

  it("admin de OUTRA organização é barrado e a conversa não muda", async () => {
    const id = await conversa(["vip"]);
    await expect(alterar({ user: u.adminVizinha }, id, ["invasao"])).rejects.toThrow(/tags_forbidden/);
    // Nem passando a própria organização: a conversa não é dela.
    await expect(alterar({ user: u.adminVizinha }, id, ["invasao"], [], vizinha)).rejects.toThrow(
      /conversa_nao_encontrada/,
    );
    expect(await tagsDe(id)).toEqual(["vip"]);
  });

  it("viewer é barrado; service_role e anon não têm EXECUTE na porta da sessão", async () => {
    const id = await conversa(["vip"]);
    await expect(alterar({ user: u.viewer }, id, ["x"])).rejects.toThrow(/tags_forbidden/);
    // P3 do Cassio: a porta da sessão não tem grant para service_role (a guarda
    // recusaria de qualquer jeito, por `auth.uid()` nulo).
    await expect(alterar({ role: "service_role", user: null }, id, ["x"])).rejects.toThrow(
      /permission denied for function/,
    );
    await expect(alterar({ role: "anon", user: null }, id, ["x"])).rejects.toThrow(/permission denied for function/);
    expect(await tagsDe(id)).toEqual(["vip"]);
  });

  it("suporte em modo leitura é barrado; a mesma sessão em `full` passa (controle)", async () => {
    const id = await conversa(["vip"]);
    const suporte = { user: u.suporte, sessao: sessaoDeSuporte };
    await expect(alterar(suporte, id, ["suporte"])).rejects.toThrow(/tags_forbidden/);
    expect(await tagsDe(id)).toEqual(["vip"]);
    await pool.query("update platform_support_sessions set access_mode='full' where id=$1", [idDoSuporte]);
    try {
      expect(await alterar(suporte, id, ["suporte"])).toEqual(["vip", "suporte"]);
    } finally {
      await pool.query("update platform_support_sessions set access_mode='support_readonly' where id=$1", [idDoSuporte]);
    }
  });

  it("atendente no modo own_and_unassigned não alcança a conversa de outro atendente", async () => {
    const doA = await conversa(["vip"], u.agenteA);
    await expect(alterar({ user: u.agenteB }, doA, ["intruso"])).rejects.toThrow(/conversa_nao_encontrada/);
    expect(await tagsDe(doA)).toEqual(["vip"]);
    // Controles: o dono alcança, e B alcança a sem dono.
    expect(await alterar({ user: u.agenteA }, doA, ["do-dono"])).toEqual(["vip", "do-dono"]);
    const semDono = await conversa([]);
    expect(await alterar({ user: u.agenteB }, semDono, ["livre"])).toEqual(["livre"]);
  });

  it("o teto de 20 recusa crescer, e não impede tirar de uma lista legada maior", async () => {
    const vinte = Array.from({ length: 20 }, (_, i) => `t${i}`);
    const cheia = await conversa(vinte);
    await expect(alterar({ user: u.manager }, cheia, ["t20"])).rejects.toThrow(/tags_limite/);
    expect(await tagsDe(cheia)).toEqual(vinte);
    const legada = await conversa([...vinte, "t20", "t21"]);
    expect(await alterar({ user: u.manager }, legada, [], ["t0"])).toHaveLength(21);
  });

  it("o teto conta a lista JÁ normalizada, não a crua", async () => {
    const dezoito = Array.from({ length: 18 }, (_, i) => `t${i}`);
    // Crua com 21 (VIP e vip contam duas), normalizada com 20: acrescentar cresce.
    const legada = await conversa(["VIP", "vip", "outra", ...dezoito]);
    await expect(alterar({ user: u.manager }, legada, ["nova"])).rejects.toThrow(/tags_limite/);
    // Crua com 20, normalizada com 19: cabe mais uma.
    const comPar = await conversa(["A", "a", ...dezoito]);
    expect(await alterar({ user: u.manager }, comPar, ["nova"])).toHaveLength(20);
  });

  it.each([
    "public.fn_conversa_tags_aplicar(text[],text[],text[])",
    "public.fn_conversa_tags_gravar(uuid,uuid,text[],text[],boolean)",
  ])("%s não é executável por authenticated nem por anon", async (fn) => {
    const { rows } = await pool.query(
      "select has_function_privilege('authenticated',$1,'execute') as auth, has_function_privilege('anon',$1,'execute') as anon",
      [fn],
    );
    expect(rows[0]).toEqual({ auth: false, anon: false });
  });
});
