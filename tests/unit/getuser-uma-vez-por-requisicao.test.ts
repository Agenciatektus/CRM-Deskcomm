// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * UM `getUser()` POR REQUISIÇÃO DE API (auditoria de desempenho, item 10).
 *
 * A rota de mensagens chamava o GoTrue DUAS vezes dentro do handler — a própria
 * rota e `loadAuthUser()` —, porque o `cache()` do React não memoriza fora de
 * renderização RSC (em Route Handler ele roda inteiro a cada chamada). Com o
 * `audit()` das rotas que gravam, eram três. Este arquivo roda a ROTA REAL, com
 * o `createClient` REAL e o `loadAuthUser` REAL; só o transporte é dublê.
 *
 * O controle negativo está nos casos de baixo: duas requisições continuam
 * fazendo duas perguntas (a memória não vaza de uma pessoa para outra), e erro
 * de rede não fica guardado (a segunda tentativa vai mesmo à rede).
 */

const estado = vi.hoisted(() => ({
  chamadasGetUser: 0,
  /** O objeto de cookies da requisição "corrente" — o Next cria um por requisição. */
  loja: null as unknown as { getAll: () => unknown[]; set: () => void; get: () => undefined },
  respostas: [] as Array<{ data: { user: unknown }; error: unknown }>,
  setAll: null as null | ((c: unknown[]) => void),
}));

function novaRequisicao() {
  estado.loja = { getAll: () => [], set: () => {}, get: () => undefined };
}

vi.mock("next/headers", () => ({ cookies: async () => estado.loja }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("redirect"); } }));
vi.mock("@/lib/logger", () => ({
  logger: { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} },
}));

const USUARIO = { id: "u-1", email: "a@b.c", user_metadata: {} };

vi.mock("@supabase/ssr", () => ({
  createServerClient: (_u: string, _k: string, opts: { cookies: { setAll: (c: unknown[]) => void } }) => {
    estado.setAll = opts.cookies.setAll;
    const folha: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "in", "order", "limit"]) folha[m] = () => folha;
    folha.maybeSingle = async () => ({ data: null, error: null });
    folha.then = (resolve: (v: unknown) => unknown) =>
      resolve({
        data: [
          {
            organization_id: "org-1",
            role: "admin",
            accepted_at: null,
            interface_settings: null,
            organizations: { display_name: "Org", locale: "pt-BR", timezone: null, currency: null, country: null },
            interface_da_empresa: null,
            situacao_da_empresa: { status: "active" },
          },
        ],
        error: null,
      });
    return {
      auth: {
        getUser: async () => {
          estado.chamadasGetUser++;
          return estado.respostas.shift() ?? { data: { user: USUARIO }, error: null };
        },
      },
      from: () => folha,
      rpc: async () => ({ data: null, error: null }),
    };
  },
}));

vi.mock("@/app/api/v1/messages/_handler", () => ({
  listMessagesHandler: async () => ({ messages: [], cursor: null, has_more: false }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/messaging/media/url-assinada", () => ({ anexarUrlsDeMidia: async (m: unknown[]) => m }));

import { NextRequest } from "next/server";

import { GET } from "@/app/api/v1/conversations/[id]/messages/route";
import { createClient } from "@/lib/supabase/server";

async function abrirConversa() {
  const req = new NextRequest("http://localhost/api/v1/conversations/c-1/messages?limit=50");
  return GET(req, { params: Promise.resolve({ id: "c-1" }) });
}

beforeEach(() => {
  estado.chamadasGetUser = 0;
  estado.respostas = [];
  novaRequisicao();
});

describe("getUser uma vez por requisição", () => {
  it("a rota de mensagens (rota + loadAuthUser) pergunta ao GoTrue UMA vez", async () => {
    const res = await abrirConversa();
    expect(res.status).toBe(200);
    expect(estado.chamadasGetUser).toBe(1);
  });

  it("controle negativo: duas requisições = duas perguntas (nada vaza entre requisições)", async () => {
    await abrirConversa();
    novaRequisicao();
    await abrirConversa();
    expect(estado.chamadasGetUser).toBe(2);
  });

  it("vários clientes da MESMA requisição compartilham a resposta, inclusive em paralelo", async () => {
    const [a, b] = await Promise.all([createClient(), createClient()]);
    const [ra, rb] = await Promise.all([a.auth.getUser(), b.auth.getUser()]);
    const rc = await (await createClient()).auth.getUser();
    expect(estado.chamadasGetUser).toBe(1);
    expect(ra.data.user).toEqual(USUARIO);
    expect(rb.data.user).toEqual(USUARIO);
    expect(rc.data.user).toEqual(USUARIO);
  });

  it("erro não fica guardado: a segunda tentativa vai de fato à rede", async () => {
    estado.respostas.push({ data: { user: null }, error: { name: "AuthRetryableFetchError", status: 0 } });
    const c = await createClient();
    const primeira = await c.auth.getUser();
    const segunda = await c.auth.getUser();
    expect(primeira.error).not.toBeNull();
    expect(segunda.data.user).toEqual(USUARIO);
    expect(estado.chamadasGetUser).toBe(2);
  });

  it("sessão mudou na requisição (setAll): a próxima pergunta vai ao GoTrue", async () => {
    const c = await createClient();
    await c.auth.getUser();
    estado.setAll!([]);
    await c.auth.getUser();
    expect(estado.chamadasGetUser).toBe(2);
  });

  it("getUser(jwt) com token explícito nunca usa a memória", async () => {
    const c = await createClient();
    await c.auth.getUser();
    await c.auth.getUser("outro-token");
    expect(estado.chamadasGetUser).toBe(2);
  });

  it("a resposta compartilhada vem congelada: um chamador não muda o user do outro", async () => {
    const c = await createClient();
    const a = await c.auth.getUser();
    const b = await c.auth.getUser();
    expect(Object.isFrozen(a.data.user)).toBe(true);
    expect(Object.isFrozen((a.data.user as { user_metadata: object }).user_metadata)).toBe(true);
    expect(() => {
      (a.data.user as { user_metadata: Record<string, unknown> }).user_metadata.role = "owner";
    }).toThrow(TypeError);
    expect((b.data.user as { user_metadata: Record<string, unknown> }).user_metadata.role).toBeUndefined();
  });
});
