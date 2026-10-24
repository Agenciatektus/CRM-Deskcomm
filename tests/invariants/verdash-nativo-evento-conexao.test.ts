import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

// SQL real da migration 9068 (fn_registrar_evento_conexao_nativa), no banco que o self-host instala.
if (!process.env.TEST_DB_CONTAINER) throw new Error("Rode via pnpm test:db");
const pool = new pg.Pool({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT}/postgres` });
const org = randomUUID(), outraOrg = randomUUID(), nativa = randomUUID(), vinculada = randomUUID();
const evento = (e: string, em: string | null = null, canal = nativa, tenant = org) =>
  pool.query("select fn_registrar_evento_conexao_nativa($1,$2,$3,$4) as r", [tenant, canal, e, em]).then((x) => x.rows[0].r);
const linha = async (id = nativa) =>
  (await pool.query("select status, metadata from channel_sessions where id=$1", [id])).rows[0];

beforeAll(async () => {
  for (const id of [org, outraOrg]) await pool.query(
    "insert into organizations(id,slug,legal_name,display_name) values($1::uuid,$1::text,'Teste','Teste')", [id]);
  for (const [id, origem] of [[nativa, "nativa"], [vinculada, "vinculada"]] as const) await pool.query(
    `insert into channel_sessions(id,organization_id,provider,verdash_origem,verdash_instance_name,verdash_token_encrypted,webhook_secret_encrypted,status,metadata)
     values($1::uuid,$2,'verdash',$3,'inst-'||$1::text,'\\x00','\\x00','STARTING',
     '{"ai_gate_mode":"pre_go_live","ai_test_phone_numbers":["+5511987654321"],"disabled":true,"disabled_by":"manual"}')`,
    [id, org, origem]);
});
afterAll(async () => { await pool.end(); });

describe("fn_registrar_evento_conexao_nativa (9068)", () => {
  it("Connected: WORKING, marca ja_conectou_em e preserva as chaves alheias", async () => {
    expect(await evento("Connected", "2026-10-24T12:00:00Z")).toMatchObject({ resultado: "aplicado", status: "WORKING" });
    const l = await linha();
    expect(l.status).toBe("WORKING");
    expect(l.metadata).toMatchObject({
      ai_gate_mode: "pre_go_live", ai_test_phone_numbers: ["+5511987654321"], disabled: true, disabled_by: "manual",
    });
    expect(l.metadata.ja_conectou_em).toBeTruthy();
    expect(l.metadata.desconectado_em).toBeUndefined();
  });
  it("Disconnected grava desconectado_em so na primeira vez; ja_conectou_em nao muda", async () => {
    const antes = (await linha()).metadata.ja_conectou_em;
    await evento("Disconnected", "2026-10-24T12:01:00Z");
    const primeiro = (await linha()).metadata.desconectado_em;
    await evento("Disconnected", "2026-10-24T12:02:00Z");
    const l = await linha();
    expect(l.status).toBe("STARTING");
    expect(l.metadata.desconectado_em).toBe(primeiro);
    expect(l.metadata.ja_conectou_em).toBe(antes);
  });
  it("evento mais antigo que a ultima transicao e obsoleto e nao escreve", async () => {
    expect(await evento("Connected", "2026-10-24T11:00:00Z")).toMatchObject({ resultado: "obsoleto" });
    expect((await linha()).status).toBe("STARTING");
  });
  it("LoggedOut: FAILED; Disconnected depois dele nao rebaixa para STARTING", async () => {
    await evento("LoggedOut", "2026-10-24T12:03:00Z");
    await evento("Disconnected", "2026-10-24T12:04:00Z");
    expect((await linha()).status).toBe("FAILED");
  });
  it("vinculada, outra organizacao e arquivada ficam intocadas", async () => {
    expect(await evento("LoggedOut", null, vinculada)).toMatchObject({ resultado: "ignorado", motivo: "evento_sem_interesse" });
    expect(await evento("LoggedOut", null, nativa, outraOrg)).toMatchObject({ resultado: "ignorado" });
    expect((await linha(vinculada)).status).toBe("STARTING");
    await pool.query("update channel_sessions set archived_at=now() where id=$1", [nativa]);
    expect(await evento("Connected")).toMatchObject({ resultado: "ignorado", motivo: "canal_arquivado" });
    await pool.query("update channel_sessions set archived_at=null where id=$1", [nativa]);
  });
  it("recusa evento invalido e nao expoe a RPC a anon nem a membros", async () => {
    await expect(evento("Qualquer")).rejects.toMatchObject({ code: "22023" });
    const f = "fn_registrar_evento_conexao_nativa(uuid,uuid,text,timestamptz)";
    const { rows } = await pool.query(`select
      has_function_privilege('anon','${f}','execute') as anon,
      has_function_privilege('authenticated','${f}','execute') as membro,
      has_function_privilege('service_role','${f}','execute') as servidor`);
    expect(rows[0]).toEqual({ anon: false, membro: false, servidor: true });
  });
});
