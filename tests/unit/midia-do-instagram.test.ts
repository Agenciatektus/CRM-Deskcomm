/**
 * MÍDIA DO DIRECT DO INSTAGRAM (#13 da auditoria).
 *
 *  - o parser lê o anexo de cada tipo que a Meta manda (imagem, vídeo, áudio,
 *    arquivo, menção em story, compartilhamento, reel) e descarta o que não tem
 *    ponteiro utilizável;
 *  - o ingest grava UMA linha por anexo com `media_url` e pede a persistência
 *    (o mesmo evento do WhatsApp), na conversa e na organização da sessão;
 *  - o download não vira SSRF: host fora da allowlist recusado, redirecionamento
 *    para host interno recusado, IP interno atrás de nome da Meta recusado,
 *    teto de bytes;
 *  - o worker corrige o tipo pelo mime quando o canal não sabia (story/post).
 *
 * Os payloads seguem a forma do webhook de mensagens do Instagram (objeto
 * `messaging` cru que a Verdash encaminha em `evento`), com ids e assinaturas
 * trocados por valores fictícios.
 */
import { describe, expect, it, vi } from "vitest";

import { lerAnexos } from "@/lib/channels/instagram/anexos";
import { lerEventoDoInstagram } from "@/lib/channels/instagram/evento";
import { instagramInbound } from "@/lib/channels/instagram/ingest";
import { baixarMidiaDaMeta, hostDaMetaPermitido } from "@/lib/messaging/media/baixar-midia-da-meta";
import { tipoPeloMime } from "@/workers/media-persist-worker";

vi.mock("@/lib/leads/fontes-do-funil", () => ({
  fonteDaEntrada: () => "instagram_direct",
  funilQueAceita: async () => "pipeline-1",
}));
vi.mock("@/lib/channels/marcar-conversa", () => ({ marcarConversaComMensagem: async () => {} }));
vi.mock("@/lib/channels/pos-entrada", () => ({ aplicarEfeitosPosEntrada: async () => {} }));

const CDN = (id: string) =>
  `https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=${id}&signature=AbCdEfFICTICIO_${id}`;

/** O envelope da Verdash com o `messaging` cru da Meta dentro. */
function envelope(attachments: unknown[], extra: Record<string, unknown> = {}) {
  return {
    tipo: "direct",
    provider_message_id: "aWdfZAFICTICIO",
    ad_id: null,
    evento: {
      sender: { id: "1784000000000001" },
      recipient: { id: "1784000000000999" },
      timestamp: 1_791_000_000_000,
      message: { mid: "aWdfZAFICTICIO", attachments, ...extra },
    },
  };
}

const PAYLOADS = {
  imagem: { type: "image", payload: { url: CDN("100") } },
  video: { type: "video", payload: { url: CDN("200") } },
  audio: { type: "audio", payload: { url: CDN("300") } },
  arquivo: { type: "file", payload: { url: CDN("400") } },
  mencaoEmStory: { type: "story_mention", payload: { url: CDN("500") } },
  compartilhamento: { type: "share", payload: { url: CDN("600") } },
  reel: { type: "ig_reel", payload: { reel_video_id: "1790000000000700", title: "legenda", url: CDN("700") } },
};

describe("o parser lê o anexo de cada tipo", () => {
  it.each([
    ["imagem", "image", "image"],
    ["video", "video", "video"],
    ["audio", "audio", "audio"],
    ["arquivo", "file", "document"],
    ["mencaoEmStory", "story_mention", null],
    ["compartilhamento", "share", null],
    ["reel", "ig_reel", null],
  ] as const)("%s → tipo na Meta %s, tipo da linha %s", (nome, tipoNaMeta, tipoDaMensagem) => {
    const [a] = lerAnexos([PAYLOADS[nome]]);
    expect(a).toEqual({ tipoNaMeta, url: PAYLOADS[nome].payload.url, tipoDaMensagem });
  });

  it("anexo sem url, url http ou lixo é descartado (a tela mostra o aviso de anexo)", () => {
    expect(
      lerAnexos([
        { type: "image" },
        { type: "image", payload: { url: "http://lookaside.fbsbx.com/x" } },
        { type: "image", payload: { url: "nao-e-url" } },
        "lixo",
      ]),
    ).toEqual([]);
  });

  it("o evento carrega os anexos lidos; resposta a story continua 'story'", () => {
    const r = lerEventoDoInstagram(
      envelope([PAYLOADS.imagem], { reply_to: { story: { id: "s1", url: CDN("900") } } }),
      new Date().toISOString(),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mensagem.entrada).toBe("story");
    expect(r.mensagem.anexos).toHaveLength(1);
  });
});

/** Admin falso que guarda o que o ingest escreve. */
function fazerAdmin() {
  const inserts: Record<string, unknown>[] = [];
  const eventos: Record<string, unknown>[] = [];
  const consulta = () => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "order", "limit"]) q[m] = () => q;
    q.maybeSingle = async () => ({ data: { id: "contato-1" }, error: null });
    return q;
  };
  const admin = {
    from: (tabela: string) => ({
      ...consulta(),
      insert: (payload: Record<string, unknown> | Record<string, unknown>[]) => {
        const linhas = Array.isArray(payload) ? payload : [payload];
        if (tabela === "messages") inserts.push(...linhas);
        const ids = linhas.map((_, i) => ({ id: `msg-${i}` }));
        return {
          select: () => ({
            maybeSingle: async () => ({ data: ids[0], error: null }),
            then: (ok: (r: unknown) => unknown) => ok({ data: ids, error: null }),
          }),
        };
      },
      update: () => {
        const u: Record<string, unknown> = {};
        for (const m of ["eq", "is"]) u[m] = () => u;
        return u;
      },
    }),
    rpc: async (nome: string, args: Record<string, unknown>) => {
      if (nome === "emit_event") eventos.push(args);
      return { data: "conversa-b", error: null };
    },
  };
  return { inserts, eventos, admin: admin as never };
}

async function ingerir(corpo: unknown, admin: never, org = "org-b") {
  return instagramInbound(admin, {
    rawBody: JSON.stringify(corpo),
    session: { id: "sessao-b", organization_id: org },
  } as never);
}

describe("o ingest grava o anexo e pede a persistência", () => {
  it("imagem + vídeo: duas linhas com media_url, na org da sessão, e dois pedidos ao worker", async () => {
    const { inserts, eventos, admin } = fazerAdmin();
    const r = await ingerir(envelope([PAYLOADS.imagem, PAYLOADS.video], { text: "olha" }), admin);
    expect(r.ok).toBe(true);
    expect(inserts.map((l) => [l.type, l.media_url, l.external_id, l.body])).toEqual([
      ["image", CDN("100"), "aWdfZAFICTICIO", "olha"],
      ["video", CDN("200"), "aWdfZAFICTICIO:anexo:1", null],
    ]);
    expect(inserts.every((l) => l.organization_id === "org-b" && l.conversation_id === "conversa-b")).toBe(true);
    expect(eventos.map((e) => [e.p_event_type, e.p_entity_id, e.p_organization_id])).toEqual([
      ["media.persist_requested", "msg-0", "org-b"],
      ["media.persist_requested", "msg-1", "org-b"],
    ]);
  });

  it("menção em story: nasce 'image' com tipo_pelo_mime, e o worker corrige pelo mime", async () => {
    const { inserts, admin } = fazerAdmin();
    await ingerir(envelope([PAYLOADS.mencaoEmStory]), admin);
    expect(inserts[0]!.type).toBe("image");
    expect(inserts[0]!.metadata).toMatchObject({ instagram_anexo_tipo: "story_mention", tipo_pelo_mime: true });
    expect(tipoPeloMime("video/mp4")).toBe("video");
    expect(tipoPeloMime("image/jpeg")).toBe("image");
    expect(tipoPeloMime("audio/mp4")).toBe("audio");
    expect(tipoPeloMime("application/pdf")).toBe("document");
  });

  it("CONTROLE: Direct só de texto continua uma linha 'text', sem pedido ao worker", async () => {
    const { inserts, eventos, admin } = fazerAdmin();
    const corpo = envelope([], { text: "oi" });
    await ingerir(corpo, admin);
    expect(inserts.map((l) => l.type)).toEqual(["text"]);
    expect(eventos).toEqual([]);
  });
});

/** `fetch` falso: responde por URL, e registra o que foi pedido. */
function fetchFalso(respostas: Record<string, () => Response>) {
  const pedidos: string[] = [];
  const impl = (async (url: string) => {
    pedidos.push(url);
    const r = respostas[url];
    if (!r) throw new Error(`fetch inesperado: ${url}`);
    return r();
  }) as unknown as typeof fetch;
  return { impl, pedidos };
}
const destinoOk = async () => {};

describe("o download não vira SSRF", () => {
  it("allowlist: só https em host da Meta", () => {
    expect(hostDaMetaPermitido(new URL("https://lookaside.fbsbx.com/x"))).toBe(true);
    expect(hostDaMetaPermitido(new URL("https://scontent-gru2-1.cdninstagram.com/x"))).toBe(true);
    expect(hostDaMetaPermitido(new URL("https://video.xx.fbcdn.net/x"))).toBe(true);
    expect(hostDaMetaPermitido(new URL("http://lookaside.fbsbx.com/x"))).toBe(false);
    expect(hostDaMetaPermitido(new URL("https://fbsbx.com.atacante.com/x"))).toBe(false);
    expect(hostDaMetaPermitido(new URL("https://evilfbsbx.com/x"))).toBe(false);
  });

  it("host fora da allowlist é recusado ANTES de qualquer requisição", async () => {
    const { impl, pedidos } = fetchFalso({});
    await expect(
      baixarMidiaDaMeta("https://169.254.169.254/latest/meta-data", { fetchImpl: impl, conferirDestino: destinoOk }),
    ).rejects.toThrow(/host_not_allowed/);
    await expect(
      baixarMidiaDaMeta("https://exemplo.com/foto.jpg", { fetchImpl: impl, conferirDestino: destinoOk }),
    ).rejects.toThrow(/host_not_allowed/);
    expect(pedidos).toEqual([]);
  });

  it("redirecionamento para host interno é recusado, e o interno nunca é pedido", async () => {
    const { impl, pedidos } = fetchFalso({
      [CDN("100")]: () => new Response(null, { status: 302, headers: { location: "http://supabase-kong:8000/rest/v1/" } }),
    });
    await expect(baixarMidiaDaMeta(CDN("100"), { fetchImpl: impl, conferirDestino: destinoOk })).rejects.toThrow(
      /host_not_allowed/,
    );
    await expect(
      baixarMidiaDaMeta(CDN("100"), {
        fetchImpl: fetchFalso({
          [CDN("100")]: () =>
            new Response(null, { status: 302, headers: { location: "https://169.254.169.254/latest/" } }),
        }).impl,
        conferirDestino: destinoOk,
      }),
    ).rejects.toThrow(/host_not_allowed/);
    expect(pedidos).toEqual([CDN("100")]);
  });

  it("nome da Meta que resolvesse para IP interno é recusado (a conferência de destino roda a cada salto)", async () => {
    const conferidos: string[] = [];
    const conferir = async (host: string) => {
      conferidos.push(host);
      if (host === "scontent.cdninstagram.com") throw new Error("unsafe_url:private_ip");
    };
    const { impl } = fetchFalso({
      [CDN("100")]: () =>
        new Response(null, { status: 302, headers: { location: "https://scontent.cdninstagram.com/v/t1/foto.jpg" } }),
    });
    await expect(baixarMidiaDaMeta(CDN("100"), { fetchImpl: impl, conferirDestino: conferir })).rejects.toThrow(
      /private_ip/,
    );
    expect(conferidos).toEqual(["lookaside.fbsbx.com", "scontent.cdninstagram.com"]);
  });

  it("CONTROLE: redirecionamento DENTRO da Meta é seguido e a mídia chega", async () => {
    const destino = "https://scontent.cdninstagram.com/v/t1/foto.jpg";
    const { impl } = fetchFalso({
      [CDN("100")]: () => new Response(null, { status: 302, headers: { location: destino } }),
      [destino]: () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/jpeg" } }),
    });
    const r = await baixarMidiaDaMeta(CDN("100"), { fetchImpl: impl, conferirDestino: destinoOk });
    expect(r.mime).toBe("image/jpeg");
    expect([...r.buffer]).toEqual([1, 2, 3]);
  });

  it("redirecionamento em laço para no teto", async () => {
    const { impl } = fetchFalso({
      [CDN("100")]: () => new Response(null, { status: 302, headers: { location: CDN("100") } }),
    });
    await expect(baixarMidiaDaMeta(CDN("100"), { fetchImpl: impl, conferirDestino: destinoOk })).rejects.toThrow(
      /too_many_redirects/,
    );
  });

  it("teto de bytes: pelo content-length declarado e pelo que de fato chega", async () => {
    const grande = fetchFalso({
      [CDN("100")]: () =>
        new Response(new Uint8Array(10), { status: 200, headers: { "content-length": "999999999" } }),
    });
    await expect(
      baixarMidiaDaMeta(CDN("100"), { fetchImpl: grande.impl, conferirDestino: destinoOk, tetoBytes: 1000 }),
    ).rejects.toThrow(/too_large/);
    const mentiroso = fetchFalso({ [CDN("100")]: () => new Response(new Uint8Array(5000), { status: 200 }) });
    await expect(
      baixarMidiaDaMeta(CDN("100"), { fetchImpl: mentiroso.impl, conferirDestino: destinoOk, tetoBytes: 1000 }),
    ).rejects.toThrow(/too_large/);
  });

  it("ponteiro vencido (403 da Meta) vira erro de download, não mídia vazia", async () => {
    const { impl } = fetchFalso({ [CDN("100")]: () => new Response("URL signature expired", { status: 403 }) });
    await expect(baixarMidiaDaMeta(CDN("100"), { fetchImpl: impl, conferirDestino: destinoOk })).rejects.toThrow(
      /download_failed: 403/,
    );
  });
});
