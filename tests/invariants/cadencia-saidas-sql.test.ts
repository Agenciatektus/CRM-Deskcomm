/**
 * SAÍDAS DA CADÊNCIA CONTRA POSTGRES DE VERDADE — o SQL do worker.
 *
 * `fatosDaSaidaDaInscricao` e `encerrarInscricaoPorSaida` são SQL cru, e o
 * teste unitário responde qualquer string: foi assim que `e.created_at` (coluna
 * que `followup_enrollments` NÃO tem — é `started_at`) passou verde. Aqui o
 * schema real responde:
 *   1. os fatos saem certos (etapa, status, etiquetas do negócio e do contato);
 *   2. "uma pessoa falou" é mensagem de SAÍDA com `sent_by_user_id`, e só a
 *      que veio DEPOIS da inscrição conta;
 *   3. encerrar avança a `revision` (o CAS do motor cai) e é idempotente;
 *   4. outra organização não lê nem encerra.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { encerrarInscricaoPorSaida, fatosDaSaidaDaInscricao } from "@/lib/cadencia/envio";
import { GOV_AGENT_A, GOV_ORG, GOV_SESSION, seedGov } from "./gov-helpers";

const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT ?? 54329}/postgres`,
  max: 4,
});
beforeAll(() => seedGov());
afterAll(() => pool.end());

async function cenario() {
  const pipeline = randomUUID();
  const stage = randomUUID();
  const contact = randomUUID();
  const conversation = randomUUID();
  await pool.query("insert into crm_pipelines (id, organization_id, name, slug) values ($1,$2,'Prospecção',$3)", [
    pipeline,
    GOV_ORG,
    `p${pipeline.slice(0, 8)}`,
  ]);
  await pool.query(
    "insert into crm_stages (id, organization_id, pipeline_id, name, slug, position) values ($1,$2,$3,'Lista fria','lista-fria',1)",
    [stage, GOV_ORG, pipeline],
  );
  await pool.query("insert into contacts (id, organization_id, display_name, tags) values ($1,$2,'Loja',$3)", [
    contact,
    GOV_ORG,
    ["Cliente VIP"],
  ]);
  const lead = (
    await pool.query(
      "insert into crm_leads (organization_id, pipeline_id, stage_id, contact_id, title, tags) values ($1,$2,$3,$4,'Loja',$5) returning id",
      [GOV_ORG, pipeline, stage, contact, ["prospectado"]],
    )
  ).rows[0].id as string;
  await pool.query(
    "insert into conversations (id, organization_id, contact_id, channel_session_id, status) values ($1,$2,$3,$4,'open')",
    [conversation, GOV_ORG, contact, GOV_SESSION],
  );
  const version = (
    await pool.query("insert into followup_flow_versions (organization_id, graph) values ($1,'{}'::jsonb) returning id", [
      GOV_ORG,
    ])
  ).rows[0].id as string;
  const pointer = (
    await pool.query(
      "insert into followup_flow_pointers (organization_id, name, surface) values ($1,$2,'cadence') returning id",
      [GOV_ORG, `cad-${randomUUID()}`],
    )
  ).rows[0].id as string;
  const enrollment = (
    await pool.query(
      `insert into followup_enrollments
         (organization_id, pointer_id, version_id, contact_id, lead_id, conversation_id, current_node_id, status, next_eval_at)
       values ($1,$2,$3,$4,$5,$6,'a1','active', now() + interval '1 hour') returning id`,
      [GOV_ORG, pointer, version, contact, lead, conversation],
    )
  ).rows[0].id as string;
  return { stage, contact, lead, conversation, enrollment };
}

async function mensagemDeSaida(conversation: string, contact: string, porPessoa: boolean, quando: string) {
  await pool.query(
    `insert into messages (id, organization_id, contact_id, conversation_id, channel_session_id, direction, type, status, body, sent_by_user_id, created_at)
     values ($1,$2,$3,$4,$5,'outbound','text','sent','Oi',$6, ${quando})`,
    [randomUUID(), GOV_ORG, contact, conversation, GOV_SESSION, porPessoa ? GOV_AGENT_A : null],
  );
}

describe("fatos da saída (SQL do worker)", () => {
  it("lê etapa, status e etiquetas do negócio e do contato; ninguém falou ainda", async () => {
    const c = await cenario();
    const fatos = await fatosDaSaidaDaInscricao(pool, GOV_ORG, c.enrollment);
    expect(fatos).toEqual({
      lead: { stage_id: c.stage, status: "open", tags: ["prospectado"] },
      tagsDoContato: ["Cliente VIP"],
      humanoFalouDepois: false,
    });
  });

  it("mensagem AUTOMÁTICA depois da inscrição não conta; a de uma PESSOA conta", async () => {
    const c = await cenario();
    await mensagemDeSaida(c.conversation, c.contact, false, "now() + interval '1 second'");
    expect((await fatosDaSaidaDaInscricao(pool, GOV_ORG, c.enrollment))?.humanoFalouDepois).toBe(false);
    await mensagemDeSaida(c.conversation, c.contact, true, "now() + interval '2 seconds'");
    expect((await fatosDaSaidaDaInscricao(pool, GOV_ORG, c.enrollment))?.humanoFalouDepois).toBe(true);
  });

  it("mensagem da pessoa ANTES da inscrição não conta (a conversa já existia)", async () => {
    const c = await cenario();
    await mensagemDeSaida(c.conversation, c.contact, true, "now() - interval '1 day'");
    expect((await fatosDaSaidaDaInscricao(pool, GOV_ORG, c.enrollment))?.humanoFalouDepois).toBe(false);
  });

  it("outra organização não lê a inscrição", async () => {
    const c = await cenario();
    expect(await fatosDaSaidaDaInscricao(pool, randomUUID(), c.enrollment)).toBeNull();
  });
});

describe("encerrar pela saída", () => {
  it("encerra, avança a revision (o CAS do motor cai) e é idempotente", async () => {
    const c = await cenario();
    const antes = (await pool.query("select revision from followup_enrollments where id=$1", [c.enrollment])).rows[0]
      .revision as string;
    expect(await encerrarInscricaoPorSaida(pool, GOV_ORG, c.enrollment, "saida_negocio_ganho")).toBe(true);
    const { rows } = await pool.query(
      "select status, outcome, cancel_reason, next_eval_at, revision from followup_enrollments where id=$1",
      [c.enrollment],
    );
    expect(rows[0]).toMatchObject({
      status: "cancelled",
      outcome: "converted",
      cancel_reason: "saida_negocio_ganho",
      next_eval_at: null,
    });
    expect(Number(rows[0].revision)).toBeGreaterThan(Number(antes));
    // Idempotente: já encerrada, não mexe de novo.
    expect(await encerrarInscricaoPorSaida(pool, GOV_ORG, c.enrollment, "saida_etiqueta")).toBe(false);
    // E a leitura dos fatos passa a dizer "não está viva".
    expect(await fatosDaSaidaDaInscricao(pool, GOV_ORG, c.enrollment)).toBeNull();
  });

  it("outra organização não encerra", async () => {
    const c = await cenario();
    expect(await encerrarInscricaoPorSaida(pool, randomUUID(), c.enrollment, "saida_etapa")).toBe(false);
    const { rows } = await pool.query("select status from followup_enrollments where id=$1", [c.enrollment]);
    expect(rows[0].status).toBe("active");
  });
});
