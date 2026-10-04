/**
 * MÍDIA DA CONVERSA: URL estável por bloco, assinada em lote, e sem abrir acesso.
 *
 * Três coisas medidas aqui:
 *
 * 1. A URL de um caminho é a MESMA dentro do bloco (o navegador reaproveita a
 *    foto) e o `max-age` da rota termina antes de ela vencer.
 * 2. A lista de mensagens assina a página inteira numa chamada só, e a tela usa
 *    essa URL: abrir uma conversa com N mídias deixa de fazer N idas à rota.
 * 3. AUTORIZAÇÃO: o lote só assina o que a consulta de sessão devolveu. Usuário
 *    da org B não recebe URL de mídia da org A, nem pela lista nem pela rota
 *    individual; conversa sem acesso devolve nada. O CONTROLE NEGATIVO roda o
 *    mesmo cenário com um banco que ignora filtro e RLS e prova que o detector
 *    acusa o vazamento — sem ele, um detector cego passaria verde.
 */
import { render } from "@testing-library/react";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  /** Org ativa e orgs do usuário logado. */
  orgAtiva: "org-b",
  orgsDoUsuario: ["org-b"],
  /** Conversas que a RLS deixa este usuário ver. */
  conversasVisiveis: new Set<string>(["conv-b"]),
  /** Banco "sem RLS e sem filtro": o controle negativo. */
  semProtecao: false,
  assinados: [] as string[][],
  chamadasDeAssinatura: 0,
}));

type Linha = Record<string, unknown>;
const MENSAGENS: Linha[] = [
  ...[1, 2, 3].map((n) => ({
    id: `a-${n}`,
    organization_id: "org-a",
    conversation_id: "conv-a",
    type: "image",
    direction: "inbound",
    media_url: null,
    media_mime: "image/jpeg",
    media_storage_path: `org-a/conv-a/${n}.jpg`,
    channel_session_id: null,
    sent_at: `2026-10-04T10:0${n}:00Z`,
  })),
  ...[1, 2, 3, 4, 5].map((n) => ({
    id: `b-${n}`,
    organization_id: "org-b",
    conversation_id: "conv-b",
    type: "image",
    direction: "inbound",
    media_url: null,
    media_mime: "image/jpeg",
    media_storage_path: `org-b/conv-b/${n}.jpg`,
    channel_session_id: null,
    sent_at: `2026-10-04T11:0${n}:00Z`,
  })),
  {
    id: "b-oculta",
    organization_id: "org-b",
    conversation_id: "conv-b-alheia",
    type: "image",
    direction: "inbound",
    media_url: null,
    media_mime: "image/jpeg",
    media_storage_path: "org-b/conv-b-alheia/1.jpg",
    channel_session_id: null,
    sent_at: "2026-10-04T12:00:00Z",
  },
];

/** Cliente de SESSÃO falso: aplica a RLS (org do usuário + conversa visível) e os `.eq()`. */
function consulta(linhas: Linha[]) {
  const filtros: Array<[string, unknown]> = [];
  let limite = Infinity;
  const resultado = () => {
    const casadas = estado.semProtecao ? linhas : linhas.filter((l) => filtros.every(([c, v]) => l[c] === v));
    return casadas.slice(0, limite);
  };
  const q = {
    select: () => q,
    eq: (c: string, v: unknown) => {
      filtros.push([c, v]);
      return q;
    },
    order: () => q,
    or: () => q,
    limit: (n: number) => {
      limite = n;
      return q;
    },
    maybeSingle: async () => ({ data: resultado()[0] ?? null, error: null }),
    then: (ok: (r: { data: Linha[]; error: null }) => unknown) => ok({ data: resultado(), error: null }),
  };
  return q;
}
function visiveisPelaRls(): Linha[] {
  if (estado.semProtecao) return MENSAGENS;
  return MENSAGENS.filter(
    (m) =>
      estado.orgsDoUsuario.includes(m.organization_id as string) &&
      estado.conversasVisiveis.has(m.conversation_id as string),
  );
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-b" } }, error: null }) },
    from: () => consulta(visiveisPelaRls()),
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: {
      from: () => ({
        createSignedUrls: async (caminhos: string[], validade: number) => {
          estado.chamadasDeAssinatura += 1;
          estado.assinados.push([...caminhos]);
          return {
            data: caminhos.map((c) => ({
              path: c,
              signedUrl: `https://storage.teste/sign/${c}?validade=${validade}&n=${estado.chamadasDeAssinatura}`,
              error: null,
            })),
            error: null,
          };
        },
      }),
    },
  }),
}));
vi.mock("@/lib/auth/server", () => ({
  loadAuthUser: async () => ({ id: "user-b", idioma: "pt-BR", organizations: [] }),
  resolveActiveOrg: async () => ({ orgId: estado.orgAtiva, role: "agent" }),
}));

import { MediaRenderer } from "@/components/inbox/media/MediaRenderer";
import type { Message } from "@/lib/types/messaging";
import {
  BLOCO_S,
  assinarMidias,
  esquecerUrlsAssinadas,
  segundosAteVirarOBloco,
  validadeDaAssinaturaS,
} from "@/lib/messaging/media/url-assinada";
import { createAdminClient } from "@/lib/supabase/admin";

import { GET as listar } from "@/app/api/v1/conversations/[id]/messages/route";
import { GET as midiaIndividual } from "@/app/api/v1/messages/[id]/media/route";

async function abrirConversa(id: string): Promise<Array<Message & { media_signed_url: string | null }>> {
  const res = await listar(new NextRequest(`http://crm.teste/api/v1/conversations/${id}/messages?limit=50`), {
    params: Promise.resolve({ id }),
  });
  const corpo = (await res.json()) as { data?: Array<Message & { media_signed_url: string | null }> };
  return corpo.data ?? [];
}

/** O detector: caminhos da org A que chegaram a ser assinados ou devolvidos. */
function vazamentosDaOrgA(devolvidas: Array<{ media_signed_url: string | null }>): string[] {
  const assinadosDeA = estado.assinados.flat().filter((c) => c.startsWith("org-a/"));
  const devolvidasDeA = devolvidas
    .map((m) => m.media_signed_url)
    .filter((u): u is string => !!u && u.includes("/org-a/"));
  return [...assinadosDeA, ...devolvidasDeA];
}

beforeEach(() => {
  esquecerUrlsAssinadas();
  estado.orgAtiva = "org-b";
  estado.orgsDoUsuario = ["org-b"];
  estado.conversasVisiveis = new Set(["conv-b"]);
  estado.semProtecao = false;
  estado.assinados = [];
  estado.chamadasDeAssinatura = 0;
});

describe("URL estável por bloco", () => {
  it("dentro do bloco, o mesmo caminho devolve a MESMA URL, sem assinar de novo", async () => {
    const admin = createAdminClient();
    const inicio = Date.UTC(2026, 9, 4, 10, 5, 0);
    const a = await assinarMidias(admin, ["p/1.jpg"], inicio);
    const b = await assinarMidias(admin, ["p/1.jpg"], inicio + 40 * 60_000);
    expect(b.get("p/1.jpg")).toBe(a.get("p/1.jpg"));
    expect(estado.chamadasDeAssinatura).toBe(1);
  });

  it("o bloco virou: assina de novo (a URL não vive para sempre)", async () => {
    const admin = createAdminClient();
    const inicio = Date.UTC(2026, 9, 4, 10, 5, 0);
    const a = await assinarMidias(admin, ["p/1.jpg"], inicio);
    const b = await assinarMidias(admin, ["p/1.jpg"], inicio + BLOCO_S * 1000);
    expect(b.get("p/1.jpg")).not.toBe(a.get("p/1.jpg"));
    expect(estado.chamadasDeAssinatura).toBe(2);
  });

  it("o max-age termina pelo menos um bloco antes de a URL vencer, em qualquer instante", () => {
    for (let s = 0; s < 2 * BLOCO_S; s += 97) {
      const agora = Date.UTC(2026, 9, 4, 10, 0, 0) + s * 1000;
      const maxAge = segundosAteVirarOBloco(agora);
      const validade = validadeDaAssinaturaS(agora);
      expect(maxAge).toBeGreaterThan(0);
      expect(maxAge).toBeLessThanOrEqual(BLOCO_S);
      expect(validade - maxAge).toBe(BLOCO_S);
      expect(validade).toBeLessThanOrEqual(2 * BLOCO_S);
    }
  });

  it("a rota individual manda Cache-Control private com max-age coerente e Vary: Cookie", async () => {
    const res = await midiaIndividual(new NextRequest("http://crm.teste/api/v1/messages/b-1/media"), {
      params: Promise.resolve({ id: "b-1" }),
    });
    expect(res.status).toBe(302);
    const cc = res.headers.get("cache-control") ?? "";
    expect(cc).toMatch(/^private, max-age=\d+$/);
    expect(cc).not.toMatch(/public|s-maxage/);
    expect(Number(cc.split("=")[1])).toBeLessThanOrEqual(BLOCO_S);
    expect(res.headers.get("vary")).toBe("Cookie");
    expect(res.headers.get("location")).toContain("org-b/conv-b/1.jpg");
  });
});

describe("lote: abrir a conversa assina a página numa chamada", () => {
  it("5 mídias → 1 chamada de assinatura, e cada mensagem já vem com a URL", async () => {
    const msgs = await abrirConversa("conv-b");
    expect(msgs).toHaveLength(5);
    expect(estado.chamadasDeAssinatura).toBe(1);
    expect(estado.assinados[0]).toHaveLength(5);
    for (const m of msgs) expect(m.media_signed_url).toContain(m.media_storage_path as string);
  });

  it("reabrir no mesmo bloco não assina de novo e devolve as mesmas URLs", async () => {
    const primeira = await abrirConversa("conv-b");
    const segunda = await abrirConversa("conv-b");
    expect(estado.chamadasDeAssinatura).toBe(1);
    expect(segunda.map((m) => m.media_signed_url)).toEqual(primeira.map((m) => m.media_signed_url));
  });

  it("MEDIÇÃO: idas à rota de mídia ao montar N mídias — antes N, depois 0", async () => {
    const msgs = await abrirConversa("conv-b");
    const idasARota = (lista: Message[]) => {
      const { container, unmount } = render(
        <div>
          {lista.map((m) => (
            <MediaRenderer key={m.id} message={m} />
          ))}
        </div>,
      );
      const n = [...container.querySelectorAll("img")].filter((img) =>
        (img.getAttribute("src") ?? "").startsWith("/api/v1/messages/"),
      ).length;
      unmount();
      return n;
    };
    const semLote = msgs.map((m) => ({ ...m, media_signed_url: undefined }));
    expect(idasARota(semLote)).toBe(5);
    expect(idasARota(msgs)).toBe(0);
  });
});

describe("autorização: o lote não abre o que a rota individual fecha", () => {
  it("usuário da org B pedindo a conversa da org A: nada volta e nada da A é assinado", async () => {
    const msgs = await abrirConversa("conv-a");
    expect(msgs).toEqual([]);
    expect(vazamentosDaOrgA(msgs)).toEqual([]);
  });

  it("nem com a org A como 'ativa' forjada, se o usuário não é membro dela (RLS)", async () => {
    estado.orgAtiva = "org-a";
    const msgs = await abrirConversa("conv-a");
    expect(vazamentosDaOrgA(msgs)).toEqual([]);
  });

  it("rota individual: mensagem da org A pedida pela org B → 404, sem assinar", async () => {
    const res = await midiaIndividual(new NextRequest("http://crm.teste/api/v1/messages/a-1/media"), {
      params: Promise.resolve({ id: "a-1" }),
    });
    expect(res.status).toBe(404);
    expect(estado.chamadasDeAssinatura).toBe(0);
  });

  it("conversa da própria org SEM acesso (RLS) → nada volta, nada é assinado", async () => {
    const msgs = await abrirConversa("conv-b-alheia");
    expect(msgs).toEqual([]);
    expect(estado.chamadasDeAssinatura).toBe(0);
  });

  it("CONTROLE NEGATIVO: sem RLS e sem filtro, o mesmo cenário VAZA — e o detector acusa", async () => {
    estado.semProtecao = true;
    const msgs = await abrirConversa("conv-a");
    expect(vazamentosDaOrgA(msgs).length).toBeGreaterThan(0);
  });
});
