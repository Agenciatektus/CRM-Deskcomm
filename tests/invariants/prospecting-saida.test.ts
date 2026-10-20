import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { contarEnvioAutomatico, desfazerContagem } from "@/lib/prospecting/saida-configuravel";

/**
 * Saída configurável contra o banco real (só no CI, `pnpm test:db`).
 * Chama as FUNÇÕES de `lib/prospecting/saida-configuravel.ts`, não uma cópia
 * do SQL. Cada caso semeia a própria candidata, já com a abertura enviada
 * (`automatic_sends = 1`, `status = 'sent'`), que é o estado real quando a
 * pessoa responde.
 */
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT ?? 54329}/postgres`,
});
afterAll(() => pool.end());

type Modo = "first_message" | "second_message" | "third_message";

async function novaOrganizacao(): Promise<string> {
  const org = randomUUID();
  await pool.query(
    "insert into organizations(id,slug,legal_name,display_name) values($1,$2,'Saída','Saída')",
    [org, `saida-cfg-${org.slice(0, 8)}`],
  );
  return org;
}

/** Uma candidata com conversa própria (contato e conexão próprios), abertura já enviada. */
async function candidata(org: string, modo: Modo) {
  const contato = randomUUID();
  const sessao = randomUUID();
  const conversa = randomUUID();
  const campanha = randomUUID();
  const id = randomUUID();
  await pool.query(
    "insert into contacts(id,organization_id,name,phone_number) values($1,$2,'Contato',$3)",
    [contato, org, `+55119${Math.floor(10000000 + Math.random() * 89999999)}`],
  );
  await pool.query(
    "insert into channel_sessions(id,organization_id,waha_session_name,webhook_secret_encrypted) values($1,$2,$3,'\\x00'::bytea)",
    [sessao, org, `saida-${sessao.slice(0, 8)}`],
  );
  await pool.query(
    "insert into conversations(id,organization_id,contact_id,channel_session_id,status) values($1,$2,$3,$4,'open')",
    [conversa, org, contato, sessao],
  );
  // `paused`, não `running`: só pode haver UMA campanha running por organização
  // (prospecting_one_running_org) e o SQL da contagem não olha o status da campanha.
  await pool.query(
    "insert into prospecting_campaigns(id,organization_id,request_id,name,search,config,status) values($1,$2,$3,'c','{}',$4,'paused')",
    [campanha, org, randomUUID(), JSON.stringify({ exit_offer: modo })],
  );
  await pool.query(
    `insert into prospecting_candidates(id,organization_id,campaign_id,conversation_id,contact_id,status,place_id,data,automatic_sends)
     values($1,$2,$3,$4,$5,'sent',$6,'{"name":"Empresa"}',1)`,
    [id, org, campanha, conversa, contato, `place-${id.slice(0, 8)}`],
  );
  return { id, conversa };
}

async function estado(org: string, id: string) {
  const { rows } = await pool.query<{ automatic_sends: number; exit_offered_at: Date | null }>(
    "select automatic_sends, exit_offered_at from prospecting_candidates where organization_id=$1 and id=$2",
    [org, id],
  );
  return rows[0]!;
}

describe("saída configurável — contagem e reserva (banco real)", () => {
  it("2ª mensagem: o 1º envio depois da abertura leva a saída; o seguinte não", async () => {
    const org = await novaOrganizacao();
    const c = await candidata(org, "second_message");
    const r1 = await contarEnvioAutomatico(pool, org, c.conversa);
    expect(r1).toMatchObject({ candidatoId: c.id, levaASaida: true, numeroDaMensagem: 2 });
    expect(r1!.reservadaEm).not.toBeNull();
    const r2 = await contarEnvioAutomatico(pool, org, c.conversa);
    expect(r2).toMatchObject({ levaASaida: false, numeroDaMensagem: 3, reservadaEm: null });
  });

  it("3ª mensagem: só o 2º envio depois da abertura leva a saída", async () => {
    const org = await novaOrganizacao();
    const c = await candidata(org, "third_message");
    expect(await contarEnvioAutomatico(pool, org, c.conversa)).toMatchObject({ levaASaida: false, numeroDaMensagem: 2 });
    expect(await contarEnvioAutomatico(pool, org, c.conversa)).toMatchObject({ levaASaida: true, numeroDaMensagem: 3 });
    expect(await contarEnvioAutomatico(pool, org, c.conversa)).toMatchObject({ levaASaida: false, numeroDaMensagem: 4 });
  });

  it("desfazer a contagem que reservou devolve a reserva e a contagem", async () => {
    const org = await novaOrganizacao();
    const c = await candidata(org, "second_message");
    const r = await contarEnvioAutomatico(pool, org, c.conversa);
    expect(r!.levaASaida).toBe(true);
    await desfazerContagem(pool, org, c.id, r!.reservadaEm);
    expect(await estado(org, c.id)).toEqual({ automatic_sends: 1, exit_offered_at: null });
    // a próxima volta a levar
    expect((await contarEnvioAutomatico(pool, org, c.conversa))!.levaASaida).toBe(true);
  });

  it("desfazer uma contagem que NÃO reservou não apaga a reserva de outro envio", async () => {
    const org = await novaOrganizacao();
    const c = await candidata(org, "second_message");
    await contarEnvioAutomatico(pool, org, c.conversa); // reserva
    const r2 = await contarEnvioAutomatico(pool, org, c.conversa); // não reserva
    await desfazerContagem(pool, org, c.id, r2!.reservadaEm);
    const e = await estado(org, c.id);
    expect(e.automatic_sends).toBe(2);
    expect(e.exit_offered_at).not.toBeNull();
  });

  it("a organização B não conta nem toca a candidata da organização A", async () => {
    const orgA = await novaOrganizacao();
    const orgB = await novaOrganizacao();
    const c = await candidata(orgA, "second_message");
    const antes = await estado(orgA, c.id);
    expect(await contarEnvioAutomatico(pool, orgB, c.conversa)).toBeNull();
    await desfazerContagem(pool, orgB, c.id, null);
    expect(await estado(orgA, c.id)).toEqual(antes);
  });

  it("campanha no modo padrão (1ª mensagem) nunca entra na contagem", async () => {
    const org = await novaOrganizacao();
    const c = await candidata(org, "first_message");
    expect(await contarEnvioAutomatico(pool, org, c.conversa)).toBeNull();
    expect((await estado(org, c.id)).automatic_sends).toBe(1);
  });
});
