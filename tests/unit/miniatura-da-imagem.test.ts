/**
 * MINIATURA DA IMAGEM (migration 9033) — o que é do APP.
 *
 *  - a miniatura de uma foto de celular sai webp, lado maior 512 px, e muito
 *    menor que a original (amostra medida, números no console);
 *  - o worker grava a miniatura na pasta da organização DA MENSAGEM (org B
 *    nunca escreve na pasta da A) e põe o caminho na linha;
 *  - miniatura que falha não derruba a persistência da original;
 *  - a lista assina original e miniatura na MESMA chamada em lote;
 *  - a anonimização (LGPD) enfileira a miniatura com o request_id do pedido.
 *
 * O que é do BANCO (triggers, CHECK, RPC real) está em
 * `tests/invariants/miniatura-sai-com-a-original.test.ts`.
 */
import { crc32, deflateSync } from "node:zlib";

import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  uploads: [] as Array<{ caminho: string; bytes: number; tipo: string }>,
  patches: [] as Array<Record<string, unknown>>,
  fila: [] as Array<Record<string, unknown>>,
  assinaturas: [] as string[][],
  mensagem: {
    id: "msg-b",
    organization_id: "org-b",
    conversation_id: "conv-b",
    channel_session_id: "sess-b",
    media_url: "http://canal/arquivo.jpg",
    media_mime: "image/jpeg",
    media_storage_path: null as string | null,
    metadata: {},
  },
  bytesDaMidia: Buffer.alloc(0) as Buffer,
  /** O `content-type` que o CDN/canal declarou no download. */
  mimeDaMidia: "image/jpeg",
  miniaturasDoContato: [] as Array<{ media_thumb_path: string }>,
  linhaRedigida: false,
  /** Banco com compare-and-set de verdade sobre `mensagem` (duas execuções). */
  casReal: false,
  /** Barreira: segura o download até as DUAS execuções terem lido a linha. */
  chegadas: 0,
  soltarDownloads: null as null | (() => void),
  barreira: null as null | Promise<void>,
  removidos: [] as string[],
}));

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/channels", () => ({
  CHANNEL_SESSION_REF_COLUMNS: "waha_session_name",
  DEFAULT_CHANNEL_PROVIDER: "waha",
  getAdapterOpcional: () => ({
    fetchInboundMedia: async () => {
      estado.chegadas += 1;
      if (estado.barreira) {
        if (estado.chegadas >= 2) estado.soltarDownloads?.();
        await estado.barreira;
      }
      return { buffer: estado.bytesDaMidia, mime: estado.mimeDaMidia };
    },
  }),
  resolveSessionRef: () => ({ wahaSessionName: "s" }),
}));

function encadeado(resultado: () => unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "not", "is", "order", "limit"]) q[m] = () => q;
  q.maybeSingle = async () => resultado();
  q.then = (ok: (v: unknown) => unknown) => ok(resultado());
  return q;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => ({
      ...encadeado(() => {
        if (tabela === "messages") {
          // Cópia: cada leitura é um retrato da linha naquele instante.
          return {
            data: estado.miniaturasDoContato.length ? estado.miniaturasDoContato : { ...estado.mensagem },
            error: null,
          };
        }
        if (tabela === "channel_sessions") return { data: { provider: "waha", waha_session_name: "s" }, error: null };
        if (tabela === "conversations") return { data: [{ id: "conv-a" }], error: null };
        if (tabela === "contacts") return { data: null, error: null };
        return { data: [], error: null };
      }),
      update: (patch: Record<string, unknown>) => {
        estado.patches.push(patch);
        // A corrida (P2-1): a anonimização rodou durante o download e o
        // compare-and-set não acha a linha — zero linhas mudam.
        return encadeado(() => {
          if (estado.casReal) {
            // Compare-and-set: só grava se a linha ainda está sem arquivo.
            if (estado.mensagem.media_storage_path !== null) return { data: [], error: null };
            Object.assign(estado.mensagem, patch);
            return { data: [{ id: "msg-b" }], error: null };
          }
          return { data: estado.linhaRedigida ? [] : [{ id: "msg-b" }], error: null };
        });
      },
      upsert: (linha: Record<string, unknown>) => {
        estado.fila.push(linha);
        return encadeado(() => ({ error: null }));
      },
    }),
    storage: {
      from: () => ({
        upload: async (caminho: string, dados: Uint8Array, opcoes: { contentType: string }) => {
          estado.uploads.push({ caminho, bytes: dados.byteLength, tipo: opcoes.contentType });
          return { error: null };
        },
        remove: async (caminhos: string[]) => {
          estado.removidos.push(...caminhos);
          return { error: null };
        },
        createSignedUrls: async (caminhos: string[]) => {
          estado.assinaturas.push([...caminhos]);
          return { data: caminhos.map((c) => ({ path: c, signedUrl: `https://st/${c}?t=1`, error: null })), error: null };
        },
      }),
    },
    rpc: async () => ({ data: {}, error: null }),
  }),
}));

import { cascadeRedactContact } from "@/lib/lgpd/redact-cascade";
import {
  LADO_MAIOR_DA_MINIATURA_PX,
  LIMITE_DE_PIXELS_DA_ENTRADA,
  caminhoDaMiniatura,
  gerarMiniatura,
} from "@/lib/messaging/media/miniatura";
import { anexarUrlsDeMidia, esquecerUrlsAssinadas } from "@/lib/messaging/media/url-assinada";
import { createAdminClient } from "@/lib/supabase/admin";
import { persistMessageMedia } from "@/workers/media-persist-worker";

/**
 * Amostra: "foto de celular" 4000×3000, JPEG q85, com textura em duas escalas
 * (detalhe grosso ampliado + grão fino). Ruído só fino ou só gradiente seriam
 * desonestos: um some na redução e a miniatura sairia com 1 KB, irreal.
 */
let fotoDeCelular: Buffer;
beforeAll(async () => {
  let semente = 9033;
  const aleatorio = () => {
    semente = (semente * 1103515245 + 12345) & 0x7fffffff;
    return semente;
  };
  const [largura, altura, w, h] = [4000, 3000, 400, 300];
  const grosso = Buffer.alloc(w * h * 3);
  for (let i = 0; i < grosso.length; i++) grosso[i] = aleatorio() % 256;
  const base = await sharp(grosso, { raw: { width: w, height: h, channels: 3 } })
    .resize(largura, altura, { kernel: "cubic" })
    .raw()
    .toBuffer();
  for (let i = 0; i < base.length; i++) base[i] = Math.max(0, Math.min(255, base[i]! + (aleatorio() % 33) - 16));
  fotoDeCelular = await sharp(base, { raw: { width: largura, height: altura, channels: 3 } })
    .jpeg({ quality: 85 })
    .toBuffer();
}, 60_000);

beforeEach(() => {
  estado.uploads = [];
  estado.patches = [];
  estado.fila = [];
  estado.assinaturas = [];
  estado.mensagem.media_storage_path = null;
  estado.bytesDaMidia = fotoDeCelular;
  estado.miniaturasDoContato = [];
  estado.linhaRedigida = false;
  estado.mimeDaMidia = "image/jpeg";
  estado.casReal = false;
  estado.chegadas = 0;
  estado.barreira = null;
  estado.soltarDownloads = null;
  (estado.mensagem as Record<string, unknown>).media_thumb_path = null;
  estado.removidos = [];
  esquecerUrlsAssinadas();
});

describe("a miniatura", () => {
  it("AMOSTRA: webp, lado maior 512 px, muito menor que a original", async () => {
    const mini = await gerarMiniatura(fotoDeCelular, "image/jpeg");
    expect(mini).not.toBeNull();
    const meta = await sharp(mini!).metadata();
    expect(meta.format).toBe("webp");
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(LADO_MAIOR_DA_MINIATURA_PX);
    const razao = mini!.byteLength / fotoDeCelular.byteLength;
    console.info(
      `[amostra 9033] original ${fotoDeCelular.byteLength} B (4000×3000 jpeg q85) → ` +
        `miniatura ${mini!.byteLength} B (${meta.width}×${meta.height} webp q70) = ${(razao * 100).toFixed(1)}%`,
    );
    expect(razao).toBeLessThan(0.1);
  });

  it("CONTA: abrir conversa com N imagens baixa N miniaturas em vez de N originais", async () => {
    const mini = (await gerarMiniatura(fotoDeCelular, "image/jpeg"))!;
    const N = 20;
    const antes = N * fotoDeCelular.byteLength;
    const depois = N * mini.byteLength;
    console.info(`[amostra 9033] conversa com ${N} imagens: antes ${antes} B, depois ${depois} B`);
    expect(depois).toBeLessThan(antes / 10);
  });

  it("tipo sem miniatura (gif, heic) devolve null: a tela usa a original", async () => {
    expect(await gerarMiniatura(fotoDeCelular, "image/gif")).toBeNull();
    expect(await gerarMiniatura(fotoDeCelular, "image/heic")).toBeNull();
  });

  it("o caminho fica sempre na pasta da organização", () => {
    expect(caminhoDaMiniatura("org-b", "conv-b", "msg-b")).toBe("org-b/miniaturas/conv-b/msg-b.webp");
  });
});

/**
 * BOMBA DE DESCOMPRESSÃO: PNG 20000×20000 (400 Mpx) de cinza 1 bit, toda zero.
 * Em bytes é pequena (~50 KB); decodificada, passa de 400 MB. Montada à mão
 * (IHDR + IDAT comprimido + IEND) para não precisar decodificar nada para criá-la.
 */
function pngBomba(lado: number): Buffer {
  const pedaco = (tipo: string, dados: Buffer) => {
    const tamanho = Buffer.alloc(4);
    tamanho.writeUInt32BE(dados.length);
    const corpo = Buffer.concat([Buffer.from(tipo, "ascii"), dados]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(corpo) >>> 0);
    return Buffer.concat([tamanho, corpo, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lado, 0);
  ihdr.writeUInt32BE(lado, 4);
  ihdr[8] = 1; // 1 bit por pixel
  ihdr[9] = 0; // cinza
  const linha = 1 + Math.ceil(lado / 8); // byte de filtro + pixels
  const idat = deflateSync(Buffer.alloc(linha * lado), { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pedaco("IHDR", ihdr),
    pedaco("IDAT", idat),
    pedaco("IEND", Buffer.alloc(0)),
  ]);
}

describe("BOMBA de descompressão (P1 da #75): sem miniatura, e nada cai", () => {
  it("PNG 20000×20000 de poucos KB: gerarMiniatura devolve null pelo teto, sem decodificar", async () => {
    const bomba = pngBomba(20_000);
    const meta = await sharp(bomba, { limitInputPixels: false }).metadata();
    // Controle da AMOSTRA: é mesmo uma imagem de 400 Mpx, pequena em bytes.
    expect(meta.width! * meta.height!).toBeGreaterThan(LIMITE_DE_PIXELS_DA_ENTRADA);
    expect(bomba.byteLength).toBeLessThan(200_000);
    const memoriaAntes = process.memoryUsage().rss;
    const inicio = Date.now();
    expect(await gerarMiniatura(bomba, "image/png")).toBeNull();
    // Recusada pelo cabeçalho: rápido, e sem os ~400 MB da decodificação.
    expect(Date.now() - inicio).toBeLessThan(2_000);
    expect(process.memoryUsage().rss - memoriaAntes).toBeLessThan(200 * 1024 * 1024);
  });

  it("CONTROLE: a foto normal continua gerando miniatura", async () => {
    expect(await gerarMiniatura(fotoDeCelular, "image/jpeg")).not.toBeNull();
  });

  it("a ORIGINAL da bomba é salva do mesmo jeito: o teto é só para a miniatura", async () => {
    estado.bytesDaMidia = pngBomba(20_000);
    const r = await persistMessageMedia({
      id: "ev",
      organization_id: "org-b",
      event_type: "media.persist_requested",
      entity_kind: "message",
      entity_id: "msg-b",
      payload: { message_id: "msg-b" },
      metadata: {},
      consumed_by: [],
      attempts: 0,
    } as never);
    expect(r.status).toBe("ok");
    expect(estado.uploads.map((u) => u.caminho)).toEqual(["org-b/conv-b/msg-b.jpg"]);
    expect(estado.patches.at(-1)).toMatchObject({ media_storage_path: "org-b/conv-b/msg-b.jpg" });
    expect(estado.patches.at(-1)).not.toHaveProperty("media_thumb_path");
  });
});

describe("CORRIDA com a anonimização (P2-1 da #75)", () => {
  it("a LGPD redigiu a linha durante o download: nada é gravado e os objetos recém-subidos saem", async () => {
    estado.linhaRedigida = true;
    const r = await persistMessageMedia({
      id: "ev",
      organization_id: "org-b",
      event_type: "media.persist_requested",
      entity_kind: "message",
      entity_id: "msg-b",
      payload: { message_id: "msg-b" },
      metadata: {},
      consumed_by: [],
      attempts: 0,
    } as never);
    expect(r.status).toBe("skipped");
    expect(estado.removidos).toEqual(["org-b/conv-b/msg-b.jpg", "org-b/miniaturas/conv-b/msg-b.webp"]);
  });

  it("P2-A: DUAS execuções do mesmo evento, intercaladas — a mídia final continua no bucket", async () => {
    estado.casReal = true;
    estado.barreira = new Promise<void>((soltar) => (estado.soltarDownloads = soltar));
    const evento = {
      id: "ev",
      organization_id: "org-b",
      event_type: "media.persist_requested",
      entity_kind: "message",
      entity_id: "msg-b",
      payload: { message_id: "msg-b" },
      metadata: {},
      consumed_by: [],
      attempts: 0,
    } as never;
    const resultados = await Promise.all([persistMessageMedia(evento), persistMessageMedia(evento)]);
    // As duas leram a linha vazia e subiram no MESMO caminho; uma gravou.
    expect(estado.chegadas).toBe(2);
    expect(resultados.map((r) => r.status).sort()).toEqual(["ok", "skipped"]);
    expect(estado.mensagem.media_storage_path).toBe("org-b/conv-b/msg-b.jpg");
    expect((estado.mensagem as Record<string, unknown>).media_thumb_path).toBe("org-b/miniaturas/conv-b/msg-b.webp");
    // A perdedora NÃO apaga o que a vencedora referenciou.
    expect(estado.removidos).toEqual([]);
  });

  it("CONTROLE: sem corrida, nada é removido", async () => {
    await persistMessageMedia({
      id: "ev",
      organization_id: "org-b",
      event_type: "media.persist_requested",
      entity_kind: "message",
      entity_id: "msg-b",
      payload: { message_id: "msg-b" },
      metadata: {},
      consumed_by: [],
      attempts: 0,
    } as never);
    expect(estado.removidos).toEqual([]);
  });
});

describe("o worker grava a miniatura na pasta da organização da mensagem", () => {
  it("org B: original e miniatura em org-b/, e o caminho vai para a linha", async () => {
    const r = await persistMessageMedia({
      id: "ev",
      organization_id: "org-b",
      event_type: "media.persist_requested",
      entity_kind: "message",
      entity_id: "msg-b",
      payload: { message_id: "msg-b" },
      metadata: {},
      consumed_by: [],
      attempts: 0,
    } as never);
    expect(r.status).toBe("ok");
    expect(estado.uploads.map((u) => u.caminho)).toEqual([
      "org-b/conv-b/msg-b.jpg",
      "org-b/miniaturas/conv-b/msg-b.webp",
    ]);
    expect(estado.uploads.every((u) => u.caminho.startsWith("org-b/"))).toBe(true);
    expect(estado.uploads[1]!.tipo).toBe("image/webp");
    expect(estado.patches.at(-1)).toMatchObject({
      media_storage_path: "org-b/conv-b/msg-b.jpg",
      media_thumb_path: "org-b/miniaturas/conv-b/msg-b.webp",
    });
  });

  it("imagem ilegível: a original é salva do mesmo jeito, sem miniatura", async () => {
    estado.bytesDaMidia = Buffer.from([1, 2, 3]);
    const r = await persistMessageMedia({
      id: "ev",
      organization_id: "org-b",
      event_type: "media.persist_requested",
      entity_kind: "message",
      entity_id: "msg-b",
      payload: { message_id: "msg-b" },
      metadata: {},
      consumed_by: [],
      attempts: 0,
    } as never);
    expect(r.status).toBe("ok");
    expect(estado.uploads.map((u) => u.caminho)).toEqual(["org-b/conv-b/msg-b.jpg"]);
    expect(estado.patches.at(-1)).toMatchObject({ media_storage_path: "org-b/conv-b/msg-b.jpg" });
    expect(estado.patches.at(-1)).not.toHaveProperty("media_thumb_path");
  });
});

describe("a lista assina a miniatura no mesmo lote", () => {
  it("N imagens com miniatura → UMA chamada com originais e miniaturas", async () => {
    const msgs = [1, 2, 3].map((n) => ({
      id: `m${n}`,
      media_storage_path: `org-b/conv-b/m${n}.jpg`,
      media_thumb_path: `org-b/miniaturas/conv-b/m${n}.webp`,
      media_mime: "image/jpeg",
    }));
    const r = await anexarUrlsDeMidia(createAdminClient() as never, msgs);
    expect(estado.assinaturas).toHaveLength(1);
    expect(estado.assinaturas[0]).toHaveLength(6);
    expect(r[0]!.media_thumb_signed_url).toContain("miniaturas/conv-b/m1.webp");
    expect(r[0]!.media_signed_url).toContain("conv-b/m1.jpg");
  });

  it("mensagem antiga sem miniatura: só a original, e a tela segue com ela", async () => {
    const r = await anexarUrlsDeMidia(createAdminClient() as never, [
      { id: "m", media_storage_path: "org-b/conv-b/m.jpg", media_thumb_path: null, media_mime: "image/jpeg" },
    ]);
    expect(r[0]!.media_thumb_signed_url).toBeNull();
    expect(r[0]!.media_signed_url).toContain("conv-b/m.jpg");
  });
});

describe("LGPD: a anonimização enfileira a miniatura com o pedido", () => {
  it("miniatura da org entra na fila com request_id; caminho de outra org é recusado", async () => {
    estado.miniaturasDoContato = [
      { media_thumb_path: "org-a/miniaturas/conv-a/m1.webp" },
      { media_thumb_path: "org-b/miniaturas/conv-b/intrusa.webp" },
    ];
    await cascadeRedactContact({ organizationId: "org-a", contactId: "c-a", requestId: "req-1" });
    const daFila = estado.fila.filter((l) => String(l.object_path).includes("/miniaturas/"));
    expect(daFila).toEqual([
      expect.objectContaining({
        organization_id: "org-a",
        request_id: "req-1",
        bucket: "whatsapp-media",
        object_path: "org-a/miniaturas/conv-a/m1.webp",
      }),
    ]);
  });
});

describe("mime declarado pelo CDN não é confiado (P2-3 da #79)", () => {
  const evento = {
    id: "ev",
    organization_id: "org-b",
    event_type: "media.persist_requested",
    entity_kind: "message",
    entity_id: "msg-b",
    payload: { message_id: "msg-b" },
    metadata: {},
    consumed_by: [],
    attempts: 0,
  } as never;

  it.each([
    ["text/html", "<html><script>alert(1)</script></html>"],
    ["image/svg+xml", '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
    ["application/x-msdownload", "MZ"],
  ])("%s: o OBJETO vai como application/octet-stream, sem miniatura; a coluna guarda o declarado", async (mime, corpo) => {
    estado.mimeDaMidia = mime;
    estado.bytesDaMidia = Buffer.from(corpo);
    const r = await persistMessageMedia(evento);
    expect(r.status).toBe("ok");
    expect(estado.uploads).toHaveLength(1);
    expect(estado.uploads[0]!.tipo).toBe("application/octet-stream");
    // A coluna é o RÓTULO da tela; quem decide exibir é o seguro (ver a rota).
    expect(estado.patches.at(-1)).toMatchObject({ media_mime: mime });
    expect(estado.patches.at(-1)).not.toHaveProperty("media_thumb_path");
  });

  it("CONTROLE: imagem, PDF e áudio guardam o mime declarado", async () => {
    for (const mime of ["image/jpeg", "application/pdf", "audio/ogg"]) {
      estado.uploads = [];
      estado.patches = [];
      estado.mimeDaMidia = mime;
      estado.bytesDaMidia = mime === "image/jpeg" ? fotoDeCelular : Buffer.from("conteudo");
      await persistMessageMedia(evento);
      expect(estado.uploads[0]!.tipo).toBe(mime);
      expect(estado.patches.at(-1)).toMatchObject({ media_mime: mime });
    }
  });
});
