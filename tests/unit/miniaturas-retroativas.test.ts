/**
 * O preenchimento retroativo das miniaturas (scripts/miniaturas-retroativas.ts)
 * é idempotente, simula por padrão e não deixa arquivo sem dono.
 */
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { preencherMiniaturas } from "../../scripts/miniaturas-retroativas";

type Linha = Record<string, unknown>;

let jpeg: Buffer;
beforeAll(async () => {
  jpeg = await sharp({ create: { width: 2000, height: 1500, channels: 3, background: "#4a7" } })
    .composite([
      {
        input: Buffer.from(
          `<svg width="2000" height="1500"><text x="100" y="700" font-size="300">foto 9033</text></svg>`,
        ),
      },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
});

let tabela: Linha[];
let uploads: string[];
let removidos: string[];
/** Simula outra coisa (poda, LGPD) mexendo na linha entre a leitura e a gravação. */
let antesDeGravar: (() => void) | null;

function falso() {
  const consulta = (base: () => Linha[]) => {
    const filtros: Array<(l: Linha) => boolean> = [];
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (c: string, v: unknown) => (filtros.push((l) => l[c] === v), q),
      is: (c: string) => (filtros.push((l) => l[c] == null), q),
      not: (c: string) => (filtros.push((l) => l[c] != null), q),
      in: (c: string, vs: unknown[]) => (filtros.push((l) => vs.includes(l[c])), q),
      order: () => q,
      or: () => q,
      limit: () => q,
      then: (ok: (r: unknown) => unknown) => ok({ data: base().filter((l) => filtros.every((f) => f(l))), error: null }),
    };
    return { q, filtros };
  };
  return {
    from: () => ({
      select: () => consulta(() => tabela).q,
      update: (patch: Linha) => {
        const { q, filtros } = consulta(() => tabela);
        const atualizar = {
          ...q,
          select: () => ({
            then: (ok: (r: unknown) => unknown) => {
              antesDeGravar?.();
              const alvo = tabela.filter((l) => filtros.every((f) => f(l)));
              for (const l of alvo) Object.assign(l, patch);
              return ok({ data: alvo.map((l) => ({ id: l.id })), error: null });
            },
          }),
        };
        for (const k of ["eq", "is"] as const) {
          const original = q[k] as (...a: unknown[]) => unknown;
          (atualizar as Record<string, unknown>)[k] = (...a: unknown[]) => (original(...a), atualizar);
        }
        return atualizar;
      },
    }),
    storage: {
      from: () => ({
        download: async () => ({ data: new Blob([new Uint8Array(jpeg)]), error: null }),
        upload: async (caminho: string) => (uploads.push(caminho), { error: null }),
        remove: async (caminhos: string[]) => (removidos.push(...caminhos), { error: null }),
      }),
    },
  };
}

const opcoes = { lote: 10, max: 100, pausaMs: 1, log: () => {} };

beforeEach(() => {
  uploads = [];
  removidos = [];
  antesDeGravar = null;
  tabela = [1, 2, 3].map((n) => ({
    id: `m${n}`,
    organization_id: "org-a",
    conversation_id: "conv-a",
    type: "image",
    media_mime: "image/jpeg",
    media_storage_path: `org-a/conv-a/m${n}.jpg`,
    media_thumb_path: null,
    created_at: `2026-09-0${n}T00:00:00Z`,
  }));
});

describe("preenchimento retroativo de miniaturas", () => {
  it("SIMULA por padrão: lê e gera em memória, não grava nada", async () => {
    const r = await preencherMiniaturas(falso() as never, { ...opcoes, aplicar: false });
    expect(r.geradas).toBe(3);
    expect(uploads).toEqual([]);
    expect(tabela.every((l) => l.media_thumb_path === null)).toBe(true);
  });

  it("com --aplicar grava na pasta da org; a SEGUNDA rodada não refaz nada", async () => {
    const primeira = await preencherMiniaturas(falso() as never, { ...opcoes, aplicar: true });
    expect(primeira.geradas).toBe(3);
    expect(tabela.map((l) => l.media_thumb_path)).toEqual([
      "org-a/miniaturas/conv-a/m1.webp",
      "org-a/miniaturas/conv-a/m2.webp",
      "org-a/miniaturas/conv-a/m3.webp",
    ]);
    uploads = [];
    const segunda = await preencherMiniaturas(falso() as never, { ...opcoes, aplicar: true });
    expect(segunda.lidas).toBe(0);
    expect(uploads).toEqual([]);
  });

  it("a original saiu no meio (poda/LGPD): a miniatura recém-subida é apagada", async () => {
    antesDeGravar = () => {
      tabela[0]!.media_storage_path = null;
      antesDeGravar = null;
    };
    tabela = [tabela[0]!];
    const r = await preencherMiniaturas(falso() as never, { ...opcoes, aplicar: true });
    expect(r.geradas).toBe(0);
    expect(removidos).toEqual(["org-a/miniaturas/conv-a/m1.webp"]);
    expect(tabela[0]!.media_thumb_path).toBeNull();
  });
});
