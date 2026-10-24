import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

// SQL real da migration 9069 (fn_marcar_limpeza_nativa), no banco que o self-host instala.
if (!process.env.TEST_DB_CONTAINER) throw new Error("Rode via pnpm test:db");
const pool = new pg.Pool({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT}/postgres` });
const org = randomUUID(), nativa = randomUUID(), vinculada = randomUUID();
const marcar = (canal: string, pendente: boolean) =>
  pool.query("select fn_marcar_limpeza_nativa($1,$2,$3) as n", [org, canal, pendente]).then((x) => x.rows[0].n);
const meta = async (id: string) => (await pool.query("select metadata from channel_sessions where id=$1", [id])).rows[0].metadata;

beforeAll(async () => {
  await pool.query("insert into organizations(id,slug,legal_name,display_name) values($1::uuid,$1::text,'Teste','Teste')", [org]);
  for (const [id, origem] of [[nativa, "nativa"], [vinculada, "vinculada"]] as const) await pool.query(
    `insert into channel_sessions(id,organization_id,provider,verdash_origem,verdash_instance_name,verdash_token_encrypted,webhook_secret_encrypted,status,archived_at,metadata)
     values($1::uuid,$2,'verdash',$3,'inst-'||$1::text,decode('00','hex'),decode('00','hex'),'STOPPED',now(),'{"ai_gate_mode":"pre_go_live","disabled":true}')`,
    [id, org, origem]);
});
afterAll(async () => { await pool.end(); });

describe("fn_marcar_limpeza_nativa (9069)", () => {
  it("marca e desmarca no canal ARQUIVADO preservando as chaves alheias", async () => {
    expect(await marcar(nativa, true)).toBe(1);
    expect(await meta(nativa)).toMatchObject({ ai_gate_mode: "pre_go_live", disabled: true });
    expect((await meta(nativa)).limpeza_fzap_pendente_em).toBeTruthy();
    expect(await marcar(nativa, false)).toBe(1);
    expect((await meta(nativa)).limpeza_fzap_pendente_em).toBeUndefined();
    expect((await meta(nativa)).ai_gate_mode).toBe("pre_go_live");
  });
  it("vinculada nao e marcada", async () => {
    expect(await marcar(vinculada, true)).toBe(0);
    expect((await meta(vinculada)).limpeza_fzap_pendente_em).toBeUndefined();
  });
});

describe("fn_marcar_limpeza_nativa: isolamento e grants (9069)", () => {
  it("canal de OUTRA org nao e marcado", async () => {
    const r = await pool.query("select fn_marcar_limpeza_nativa($1,$2,true) as n", [randomUUID(), nativa]);
    expect(r.rows[0].n).toBe(0);
    expect((await meta(nativa)).limpeza_fzap_pendente_em).toBeUndefined();
  });
  it("anon e authenticated sem EXECUTE; service_role com", async () => {
    const q = (role: string) =>
      pool.query("select has_function_privilege($1, 'public.fn_marcar_limpeza_nativa(uuid,uuid,boolean)', 'execute') as p", [role]).then((x) => x.rows[0].p);
    expect(await q("anon")).toBe(false);
    expect(await q("authenticated")).toBe(false);
    expect(await q("service_role")).toBe(true);
  });
});
