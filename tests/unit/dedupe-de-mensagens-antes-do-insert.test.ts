/**
 * Dedup ANTES do INSERT de `messages`, a ligação em cada canal (substitui parte da #59).
 * O helper em si: lib/messaging/mensagem-ja-recebida.test.ts.
 *
 * `messages_org_external_id_unique` é DEFERRABLE INITIALLY DEFERRED: a
 * reentrega roda os gatilhos de `messages` inteiros (inclusive o que emite o
 * `message.received` que acorda a IA) e só estoura o 23505 no COMMIT. A leitura
 * pela chave da constraint, por organização, faz a reentrega sair antes. O
 * 23505 continua sendo a rede da corrida. A prova contra Postgres de verdade
 * (gatilho que não roda, constraint que segura a corrida) está em
 * tests/invariants/dedupe-de-mensagens-antes-do-insert.test.ts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ingestMetaInbound } from "@/lib/channels/meta/ingest";
import type { InboundMessageEvent } from "@/lib/channels/meta/webhook";
import { insertMessage } from "@/lib/channels/verdash/gravacao";
import type { VerdashInboundMessage } from "@/lib/channels/verdash/webhook";

vi.mock("@/lib/channels/contato-por-telefone", () => ({
  encontrarContatoPorTelefone: async () => null,
}));
vi.mock("@/lib/channels/pos-entrada", () => ({
  aplicarEfeitosPosEntrada: async () => undefined,
}));

type Leitura = { data: unknown; error: unknown } | "lanca";

/**
 * Admin falso de `messages`: a leitura devolve o que o caso manda; o INSERT é
 * registrado e devolve sucesso ou o 23505 que o COMMIT daria.
 */
function adminDeMensagens(leitura: Leitura, insertDa23505 = false) {
  const filtros: Array<[string, unknown]> = [];
  const inserts: Record<string, unknown>[] = [];
  const from = (tabela: string) => {
    if (tabela === "channel_sessions") {
      const c: Record<string, unknown> = {
        select: () => c,
        eq: () => c,
        is: () => c,
        maybeSingle: async () => ({ data: { id: "sessao-1", organization_id: "org-1" }, error: null }),
      };
      return c;
    }
    if (tabela !== "messages") throw new Error(`tabela inesperada: ${tabela}`);
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (coluna: string, valor: unknown) => {
        filtros.push([coluna, valor]);
        return q;
      },
      limit: () => q,
      maybeSingle: async () => {
        if (leitura === "lanca") throw new Error("rede caiu");
        return leitura;
      },
      insert: (linha: Record<string, unknown>) => {
        inserts.push(linha);
        return {
          select: () => ({
            maybeSingle: async () =>
              insertDa23505
                ? { data: null, error: { code: "23505", message: "duplicate key value" } }
                : { data: { id: "msg-nova" }, error: null },
          }),
        };
      },
    };
    return q;
  };
  const rpc = async (nome: string) => {
    if (nome === "fn_upsert_wa_contact") return { data: "contato-1", error: null };
    if (nome === "fn_upsert_wa_conversation") return { data: "conversa-1", error: null };
    return { data: null, error: null };
  };
  return { filtros, inserts, admin: { from, rpc } as unknown as SupabaseClient };
}

const NAO_EXISTE: Leitura = { data: null, error: null };
const EXISTE: Leitura = { data: { id: "msg-antiga" }, error: null };
const FALHOU: Leitura = { data: null, error: { code: "57014", message: "statement timeout" } };

const EVENTO_META: InboundMessageEvent = {
  kind: "inbound_message",
  wabaId: "waba-1",
  phoneNumberId: "phone-1",
  externalId: "wamid.REENTREGA",
  from: "5519999999999",
  profileName: "Cliente",
  sentAt: new Date("2026-10-22T12:00:00.000Z"),
  type: "text",
  text: "oi",
  media: null,
};

describe("canal oficial (Meta): ingestMetaInbound", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reentrega já gravada: duplicate sem INSERT", async () => {
    const { admin, inserts, filtros } = adminDeMensagens(EXISTE);
    const r = await ingestMetaInbound(admin, EVENTO_META, { organizationId: "org-1" });
    expect(r).toEqual({ status: "duplicate" });
    expect(inserts).toEqual([]);
    expect(filtros).toEqual([
      ["organization_id", "org-1"],
      ["external_id", "wamid.REENTREGA"],
    ]);
  });

  it("corrida: a leitura não viu, o 23505 do INSERT ainda devolve duplicate", async () => {
    const { admin, inserts } = adminDeMensagens(NAO_EXISTE, true);
    const r = await ingestMetaInbound(admin, EVENTO_META, { organizationId: "org-1" });
    expect(r).toEqual({ status: "duplicate" });
    expect(inserts).toHaveLength(1);
  });

  it("leitura falhou: a mensagem inédita entra mesmo assim (nunca perde mensagem)", async () => {
    const { admin, inserts } = adminDeMensagens(FALHOU);
    const r = await ingestMetaInbound(admin, EVENTO_META, { organizationId: "org-1" });
    expect(r).toMatchObject({ status: "ingested", messageId: "msg-nova" });
    expect(inserts).toHaveLength(1);
  });
});

const MSG_VERDASH: VerdashInboundMessage = {
  kind: "message",
  externalId: "3EB0REENTREGA",
  direction: "inbound",
  chat: "5566999990000@s.whatsapp.net",
  identity: { phone: "+5566999990000", lid: null, displayName: null },
  isGroup: false,
  text: "oi",
  attachments: [],
  sentAt: null,
  tipo: "text",
  extra: {},
  alteracao: null,
  ignorar: null,
} as VerdashInboundMessage;

const ENTRADA_VERDASH = {
  organizationId: "org-1",
  conversationId: "conversa-1",
  contactId: "contato-1",
  channelSessionId: "sessao-1",
  msg: MSG_VERDASH,
};

describe("canal Verdash/FZAP: insertMessage", () => {
  it("reentrega já gravada: duplicate sem INSERT", async () => {
    const { admin, inserts, filtros } = adminDeMensagens(EXISTE);
    expect(await insertMessage(admin, ENTRADA_VERDASH)).toBe("duplicate");
    expect(inserts).toEqual([]);
    expect(filtros).toEqual([
      ["organization_id", "org-1"],
      ["external_id", "3EB0REENTREGA"],
    ]);
  });

  it("corrida: o 23505 do INSERT continua devolvendo duplicate", async () => {
    const { admin, inserts } = adminDeMensagens(NAO_EXISTE, true);
    expect(await insertMessage(admin, ENTRADA_VERDASH)).toBe("duplicate");
    expect(inserts).toHaveLength(1);
  });

  it("CONTROLE: mensagem inédita entra", async () => {
    const { admin, inserts } = adminDeMensagens(NAO_EXISTE);
    expect(await insertMessage(admin, ENTRADA_VERDASH)).toBe("msg-nova");
    expect(inserts).toHaveLength(1);
  });
});
