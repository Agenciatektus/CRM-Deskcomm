import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Qual endereço o cron de fotos pede ao canal.
 *
 * `wa_identity` é GERADA com o telefone antes do lid (migration 0122). Num número
 * BR cujo `wa_id` não tem o nono dígito — comum em linhas antigas — derivar o
 * chatId dela produz `55AA9BBBBCCCC@c.us`, endereço que não existe no WhatsApp:
 * o provider responde `profilePictureURL: null`, o cron carimba "sem foto" e o
 * avatar nunca aparece. Medido numa instalação real: `check-exists` do WAHA
 * devolvia `{"numberExists":true,"chatId":"55AABBBBCCCC@c.us"}` (12 dígitos)
 * para um contato cujo `wa_identity` dizia 13, e o `@lid` do mesmo contato
 * devolvia a foto na hora.
 *
 * `wa_lid` não deriva de telefone, por isso vem primeiro — a MESMA ordem de
 * `resolveWahaChatId` (lib/waha/send.ts) e de `chatIdOf` (session-reconciler).
 */

const CONTATO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LID = "142704667287623";

/** O contato do lote — cada teste ajusta antes de chamar. */
let linhaDoContato: Record<string, unknown> = {};
/** Conversas e sessões do banco falso — os filtros `eq`/`in`/`not` são aplicados. */
let conversas: Record<string, unknown>[] = [];
let sessoes: Record<string, unknown>[] = [];
/** O que o cron pediu ao canal: provider, sessão e endereço. */
const pedidos: string[] = [];
const referencias: string[] = [];
const providersPedidos: string[] = [];

const SESSAO_WAHA = {
  id: "sessao-waha",
  organization_id: ORG,
  status: "WORKING",
  provider: "waha",
  waha_session_name: "sessao-de-teste",
};

vi.mock("@/lib/env", () => ({
  env: { INTERNAL_CRON_SECRET: "segredo-de-teste", INTERNAL_SECRET: "segredo-de-teste" },
}));

vi.mock("@/lib/channels", () => ({
  DEFAULT_CHANNEL_PROVIDER: "waha",
  // `getAdapterOpcional`: a rota passou a usar a porta que devolve `null` para canal
  // conhecido sem adapter local, em vez da que lança.
  getAdapterOpcional: (provider: string) => ({
    fetchProfilePictureUrl: async (input: { recipient: string; sessionRef: string }) => {
      providersPedidos.push(provider);
      referencias.push(input.sessionRef);
      pedidos.push(input.recipient);
      return "https://cdn.exemplo.invalid/foto.jpg";
    },
  }),
}));

type Linha = Record<string, unknown>;
/** `filtra = false` no lote de contatos: cada teste já entrega o contato elegível. */
function consulta(linhas: () => Linha[], filtra = true) {
  const filtros: ((l: Linha) => boolean)[] = [];
  let limite = Infinity;
  const resultado = () =>
    linhas()
      .filter((l) => !filtra || filtros.every((f) => f(l)))
      .slice(0, limite);
  const q: Record<string, unknown> = {
    eq: (col: string, v: unknown) => (filtros.push((l) => l[col] === v), q),
    in: (col: string, vs: unknown[]) => (filtros.push((l) => vs.includes(l[col])), q),
    not: (col: string, _op: string, _v: unknown) => (filtros.push((l) => l[col] != null), q),
    or: () => q,
    order: () => q,
    limit: (n: number) => ((limite = n), q),
    maybeSingle: async () => ({ data: resultado()[0] ?? null, error: null }),
    then: (ok: (v: unknown) => unknown) =>
      Promise.resolve({ data: resultado(), error: null }).then(ok),
  };
  return q;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => ({
      select: () =>
        consulta(
          () =>
            tabela === "contacts"
              ? [linhaDoContato]
              : tabela === "conversations"
                ? conversas
                : tabela === "channel_sessions"
                  ? sessoes
                  : [],
          tabela !== "contacts",
        ),
      update: () => {
        const proxy: Record<string, unknown> = new Proxy(
          {},
          {
            get(_t, prop) {
              if (prop === "then") {
                return (ok: (v: unknown) => unknown) =>
                  Promise.resolve({ data: [{ id: CONTATO }], error: null }).then(ok);
              }
              if (prop === "select") {
                return () => Promise.resolve({ data: [{ id: CONTATO }], error: null });
              }
              return () => proxy;
            },
          },
        );
        return proxy;
      },
      upsert: async () => ({ error: null }),
    }),
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  }),
}));

import { POST } from "@/app/api/v1/cron/contact-avatars/route";

beforeEach(() => {
  pedidos.length = 0;
  referencias.length = 0;
  providersPedidos.length = 0;
  conversas = [];
  sessoes = [SESSAO_WAHA];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })),
  );
});

function chamar(): Promise<Response> {
  return POST(
    new Request("http://localhost/api/v1/cron/contact-avatars", {
      method: "POST",
      headers: { authorization: "Bearer segredo-de-teste" },
    }) as never,
  );
}

describe("cron de fotos: qual endereço vai ao canal", () => {
  it("com wa_lid presente, pede pelo @lid — não pelo telefone do wa_identity", async () => {
    linhaDoContato = {
      id: CONTATO,
      organization_id: ORG,
      // O telefone tem o nono dígito; o wa_id real do contato não tem.
      wa_identity: "phone:+5587999577575",
      wa_lid: LID,
      phone_number: "+5587999577575",
      avatar_storage_path: null,
    };

    await chamar();

    expect(pedidos).toEqual([`${LID}@lid`]);
    // O endereço derivado do telefone é justamente o que não existe no WhatsApp.
    expect(pedidos).not.toContain("5587999577575@c.us");
  });

  it("sem wa_lid, continua caindo no wa_identity — retaguarda preservada", async () => {
    linhaDoContato = {
      id: CONTATO,
      organization_id: ORG,
      wa_identity: "phone:+5511999990000",
      wa_lid: null,
      phone_number: "+5511999990000",
      avatar_storage_path: null,
    };

    await chamar();

    expect(pedidos).toEqual(["5511999990000@c.us"]);
  });

  it("wa_identity no formato lid: também resolve para @lid", async () => {
    linhaDoContato = {
      id: CONTATO,
      organization_id: ORG,
      wa_identity: `lid:${LID}`,
      wa_lid: null,
      phone_number: null,
      avatar_storage_path: null,
    };

    await chamar();

    expect(pedidos).toEqual([`${LID}@lid`]);
  });
});

describe("cron de fotos: por qual sessão o pedido sai", () => {
  const OUTRA_SESSAO = {
    id: "sessao-do-contato",
    organization_id: ORG,
    status: "WORKING",
    provider: "waha",
    waha_session_name: "numero-do-contato",
  };
  const contatoWhatsapp = {
    id: CONTATO,
    organization_id: ORG,
    wa_identity: "phone:+5511999990000",
    wa_lid: null,
    instagram_igsid: null,
    phone_number: "+5511999990000",
    avatar_storage_path: null,
  };

  it("usa a sessão da conversa do contato, não a primeira da organização", async () => {
    // A primeira sessão da org vem antes na lista: é ela que o `limit(1)` antigo
    // pegava. O contato conversou pela segunda.
    sessoes = [SESSAO_WAHA, OUTRA_SESSAO];
    conversas = [
      { organization_id: ORG, contact_id: CONTATO, channel_session_id: OUTRA_SESSAO.id },
    ];
    linhaDoContato = contatoWhatsapp;

    await chamar();

    expect(referencias).toEqual(["numero-do-contato"]);
    expect(referencias).not.toContain("sessao-de-teste");
  });

  it("controle negativo: sem conversa, cai numa sessão compatível da mesma org", async () => {
    sessoes = [
      { ...OUTRA_SESSAO, organization_id: "outra-org", waha_session_name: "de-outro-tenant" },
      SESSAO_WAHA,
    ];
    linhaDoContato = contatoWhatsapp;

    await chamar();

    expect(referencias).toEqual(["sessao-de-teste"]);
  });

  it("sessão da conversa desconectada: não pega outra no lugar", async () => {
    sessoes = [SESSAO_WAHA, { ...OUTRA_SESSAO, status: "STOPPED" }];
    conversas = [
      { organization_id: ORG, contact_id: CONTATO, channel_session_id: OUTRA_SESSAO.id },
    ];
    linhaDoContato = contatoWhatsapp;

    await chamar();

    expect(pedidos).toEqual([]);
  });

  it("contato só com IGSID entra e pede pelo IGSID na conexão de Instagram", async () => {
    sessoes = [
      SESSAO_WAHA,
      {
        id: "sessao-ig",
        organization_id: ORG,
        status: "WORKING",
        provider: "instagram",
        verdash_instance_name: "conta-ig",
      },
    ];
    linhaDoContato = {
      id: CONTATO,
      organization_id: ORG,
      wa_identity: null,
      wa_lid: null,
      instagram_igsid: "17841400000000001",
      phone_number: null,
      avatar_storage_path: null,
    };

    await chamar();

    // A sessão WAHA vem primeiro e não serve a quem só tem IGSID.
    expect(providersPedidos).toEqual(["instagram"]);
    expect(referencias).toEqual(["conta-ig"]);
    expect(pedidos).toEqual(["17841400000000001"]);
  });

  it("WhatsApp pareado usa a referência da plataforma, não a coluna do WAHA", async () => {
    sessoes = [
      {
        id: "sessao-verdash",
        organization_id: ORG,
        status: "WORKING",
        provider: "verdash",
        verdash_instance_name: "instancia-pareada",
      },
    ];
    linhaDoContato = { ...contatoWhatsapp, wa_lid: LID };

    await chamar();

    expect(providersPedidos).toEqual(["verdash"]);
    expect(referencias).toEqual(["instancia-pareada"]);
    expect(pedidos).toEqual([`${LID}@lid`]);
  });
});
