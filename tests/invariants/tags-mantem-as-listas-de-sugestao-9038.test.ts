/**
 * 9038 — a operação da tela de Tags mantém as QUATRO listas de sugestão e
 * respeita a etiqueta `cliente` reservada.
 *
 * Desde a 9038 a tela de Tags é a única tela de etiquetas: renomear, juntar e
 * excluir saem só por `fn_vocabulario_de_tags_operar`. A 0336 conhecia
 * `settings.tags` e `settings.canonical_conversation_tags`; as três listas que a
 * 9005 criou (`archived_conversation_tags`, `canonical_contact_tags`,
 * `archived_contact_tags`) ficavam com o nome antigo, e a etiqueta `cliente`
 * (0262) podia ser renomeada, juntada ou excluída mesmo com a regra da agenda
 * ligada.
 *
 * Chamado com a SESSÃO do usuário (`set local role authenticated` + claims): a
 * função é `security definer`, e medir como `postgres` não provaria nada sobre
 * papel.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT ?? 54329}/postgres`,
  max: 5,
});

const org = randomUUID();
const manager = randomUUID();
const viewer = randomUUID();
const contato = randomUUID();

interface Listas {
  canonical_conversation_tags?: string[];
  archived_conversation_tags?: string[];
  canonical_contact_tags?: string[];
  archived_contact_tags?: string[];
  tags?: unknown[];
  crm?: Record<string, unknown>;
}

async function como(user: string, sql: string, valores: unknown[] = []) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub: user, role: "authenticated", aal: "aal2" }),
    ]);
    const r = await client.query(sql, valores);
    await client.query("commit");
    return r;
  } catch (erro) {
    await client.query("rollback");
    throw erro;
  } finally {
    client.release();
  }
}

function operar(acao: string, tag: string, destino: string | null, user = manager) {
  return como(user, "select public.fn_vocabulario_de_tags_operar($1,$2,$3,$4) as r", [
    org,
    acao,
    tag,
    destino,
  ]);
}

async function settings(): Promise<Listas> {
  const { rows } = await pool.query("select settings from organizations where id=$1", [org]);
  return (rows[0]?.settings ?? {}) as Listas;
}

async function definirSettings(s: Listas) {
  await pool.query("update organizations set settings=$2::jsonb where id=$1", [org, JSON.stringify(s)]);
}

async function tagsDoContato(): Promise<string[]> {
  const { rows } = await pool.query("select tags from contacts where id=$1", [contato]);
  return (rows[0]?.tags ?? []) as string[];
}

beforeAll(async () => {
  await pool.query(
    "insert into organizations(id,slug,legal_name,display_name) values($1::uuid,$1::text,'9038','9038')",
    [org],
  );
  for (const [user, papel] of [
    [manager, "manager"],
    [viewer, "viewer"],
  ] as const) {
    await pool.query("insert into auth.users(id,email) values($1,$2)", [user, `${user}@invariant.test`]);
    await pool.query(
      "insert into user_organizations(user_id,organization_id,role,accepted_at) values($1,$2,$3,now())",
      [user, org, papel],
    );
  }
  await pool.query(
    "insert into contacts(id,organization_id,name,display_name,tags) values($1,$2,'9038','9038','{}')",
    [contato, org],
  );
});

beforeEach(async () => {
  await pool.query("update contacts set tags='{}', client_tag_by_system=null where id=$1", [contato]);
});

afterAll(() => pool.end());

describe("9038 — as quatro listas de sugestão", () => {
  it("renomear troca o nome nas quatro listas e no vocabulário curado", async () => {
    await definirSettings({
      tags: [{ tag: "vip", cor: "#ffb224" }],
      canonical_conversation_tags: ["vip", "urgente"],
      archived_conversation_tags: ["vip"],
      canonical_contact_tags: ["vip"],
      archived_contact_tags: ["vip", "antigo"],
    });
    await pool.query("update contacts set tags=array['vip'] where id=$1", [contato]);

    await operar("renomear", "vip", "cliente vip");

    const s = await settings();
    // Sugerida vence arquivada no mesmo escopo: "cliente vip" sai das arquivadas
    // de conversa e de contato, porque continua sugerida nos dois.
    expect(s.canonical_conversation_tags).toEqual(["cliente vip", "urgente"]);
    expect(s.archived_conversation_tags).toEqual([]);
    expect(s.canonical_contact_tags).toEqual(["cliente vip"]);
    expect(s.archived_contact_tags).toEqual(["antigo"]);
    // A cor sobrevive ao rename (comportamento da 0336, mantido).
    expect(s.tags).toEqual([{ tag: "cliente vip", cor: "#ffb224" }]);
    expect(await tagsDoContato()).toEqual(["cliente vip"]);
  });

  it("juntar origem arquivada em destino sugerido deixa o destino sugerido e fora das arquivadas", async () => {
    await definirSettings({
      canonical_contact_tags: ["premium"],
      archived_contact_tags: ["ouro"],
    });
    await pool.query("update contacts set tags=array['ouro','premium'] where id=$1", [contato]);

    await operar("juntar", "ouro", "premium");

    const s = await settings();
    expect(s.canonical_contact_tags).toEqual(["premium"]);
    expect(s.archived_contact_tags).toEqual([]);
    expect(await tagsDoContato()).toEqual(["premium"]);
  });

  it("excluir tira SÓ a etiqueta excluída das quatro listas e do vocabulário curado", async () => {
    // O defeito (5) da 0336: `when v_remover then null` sem casar o nome
    // esvaziava `settings.tags` (todas as cores) e as sugestões de conversa.
    await definirSettings({
      tags: [{ tag: "teste", cor: "#e54d2e" }, { tag: "reclamação", cor: "#ffb224" }],
      canonical_conversation_tags: ["teste", "duvida"],
      archived_conversation_tags: ["teste"],
      canonical_contact_tags: ["teste"],
      archived_contact_tags: ["teste"],
    });

    await operar("excluir", "teste", null);

    const s = await settings();
    expect(s.canonical_conversation_tags).toEqual(["duvida"]);
    expect(s.archived_conversation_tags).toEqual([]);
    expect(s.canonical_contact_tags).toEqual([]);
    expect(s.archived_contact_tags).toEqual([]);
    // A cor de OUTRA etiqueta sobrevive.
    expect(s.tags).toEqual([{ tag: "reclamação", cor: "#ffb224" }]);
  });

  it("lista que a organização nunca teve continua sem existir", async () => {
    await definirSettings({ canonical_conversation_tags: ["a"] });

    await operar("renomear", "a", "b");

    const s = await settings();
    expect(s.canonical_conversation_tags).toEqual(["b"]);
    expect("archived_conversation_tags" in s).toBe(false);
    expect("canonical_contact_tags" in s).toBe(false);
    expect("archived_contact_tags" in s).toBe(false);
  });

  it("compara sem diferenciar maiúsculas, a régua de fn_tags_normalizar", async () => {
    await definirSettings({ canonical_contact_tags: ["VIP"], archived_contact_tags: [] });

    await operar("renomear", "vip", "especial");

    expect((await settings()).canonical_contact_tags).toEqual(["especial"]);
  });
});

describe("9038 — a etiqueta cliente reservada", () => {
  it("com a regra da agenda LIGADA, renomear, juntar e excluir cliente são recusados e nada muda", async () => {
    const antes: Listas = {
      crm: { cliente_pela_agenda: true },
      canonical_contact_tags: ["cliente", "vip"],
    };
    await definirSettings(antes);
    await pool.query("update contacts set tags=array['cliente','vip'] where id=$1", [contato]);

    await expect(operar("renomear", "cliente", "paciente")).rejects.toThrow(/tags_etiqueta_do_sistema/);
    await expect(operar("juntar", "cliente", "vip")).rejects.toThrow(/tags_etiqueta_do_sistema/);
    // Como DESTINO também: juntar `vip` em `cliente` mudaria a presença de
    // `cliente` em quem só tinha `vip`.
    await expect(operar("juntar", "vip", "cliente")).rejects.toThrow(/tags_etiqueta_do_sistema/);
    await expect(operar("excluir", "cliente", null)).rejects.toThrow(/tags_etiqueta_do_sistema/);

    expect(await tagsDoContato()).toEqual(["cliente", "vip"]);
    expect((await settings()).canonical_contact_tags).toEqual(["cliente", "vip"]);
  });

  it("com a regra LIGADA, excluir OUTRA etiqueta continua permitido (sem destino não vira recusa)", async () => {
    // Controle do defeito do nulo: no excluir não há destino, e `'cliente' = any`
    // de uma lista com nulo é NULO. Sem o `array_remove`, a reserva recusaria
    // a exclusão de qualquer etiqueta nesta organização.
    //
    // A `cliente` do contato é a que o SISTEMA pôs (`client_tag_by_system =
    // 'added'`), o estado real com a regra ligada — o mesmo da medição da 9005.
    // Sem o dono gravado, o gatilho da 0262 recalcula a etiqueta por conta
    // própria e o teste mediria o gatilho, não esta função.
    await definirSettings({ crm: { cliente_pela_agenda: true }, canonical_contact_tags: ["vip"] });
    await pool.query(
      "update contacts set tags=array['cliente','vip'], client_tag_by_system='added' where id=$1",
      [contato],
    );

    const r = await operar("excluir", "vip", null);

    expect((r.rows[0].r as { contatos: number }).contatos).toBe(1);
    expect(await tagsDoContato()).toEqual(["cliente"]);
    expect((await settings()).canonical_contact_tags).toEqual([]);
  });

  it("com a regra LIGADA, definir a cor de cliente é permitido (cor não mexe na presença)", async () => {
    await definirSettings({ crm: { cliente_pela_agenda: true } });

    const r = await como(manager, "select public.fn_vocabulario_de_tags_operar($1,'definir_cor','cliente',null,'#12a594') as r", [org]);

    expect((r.rows[0].r as { alterou: boolean }).alterou).toBe(true);
  });

  it("com a regra DESLIGADA, cliente é palavra comum e renomeia (controle positivo)", async () => {
    await definirSettings({ crm: { cliente_pela_agenda: false }, canonical_contact_tags: ["cliente"] });
    await pool.query("update contacts set tags=array['cliente'] where id=$1", [contato]);

    await operar("renomear", "cliente", "paciente");

    expect(await tagsDoContato()).toEqual(["paciente"]);
    expect((await settings()).canonical_contact_tags).toEqual(["paciente"]);
  });
});

describe("9038 — quem pode chamar", () => {
  it("manager renomeia (papel decidido para a tela unificada) e viewer é recusado", async () => {
    await definirSettings({ canonical_conversation_tags: ["x"] });

    await expect(operar("renomear", "x", "y", viewer)).rejects.toThrow(/insufficient_role/);
    expect((await settings()).canonical_conversation_tags).toEqual(["x"]);

    await operar("renomear", "x", "y", manager);
    expect((await settings()).canonical_conversation_tags).toEqual(["y"]);
  });
});
