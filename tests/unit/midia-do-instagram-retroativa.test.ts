/**
 * Recuperação das mensagens antigas do Instagram (scripts/midia-do-instagram-retroativa.ts):
 * simula por padrão, separa ponteiro que responde de vencido, e com `--aplicar`
 * devolve o ponteiro à linha e pede a persistência — idempotente.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { anexosDoArquivo, recuperarMidiaDoInstagram } from "../../scripts/midia-do-instagram-retroativa";

const CDN = (id: string) => `https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=${id}&signature=FICTICIO`;

type Linha = Record<string, unknown>;
let mensagens: Linha[];
let arquivo: Record<string, unknown>;
let updates: Linha[];
let inserts: Linha[];
let eventos: Linha[];

function admin() {
  return {
    from: (tabela: string) => {
      const filtros: Array<[string, unknown]> = [];
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: string, v: unknown) => (filtros.push([c, v]), q),
        is: () => q,
        order: () => q,
        limit: () => q,
        maybeSingle: async () => {
          const ext = filtros.find(([c]) => c === "payload_parsed->>provider_message_id")?.[1] as string;
          return { data: arquivo[ext] ? { payload_parsed: arquivo[ext] } : null, error: null };
        },
        then: (ok: (r: unknown) => unknown) => ok({ data: tabela === "messages" ? mensagens : [], error: null }),
        update: (patch: Linha) => {
          const id = () => filtros.find(([c]) => c === "id")?.[1];
          const u: Record<string, unknown> = {
            eq: (c: string, v: unknown) => (filtros.push([c, v]), u),
            is: () => u,
            select: async () => {
              const alvo = mensagens.find((l) => l.id === id() && l.media_url == null);
              if (!alvo) return { data: [], error: null };
              Object.assign(alvo, patch);
              updates.push(patch);
              return { data: [{ id: alvo.id }], error: null };
            },
          };
          return u;
        },
        insert: (linhas: Linha[]) => {
          inserts.push(...linhas);
          return { select: async () => ({ data: linhas.map((_, i) => ({ id: `extra-${i}` })), error: null }) };
        },
      };
      return q;
    },
    rpc: async (_n: string, args: Linha) => {
      eventos.push(args);
      return { error: null };
    },
  };
}

const vivo = async () => ({ buffer: Buffer.from([1]), mime: "image/jpeg" });
const baixar = async (url: string) => {
  if (url.includes("vencido")) throw new Error("meta_media_download_failed: 403");
  return vivo();
};

beforeEach(() => {
  mensagens = [
    { id: "m1", organization_id: "org-a", conversation_id: "c1", contact_id: "k1", channel_session_id: "s1", external_id: "mid-1", sent_at: "2026-09-30T10:00:00Z", metadata: { instagram_tem_anexo: true }, media_url: null },
    { id: "m2", organization_id: "org-a", conversation_id: "c1", contact_id: "k1", channel_session_id: "s1", external_id: "mid-2", sent_at: "2026-09-29T10:00:00Z", metadata: { instagram_tem_anexo: true }, media_url: null },
    { id: "m3", organization_id: "org-a", conversation_id: "c1", contact_id: "k1", channel_session_id: "s1", external_id: "mid-3", sent_at: "2026-09-28T10:00:00Z", metadata: { instagram_tem_anexo: true }, media_url: null },
  ];
  arquivo = {
    "mid-1": { tipo: "direct", evento: { message: { attachments: [{ type: "image", payload: { url: CDN("1") } }, { type: "ig_reel", payload: { reel_video_id: "r1", title: "t", url: CDN("2") } }] } } },
    "mid-2": { tipo: "direct", evento: { message: { attachments: [{ type: "story_mention", payload: { url: CDN("vencido") } }] } } },
    // mid-3: o payload saiu do arquivo (retenção)
  };
  updates = [];
  inserts = [];
  eventos = [];
});

describe("recuperação das mensagens antigas do Instagram", () => {
  it("lê os anexos do payload arquivado", () => {
    expect(anexosDoArquivo(arquivo["mid-1"]).midias.map((a) => a.tipoNaMeta)).toEqual(["image", "ig_reel"]);
    expect(anexosDoArquivo(null)).toEqual({ midias: [], links: [], temporaria: false });
  });

  it("SIMULA por padrão: mede o que responde e o que venceu, sem gravar nada", async () => {
    const r = await recuperarMidiaDoInstagram(admin() as never, { aplicar: false, max: 100, baixar, log: () => {} });
    // Só o 1º arquivo de cada mensagem é testado (é a única mídia que a linha guarda).
    expect(r).toMatchObject({ mensagens: 3, semPayload: 1, anexos: 3, respondem: 1, vencidos: 1, recuperadas: 0 });
    expect(r.porTipo).toEqual({ image: 1, ig_reel: 1, story_mention: 1 });
    expect(updates).toEqual([]);
    expect(inserts).toEqual([]);
    expect(eventos).toEqual([]);
  });

  it("--aplicar: só UPDATE na linha existente (extra no metadata), NENHUM insert; vencido fica", async () => {
    const r = await recuperarMidiaDoInstagram(admin() as never, { aplicar: true, max: 100, baixar, log: () => {} });
    expect(r.recuperadas).toBe(1);
    expect(updates).toEqual([expect.objectContaining({ media_url: CDN("1"), type: "image" })]);
    expect((updates[0]!.metadata as Record<string, unknown>).instagram_anexos_extras).toEqual([
      { tipo: "ig_reel", url: CDN("2") },
    ]);
    expect(inserts).toEqual([]);
    expect(eventos.map((e) => e.p_entity_id)).toEqual(["m1"]);
    expect(mensagens.find((m) => m.id === "m2")!.media_url).toBeNull();
  });

  it("idempotente: a segunda rodada não devolve o mesmo ponteiro de novo", async () => {
    await recuperarMidiaDoInstagram(admin() as never, { aplicar: true, max: 100, baixar, log: () => {} });
    updates = [];
    eventos = [];
    await recuperarMidiaDoInstagram(admin() as never, { aplicar: true, max: 100, baixar, log: () => {} });
    expect(updates).toEqual([]);
  });
});
