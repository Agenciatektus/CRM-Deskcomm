import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

/** Prova o caminho Postgres real: autorização, idempotência, eventos e fila juntos. */
const container = process.env.TEST_DB_CONTAINER;
if (!container) throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:db`");

const port = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`,
  max: 2,
});

const ORG = "06180000-0000-4000-8000-000000000001";
const CONTACT = "06180000-0000-4000-8000-000000000002";
const SESSION = "06180000-0000-4000-8000-000000000003";
const CONVERSATION = "06180000-0000-4000-8000-000000000004";
const CASE_RESOLVED = "06180000-0000-4000-8000-000000000005";
const CASE_QUESTION = "06180000-0000-4000-8000-000000000006";
const PHONE = "+5511990000001";

async function reply(input: {
  caseId: string;
  action: "resolved" | "need_lead_info";
  body: string;
  messageKey: string;
  phones?: string[];
}) {
  const client = await pool.connect();
  try {
    await client.query("set role service_role");
    await client.query("select set_config('request.jwt.claim.role', 'service_role', false)");
    await client.query(
      "select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', false)",
    );
    const result = await client.query<{ fn_responder_caso_por_whatsapp: string }>(
      `select public.fn_responder_caso_por_whatsapp(
         $1::uuid, $2::uuid, $3::uuid, $4::text[], $5::text, $6::text, $7::text
       ) as fn_responder_caso_por_whatsapp`,
      [ORG, input.caseId, SESSION, input.phones ?? [PHONE], input.action, input.body, input.messageKey],
    );
    const row = result.rows[0];
    if (!row) throw new Error("RPC returned no row");
    return row.fn_responder_caso_por_whatsapp;
  } finally {
    await client.query("reset role");
    await client.query("select set_config('request.jwt.claim.role', '', false)");
    await client.query("select set_config('request.jwt.claims', '{}', false)");
    client.release();
  }
}

async function replySemCredencialDeServico() {
  const client = await pool.connect();
  try {
    await client.query("select set_config('request.jwt.claim.role', 'authenticated', false)");
    await client.query(
      "select set_config('request.jwt.claims', '{\"role\":\"authenticated\"}', false)",
    );
    await client.query(
      `select public.fn_responder_caso_por_whatsapp(
         $1::uuid, $2::uuid, $3::uuid, $4::text[], 'resolved', 'Resposta', 'unauthorized-key'
       )`,
      [ORG, CASE_RESOLVED, SESSION, [PHONE]],
    );
  } finally {
    await client.query("select set_config('request.jwt.claim.role', '', false)");
    await client.query("select set_config('request.jwt.claims', '{}', false)");
    client.release();
  }
}

beforeAll(async () => {
  await pool.query(
    `insert into public.organizations (id, slug, legal_name, display_name)
     values ($1, 'whatsapp-case-reply-0618', 'Teste 0618', 'Teste 0618') on conflict (id) do nothing`,
    [ORG],
  );
  await pool.query(
    `insert into public.contacts (id, organization_id, name, phone_number)
     values ($1, $2, 'Contato de teste', '+5511990000002') on conflict (id) do nothing`,
    [CONTACT, ORG],
  );
  await pool.query(
    `insert into public.channel_sessions
       (id, organization_id, waha_session_name, status, webhook_secret_encrypted)
     values ($1, $2, 'case-reply-0618', 'WORKING', '\\x00'::bytea) on conflict (id) do nothing`,
    [SESSION, ORG],
  );
  await pool.query(
    `insert into public.conversations (id, organization_id, contact_id, channel_session_id, status, is_group)
     values ($1, $2, $3, $4, 'ai_handling', false) on conflict (id) do nothing`,
    [CONVERSATION, ORG, CONTACT, SESSION],
  );
  await pool.query(
    `insert into public.config_aviso_de_caso
       (organization_id, channel_session_id, telefone_destino, ligado)
     values ($1, $2, $3, true) on conflict (organization_id) do update
       set channel_session_id = excluded.channel_session_id,
           telefone_destino = excluded.telefone_destino, ligado = true`,
    [ORG, SESSION, PHONE],
  );
  for (const caseId of [CASE_RESOLVED, CASE_QUESTION]) {
    await pool.query(
      `insert into public.agent_cases (id, organization_id, conversation_id, status, title, summary, blocker)
       values ($1, $2, $3, 'awaiting_human', 'Dúvida de tamanho', 'Cliente quer saber o tamanho', 'Confirmar com a equipe')
       on conflict (id) do nothing`,
      [caseId, ORG, CONVERSATION],
    );
    await pool.query(
      `insert into public.entregas_de_aviso_de_caso
         (organization_id, case_id, destino, channel_session_id, status, enviado_em)
       values ($1, $2, $3, $4, 'enviado', now())
       on conflict (organization_id, case_id, destino) do update
         set channel_session_id = excluded.channel_session_id,
             status = 'enviado', enviado_em = now()`,
      [ORG, caseId, PHONE, SESSION],
    );
  }
});

afterAll(async () => {
  await pool.query("delete from public.organizations where id = $1", [ORG]);
  await pool.end();
});

describe("resposta do funcionário pelo WhatsApp", () => {
  it("recusa uma chamada sem a credencial service_role", async () => {
    await expect(replySemCredencialDeServico()).rejects.toThrow("service_role_required");
  });

  it("responde ao cliente pela IA e grava transição, trilha e job no mesmo fluxo", async () => {
    const first = await reply({
      caseId: CASE_RESOLVED,
      action: "resolved",
      body: "A escola confirmou o tamanho G para 15 anos.",
      messageKey: "session:wamid-first",
    });
    expect(first).toBe("accepted");

    const state = await pool.query(
      "select status from public.agent_cases where id = $1",
      [CASE_RESOLVED],
    );
    expect(state.rows[0].status).toBe("resolved");

    const event = await pool.query(
      `select kind, actor_kind, human_action, body, metadata->>'source' as source
         from public.agent_case_events where case_id = $1 and kind = 'human_replied'`,
      [CASE_RESOLVED],
    );
    expect(event.rows).toEqual([
      {
        kind: "human_replied",
        actor_kind: "human",
        human_action: "resolved",
        body: "A escola confirmou o tamanho G para 15 anos.",
        source: "whatsapp",
      },
    ]);

    const job = await pool.query(
      `select kind, contact_id, payload->>'action' as action, payload->>'body' as body
         from public.job_queue where organization_id = $1 and kind = 'case_reply_turn'
           and payload->>'case_id' = $2`,
      [ORG, CASE_RESOLVED],
    );
    expect(job.rows).toEqual([
      {
        kind: "case_reply_turn",
        contact_id: CONTACT,
        action: "resolved",
        body: "A escola confirmou o tamanho G para 15 anos.",
      },
    ]);

    expect(
      await reply({
        caseId: CASE_RESOLVED,
        action: "resolved",
        body: "A escola confirmou o tamanho G para 15 anos.",
        messageKey: "session:wamid-first",
      }),
    ).toBe("duplicate");
    const jobsAfterDuplicate = await pool.query(
      `select count(*)::int as count from public.job_queue
        where organization_id = $1 and kind = 'case_reply_turn' and payload->>'case_id' = $2`,
      [ORG, CASE_RESOLVED],
    );
    expect(jobsAfterDuplicate.rows[0].count).toBe(1);
  });

  it("PERGUNTAR devolve a próxima pergunta ao cliente pela IA", async () => {
    expect(
      await reply({
        caseId: CASE_QUESTION,
        action: "need_lead_info",
        body: "Pergunte qual escola a pessoa frequenta.",
        messageKey: "session:wamid-question",
      }),
    ).toBe("accepted");
    const state = await pool.query(
      "select status from public.agent_cases where id = $1",
      [CASE_QUESTION],
    );
    expect(state.rows[0].status).toBe("awaiting_lead");
  });

  it("não aceita outro telefone nem caso sem entrega enviada", async () => {
    expect(
      await reply({
        caseId: CASE_QUESTION,
        action: "resolved",
        body: "Resposta não autorizada.",
        messageKey: "session:wamid-wrong-phone",
        phones: ["+5511988880000"],
      }),
    ).toBe("unauthorized");
    expect(
      await reply({
        caseId: "06180000-0000-4000-8000-000000000099",
        action: "resolved",
        body: "Resposta sem caso.",
        messageKey: "session:wamid-no-case",
      }),
    ).toBe("case_unavailable");
  });
});
