/**
 * A pele do escuro em SUBÁRVORE é cópia exata da pele do <body> escuro.
 *
 * `app/globals.css` declara os tokens da pele (`--pele-*`, `--gradient-primary`)
 * em `[data-theme="dark"] body` e repete o bloco em `body [data-theme="dark"]`
 * para um painel escuro dentro de página clara (a vitrine do design system).
 * Duas cópias divergem caladas: o degradê mudaria na página e não no painel, e
 * a vitrine passaria a mostrar um botão que nenhuma tela tem.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const CSS = readFileSync("app/globals.css", "utf8");

function declaracoes(seletor: string): Map<string, string> {
  const i = CSS.indexOf(`\n${seletor} {`);
  expect(i, `sumiu o bloco \`${seletor}\``).toBeGreaterThan(-1);
  const corpo = CSS.slice(i, CSS.indexOf("\n}", i)).replace(/\/\*[\s\S]*?\*\//g, "");
  const mapa = new Map<string, string>();
  for (const m of corpo.matchAll(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/gm)) {
    mapa.set(m[1]!, m[2]!.trim());
  }
  return mapa;
}

describe("pele escura em subárvore", () => {
  it("declara exatamente os mesmos tokens, com os mesmos valores", () => {
    const pagina = declaracoes('[data-theme="dark"] body');
    const subarvore = declaracoes('body [data-theme="dark"]');
    expect(pagina.size).toBeGreaterThan(10);
    expect(Object.fromEntries(subarvore)).toEqual(Object.fromEntries(pagina));
  });
});
