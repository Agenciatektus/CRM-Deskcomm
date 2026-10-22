/**
 * Reentrega não chega ao INSERT de `messages` — e a corrida segue segura pela
 * constraint (substitui parte da #59).
 *
 * ═══ POR QUE A LEITURA ANTES DO INSERT ═══
 *
 * `messages_org_external_id_unique` é DEFERRABLE INITIALLY DEFERRED. Um INSERT
 * com `(organization_id, external_id)` repetido NÃO falha na hora: roda os
 * gatilhos de `messages` inteiros (o `trg_messages_emit_event`, que emite o
 * `message.received` que acorda a IA, a demanda, a revisão de atendimento) e só
 * estoura o 23505 no COMMIT, que desfaz tudo. Correto, mas caro a cada
 * reentrega do provedor.
 *
 * ═══ O QUE ESTES CASOS MEDEM (no Postgres de verdade) ═══
 *
 * Um gatilho de TESTE `after insert` em `messages` chama `nextval` de uma
 * sequência. Sequência não volta no ROLLBACK: é o contador que enxerga "o
 * gatilho rodou" mesmo quando o COMMIT desfaz a linha.
 *
 *  - CONTROLE: o INSERT cru repetido roda o gatilho (o contador sobe) e só
 *    falha no COMMIT com 23505. É o custo que a leitura evita;
 *  - `insertMessage` (canal Verdash/FZAP, pelo mesmo cliente que a rota usa)
 *    na reentrega devolve `duplicate` SEM o contador subir: o INSERT nem foi;
 *  - corrida: com a leitura cega (a outra entrega gravou depois da leitura), o
 *    INSERT bate na constraint e o desfecho continua `duplicate`, sem 2ª linha;
 *  - corrida crua: duas transações abertas com a mesma chave; o INSERT da 2ª
 *    espera a 1ª, e o COMMIT da 2ª recebe 23505.
 */
import pg from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { insertMessage } from "@/lib/channels/verdash/gravacao";
import type { VerdashInboundMessage } from "@/lib/channels/verdash/webhook";

import { pgComoSupabase } from "../pg-como-supabase";

const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:db` (scripts/test-db.sh)");
}

const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`,
  max: 4,
});
const db = pgComoSupabase(pool);

const ORG = "d3d00000-0059-4000-8000-000000000001";
const SESSAO = "d3d00000-0059-4000-8000-000000000002";
const CONTATO = "d3d00000-0059-4000-8000-000000000003";
const CONVERSA = "d3d00000-0059-4000-8000-000000000004";

function mensagem(externalId: string): VerdashInboundMessage {
  return {
    kind: "message",
    externalId,
    direction: "inbound",
    chat: "5566999990059@s.whatsapp.net",
    identity: { phone: "+5566999990059", lid: null, displayName: null },
    isGroup: false,
    text: "oi, tudo bem?",
    attachments: [],
    sentAt: null,
    tipo: "text",
    extra: {},
    alteracao: null,
    ignorar: null,
  } as VerdashInboundMessage;
}

function entrada(externalId: string) {
  return {
    organizationId: ORG,
    conversationId: CONVERSA,
    contactId: CONTATO,
    channelSessionId: SESSAO,
    msg: mensagem(externalId),
  };
}

async function disparos(): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    "select last_value::text as n from teste_dedupe_disparos",
  );
  return Number(rows[0]!.n);
}

async function linhas(externalId: string): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    "select count(*)::text as n from messages where organization_id = $1 and external_id = $2",
    [ORG, externalId],
  );
  return Number(rows[0]!.n);
}

/** INSERT cru com as colunas mínimas, fora de qualquer leitura. */
async function insertCru(cliente: pg.Pool | pg.PoolClient, externalId: string): Promise<void> {
  await cliente.query(
    `insert into messages
       (organization_id, conversation_id, contact_id, channel_session_id, external_id,
        direction, sent_via, status, type, body, sent_at)
     values ($1, $2, $3, $4, $5, 'inbound', 'external_device', 'delivered', 'text', 'oi', now())`,
    [ORG, CONVERSA, CONTATO, SESSAO, externalId],
  );
}

beforeAll(async () => {
  await pool.query(
    `insert into organizations (id, slug, legal_name, display_name)
     values ($1, 'dedupe-0059', 'Dedupe 0059 LTDA', 'Dedupe 0059') on conflict (id) do nothing`,
    [ORG],
  );
  await pool.query(
    `insert into channel_sessions (id, organization_id, waha_session_name, webhook_secret_encrypted)
     values ($1, $2, 'dedupe-0059', '\\x00'::bytea) on conflict (id) do nothing`,
    [SESSAO, ORG],
  );
  await pool.query(
    `insert into contacts (id, organization_id, name, phone_number)
     values ($1, $2, 'Contato do dedupe', '+5566999990059') on conflict (id) do nothing`,
    [CONTATO, ORG],
  );
  await pool.query(
    `insert into conversations (id, organization_id, contact_id, channel_session_id, channel, status, is_group)
     values ($1, $2, $3, $4, 'whatsapp', 'open', false) on conflict (id) do nothing`,
    [CONVERSA, ORG, CONTATO, SESSAO],
  );
  // O contador do gatilho. Este arquivo roda num banco só seu (o setupFile
  // recria o banco por arquivo), então o gatilho de teste não vaza.
  await pool.query(`
    create sequence teste_dedupe_disparos;
    create function teste_dedupe_conta() returns trigger language plpgsql as $$
    begin perform nextval('teste_dedupe_disparos'); return new; end $$;
    create trigger zz_teste_dedupe_conta after insert on messages
      for each row execute function teste_dedupe_conta();
  `);
  // O 1º nextval não muda o last_value (só liga o is_called): consome-o aqui
  // para que cada disparo dali em diante apareça como +1.
  await pool.query("select nextval('teste_dedupe_disparos')");
});

afterAll(async () => {
  await pool.end();
});

describe("messages: dedup antes do INSERT", () => {
  it("CONTROLE: a constraint é deferível — o INSERT repetido roda o gatilho e só falha no COMMIT", async () => {
    await insertCru(pool, "wamid.CRU-1");
    const antes = await disparos();

    const erro = await insertCru(pool, "wamid.CRU-1").then(
      () => null,
      (e: { code?: string }) => e.code,
    );

    expect(erro).toBe("23505");
    expect(await disparos()).toBe(antes + 1); // rodou à toa
    expect(await linhas("wamid.CRU-1")).toBe(1);
  });

  it("reentrega pelo insertMessage: duplicate e o gatilho NÃO roda", async () => {
    const primeira = await insertMessage(db, entrada("3EB0-DEDUPE-1"));
    expect(primeira).toMatch(/^[0-9a-f-]{36}$/);
    const depoisDaPrimeira = await disparos();

    const reentrega = await insertMessage(db, entrada("3EB0-DEDUPE-1"));

    expect(reentrega).toBe("duplicate");
    expect(await disparos()).toBe(depoisDaPrimeira);
    expect(await linhas("3EB0-DEDUPE-1")).toBe(1);
  });

  it("corrida: a leitura não viu a linha, a constraint segura e o desfecho é duplicate", async () => {
    await insertMessage(db, entrada("3EB0-DEDUPE-CORRIDA"));
    // A outra entrega commitou DEPOIS da leitura: a leitura devolve vazio.
    const leituraCega = {
      from(tabela: string) {
        const real = db.from(tabela);
        if (tabela !== "messages") return real;
        const vazio: Record<string, unknown> = {
          eq: () => vazio,
          limit: () => vazio,
          maybeSingle: async () => ({ data: null, error: null }),
        };
        return { ...real, select: () => vazio };
      },
    } as unknown as SupabaseClient;

    expect(await insertMessage(leituraCega, entrada("3EB0-DEDUPE-CORRIDA"))).toBe("duplicate");
    expect(await linhas("3EB0-DEDUPE-CORRIDA")).toBe(1);
  });

  it("corrida crua: duas transações com a mesma chave, a segunda a commitar recebe 23505", async () => {
    const a = await pool.connect();
    const b = await pool.connect();
    try {
      await a.query("begin");
      await b.query("begin");
      await insertCru(a, "wamid.CORRIDA-CRUA");
      // O INSERT de B pode ESPERAR a transação de A (os gatilhos de `messages`
      // tocam a mesma conversa): dispara sem aguardar, e só então A commita.
      const insertDeB = insertCru(b, "wamid.CORRIDA-CRUA").then(
        () => null,
        (e: { code?: string }) => e.code,
      );
      await a.query("commit");
      // deferível: o INSERT de B passa; quem recusa é o COMMIT
      expect(await insertDeB).toBeNull();
      const erro = await b.query("commit").then(
        () => null,
        (e: { code?: string }) => e.code,
      );
      expect(erro).toBe("23505");
      expect(await linhas("wamid.CORRIDA-CRUA")).toBe(1);
    } finally {
      await a.query("rollback").catch(() => undefined);
      await b.query("rollback").catch(() => undefined);
      a.release();
      b.release();
    }
  });
});
