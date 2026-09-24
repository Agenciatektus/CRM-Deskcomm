/**
 * CADÊNCIA DE PROSPECÇÃO (migration 9016) CONTRA POSTGRES DE VERDADE.
 *
 * O que só o banco prova:
 *   1. as funções `SECURITY DEFINER` da cadência NÃO são executáveis por
 *      `anon`/`authenticated` (só `service_role`) — o kill switch é a exceção,
 *      executável pela sessão, que reconfere papel e MFA pelo `auth.uid()`;
 *   2. a RESERVA de vagas do dia nunca passa do teto com duas sessões
 *      concorrentes (o motivo de ela existir) — com controle sequencial;
 *   3. a base legal nunca é gravada por cima de recusa de marketing, e só uma vez;
 *   4. a etiqueta é atômica e não atravessa organização;
 *   5. cadência NO AR sem número/funil/política é recusada pelo CHECK.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";

const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT ?? 54329}/postgres`,
  max: 6,
});
afterAll(() => pool.end());

const POLITICA = {
  janela: { start: "08:00", end: "18:00", weekdays: [1, 2, 3, 4, 5] },
  espacamento: { min_s: 45, max_s: 120 },
  legal_basis_ref: "LIA teste",
  max_inscricoes_dia: 3,
};

async function org(): Promise<string> {
  const id = randomUUID();
  await pool.query(
    "insert into organizations(id,slug,legal_name,display_name) values($1::uuid,$1::text,'Org cadência','Org cadência')",
    [id],
  );
  return id;
}

async function cadenciaRascunho(organizacao: string): Promise<string> {
  const { rows } = await pool.query(
    `insert into followup_flow_pointers (organization_id, name, surface, cadence_settings)
     values ($1, $2, 'cadence', $3) returning id`,
    [organizacao, `cad-${randomUUID()}`, POLITICA],
  );
  return rows[0].id as string;
}

describe("privilégios das funções da cadência", () => {
  const soServico = [
    "public.fn_cadencia_etiqueta_do_lead(uuid, uuid, text, text)",
    "public.fn_cadencia_registrar_base_legal(uuid, uuid, text)",
    "public.fn_cadencia_reservar_inscricoes(uuid, uuid, integer)",
    "public.fn_cadencia_vagas_de_hoje(uuid, uuid)",
  ];
  for (const fn of soServico) {
    it(`${fn}: anon e authenticated NÃO executam; service_role executa`, async () => {
      const { rows } = await pool.query(
        `select has_function_privilege('anon', $1, 'EXECUTE') as anon,
                has_function_privilege('authenticated', $1, 'EXECUTE') as autenticado,
                has_function_privilege('service_role', $1, 'EXECUTE') as servico`,
        [fn],
      );
      expect(rows[0]).toEqual({ anon: false, autenticado: false, servico: true });
    });
  }

  it("kill switch: anon não executa; a sessão (authenticated) executa e a função reconfere", async () => {
    const { rows } = await pool.query(
      `select has_function_privilege('anon', 'public.fn_definir_cadencias_pausadas(uuid, boolean)', 'EXECUTE') as anon,
              has_function_privilege('authenticated', 'public.fn_definir_cadencias_pausadas(uuid, boolean)', 'EXECUTE') as autenticado`,
    );
    expect(rows[0]).toEqual({ anon: false, autenticado: true });
  });

  it("a tabela de vagas não é legível por authenticated", async () => {
    const { rows } = await pool.query(
      "select has_table_privilege('authenticated', 'public.cadencia_inscricoes_do_dia', 'SELECT') as pode",
    );
    expect(rows[0].pode).toBe(false);
  });
});

describe("reserva de vagas do dia", () => {
  it("controle sequencial: concede até o teto e depois zero", async () => {
    const o = await org();
    const p = await cadenciaRascunho(o);
    const a = await pool.query("select public.fn_cadencia_reservar_inscricoes($1,$2,2) as n", [o, p]);
    const b = await pool.query("select public.fn_cadencia_reservar_inscricoes($1,$2,2) as n", [o, p]);
    const c = await pool.query("select public.fn_cadencia_reservar_inscricoes($1,$2,2) as n", [o, p]);
    expect([a.rows[0].n, b.rows[0].n, c.rows[0].n]).toEqual([2, 1, 0]);
    const v = await pool.query("select public.fn_cadencia_vagas_de_hoje($1,$2) as n", [o, p]);
    expect(v.rows[0].n).toBe(0);
  });

  it("⭐ duas sessões concorrentes pedindo 3 cada: juntas nunca passam de 3", async () => {
    const o = await org();
    const p = await cadenciaRascunho(o);
    const c1 = await pool.connect();
    const c2 = await pool.connect();
    try {
      // Sessão 1 reserva e SEGURA o lock (transação aberta). Sem o lock, a
      // sessão 2 leria 0 reservadas e concederia 3 também.
      await c1.query("begin");
      const r1 = await c1.query("select public.fn_cadencia_reservar_inscricoes($1,$2,3) as n", [o, p]);
      await c2.query("begin");
      const pedido2 = c2.query("select public.fn_cadencia_reservar_inscricoes($1,$2,3) as n", [o, p]);
      // A sessão 2 tem de estar ESPERANDO o lock: comita a 1 um pouco depois.
      await new Promise((r) => setTimeout(r, 150));
      await c1.query("commit");
      const r2 = await pedido2;
      await c2.query("commit");
      expect(r1.rows[0].n).toBe(3);
      expect(r2.rows[0].n).toBe(0);
    } finally {
      c1.release();
      c2.release();
    }
  });

  it("pointer de outra organização não concede nada", async () => {
    const o = await org();
    const outra = await org();
    const p = await cadenciaRascunho(o);
    const { rows } = await pool.query("select public.fn_cadencia_reservar_inscricoes($1,$2,2) as n", [outra, p]);
    expect(rows[0].n).toBe(0);
  });
});

describe("base legal e etiqueta", () => {
  it("LIA grava uma vez, e nunca por cima de recusa de marketing", async () => {
    const o = await org();
    const livre = (await pool.query("insert into contacts(organization_id,display_name) values($1,'A') returning id", [o])).rows[0].id;
    const recusou = (
      await pool.query(
        `insert into contacts(organization_id,display_name,consent)
         values($1,'B','{"marketing":{"declined_at":"2026-09-01T00:00:00Z"}}') returning id`,
        [o],
      )
    ).rows[0].id;

    const g1 = await pool.query("select public.fn_cadencia_registrar_base_legal($1,$2,'LIA x') as ok", [o, livre]);
    const g2 = await pool.query("select public.fn_cadencia_registrar_base_legal($1,$2,'LIA y') as ok", [o, livre]);
    const g3 = await pool.query("select public.fn_cadencia_registrar_base_legal($1,$2,'LIA x') as ok", [o, recusou]);
    expect([g1.rows[0].ok, g2.rows[0].ok, g3.rows[0].ok]).toEqual([true, false, false]);

    const { rows } = await pool.query("select id, consent from contacts where id = any($1)", [[livre, recusou]]);
    const porId = new Map(rows.map((r) => [r.id, r.consent]));
    expect(porId.get(livre).legitimate_interest.ref).toBe("LIA x");
    expect(porId.get(recusou).legitimate_interest).toBeUndefined();
    expect(porId.get(recusou).marketing.declined_at).toBeTruthy();
  });

  it("etiqueta: adicionar duas vezes não duplica; remover tira; outra organização não alcança", async () => {
    const o = await org();
    const outra = await org();
    const pipeline = randomUUID();
    const stage = randomUUID();
    await pool.query(
      "insert into crm_pipelines (id, organization_id, name, slug) values ($1, $2, 'Funil', $1::text)",
      [pipeline, o],
    );
    await pool.query(
      "insert into crm_stages (id, organization_id, pipeline_id, name, slug, position) values ($1,$2,$3,'Entrada','entrada',1)",
      [stage, o, pipeline],
    );
    const lead = (
      await pool.query(
        "insert into crm_leads (organization_id, pipeline_id, stage_id, title) values ($1,$2,$3,'Loja') returning id",
        [o, pipeline, stage],
      )
    ).rows[0].id;

    await pool.query("select public.fn_cadencia_etiqueta_do_lead($1,$2,'add','prospectado')", [o, lead]);
    const dup = await pool.query("select public.fn_cadencia_etiqueta_do_lead($1,$2,'add','prospectado') as t", [o, lead]);
    expect(dup.rows[0].t).toEqual(["prospectado"]);
    const fora = await pool.query("select public.fn_cadencia_etiqueta_do_lead($1,$2,'add','x') as t", [outra, lead]);
    expect(fora.rows[0].t).toBeNull();
    const rem = await pool.query("select public.fn_cadencia_etiqueta_do_lead($1,$2,'remove','prospectado') as t", [o, lead]);
    expect(rem.rows[0].t).toEqual([]);
  });
});

describe("CHECK de cadência completa", () => {
  it("cadência NO AR sem número, funil e política é recusada; rascunho vazio é aceito", async () => {
    const o = await org();
    await expect(
      pool.query("insert into followup_flow_pointers (organization_id, name, surface, status) values ($1, 'x', 'cadence', 'active')", [o]),
    ).rejects.toThrow(/followup_flow_pointers_cadencia_completa/);
    await expect(
      pool.query("insert into followup_flow_pointers (organization_id, name, surface) values ($1, 'y', 'cadence')", [o]),
    ).resolves.toBeTruthy();
  });
});
