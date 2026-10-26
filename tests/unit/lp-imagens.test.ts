import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { IMAGENS } from "../../site/lib/imagens";

const PASTA = join(__dirname, "../../site/public/_lp/img");

describe("mapa de imagens da LP", () => {
  it("todo id marcado como disponível tem os três formatos em public/_lp/img", () => {
    const faltando: string[] = [];
    for (const [id, m] of Object.entries(IMAGENS)) {
      if (!m.disponivel) continue;
      for (const ext of ["avif", "webp", "jpg"]) {
        if (!existsSync(join(PASTA, `${id}.${ext}`))) faltando.push(`${id}.${ext}`);
      }
    }
    expect(faltando).toEqual([]);
  });

  it("largura e altura declaradas são positivas (evitam salto de layout)", () => {
    for (const m of Object.values(IMAGENS)) {
      expect(m.largura).toBeGreaterThan(0);
      expect(m.altura).toBeGreaterThan(0);
    }
  });
});
