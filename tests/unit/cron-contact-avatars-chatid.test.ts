import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ContatoAvatar from "@/lib/channels/contact-avatar";

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
/** Lote inteiro, quando o teste precisa de mais de um contato. */
let lote: Record<string, unknown>[] | null = null;
/** Argumentos de cada `.or()` da consulta de contatos. */
const orsDosContatos: string[] = [];
/** `id` de cada contato carimbado (UPDATE em `contacts`). */
const carimbados: string[] = [];
/** O que o canal responde ao pedido — cada teste pode trocar. */
let comportamentoDoCanal: (input: { recipient: string }) => Promise<string | null> = async () =>
  "https://pps.whatsapp.net/foto.jpg";
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
      return comportamentoDoCanal(input);
    },
  }),
}));

// O download cercado tem a própria suíte (`foto-de-perfil-download.test.ts`);
// aqui ele só precisa devolver uma imagem.
vi.mock("@/lib/channels/contact-avatar", async (real) => ({
  ...(await real<typeof ContatoAvatar>()),
  baixarFotoDePerfil: async () => ({ buffer: Buffer.from([1, 2, 3]), mime: "image/jpeg" }),
}));

type Linha = Record<string, unknown>;
/** `filtra = false` no lote de contatos: cada teste já entrega o contato elegível. */
function consulta(linhas: () => Linha[], filtra = true) {
  const filtros: ((l: Linha) => boolean)[] = [];
  const ordens: { col: string; asc: boolean }[] = [];
  let limite = Infinity;
  const comparar = (a: Linha, b: Linha) => {
    for (const { col, asc } of ordens) {
      const [x, y] = [String(a[col] ?? ""), String(b[col] ?? "")];
      if (x !== y) return (x < y ? -1 : 1) * (asc ? 1 : -1);
    }
    return 0;
  };
  const resultado = () =>
    linhas()
      .filter((l) => !filtra || filtros.every((f) => f(l)))
      .sort(comparar)
      .slice(0, limite);
  const q: Record<string, unknown> = {
    eq: (col: string, v: unknown) => (filtros.push((l) => l[col] === v), q),
    in: (col: string, vs: unknown[]) => (filtros.push((l) => vs.includes(l[col])), q),
    not: (col: string, _op: string, _v: unknown) => (filtros.push((l) => l[col] != null), q),
    is: (col: string, _v: null) => (filtros.push((l) => l[col] == null), q),
    or: (f: string) => {
      if (!filtra) orsDosContatos.push(f);
      return q;
    },
    order: (col: string, o?: { ascending?: boolean }) => {
      ordens.push({ col, asc: o?.ascending !== false });
      return q;
    },
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
              ? (lote ?? [linhaDoContato])
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
              if (prop === "eq") {
                return (col: string, v: unknown) => {
                  if (col === "id") carimbados.push(String(v));
                  return proxy;
                };
              }
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
  lote = null;
  orsDosContatos.length = 0;
  carimbados.length = 0;
  comportamentoDoCanal = async () => "https://pps.whatsapp.net/foto.jpg";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
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

describe("cron de fotos: escolha da sessão sem conversa, sessão arquivada e filtro", () => {
  const contato = {
    id: CONTATO,
    organization_id: ORG,
    wa_identity: "phone:+5511999990000",
    wa_lid: null,
    instagram_igsid: null,
    phone_number: "+5511999990000",
    avatar_storage_path: null,
  };
  const sessao = (id: string, criada: string, extra: Record<string, unknown> = {}) => ({
    id,
    organization_id: ORG,
    status: "WORKING",
    provider: "waha",
    waha_session_name: id,
    created_at: criada,
    ...extra,
  });

  it("sem conversa: a sessão compatível MAIS RECENTE, não a primeira da lista", async () => {
    // A antiga vem primeiro: é o que um `limit(1)` sem ordem devolveria.
    sessoes = [sessao("antiga", "2026-01-01T00:00:00Z"), sessao("recente", "2026-09-01T00:00:00Z")];
    linhaDoContato = contato;

    await chamar();

    expect(referencias).toEqual(["recente"]);
  });

  it("sessão arquivada não é usada, mesmo WORKING e mais recente", async () => {
    sessoes = [
      sessao("arquivada", "2026-09-01T00:00:00Z", { archived_at: "2026-09-02T00:00:00Z" }),
      sessao("viva", "2026-01-01T00:00:00Z"),
    ];
    linhaDoContato = contato;

    await chamar();

    expect(referencias).toEqual(["viva"]);
  });

  it("a varredura usa UM filtro só, com o AND escrito", async () => {
    linhaDoContato = contato;

    await chamar();

    expect(orsDosContatos).toHaveLength(1);
    expect(orsDosContatos[0]).toMatch(
      /^and\(or\(wa_identity\.not\.is\.null,instagram_igsid\.not\.is\.null\),or\(avatar_updated_at\.is\.null,avatar_updated_at\.lt\.[^)]+\)\)$/,
    );
  });
});

describe("cron de fotos: orçamento da rodada", () => {
  const contatoN = (n: number) => ({
    id: `contato-${n}`,
    organization_id: ORG,
    wa_identity: `phone:+551199999000${n}`,
    wa_lid: null,
    instagram_igsid: null,
    phone_number: null,
    avatar_storage_path: null,
  });

  it("estourou o prazo: para de pegar contato e não carimba quem não tentou", async () => {
    let agora = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => agora);
    // Cada chamada ao canal leva 20 s: o 3º contato começaria aos 40 s.
    comportamentoDoCanal = async () => {
      agora += 20_000;
      return "https://pps.whatsapp.net/foto.jpg";
    };
    lote = [contatoN(1), contatoN(2), contatoN(3), contatoN(4)];

    const corpo = (await (await chamar()).json()) as { data: Record<string, number> };

    expect(pedidos).toHaveLength(2);
    expect(corpo.data).toMatchObject({ scanned: 4, updated: 2, deferred: 2 });
    expect(carimbados).not.toContain("contato-3");
    expect(carimbados).not.toContain("contato-4");
  });

  it("canal que estoura o prazo: a tentativa fica carimbada (não prende o topo da fila)", async () => {
    comportamentoDoCanal = async () => {
      throw new Error("verdash_unreachable: The operation was aborted due to timeout");
    };
    lote = [contatoN(1), contatoN(2)];

    const corpo = (await (await chamar()).json()) as { data: Record<string, number> };

    expect(corpo.data).toMatchObject({ failed: 2, updated: 0 });
    expect(carimbados).toEqual(["contato-1", "contato-2"]);
  });
});
