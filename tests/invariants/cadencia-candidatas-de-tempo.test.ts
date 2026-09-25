/**
 * `fn_cadencia_candidatas_de_tempo` (migration 9017) CONTRA POSTGRES DE VERDADE.
 *
 * A varredura de tempo roda todo minuto; o que ela leva à porta é o que esta
 * função devolve. Cada exclusão tem um caso, e cada caso tem o CONTROLE ao lado
 * (a conversa que tem de entrar), para uma função que devolve vazio sempre não
 * passar como "exclui tudo certinho".
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GOV_ORG, GOV_SESSION, seedGov } from "./gov-helpers";

const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT ?? 54329}/postgres`,
  max: 4,
});
beforeAll(() => seedGov());
afterAll(() => pool.end());

const POLITICA = {
  janela: { start: "08:00", end: "18:00", weekdays: [1, 2, 3, 4, 5] },
  espacamento: { min_s: 45, max_s: 120 },
  legal_basis_ref: "LIA teste",
  max_inscricoes_dia: 100,
};

async function funil() {
  const pipeline = randomUUID();
  const stage = randomUUID();
  await pool.query("insert into crm_pipelines (id, organization_id, name, slug) values ($1,$2,'Prospecção',$3)", [
    pipeline,
    GOV_ORG,
    `t${pipeline.slice(0, 8)}`,
  ]);
  await pool.query(
    "insert into crm_stages (id, organization_id, pipeline_id, name, slug, position) values ($1,$2,$3,'Entrada','entrada',1)",
    [stage, GOV_ORG, pipeline],
  );
  return { pipeline, stage };
}

async function cadencia(pipeline: string, kind: "agent_sla" | "lead_idle", minutos: number) {
  const version = (
    await pool.query("insert into followup_flow_versions (organization_id, graph) values ($1,'{}'::jsonb) returning id", [GOV_ORG])
  ).rows[0].id as string;
  return (
    await pool.query(
      `insert into followup_flow_pointers
         (organization_id, name, surface, status, active_version_id, channel_session_id, pipeline_id, cadence_settings, trigger_config)
       values ($1,$2,'cadence','active',$3,$4,$5,$6,$7) returning id`,
      [
        GOV_ORG,
        `cad-${randomUUID()}`,
        version,
        GOV_SESSION,
        pipeline,
        POLITICA,
        { kind, params: { threshold_minutes: minutos }, cancel_on_reply: true },
      ],
    )
  ).rows[0].id as string;
}

/** Contato + conversa (com os instantes em minutos atrás) + negócio aberto no funil. */
async function conversa(
  f: { pipeline: string; stage: string },
  t: { entrou?: number; saiu?: number; espera?: number },
  opcoes: { semNegocio?: boolean; contato?: Record<string, unknown> } = {},
) {
  const contact = randomUUID();
  const conv = randomUUID();
  const extra = opcoes.contato ?? {};
  await pool.query(
    "insert into contacts (id, organization_id, display_name, is_blocked, consent) values ($1,$2,'Loja',$3,$4)",
    [contact, GOV_ORG, extra.is_blocked ?? false, extra.consent ?? {}],
  );
  const ago = (m?: number) => (m === undefined ? null : new Date(Date.now() - m * 60_000).toISOString());
  await pool.query(
    `insert into conversations (id, organization_id, contact_id, channel_session_id, status, last_inbound_at, last_outbound_at, awaiting_since)
     values ($1,$2,$3,$4,'open',$5,$6,$7)`,
    [conv, GOV_ORG, contact, GOV_SESSION, ago(t.entrou), ago(t.saiu), ago(t.espera)],
  );
  let lead: string | null = null;
  if (!opcoes.semNegocio) {
    lead = (
      await pool.query(
        "insert into crm_leads (organization_id, pipeline_id, stage_id, contact_id, title) values ($1,$2,$3,$4,'Loja') returning id",
        [GOV_ORG, f.pipeline, f.stage, contact],
      )
    ).rows[0].id as string;
  }
  return { contact, conv, lead };
}

async function candidatas(pointer: string, org = GOV_ORG) {
  const { rows } = await pool.query("select * from public.fn_cadencia_candidatas_de_tempo($1,$2,50)", [org, pointer]);
  return rows as Array<{ conversation_id: string; lead_id: string; evento_em: Date }>;
}

describe("agent_sla — cliente esperando o time", () => {
  it("entra quem espera além do limiar; fica fora quem o time já respondeu, quem ainda está no prazo e quem passou da janela de 24 h", async () => {
    const f = await funil();
    const p = await cadencia(f.pipeline, "agent_sla", 30);
    const entra = await conversa(f, { entrou: 40, saiu: 90, espera: 40 });
    const respondido = await conversa(f, { entrou: 60, saiu: 50, espera: 60 });
    const noPrazo = await conversa(f, { entrou: 10, saiu: 90, espera: 10 });
    const antigo = await conversa(f, { entrou: 3 * 1440, saiu: 4 * 1440, espera: 3 * 1440 });

    const ids = (await candidatas(p)).map((c) => c.conversation_id);
    expect(ids).toContain(entra.conv);
    expect(ids).not.toContain(respondido.conv);
    expect(ids).not.toContain(noPrazo.conv);
    expect(ids).not.toContain(antigo.conv);

    const linha = (await candidatas(p)).find((c) => c.conversation_id === entra.conv)!;
    expect(linha.lead_id).toBe(entra.lead);
    // instante da violação = começo da espera + limiar (≈ 10 min atrás)
    const minutosAtras = (Date.now() - new Date(linha.evento_em).getTime()) / 60_000;
    expect(minutosAtras).toBeGreaterThan(9);
    expect(minutosAtras).toBeLessThan(11);
  });

  it("exclui contato com inscrição viva, bloqueado, com recusa de marketing e sem negócio aberto no funil", async () => {
    const f = await funil();
    const p = await cadencia(f.pipeline, "agent_sla", 30);
    const controle = await conversa(f, { entrou: 40, saiu: 90, espera: 40 });
    const vivo = await conversa(f, { entrou: 40, saiu: 90, espera: 40 });
    const bloqueado = await conversa(f, { entrou: 40, saiu: 90, espera: 40 }, { contato: { is_blocked: true } });
    const recusou = await conversa(
      f,
      { entrou: 40, saiu: 90, espera: 40 },
      { contato: { consent: { marketing: { declined_at: "2026-09-01T00:00:00Z" } } } },
    );
    const semNegocio = await conversa(f, { entrou: 40, saiu: 90, espera: 40 }, { semNegocio: true });

    // Inscrição viva do contato `vivo` noutro fluxo qualquer.
    const outraVersao = (
      await pool.query("insert into followup_flow_versions (organization_id, graph) values ($1,'{}'::jsonb) returning id", [GOV_ORG])
    ).rows[0].id;
    const outroFluxo = (
      await pool.query("insert into followup_flow_pointers (organization_id, name) values ($1,$2) returning id", [
        GOV_ORG,
        `fluxo-${randomUUID()}`,
      ])
    ).rows[0].id;
    await pool.query(
      `insert into followup_enrollments (organization_id, pointer_id, version_id, contact_id, current_node_id, status, next_eval_at)
       values ($1,$2,$3,$4,'a1','active', now() + interval '1 hour')`,
      [GOV_ORG, outroFluxo, outraVersao, vivo.contact],
    );

    const ids = (await candidatas(p)).map((c) => c.conversation_id);
    expect(ids).toContain(controle.conv);
    for (const fora of [vivo, bloqueado, recusou, semNegocio]) expect(ids).not.toContain(fora.conv);
  });

  it("o mesmo negócio não volta à mesma cadência em 30 dias", async () => {
    const f = await funil();
    const p = await cadencia(f.pipeline, "agent_sla", 30);
    const c = await conversa(f, { entrou: 40, saiu: 90, espera: 40 });
    const versao = (await pool.query("select active_version_id from followup_flow_pointers where id=$1", [p])).rows[0]
      .active_version_id;
    await pool.query(
      `insert into followup_enrollments (organization_id, pointer_id, version_id, contact_id, lead_id, current_node_id, status, started_at)
       values ($1,$2,$3,$4,$5,'a1','completed', now() - interval '5 days')`,
      [GOV_ORG, p, versao, c.contact, c.lead],
    );
    expect((await candidatas(p)).map((k) => k.conversation_id)).not.toContain(c.conv);
  });
});

describe("lead_idle — nós esperando o lead", () => {
  it("entra quem não responde à nossa última mensagem além do limiar; fica fora quem respondeu", async () => {
    const f = await funil();
    const p = await cadencia(f.pipeline, "lead_idle", 120);
    const parado = await conversa(f, { entrou: 600, saiu: 180 });
    const respondeu = await conversa(f, { entrou: 60, saiu: 180 });
    const ids = (await candidatas(p)).map((c) => c.conversation_id);
    expect(ids).toContain(parado.conv);
    expect(ids).not.toContain(respondeu.conv);
  });
});

describe("isolamento e privilégio", () => {
  it("outra organização não recebe nada da cadência", async () => {
    const f = await funil();
    const p = await cadencia(f.pipeline, "agent_sla", 30);
    await conversa(f, { entrou: 40, saiu: 90, espera: 40 });
    expect(await candidatas(p, randomUUID())).toEqual([]);
  });

  it("só service_role executa", async () => {
    const { rows } = await pool.query(
      `select has_function_privilege('anon', 'public.fn_cadencia_candidatas_de_tempo(uuid, uuid, integer)', 'EXECUTE') as anon,
              has_function_privilege('authenticated', 'public.fn_cadencia_candidatas_de_tempo(uuid, uuid, integer)', 'EXECUTE') as autenticado,
              has_function_privilege('service_role', 'public.fn_cadencia_candidatas_de_tempo(uuid, uuid, integer)', 'EXECUTE') as servico`,
    );
    expect(rows[0]).toEqual({ anon: false, autenticado: false, servico: true });
  });
});
