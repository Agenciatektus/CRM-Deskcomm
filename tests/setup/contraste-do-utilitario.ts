import fs from "node:fs";
import path from "node:path";

import { razaoDeContraste } from "@/lib/branding/contraste";

/**
 * Contraste CALCULADO de um utilitário de cor do Tailwind contra um token de
 * superfície, nos dois temas, a partir do próprio `app/globals.css`.
 *
 * O jsdom não aplica o Tailwind, então `getComputedStyle` no teste de
 * componente devolve vazio. O que dá para medir aqui é a cadeia de tokens que
 * a classe nomeia: `border-muted-foreground` → `--color-muted-foreground` (no
 * `@theme inline`) → `--color-text-muted` → o hex de cada tema.
 */
const CSS = fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

function bloco(seletor: string): string {
  const rx = new RegExp(`^${seletor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{`, "m");
  const i = CSS.search(rx);
  if (i < 0) throw new Error(`não achei o bloco \`${seletor}\` em globals.css`);
  return CSS.slice(i, CSS.indexOf("\n}", i));
}

function valor(texto: string, prop: string): string | undefined {
  const m = texto.match(new RegExp(`^\\s*${prop}:\\s*([^;]+);`, "m"));
  return m?.[1]?.trim();
}

const PONTE = bloco("@theme inline");
const TEMA = { claro: bloco(":root"), escuro: bloco('[data-theme="dark"]') } as const;
export type Tema = keyof typeof TEMA;

export function hexDoToken(nome: string, tema: Tema): string {
  let v = valor(PONTE, `--color-${nome}`);
  if (!v) throw new Error(`\`--color-${nome}\` não tem ponte no @theme inline`);
  for (let i = 0; i < 5 && v.startsWith("var("); i++) {
    const prop = v.slice(4, -1).trim();
    v = valor(TEMA[tema], prop) ?? valor(TEMA.claro, prop) ?? v;
  }
  if (!/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`\`${nome}\` no tema ${tema} resolveu para \`${v}\``);
  return v;
}

/** O nome do token de cor que a classe usa com o prefixo (`border`, `text`…). */
export function tokenDaClasse(className: string, prefixo: string): string {
  const nomes = [...className.matchAll(new RegExp(`(?:^|\\s)${prefixo}-([a-z-]+)(?=\\s|$)`, "g"))]
    .map((m) => m[1] ?? "")
    .filter((n) => valor(PONTE, `--color-${n}`) !== undefined);
  if (nomes.length !== 1) throw new Error(`esperava 1 cor \`${prefixo}-*\` em "${className}", achei ${nomes.length}`);
  return nomes[0] as string;
}

export function contrasteNoTema(frente: string, fundo: string, tema: Tema): number {
  return razaoDeContraste(hexDoToken(frente, tema), hexDoToken(fundo, tema));
}

/** O trecho de `app/globals.css` que declara `--cbx-line` no tema, para medir a borda da caixa v2. */
export function bordaDaCaixaNoTema(tema: Tema, fundo: string): number {
  const bloco = tema === "claro" ? CSS.match(/^\s*:root,\s*body,\s*body \[data-theme\] \{[^}]*\}/m)?.[0] : CSS.match(/^\s*\[data-theme="dark"\] body,\s*body \[data-theme="dark"\] \{[^}]*\}/m)?.[0];
  const pct = Number(bloco?.match(/--cbx-line:\s*color-mix\(in oklch, var\(--color-text-subtle\) (\d+)%/)?.[1]);
  if (!pct) throw new Error(`não achei --cbx-line no tema ${tema}`);
  const a = oklab(hexDoToken("text-subtle", tema));
  const b = oklab(hexDoToken("border-strong", tema));
  const m = a.map((v, i) => (v * pct + (b[i] as number) * (100 - pct)) / 100) as number[];
  return razaoDeContraste(hexDeOklab(m), hexDoToken(fundo, tema));
}

function oklab(hex: string): number[] {
  const c = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * c[0] + 0.5363325363 * c[1] + 0.0514459929 * c[2]);
  const m = Math.cbrt(0.2119034982 * c[0] + 0.6806995451 * c[1] + 0.1073969566 * c[2]);
  const s = Math.cbrt(0.0883024619 * c[0] + 0.2817188376 * c[1] + 0.6299787005 * c[2]);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function hexDeOklab([L, A, B]: number[]): string {
  const l = (L! + 0.3963377774 * A! + 0.2158037573 * B!) ** 3;
  const m = (L! - 0.1055613458 * A! - 0.0638541728 * B!) ** 3;
  const s = (L! - 0.0894841775 * A! - 1.291485548 * B!) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return (
    "#" +
    lin
      .map((v) => {
        const x = Math.min(1, Math.max(0, v));
        const g = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
        return Math.round(g * 255).toString(16).padStart(2, "0");
      })
      .join("")
  );
}
