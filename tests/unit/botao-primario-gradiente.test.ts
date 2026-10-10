/**
 * O degradê do tema escuro é o FIXO do Verdash, e o texto passa AA sobre ele.
 *
 * Decisão do Peterson (10/10/2026): no escuro o degradê é azul->menta para todo
 * revendedor; no claro nada muda (a marca do revendedor continua). Nenhuma cor
 * de texto passa AA sobre o degradê ORIGINAL do protótipo inteiro, então há
 * dois: o vibrante (`--pele-grad`, só onde não há texto) e o de texto
 * (`--pele-grad-texto`, meio e ponta escurecidos). Esta cerca lê as paradas do
 * próprio CSS e refaz a conta: nenhuma parada do degradê de texto pode ficar
 * abaixo de 4,5:1 com o texto declarado. Transcrever as cores aqui mediria a
 * minha cópia, que continuaria "certa" com o CSS mudado.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { razaoDeContraste } from "@/lib/branding/contraste";

const CSS = readFileSync("app/globals.css", "utf8");
const BOTAO = readFileSync("components/ui/button.tsx", "utf8");

/** O bloco dos tokens do escuro, e não o arquivo inteiro: comentário não vale. */
function blocoDoEscuro(): string {
  const i = CSS.indexOf('\n[data-theme="dark"] body {');
  expect(i, "sumiu o bloco dos tokens do escuro em app/globals.css").toBeGreaterThan(-1);
  // Só as declarações: tira os comentários, que citam hex de exemplo.
  return CSS.slice(i, CSS.indexOf("\n}", i)).replace(/\/\*[\s\S]*?\*\//g, "");
}

function token(nome: string): string {
  const m = blocoDoEscuro().match(new RegExp(`${nome}:\\s*([^;]+);`));
  expect(m, `sem ${nome} no bloco do escuro`).not.toBeNull();
  return m![1]!.trim();
}

function paradas(valor: string): string[] {
  return [...valor.matchAll(/#[0-9a-f]{6}\b/gi)].map((m) => m[0].toLowerCase());
}

describe("degradê do escuro", () => {
  it("o degradê de texto tem as três paradas, e o texto passa AA em todas", () => {
    const fg = token("--pele-grad-fg");
    const cores = paradas(token("--pele-grad-texto"));
    expect(cores).toHaveLength(3);
    for (const cor of cores) {
      expect(
        razaoDeContraste(fg, cor),
        `${fg} sobre ${cor}: o texto do botão reprova AA nesta parada`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("controle negativo: o degradê VIBRANTE reprova com o mesmo texto (por isso existem dois)", () => {
    const fg = token("--pele-grad-fg");
    const vibrante = paradas(token("--pele-grad"));
    expect(vibrante).toHaveLength(3);
    expect(vibrante.some((cor) => razaoDeContraste(fg, cor) < 4.5)).toBe(true);
  });

  it("é fixo: nenhum token de degradê, brilho ou foco lê a marca do revendedor", () => {
    for (const nome of ["--pele-grad", "--pele-grad-texto", "--pele-brilho", "--pele-foco", "--pele-grad-fg"]) {
      expect(token(nome), `${nome} voltou a depender da marca`).not.toMatch(/--color-accent/);
    }
  });

  it("o botão primário usa o degradê de texto no escuro, com o texto do degradê", () => {
    expect(token("--gradient-primary")).toBe("var(--pele-grad-texto)");
    expect(BOTAO).toContain("dark:bg-(image:--gradient-primary)");
    expect(BOTAO).toContain("dark:text-(--pele-grad-fg)");
    // O hover escurece em vez de trocar pelo accent chapado: o accent é da
    // marca, e o texto branco não foi medido contra ele.
    expect(BOTAO).not.toContain("dark:hover:bg-none");
  });

  it("o claro não ganhou degradê: o bloco do claro não declara os tokens da pele", () => {
    const inicio = CSS.indexOf("\n:root {");
    const claro = CSS.slice(inicio, CSS.indexOf("\n}", inicio));
    expect(claro).not.toMatch(/--pele-grad|--gradient-primary/);
  });

  it("o texto do chip da IA passa AA no pior ponto do fundo dele, inclusive no hover", () => {
    // O fundo do chip no escuro: a caixa do composer (`--color-surface`), o
    // `bg-accent-soft` da marca padrão e o `--pele-grad-soft` por cima. Os
    // piores pontos são as duas pontas. O hover aplica `brightness(1.15)` no
    // chip inteiro (texto e fundo).
    const fg = token("--pele-grad-soft-fg");
    const mistura = (b: number[], c: number[], a: number) => b.map((x, i) => x * (1 - a) + c[i]! * a);
    const hex = (c: number[]) =>
      "#" + c.map((v) => Math.round(Math.min(255, v)).toString(16).padStart(2, "0")).join("");
    const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const claro = (c: number[]) => c.map((v) => v * 1.15);
    const base = mistura([24, 26, 28], [130, 160, 119], 0.16);
    const pontas = [mistura(base, [42, 82, 216], 0.24), mistura(base, [43, 200, 143], 0.18)];
    for (const fundo of pontas) {
      expect(razaoDeContraste(fg, hex(fundo))).toBeGreaterThanOrEqual(4.5);
      expect(razaoDeContraste(hex(claro(rgb(fg))), hex(claro(fundo)))).toBeGreaterThanOrEqual(4.5);
    }
  });
});
