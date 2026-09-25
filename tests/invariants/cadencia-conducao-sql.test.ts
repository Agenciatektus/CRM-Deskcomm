/**
 * CONDUÇÃO DA CADÊNCIA POR IA (migration 9018) CONTRA POSTGRES DE VERDADE.
 *
 * O que só o banco prova:
 *   1. as três funções são SECURITY DEFINER só de `service_role` e a tabela
 *      não é legível por `authenticated` (nem da própria organização);
 *   2. `fn_cadencia_lead_respondeu` é ATÔMICA: cancela a inscrição, abre a
 *      condução com o snapshot da VERSÃO (modo inclusive), fixa o agente e
 *      autoriza o contato, tudo ou nada; e é idempotente, também concorrente;
 *   3. cada pré-condição que falha devolve `atendente` sem abrir condução
 *      (com o controle positivo ao lado de cada negativo);
 *   4. agente × modo: automático exige agente automático; assistido aceita os dois;
 *   5. encerrar é CAS e só desfaz o que é DELA (agente e autorização);
 *   6. publicar grava a condução na MESMA versão que vai ao ar;
 *   7. os CHECKs da tabela;
 *   8. o rascunho do modo assistido (`fn_reply_begin`) aceita o agente da
 *      condução e recusa outro; mensagem nova invalida a aprovação e gera outro
 *      rascunho; viewer não aprova.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { criarOrigemDeFollowup } from "./followup-service-origin";
import { GOV_AGENT_A, GOV_VIEWER, seedGov } from "./gov-helpers";

const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT ?? 54329}/postgres`,
  max: 6,
});
beforeAll(() => seedGov());
afterAll(() => pool.end());

const POLITICA = {
  janela: { start: "08:00", end: "18:00", weekdays: [1, 2, 3, 4, 5] },
  espacamento: { min_s: 45, max_s: 120 },
  legal_basis_ref: "LIA teste",
  max_inscricoes_dia: 10,
};

interface Opcoes {
  quemAtende?: "ia" | "atendente";
  modo?: "automatico" | "assistido";
  operationMode?: "automatic" | "assisted";
  instrucao?: string;
}

async function cenario(o: Opcoes = {}) {
  const org = randomUUID();
  const contact = randomUUID();
  const pipeline = randomUUID();
  const etapaGatilho = randomUUID();
  const etapaAlvo = randomUUID();
  const agent = randomUUID();
  const agentVersion = randomUUID();
  await pool.query(
    "insert into organizations(id,slug,legal_name,display_name) values($1::uuid,$1::text,'Org condução','Org condução')",
    [org],
  );
  for (const [user, role] of [
    [GOV_AGENT_A, "agent"],
    [GOV_VIEWER, "viewer"],
  ]) {
    await pool.query(
      "insert into user_organizations(organization_id,user_id,role,accepted_at) values($1,$2,$3,now())",
      [org, user, role],
    );
  }
  await pool.query("insert into contacts(id,organization_id,display_name) values($1,$2,'Loja')", [contact, org]);
  const boundary = await criarOrigemDeFollowup(pool, org, contact);
  const conversation = boundary.conversation_id as string;
  const channel = (
    await pool.query("select channel_session_id from conversations where organization_id=$1 and id=$2", [org, conversation])
  ).rows[0].channel_session_id as string;

  await pool.query("insert into crm_pipelines (id, organization_id, name, slug) values ($1,$2,'Prospecção',$3)", [
    pipeline,
    org,
    `p${pipeline.slice(0, 8)}`,
  ]);
  await pool.query(
    `insert into crm_stages (id, organization_id, pipeline_id, name, slug, position)
     values ($1,$3,$4,'Lista fria','lista-fria',1), ($2,$3,$4,'Reunião marcada','reuniao-marcada',2)`,
    [etapaGatilho, etapaAlvo, org, pipeline],
  );
  const lead = (
    await pool.query(
      "insert into crm_leads (organization_id, pipeline_id, stage_id, contact_id, title) values ($1,$2,$3,$4,'Loja') returning id",
      [org, pipeline, etapaGatilho, contact],
    )
  ).rows[0].id as string;

  await pool.query(
    "insert into ai_agents(id,organization_id,name,system_prompt,operation_mode) values($1,$2,'SDR','Prompt',$3)",
    [agent, org, o.operationMode ?? "automatic"],
  );
  await pool.query(
    `insert into ai_agent_versions(id,organization_id,agent_id,version_number,system_prompt,provider,model,channel_session_id,status,tool_ids,pipeline_ids)
     values($1,$2,$3,1,'Prompt','anthropic','test-model',$4,'published',$5,$6)`,
    [agentVersion, org, agent, channel, ["crm_move_lead_stage"], [pipeline]],
  );
  await pool.query("update ai_agents set published_version_id=$1 where organization_id=$2 and id=$3", [
    agentVersion,
    org,
    agent,
  ]);

  const conducao =
    (o.quemAtende ?? "ia") === "ia"
      ? {
          quem_atende: "ia",
          agent_id: agent,
          preset: "qualificar",
          etapa_alvo_id: etapaAlvo,
          modo: o.modo ?? "automatico",
          ...(o.instrucao ? { instrucao: o.instrucao } : {}),
        }
      : { quem_atende: "atendente" };

  const pointer = (
    await pool.query(
      `insert into followup_flow_pointers (organization_id, name, surface, pipeline_id, channel_session_id, cadence_settings)
       values ($1,$2,'cadence',$3,$4,$5) returning id`,
      [org, `cad-${randomUUID()}`, pipeline, channel, { ...POLITICA, conducao }],
    )
  ).rows[0].id as string;
  const version = (
    await pool.query(
      "insert into followup_flow_versions (organization_id, pointer_id, graph, cadence_conducao) values ($1,$2,'{}'::jsonb,$3) returning id",
      [org, pointer, conducao],
    )
  ).rows[0].id as string;

  async function inscrever(): Promise<string> {
    return (
      await pool.query(
        `insert into followup_enrollments
           (organization_id, pointer_id, version_id, contact_id, lead_id, conversation_id, current_node_id, status, next_eval_at)
         values ($1,$2,$3,$4,$5,$6,'a1','active', now() + interval '1 hour') returning id`,
        [org, pointer, version, contact, lead, conversation],
      )
    ).rows[0].id as string;
  }
  const enrollment = await inscrever();

  return { org, contact, conversation, channel, pipeline, etapaAlvo, agent, agentVersion, lead, pointer, version, enrollment, conducao, inscrever };
}
type Cenario = Awaited<ReturnType<typeof cenario>>;

async function responder(c: Cenario, enrollment = c.enrollment) {
  return (
    await pool.query("select public.fn_cadencia_lead_respondeu($1,$2,$3) as r", [c.org, enrollment, randomUUID()])
  ).rows[0].r as Record<string, unknown>;
}

async function conducoesVivas(c: Cenario): Promise<Array<Record<string, unknown>>> {
  return (
    await pool.query("select * from cadencia_conducoes where conversation_id=$1 and encerrada_em is null", [c.conversation])
  ).rows;
}

describe("privilégios", () => {
  const fns = [
    "public.fn_cadencia_lead_respondeu(uuid, uuid, uuid)",
    "public.fn_cadencia_encerrar_conducao(uuid, uuid, text)",
    "public.fn_cadencia_publicar_versao(uuid, uuid, jsonb, uuid, jsonb)",
  ];
  for (const fn of fns) {
    it(`${fn}: anon e authenticated NÃO executam; service_role executa`, async () => {
      const { rows } = await pool.query(
        `select has_function_privilege('anon', $1, 'EXECUTE') as anon,
                has_function_privilege('authenticated', $1, 'EXECUTE') as autenticado,
                has_function_privilege('service_role', $1, 'EXECUTE') as servico,
                (select prosecdef from pg_proc where oid = $1::regprocedure) as definer,
                (select proconfig from pg_proc where oid = $1::regprocedure) as config`,
        [fn],
      );
      expect(rows[0]).toMatchObject({ anon: false, autenticado: false, servico: true, definer: true });
      expect(rows[0].config).toContain("search_path=public");
    });
  }

  it("a tabela não é legível por authenticated (privilégio) nem pela RLS da própria organização", async () => {
    const { rows } = await pool.query(
      "select has_table_privilege('authenticated', 'public.cadencia_conducoes', 'SELECT') as pode",
    );
    expect(rows[0].pode).toBe(false);

    const c = await cenario();
    await responder(c);
    // controle: a linha existe para o service_role
    expect(await conducoesVivas(c)).toHaveLength(1);
    const cli = await pool.connect();
    try {
      await cli.query("begin");
      await cli.query("set local role authenticated");
      await cli.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({ sub: GOV_AGENT_A, role: "authenticated" }),
      ]);
      await expect(cli.query("select id from cadencia_conducoes where organization_id=$1", [c.org])).rejects.toMatchObject({
        code: "42501",
      });
    } finally {
      await cli.query("rollback");
      cli.release();
    }
  });
});

describe("fn_cadencia_lead_respondeu", () => {
  it("⭐ atômica: cancela a inscrição, abre a condução com o snapshot da versão, fixa o agente e autoriza o contato", async () => {
    const c = await cenario({ instrucao: "Pergunte o porte da loja" });
    const r = await responder(c);
    expect(r).toMatchObject({ ja_encerrada: false, modo: "ia", modo_conducao: "automatico", motivo: null });

    const e = (await pool.query("select status, outcome, cancel_reason, next_eval_at from followup_enrollments where id=$1", [c.enrollment])).rows[0];
    expect(e).toEqual({ status: "cancelled", outcome: "replied", cancel_reason: "lead_respondeu:ia", next_eval_at: null });

    const [conducao] = await conducoesVivas(c);
    expect(conducao).toMatchObject({
      id: r.conducao_id,
      organization_id: c.org,
      contact_id: c.contact,
      lead_id: c.lead,
      pointer_id: c.pointer,
      version_id: c.version,
      enrollment_id: c.enrollment,
      agent_id: c.agent,
      pipeline_id: c.pipeline,
      modo: "automatico",
      preset: "qualificar",
      etapa_alvo_id: c.etapaAlvo,
      instrucao: "Pergunte o porte da loja",
      turnos: 0,
      motivo: null,
    });

    const conv = (await pool.query("select active_ai_agent_id from conversations where id=$1", [c.conversation])).rows[0];
    expect(conv.active_ai_agent_id).toBe(c.agent);
    const ct = (await pool.query("select ai_authorized_at, ai_authorized_reason from contacts where id=$1", [c.contact])).rows[0];
    expect(ct.ai_authorized_reason).toBe(`cadencia:${c.pointer}`);
    expect(ct.ai_authorized_at).not.toBeNull();

    const ev = await pool.query(
      "select payload from followup_enrollment_events where enrollment_id=$1 and event_type='cadencia_lead_respondeu'",
      [c.enrollment],
    );
    expect(ev.rows).toHaveLength(1);
    expect(ev.rows[0].payload).toMatchObject({ modo: "ia", conducao_id: r.conducao_id });
  });

  it("o modo vem da VERSÃO (assistido), não do rascunho nem do agente", async () => {
    const c = await cenario({ modo: "assistido" });
    // o rascunho diz outra coisa: não pode valer
    await pool.query("update followup_flow_pointers set cadence_settings = $2 where id=$1", [
      c.pointer,
      { ...POLITICA, conducao: { ...c.conducao, modo: "automatico" } },
    ]);
    const r = await responder(c);
    expect(r).toMatchObject({ modo: "ia", modo_conducao: "assistido" });
    expect((await conducoesVivas(c))[0].modo).toBe("assistido");
  });

  it("idempotente: a segunda chamada devolve ja_encerrada e não abre outra condução", async () => {
    const c = await cenario();
    expect((await responder(c)).modo).toBe("ia");
    expect(await responder(c)).toEqual({ ja_encerrada: true });
    expect(await conducoesVivas(c)).toHaveLength(1);
  });

  it("⭐ duas sessões concorrentes na mesma inscrição: exatamente 1 condução, a segunda vê ja_encerrada", async () => {
    const c = await cenario();
    const c1 = await pool.connect();
    const c2 = await pool.connect();
    try {
      await c1.query("begin");
      const r1 = await c1.query("select public.fn_cadencia_lead_respondeu($1,$2,$3) as r", [c.org, c.enrollment, randomUUID()]);
      await c2.query("begin");
      const pedido2 = c2.query("select public.fn_cadencia_lead_respondeu($1,$2,$3) as r", [c.org, c.enrollment, randomUUID()]);
      // A sessão 2 tem de estar ESPERANDO o lock da inscrição.
      await new Promise((res) => setTimeout(res, 150));
      await c1.query("commit");
      const r2 = await pedido2;
      await c2.query("commit");
      expect(r1.rows[0].r.modo).toBe("ia");
      expect(r2.rows[0].r).toEqual({ ja_encerrada: true });
    } finally {
      c1.release();
      c2.release();
    }
    expect(await conducoesVivas(c)).toHaveLength(1);
  });

  it("condução já viva na conversa: nova inscrição respondida reusa a MESMA condução", async () => {
    const c = await cenario();
    const r1 = await responder(c);
    const outra = await c.inscrever();
    const r2 = await responder(c, outra);
    expect(r2).toMatchObject({ modo: "ia", conducao_id: r1.conducao_id });
    expect(await conducoesVivas(c)).toHaveLength(1);
  });

  it("cadência de atendente: cancela com lead_respondeu:atendente e não abre condução", async () => {
    const c = await cenario({ quemAtende: "atendente" });
    expect(await responder(c)).toMatchObject({ modo: "atendente", conducao_id: null });
    expect(await conducoesVivas(c)).toHaveLength(0);
    const e = (await pool.query("select cancel_reason from followup_enrollments where id=$1", [c.enrollment])).rows[0];
    expect(e.cancel_reason).toBe("lead_respondeu:atendente");
  });

  it("inscrição de follow-up comum (não cadência) não é encontrada", async () => {
    const c = await cenario();
    await pool.query("update followup_flow_pointers set surface='followup' where id=$1", [c.pointer]);
    await expect(responder(c)).rejects.toMatchObject({ code: "P0002" });
  });

  it("outra organização não alcança a inscrição", async () => {
    const c = await cenario();
    await expect(
      pool.query("select public.fn_cadencia_lead_respondeu($1,$2,$3)", [randomUUID(), c.enrollment, randomUUID()]),
    ).rejects.toMatchObject({ code: "P0002" });
    expect((await pool.query("select status from followup_enrollments where id=$1", [c.enrollment])).rows[0].status).toBe(
      "active",
    );
  });
});

describe("pré-condições: cada negativo ao lado do controle", () => {
  const casos: Array<[string, (c: Cenario) => Promise<unknown>, string]> = [
    ["agente despublicado", (c) => pool.query("update ai_agents set published_version_id=null where id=$1", [c.agent]), "agente_indisponivel"],
    ["agente arquivado", (c) => pool.query("update ai_agents set archived_at=now() where id=$1", [c.agent]), "agente_indisponivel"],
    ["agente pausado", (c) => pool.query("update ai_agents set paused_at=now() where id=$1", [c.agent]), "agente_indisponivel"],
    ["contato force_human", (c) => pool.query("update contacts set force_human=true where id=$1", [c.contact]), "contato_indisponivel"],
    ["contato bloqueado", (c) => pool.query("update contacts set is_blocked=true where id=$1", [c.contact]), "contato_indisponivel"],
    [
      "contato recusou marketing",
      (c) =>
        pool.query(
          `update contacts set consent = jsonb_set(consent, '{marketing,declined_at}', '"2026-09-01T00:00:00Z"') where id=$1`,
          [c.contact],
        ),
      "contato_indisponivel",
    ],
    [
      "conversa com uma pessoa atribuída",
      (c) =>
        pool.query("update conversations set assigned_to_user_id=$2, assignee_kind='user' where id=$1", [
          c.conversation,
          GOV_AGENT_A,
        ]),
      "conversa_indisponivel",
    ],
    [
      "bot silenciado",
      (c) => pool.query("update conversations set bot_silenced_until=now() + interval '1 day' where id=$1", [c.conversation]),
      "conversa_indisponivel",
    ],
    [
      "etapa-alvo arquivada",
      (c) => pool.query("update crm_stages set is_archived=true where id=$1", [c.etapaAlvo]),
      "etapa_alvo_invalida",
    ],
  ];

  it("controle: o cenário base abre a condução", async () => {
    const c = await cenario();
    expect((await responder(c)).modo).toBe("ia");
  });

  for (const [nome, sabotar, motivo] of casos) {
    it(`${nome} → atendente (${motivo}), nenhuma condução, inscrição cancelada`, async () => {
      const c = await cenario();
      await sabotar(c);
      expect(await responder(c)).toMatchObject({ modo: "atendente", motivo, conducao_id: null });
      expect(await conducoesVivas(c)).toHaveLength(0);
      const conv = (await pool.query("select active_ai_agent_id from conversations where id=$1", [c.conversation])).rows[0];
      expect(conv.active_ai_agent_id).toBeNull();
      const e = (await pool.query("select status, cancel_reason from followup_enrollments where id=$1", [c.enrollment])).rows[0];
      expect(e).toEqual({ status: "cancelled", cancel_reason: "lead_respondeu:ia" });
    });
  }

  it("config da versão ilegível → atendente (config_invalida)", async () => {
    const c = await cenario();
    await pool.query("update followup_flow_versions set cadence_conducao = $2 where id=$1", [
      c.version,
      { quem_atende: "ia", agent_id: "nao-e-uuid", preset: "qualificar", etapa_alvo_id: c.etapaAlvo },
    ]);
    expect(await responder(c)).toMatchObject({ modo: "atendente", motivo: "config_invalida" });
  });
});

describe("agente × modo", () => {
  it("⭐ automático com agente assistido → atendente (agente_indisponivel)", async () => {
    const c = await cenario({ modo: "automatico", operationMode: "assisted" });
    expect(await responder(c)).toMatchObject({ modo: "atendente", motivo: "agente_indisponivel" });
    expect(await conducoesVivas(c)).toHaveLength(0);
  });
  it("controle: assistido com o MESMO agente assistido abre a condução", async () => {
    const c = await cenario({ modo: "assistido", operationMode: "assisted" });
    expect(await responder(c)).toMatchObject({ modo: "ia", modo_conducao: "assistido" });
  });
  it("assistido aceita agente automático", async () => {
    const c = await cenario({ modo: "assistido", operationMode: "automatic" });
    expect((await responder(c)).modo).toBe("ia");
  });
});

describe("fn_cadencia_encerrar_conducao", () => {
  it("CAS: encerra uma vez, solta o agente e revoga a autorização da cadência", async () => {
    const c = await cenario();
    const { conducao_id } = await responder(c);
    const enc = async (org = c.org) =>
      (await pool.query("select public.fn_cadencia_encerrar_conducao($1,$2,'objetivo_atingido') as ok", [org, conducao_id]))
        .rows[0].ok;
    expect(await enc(randomUUID())).toBe(false); // outra organização não encerra
    expect(await conducoesVivas(c)).toHaveLength(1);
    expect(await enc()).toBe(true);
    expect(await enc()).toBe(false);
    const cc = (await pool.query("select encerrada_em, motivo from cadencia_conducoes where id=$1", [conducao_id])).rows[0];
    expect(cc.motivo).toBe("objetivo_atingido");
    expect(cc.encerrada_em).not.toBeNull();
    const conv = (await pool.query("select active_ai_agent_id from conversations where id=$1", [c.conversation])).rows[0];
    expect(conv.active_ai_agent_id).toBeNull();
    const ct = (await pool.query("select ai_authorized_at, ai_authorized_reason from contacts where id=$1", [c.contact])).rows[0];
    expect(ct).toEqual({ ai_authorized_at: null, ai_authorized_reason: null });
  });

  it("não solta OUTRO agente da conversa nem revoga autorização de OUTRA origem", async () => {
    const c = await cenario();
    const { conducao_id } = await responder(c);
    const outro = randomUUID();
    await pool.query("insert into ai_agents(id,organization_id,name,system_prompt) values($1,$2,'Outro','P')", [outro, c.org]);
    await pool.query("update conversations set active_ai_agent_id=$2 where id=$1", [c.conversation, outro]);
    await pool.query("update contacts set ai_authorized_reason='campanha:x' where id=$1", [c.contact]);
    await pool.query("select public.fn_cadencia_encerrar_conducao($1,$2,'handoff')", [c.org, conducao_id]);
    expect((await pool.query("select active_ai_agent_id from conversations where id=$1", [c.conversation])).rows[0].active_ai_agent_id).toBe(outro);
    expect((await pool.query("select ai_authorized_reason from contacts where id=$1", [c.contact])).rows[0].ai_authorized_reason).toBe(
      "campanha:x",
    );
  });

  it("autorização de outra origem não é sobrescrita ao abrir a condução", async () => {
    const c = await cenario();
    await pool.query("update contacts set ai_authorized_at=now(), ai_authorized_reason='respondi:f:s' where id=$1", [c.contact]);
    expect((await responder(c)).modo).toBe("ia");
    expect((await pool.query("select ai_authorized_reason from contacts where id=$1", [c.contact])).rows[0].ai_authorized_reason).toBe(
      "respondi:f:s",
    );
  });
});

describe("fn_cadencia_publicar_versao", () => {
  it("grava a condução na versão que vira active_version_id", async () => {
    const c = await cenario();
    const conducao = { ...c.conducao, modo: "assistido" };
    const v = (
      await pool.query("select public.fn_cadencia_publicar_versao($1,$2,$3,null,$4) as v", [
        c.org,
        c.pointer,
        { nodes: [], edges: [] },
        conducao,
      ])
    ).rows[0].v as string;
    const p = (await pool.query("select status, active_version_id from followup_flow_pointers where id=$1", [c.pointer])).rows[0];
    expect(p).toEqual({ status: "active", active_version_id: v });
    const ver = (await pool.query("select cadence_conducao, pointer_id from followup_flow_versions where id=$1", [v])).rows[0];
    expect(ver).toEqual({ cadence_conducao: conducao, pointer_id: c.pointer });
  });

  it("pointer que não é cadência → pointer_not_found, e nada é publicado", async () => {
    const c = await cenario();
    await pool.query("update followup_flow_pointers set surface='followup' where id=$1", [c.pointer]);
    await expect(
      pool.query("select public.fn_cadencia_publicar_versao($1,$2,'{}'::jsonb,null,null)", [c.org, c.pointer]),
    ).rejects.toThrow(/pointer_not_found/);
    const p = (await pool.query("select status from followup_flow_pointers where id=$1", [c.pointer])).rows[0];
    expect(p.status).toBe("draft");
  });

  it("outra organização → pointer_not_found", async () => {
    const c = await cenario();
    await expect(
      pool.query("select public.fn_cadencia_publicar_versao($1,$2,'{}'::jsonb,null,null)", [randomUUID(), c.pointer]),
    ).rejects.toThrow(/pointer_not_found/);
  });
});

describe("CHECKs de cadencia_conducoes", () => {
  async function inserir(c: Cenario, extra: string, valores: unknown[] = []) {
    return pool.query(
      `insert into cadencia_conducoes (organization_id, conversation_id, contact_id, pointer_id, version_id, agent_id,
                                       pipeline_id, preset, etapa_alvo_id${extra ? `, ${extra.split("=")[0]}` : ""})
       values ($1,$2,$3,$4,$5,$6,$7,'qualificar',$8${extra ? `, ${extra.split("=")[1]}` : ""})`,
      [c.org, c.conversation, c.contact, c.pointer, c.version, c.agent, c.pipeline, c.etapaAlvo, ...valores],
    );
  }

  it("controle: linha mínima entra (e a segunda viva na mesma conversa, não)", async () => {
    const c = await cenario();
    await expect(inserir(c, "")).resolves.toBeTruthy();
    await expect(inserir(c, "")).rejects.toMatchObject({ code: "23505" });
  });
  it("expiração além de 14 dias é recusada", async () => {
    const c = await cenario();
    await expect(inserir(c, "expira_em=now() + interval '15 days'")).rejects.toMatchObject({ code: "23514" });
  });
  it("encerrada sem motivo é recusada", async () => {
    const c = await cenario();
    await expect(inserir(c, "encerrada_em=now()")).rejects.toMatchObject({ code: "23514" });
  });
  it("modo desconhecido é recusado", async () => {
    const c = await cenario();
    await expect(inserir(c, "modo='sozinho'")).rejects.toMatchObject({ code: "23514" });
  });
});

describe("modo assistido: rascunho da IA sobre a condução", () => {
  async function begin(c: Cenario, agent: string, version: string) {
    return (
      await pool.query("select * from fn_reply_begin($1,$2,$3,$4,$5)", [c.org, c.conversation, agent, version, randomUUID()])
    ).rows[0];
  }
  async function asUser(user: string, sql: string, args: unknown[]) {
    const cli = await pool.connect();
    try {
      await cli.query("begin");
      await cli.query("set local role authenticated");
      await cli.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({ sub: user, role: "authenticated", aal: "aal1" }),
      ]);
      const r = await cli.query(sql, args);
      await cli.query("commit");
      return r;
    } catch (e) {
      await cli.query("rollback");
      throw e;
    } finally {
      cli.release();
    }
  }
  const approveSql = "select fn_reply_action($1,$2,$3,'approve',$4,null) as job";

  async function conducaoAssistida() {
    const c = await cenario({ modo: "assistido", operationMode: "assisted" });
    expect((await responder(c)).modo).toBe("ia");
    // A pessoa que revisa precisa enxergar a conversa (mesma montagem de autonomia-replies).
    await pool.query("update conversations set assigned_to_user_id=$1 where id=$2", [GOV_AGENT_A, c.conversation]);
    return c;
  }

  it("⭐ fn_reply_begin aceita o agente da condução e recusa outro (40001)", async () => {
    const c = await conducaoAssistida();
    const outro = randomUUID();
    const outraVersao = randomUUID();
    await pool.query("insert into ai_agents(id,organization_id,name,system_prompt,operation_mode) values($1,$2,'Outro','P','assisted')", [
      outro,
      c.org,
    ]);
    await pool.query(
      `insert into ai_agent_versions(id,organization_id,agent_id,version_number,system_prompt,provider,model,channel_session_id,status)
       values($1,$2,$3,1,'P','anthropic','test-model',$4,'published')`,
      [outraVersao, c.org, outro, c.channel],
    );
    await pool.query("update ai_agents set published_version_id=$1 where id=$2", [outraVersao, outro]);
    // controle: a recusa abaixo é pela condução ter fixado o agente na conversa
    expect((await pool.query("select active_ai_agent_id from conversations where id=$1", [c.conversation])).rows[0].active_ai_agent_id).toBe(
      c.agent,
    );
    await expect(begin(c, outro, outraVersao)).rejects.toMatchObject({ code: "40001" });
    const d = await begin(c, c.agent, c.agentVersion);
    expect(d.agent_id).toBe(c.agent);
  });

  it("ciclo: rascunho → mensagem nova do lead → aprovar falha (40001) → segundo rascunho", async () => {
    const c = await conducaoAssistida();
    const d1 = await begin(c, c.agent, c.agentVersion);
    await pool.query("update ai_reply_drafts set status='pending',original_body='Olá',edited_body='Olá' where id=$1", [d1.id]);
    await pool.query(
      `insert into messages(organization_id,contact_id,conversation_id,channel_session_id,direction,type,body,status,external_id,sent_at)
       values($1,$2,$3,$4,'inbound','text','E o preço?','received',$5,now())`,
      [c.org, c.contact, c.conversation, c.channel, randomUUID()],
    );
    await expect(asUser(GOV_AGENT_A, approveSql, [c.org, d1.id, String(d1.revision), "Olá"])).rejects.toMatchObject({
      code: "40001",
    });
    const d2 = await begin(c, c.agent, c.agentVersion);
    expect(d2.id).not.toBe(d1.id);
  });

  it("viewer não aprova (42501); controle: o agente da equipe aprova", async () => {
    const c = await conducaoAssistida();
    const d = await begin(c, c.agent, c.agentVersion);
    await pool.query("update ai_reply_drafts set status='pending',original_body='Olá',edited_body='Olá' where id=$1", [d.id]);
    await expect(asUser(GOV_VIEWER, approveSql, [c.org, d.id, String(d.revision), "Olá"])).rejects.toMatchObject({
      code: "42501",
    });
    const r = await asUser(GOV_AGENT_A, approveSql, [c.org, d.id, String(d.revision), "Olá"]);
    expect(r.rows[0].job).toBeTruthy();
  });
});
