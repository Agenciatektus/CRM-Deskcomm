/**
 * O degradê do tema escuro é o FIXO do Verdash, e a AÇÃO usa o VIBRANTE com branco.
 *
 * Decisão do Peterson (10/10/2026): no escuro o degradê é azul->menta para todo
 * revendedor; no claro nada muda (a marca do revendedor continua).
 *
 * Etapa 2 do DS: o quadro escuro (DesignSystemVerdash.dc.html, Cor) pinta botão
 * primário, contador e etapa com o degradê VIBRANTE e texto branco: "Branco sobre o
 * gradiente foi validado no Verdash; o trecho central mede cerca de 3,7:1, aceito
 * para botão em 600. Texto corrido nunca vai sobre o gradiente." Esta cerca registra a
 * EXCEÇÃO de contraste (rótulo de peso >= 600 e >= 12px, mínimo de 3,5:1 no meio) e
 * lê as paradas do próprio CSS: transcrever as cores aqui mediria a minha cópia.
 */
import { globSync, readFileSync } from "node:fs";

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

/** O mínimo aceito no TRECHO CENTRAL do degradê, pela exceção do quadro escuro. */
const MINIMO_DA_EXCECAO = 3.5;

describe("degradê do escuro", () => {
  it("o meio do degradê vibrante passa a exceção do quadro com o texto branco, e o início passa AA", () => {
    const fg = token("--pele-grad-fg");
    const [inicio, meio, fim] = paradas(token("--pele-grad"));
    expect(razaoDeContraste(fg, inicio!)).toBeGreaterThanOrEqual(4.5);
    expect(razaoDeContraste(fg, meio!), "o trecho central caiu abaixo da exceção do quadro").toBeGreaterThanOrEqual(
      MINIMO_DA_EXCECAO,
    );
    // Controle negativo: a ponta menta reprova até a exceção (2,15:1). É por isso que
    // o degradê só leva RÓTULO curto, centralizado, nunca texto corrido.
    expect(razaoDeContraste(fg, fim!)).toBeLessThan(MINIMO_DA_EXCECAO);
  });

  it("é fixo: nenhum token de degradê, brilho ou foco lê a marca do revendedor", () => {
    for (const nome of ["--pele-grad", "--pele-grad-hover", "--pele-grad-acao", "--pele-grad-acao-hover", "--pele-brilho", "--pele-foco", "--pele-grad-fg"]) {
      expect(token(nome), `${nome} voltou a depender da marca`).not.toMatch(/--color-accent/);
    }
  });

  it("a ação usa as cores do degradê com a ponta menta só depois de 85% (P2-2 do Cassio na #167)", () => {
    // Botão largo com rótulo longo: as últimas letras chegavam à faixa da ponta
    // (2,15:1). Com o meio esticado até 85%, o branco fica >= 3,5:1 até ~87%.
    const acao = token("--pele-grad-acao");
    expect([...new Set(paradas(acao))]).toEqual(paradas(token("--pele-grad")));
    const posicoes = [...acao.matchAll(/#[0-9a-f]{6}\s+(\d+)%/gi)].map((m) => Number(m[1]));
    expect(posicoes.at(-2), "a cor do meio tem de ir até 85%").toBeGreaterThanOrEqual(85);
    expect(token("--gradient-primary")).toBe("var(--pele-grad-acao)");
  });

  it("o botão primário usa o degradê da ação no escuro, com o texto branco e peso 600", () => {
    expect(BOTAO).toContain("dark:bg-(image:--gradient-primary)");
    expect(BOTAO).toContain("dark:text-(--pele-grad-fg)");
    expect(BOTAO).toContain("font-semibold");
    expect(BOTAO).not.toContain("dark:hover:bg-none");
  });

  it("o hover do botão escurece SÓ o fundo, e o meio continua na exceção", () => {
    // P1 do Cassio na #145: `brightness()` no botão escurecia o texto junto.
    expect(BOTAO).toContain("dark:hover:bg-(image:--pele-grad-acao-hover)");
    expect(BOTAO, "filtro no hover escurece o texto junto com o fundo").not.toMatch(/dark:hover:brightness/);
    const fg = token("--pele-grad-fg");
    const cores = paradas(token("--pele-grad-acao-hover"));
    expect(cores).toHaveLength(4);
    expect(razaoDeContraste(fg, cores[1]!)).toBeGreaterThanOrEqual(MINIMO_DA_EXCECAO);
  });

  it("chip ligado, etapa e aba do composer usam o degradê da ação", () => {
    for (const classe of [".pele-grad:not(", ".pele-grad-ativo:not("]) {
      const inicio = CSS.indexOf(classe);
      expect(inicio, `sumiu a regra ${classe}`).toBeGreaterThan(-1);
      const corpo = CSS.slice(inicio, CSS.indexOf("}", inicio));
      expect(corpo).toContain("var(--pele-grad-acao)");
      expect(corpo).toContain("var(--pele-grad-fg)");
    }
    expect(CSS, "o degradê escurecido de texto voltou").not.toMatch(/--pele-grad-texto:/);
  });

  it("contador com texto < 12px usa o degradê do hover, que passa 4,5:1 no meio (P2-1 do Cassio na #167)", () => {
    const fg = token("--pele-grad-fg");
    const inicio = CSS.indexOf(".pele-grad-contador:not(");
    expect(inicio).toBeGreaterThan(-1);
    expect(CSS.slice(inicio, CSS.indexOf("}", inicio))).toContain("var(--pele-grad-hover)");
    expect(razaoDeContraste(fg, paradas(token("--pele-grad-hover"))[1]!)).toBeGreaterThanOrEqual(4.5);
    // A cerca: nenhum arquivo com a classe `pele-grad` (texto sobre o degradê da
    // ação) usa texto abaixo de 12px. Selo pequeno vai de `pele-grad-contador`.
    const pequeno = /text-\[(?:\d|1[01])(?:\.\d+)?px\]|text-\[0\.\d+rem\]|\btext-rail\b|\btext-\[10\.5px\]/;
    const reprovados = globSync("{app,components}/**/*.tsx").filter((arq) => {
      const src = readFileSync(arq, "utf8");
      return /(["'`\s])pele-grad(?=[\s"'`])/.test(src) && pequeno.test(src);
    });
    expect(reprovados, "texto < 12px sobre o degradê da ação: use pele-grad-contador").toEqual([]);
  });

  it("o claro não ganhou degradê: o bloco do claro não declara os tokens da pele", () => {
    const inicio = CSS.indexOf("\n:root {");
    const claro = CSS.slice(inicio, CSS.indexOf("\n}", inicio));
    expect(claro).not.toMatch(/--pele-grad|--gradient-primary/);
  });

  it("o texto do chip da IA passa AA no pior ponto do fundo dele, inclusive no hover", () => {
    // O fundo do chip no escuro: a caixa do composer (`--color-surface`), o
    // `accent-soft` do primary Verdash (20%) e o `--pele-grad-soft` por cima. Os
    // piores pontos são as duas pontas. O hover aplica `brightness(1.15)`.
    const fg = token("--pele-grad-soft-fg");
    const mistura = (b: number[], c: number[], a: number) => b.map((x, i) => x * (1 - a) + c[i]! * a);
    const hex = (c: number[]) =>
      "#" + c.map((v) => Math.round(Math.min(255, v)).toString(16).padStart(2, "0")).join("");
    const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const claro = (c: number[]) => c.map((v) => v * 1.15);
    const base = mistura([24, 26, 28], [38, 144, 177], 0.2);
    const pontas = [mistura(base, [42, 82, 216], 0.24), mistura(base, [43, 200, 143], 0.18)];
    for (const fundo of pontas) {
      expect(razaoDeContraste(fg, hex(fundo))).toBeGreaterThanOrEqual(4.5);
      expect(razaoDeContraste(hex(claro(rgb(fg))), hex(claro(fundo)))).toBeGreaterThanOrEqual(4.5);
    }
  });
});
