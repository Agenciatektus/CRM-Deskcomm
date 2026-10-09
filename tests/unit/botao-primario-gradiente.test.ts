/**
 * O gradiente do botão primário no escuro nunca piora o contraste do texto.
 *
 * O texto do botão (`--color-accent-fg`) é CALCULADO contra `--color-accent`; é
 * o único par que a régua valida para a marca de cada cliente. Uma ponta de
 * gradiente fora desse par (ex.: `--color-accent-hover`, `contra: null` na
 * régua) viraria estado de REPOUSO sem validação nenhuma. Por isso a outra ponta
 * é o accent misturado 30% com o extremo oposto ao texto, e esta cerca prende as
 * duas metades: a fórmula no CSS e a conta sobre as marcas das fixtures.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { derivarMarca, razaoDeContraste } from "@/lib/branding/contraste";
import { REGUA_DO_PRODUTO } from "@/lib/branding/regua-do-produto";

const CSS = readFileSync("app/globals.css", "utf8");
const BOTAO = readFileSync("components/ui/button.tsx", "utf8");

/** O bloco do token, e não o arquivo inteiro: uma menção em comentário não vale. */
function blocoDoGradiente(): string {
  const i = CSS.indexOf('\n[data-theme="dark"] body {');
  expect(i, "sumiu o bloco do gradiente em app/globals.css").toBeGreaterThan(-1);
  return CSS.slice(i, CSS.indexOf("\n}", i));
}

/** O que `color-mix(in srgb, A 70%, B)` produz, canal a canal. */
function misturar(a: string, b: string, pesoDeB: number): string {
  const canal = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16);
  return (
    "#" +
    [1, 3, 5]
      .map((i) => Math.round(canal(a, i) * (1 - pesoDeB) + canal(b, i) * pesoDeB))
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  );
}

/** O que `round(255 - canal, 255)` produz: o extremo oposto ao texto. */
function oposto(fg: string): string {
  return (
    "#" +
    [1, 3, 5]
      .map((i) => (255 - parseInt(fg.slice(i, i + 2), 16) >= 127.5 ? "ff" : "00"))
      .join("")
  );
}

// As marcas das fixtures de contraste (tests/unit/branding-contraste.test.ts).
const SEMENTES = [
  "#000000", "#0f172a", "#101010", "#14b8a6", "#1a1f36", "#1abc9c", "#22c55e", "#2563eb",
  "#27ae60", "#4b0082", "#4d9351", "#506d48", "#5a8a5f", "#5d594f", "#67885d", "#7c3aed",
  "#7f7f7f", "#7f8c3a", "#808080", "#82a077", "#a94a3c", "#b07a2b", "#bd615b", "#c0392b",
  "#dc2626", "#e11d48", "#f2f2f2", "#f59e0b", "#f5c518", "#fafafa", "#ffffff",
];

describe("gradiente do botão primário no escuro", () => {
  it("parte do accent e vai para o accent misturado com o oposto do texto", () => {
    const bloco = blocoDoGradiente();
    expect(bloco).toMatch(/from var\(--color-accent-fg\) round\(calc\(255 - r\), 255\)/);
    expect(bloco).toMatch(
      /color-mix\(in srgb, var\(--color-accent\) 70%, var\(--gradient-primary-oposto\)\)/,
    );
    // A ponta que a revisão reprovou: o hover não é medido contra o texto.
    expect(bloco).not.toContain("--color-accent-hover");
  });

  it("o botão só usa o gradiente no tema escuro, e o hover volta ao chapado", () => {
    expect(BOTAO).toContain("dark:bg-(image:--gradient-primary)");
    expect(BOTAO).toContain("dark:hover:bg-none");
  });

  it("Sage padrão: 6,31:1 no accent e mais que isso na ponta", () => {
    const fg = "#161510";
    const accent = "#82a077";
    const ponta = misturar(accent, oposto(fg), 0.3);
    expect(razaoDeContraste(fg, accent)).toBeCloseTo(6.31, 2);
    expect(razaoDeContraste(fg, ponta)).toBeGreaterThan(razaoDeContraste(fg, accent));
  });

  it("em nenhuma marca das fixtures a ponta fica abaixo do accent", () => {
    for (const semente of SEMENTES) {
      const { escuro } = derivarMarca(semente, REGUA_DO_PRODUTO);
      const ponta = misturar(escuro.accent, oposto(escuro.accentFg), 0.3);
      expect(
        razaoDeContraste(escuro.accentFg, ponta),
        `${semente}: a ponta do gradiente reduziu o contraste do texto`,
      ).toBeGreaterThanOrEqual(razaoDeContraste(escuro.accentFg, escuro.accent) - 1e-9);
    }
  });
});
