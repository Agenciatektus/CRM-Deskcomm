/**
 * Tradução de uma declaração do protótipo para a classe Tailwind que o CRM tem de ter.
 * O VALOR vem do protótipo; a tradução só sabe a gramática dos tokens do CRM. Mudou o
 * valor no protótipo, muda a classe esperada, e o teste reprova até o CRM acompanhar.
 */
import { px } from "./leitor";

const n = (v: number) => String(Number(v.toFixed(3)));
const passo = (v: string) => n(px(v) / 4);

export const altura = (v: string) => `h-${passo(v)}`;
export const largura = (v: string) => `w-${passo(v)}`;
export const vao = (v: string) => `gap-${passo(v)}`;

/** `0 14px` -> `px-3.5`; `3px` -> `p-0.75`. */
export function preenchimento(v: string): string {
  const partes = v.trim().split(/\s+/);
  if (partes.length === 2 && partes[0] === "0") return `px-${passo(partes[1]!)}`;
  if (partes.length === 1) return `p-${passo(partes[0]!)}`;
  throw new Error(`padding sem tradução: ${v}`);
}

/** `4px 2px` (margem vertical horizontal) -> [`my-1`, `mx-0.5`]. */
export function margem(v: string): string[] {
  const [y, x] = v.trim().split(/\s+/);
  return [`my-${passo(y!)}`, `mx-${passo(x!)}`];
}

const RAIOS: Record<number, string> = {
  6: "rounded-pill",
  8: "rounded-md",
  9: "rounded-control",
  10: "rounded-field",
  12: "rounded-lg",
  14: "rounded-menu",
  16: "rounded-xl",
  18: "rounded-bubble",
};
/** Raio igual à metade da altura é pílula cheia (`rounded-full`). */
export function raio(v: string, alturaDoObjeto?: string): string {
  const r = px(v);
  if (alturaDoObjeto && r * 2 === px(alturaDoObjeto)) return "rounded-full";
  return RAIOS[r] ?? `rounded-[${n(r)}px]`;
}

const TAMANHOS: Record<number, string> = {
  10.5: "text-rail",
  12: "text-meta",
  13: "text-label",
  14: "text-ui",
  15: "text-message",
  16: "text-title-sm",
  17: "text-title-md",
  20: "text-title-lg",
};
export const tamanho = (v: string) => TAMANHOS[px(v)] ?? `text-[${n(px(v))}px]`;

const PESOS: Record<string, string> = {
  "400": "font-normal",
  "500": "font-medium",
  "600": "font-semibold",
  "700": "font-bold",
};
export const peso = (v: string) => {
  const c = PESOS[v.trim()];
  if (!c) throw new Error(`peso sem tradução: ${v}`);
  return c;
};

/** Nome do token do protótipo -> nome do utilitário de cor do CRM, por papel. */
const FUNDO: Record<string, string> = {
  accent: "accent",
  "accent-soft": "accent-soft",
  surface: "surface",
  "surface-2": "surface-elevated",
  line: "border",
  "line-2": "border-strong",
  hover: "hover",
  crit: "error",
  "crit-bg": "error-bg",
  "ok-bg": "success-bg",
  "warn-bg": "warning-bg",
  "info-bg": "info-bg",
};
const TEXTO: Record<string, string> = {
  ink: "text",
  "ink-2": "text-muted",
  "ink-3": "text-subtle",
  "accent-text": "accent-text",
  "accent-fg": "accent-foreground",
  crit: "error-fg",
  ok: "success-fg",
  warn: "warning-fg",
  info: "info-fg",
};
const BORDA: Record<string, string> = {
  line: "border",
  "line-2": "border-strong",
  accent: "accent",
  crit: "error",
  "ink-3": "text-subtle",
  "warn-line": "warning-line",
  transparent: "transparent",
};

function nomeDoToken(v: string): string {
  const m = /var\(--([a-z0-9-]+)\)/.exec(v);
  if (!m?.[1]) throw new Error(`esperava var(--token): ${v}`);
  return m[1];
}
function traduzir(mapa: Record<string, string>, v: string, papel: string): string {
  const t = mapa[nomeDoToken(v)];
  if (!t) throw new Error(`${papel} sem tradução: ${v}`);
  return t;
}

export const fundo = (v: string) => `bg-${traduzir(FUNDO, v, "fundo")}`;
export const texto = (v: string) => `text-${traduzir(TEXTO, v, "cor de texto")}`;
/** `1px solid var(--line-2)` ou `var(--accent)` -> `border-border-strong`/`border-accent`. */
export function borda(v: string): string[] {
  const partes = v.trim().split(/\s+/);
  const cor = partes.find((p) => p.startsWith("var(")) ?? partes.at(-1)!;
  const estilo = partes.includes("dashed") ? ["border-dashed"] : [];
  return [`border-${traduzir(BORDA, cor, "borda")}`, ...estilo];
}

/** `0 0 0 3px var(--accent-soft)` -> [`ring-3`, `ring-accent-soft`]. */
export function anel(v: string): string[] {
  const m = /^0 0 0 (\d+)px (var\(--[a-z0-9-]+\))$/.exec(v.trim());
  if (!m) throw new Error(`anel sem tradução: ${v}`);
  return [`ring-${m[1]}`, `ring-${traduzir(FUNDO, m[2]!, "anel")}`];
}

/** `2px solid var(--accent)` -> [`outline-2`, `outline-accent`]. */
export function contorno(v: string): string[] {
  const m = /^(\d+)px solid (var\(--[a-z0-9-]+\))$/.exec(v.trim());
  if (!m) throw new Error(`outline sem tradução: ${v}`);
  return [`outline-${m[1]}`, `outline-${traduzir(BORDA, m[2]!, "outline")}`];
}

export const prefixar = (prefixo: string, classes: string | string[]) =>
  (Array.isArray(classes) ? classes : [classes]).map((c) => `${prefixo}${c}`);
