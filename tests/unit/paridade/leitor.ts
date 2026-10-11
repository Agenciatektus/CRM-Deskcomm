/**
 * Leitores do teste de paridade com o protótipo (tests/unit/paridade-com-o-prototipo.test.ts).
 *
 * Tudo aqui LÊ os arquivos: o CSS dos protótipos (`docs/design/inbox-v2/*.dc.html`), o
 * `app/globals.css` e o código dos componentes. Nenhum valor do protótipo é transcrito à
 * mão, para que mudar o protótipo (ou o CRM) mude o resultado.
 */
import { readFileSync } from "node:fs";

import { hexParaRgb, oklchParaHex, rgbParaHex } from "@/lib/branding/rampa";

export const ler = (caminho: string) => readFileSync(caminho, "utf8");

/** O conteúdo dos `<style>` de um `.dc.html`. */
export function estiloDoHtml(html: string): string {
  return [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
}

const MAIN_HTML = ler("docs/design/inbox-v2/Main.dc.html");
const VERDASH_HTML = ler("docs/design/inbox-v2/MainVerdash.dc.html");
const DS_HTML = ler("docs/design/inbox-v2/DesignSystem.dc.html");

export const MAIN = estiloDoHtml(MAIN_HTML);
/** Só o bloco "VARIANTE VERDASH" (o escuro aprovado). */
export const VERDASH = (() => {
  const css = estiloDoHtml(VERDASH_HTML);
  const i = css.indexOf("VARIANTE VERDASH ===== INÍCIO");
  const f = css.indexOf("PELE VERDASH ===== FIM");
  if (i < 0 || f < 0) throw new Error("bloco VARIANTE VERDASH sumiu do MainVerdash.dc.html");
  // Do `/*` que abre o comentário do marcador, para o leitor não começar dentro dele.
  return css.slice(css.lastIndexOf("/*", i), f);
})();
export const DS = estiloDoHtml(DS_HTML);
export const DS_HTML_TEXTO = DS_HTML;
export const CSS = ler("app/globals.css");

/** O accent padrão que o protótipo usa quando nenhuma marca é passada. */
export function accentPadrao(qual: "claro" | "escuro"): string {
  const html = qual === "claro" ? MAIN_HTML : VERDASH_HTML;
  const m = /accent:\s*this\.props\.accent\s*\|\|\s*'(#[0-9a-fA-F]{6})'/.exec(html);
  if (!m?.[1]) throw new Error(`accent padrão do protótipo (${qual}) não encontrado`);
  return m[1].toLowerCase();
}

/** Regras CSS de nível de folha: seletor (normalizado) -> declarações (a última vence). */
export function regras(css: string): Map<string, Record<string, string>> {
  const limpo = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const saida = new Map<string, Record<string, string>>();
  const visitar = (texto: string) => {
    let i = 0;
    let inicio = 0;
    while (i < texto.length) {
      const abre = texto.indexOf("{", i);
      if (abre < 0) return;
      let prof = 1;
      let j = abre + 1;
      while (j < texto.length && prof > 0) {
        if (texto[j] === "{") prof += 1;
        else if (texto[j] === "}") prof -= 1;
        j += 1;
      }
      const cru = texto.slice(inicio, abre);
      const seletor = cru.slice(cru.lastIndexOf(";") + 1).replace(/\s+/g, " ").trim();
      const corpo = texto.slice(abre + 1, j - 1);
      // O celular (< 760), o toque e o movimento reduzido ficam de fora: a
      // paridade desta etapa é a do desktop, e a regra deles sobrescreveria a base.
      if (/@media[^{]*(max-width:\s*759px|hover:\s*none|prefers-reduced-motion)/.test(seletor)) {
        // fora do escopo
      } else if (corpo.includes("{")) visitar(corpo);
      else {
        for (const sel of seletor.split(",").map((s) => s.trim())) {
          const atual = saida.get(sel) ?? {};
          for (const linha of corpo.split(";")) {
            const k = linha.indexOf(":");
            if (k < 0) continue;
            const prop = linha.slice(0, k).trim();
            if (prop) atual[prop] = linha.slice(k + 1).trim();
          }
          saida.set(sel, atual);
        }
      }
      i = j;
      inicio = j;
    }
  };
  visitar(limpo);
  return saida;
}

export const R_MAIN = regras(MAIN);
export const R_VERDASH = regras(VERDASH);
export const R_DS = regras(DS);

/** Uma declaração do protótipo; lança quando some (o protótipo mudou e o teste precisa saber). */
export function decl(fonte: Map<string, Record<string, string>>, seletor: string, prop: string): string {
  const v = fonte.get(seletor)?.[prop];
  if (v === undefined) throw new Error(`protótipo: ${seletor} { ${prop} } não existe`);
  return v;
}

/** Bloco de tokens do `globals.css` por seletor exato (`:root`, `[data-theme="dark"]`). */
export function blocoDoCrm(seletor: string): Record<string, string> {
  const marca = `\n${seletor} {`;
  const i = CSS.indexOf(marca);
  if (i < 0) throw new Error(`globals.css: bloco ${seletor} sumiu`);
  const corpo = CSS.slice(i + marca.length, CSS.indexOf("\n}", i)).replace(/\/\*[\s\S]*?\*\//g, "");
  const saida: Record<string, string> = {};
  for (const linha of corpo.split(";")) {
    const k = linha.indexOf(":");
    if (k < 0) continue;
    saida[linha.slice(0, k).trim()] = linha.slice(k + 1).trim();
  }
  return saida;
}

/** O bloco `@theme inline` do globals.css (papéis de texto, animações). */
export function blocoDoTema(): string {
  const i = CSS.indexOf("@theme inline {");
  return CSS.slice(i, CSS.indexOf("\n}\n", i));
}

/** Resolve `var(--x)` dentro de um bloco (e de blocos de reserva), até um valor final. */
export function resolver(valor: string, ...blocos: Record<string, string>[]): string {
  let v = valor.trim();
  for (let n = 0; n < 10; n += 1) {
    const m = /^var\((--[a-z0-9-]+)\)$/.exec(v);
    if (!m?.[1]) return v;
    const proximo = blocos.map((b) => b[m[1]!]).find((x) => x !== undefined);
    if (proximo === undefined) return v;
    v = proximo.trim();
  }
  return v;
}

export type Cor = { hex: string; alfa: number };

/** Lê uma cor CSS em hex + alfa: oklch, #hex, rgb/rgba, `color-mix(X N%, transparent)`, white/black. */
export function lerCor(valor: string, tokens: Record<string, string> = {}): Cor {
  const v = valor.trim();
  const ok = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)$/.exec(v);
  if (ok) {
    return {
      hex: oklchParaHex({ L: Number(ok[1]), C: Number(ok[2]), h: Number(ok[3]) }),
      alfa: ok[4] === undefined ? 1 : Number(ok[4]),
    };
  }
  if (/^#[0-9a-f]{3}$/i.test(v)) {
    return { hex: `#${[...v.slice(1)].map((c) => c + c).join("")}`.toLowerCase(), alfa: 1 };
  }
  if (/^#[0-9a-f]{6}$/i.test(v)) return { hex: v.toLowerCase(), alfa: 1 };
  if (v === "white") return { hex: "#ffffff", alfa: 1 };
  if (v === "black") return { hex: "#000000", alfa: 1 };
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[,/]\s*([\d.]+)\s*)?\)$/.exec(v);
  if (rgb) {
    return {
      hex: rgbParaHex({ r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) }),
      alfa: rgb[4] === undefined ? 1 : Number(rgb[4]),
    };
  }
  const mix = /^color-mix\(in oklch,\s*(.+?)\s+([\d.]+)%,\s*transparent\)$/.exec(v);
  if (mix?.[1]) {
    const base = lerCor(resolver(mix[1], tokens), tokens);
    return { hex: base.hex, alfa: Number(mix[2]) / 100 };
  }
  const ref = /^var\((--[a-z0-9-]+)\)$/.exec(v);
  if (ref?.[1] && tokens[ref[1]]) return lerCor(tokens[ref[1]]!, tokens);
  throw new Error(`cor ilegível: ${v}`);
}

/** Igual com a tolerância da conversão oklch->hex: ±1 por canal, alfa ±0,005. */
export function coresIguais(a: Cor, b: Cor): boolean {
  const x = hexParaRgb(a.hex);
  const y = hexParaRgb(b.hex);
  return (
    Math.abs(x.r - y.r) <= 1 &&
    Math.abs(x.g - y.g) <= 1 &&
    Math.abs(x.b - y.b) <= 1 &&
    Math.abs(a.alfa - b.alfa) <= 0.005
  );
}

export const fmt = (c: Cor) => (c.alfa === 1 ? c.hex : `${c.hex}/${c.alfa}`);

/** `12px` -> 12. */
export function px(valor: string): number {
  const m = /^(-?[\d.]+)px$/.exec(valor.trim());
  if (!m) throw new Error(`não é px: ${valor}`);
  return Number(m[1]);
}

/** As classes de um arquivo de componente, como conjunto de palavras (prefixos inclusos). */
export function classesDoArquivo(caminho: string): Set<string> {
  const src = ler(caminho);
  const saida = new Set<string>();
  for (const m of src.matchAll(/(["'`])((?:(?!\1)[^\\]|\\.)*)\1/g)) {
    for (const c of m[2]!.split(/\s+/)) if (c) saida.add(c);
  }
  return saida;
}
