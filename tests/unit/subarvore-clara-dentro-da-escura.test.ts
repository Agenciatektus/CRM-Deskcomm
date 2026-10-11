/**
 * Uma subárvore `data-theme="light"` dentro de página escura fica CLARA.
 *
 * O espelho de tokens (`[data-theme="light"]` no globals.css) sempre funcionou;
 * o que vazava eram os seletores que casam com QUALQUER ancestral escuro: o
 * `dark:` do Tailwind e as classes `pele-*`. Na vitrine do design system, com o
 * app escuro, o painel claro saía com o degradê do botão, o fundo da moldura e
 * o chip do escuro. Medido num Chromium antes e depois do recorte (PR desta
 * cerca). As duas provas abaixo leem o CSS de verdade: o compilado, para o
 * `dark:`, e o fonte, para a pele.
 */
import { readFileSync } from "node:fs";

import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { describe, expect, it } from "vitest";

import { cssDaMarca, ESCOPO_DO_PAINEL } from "@/lib/branding/css";

const FONTE = readFileSync("app/globals.css", "utf8");
const FORA = ':not(:where([data-theme="dark"] [data-theme="light"], [data-theme="dark"] [data-theme="light"] *))';

describe("subárvore clara dentro da escura", () => {
  it("toda regra de classe da pele escura recorta a subárvore clara", () => {
    const regras = FONTE.split("\n").filter((l) =>
      /^(\[data-theme="dark"\] |  )\.(pele-[a-z-]+|fundo-do-fio|trama-do-fio)\b.*\{$/.test(l),
    );
    // Controle: a varredura enxerga as regras (sem isto, lista vazia passaria).
    expect(regras.length).toBeGreaterThan(15);
    const semRecorte = regras.filter((l) => !l.includes(FORA));
    expect(semRecorte).toEqual([]);
  });

  it("o utilitário `dark:` compilado não casa dentro da subárvore clara", async () => {
    const from = "app/globals.css";
    const { css } = await postcss([tailwind()]).process(FONTE, { from });
    const regra = /\.dark\\:bg-\\\(image\\:--gradient-primary\\\)[^{]*\{/.exec(css)?.[0] ?? "";
    expect(regra, "não achei o dark: do botão primário no CSS compilado").not.toBe("");
    expect(regra).toContain(FORA.replace(/\s+/g, " ").slice(0, 20));
    expect(regra).toContain('[data-theme="dark"] [data-theme="light"]');
  }, 60_000);

  it("a marca chega a cada painel no escopo do próprio painel, do tema dele", () => {
    const { css } = cssDaMarca(
      {
        semente: "#2b59c3",
        derivada: null,
      } as unknown as Parameters<typeof cssDaMarca>[0],
      ESCOPO_DO_PAINEL,
    );
    expect(css).toContain('[data-painel-do-tema][data-theme="light"] {');
    expect(css).toContain('[data-painel-do-tema][data-theme="dark"] {');
  });
});
