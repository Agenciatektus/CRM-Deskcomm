/**
 * O `<select>` nativo legível nos dois temas.
 *
 * O defeito que esta cerca prende: no escuro, o Chrome/Edge do Windows abria a
 * lista do `<select>` com fundo BRANCO e o texto claro herdado do controle,
 * ilegível, mesmo com `color-scheme: dark`. A correção é global (em
 * `app/globals.css`), então a cerca lê o CSS: `option` e `optgroup` precisam
 * ter fundo E texto dos tokens, no claro e no escuro, e o gatilho precisa do
 * desenho próprio (sem a aparência nativa) com cores de token, nunca hex.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const CSS = readFileSync("app/globals.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** O corpo da PRIMEIRA regra cujo seletor é exatamente `seletor`. */
function regra(seletor: string): string {
  const escapado = seletor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = CSS.match(new RegExp(`(^|[}\\s])${escapado}\\s*\\{([^}]*)\\}`, "m"));
  expect(m, `sem a regra \`${seletor}\` em app/globals.css`).not.toBeNull();
  return m![2]!;
}

describe("select nativo", () => {
  it("o gatilho tira a aparência nativa e usa só tokens", () => {
    const corpo = regra("select:not([multiple]):not([size])");
    expect(corpo).toMatch(/appearance:\s*none/);
    expect(corpo).toMatch(/background-color:\s*var\(--color-surface\)/);
    expect(corpo).toMatch(/color:\s*var\(--color-text\)/);
    expect(corpo).toMatch(/border:\s*1px solid var\(--color-border-strong\)/);
    // O chevron mora no fundo e precisa do espaço reservado à direita.
    expect(corpo).toMatch(/background-image:/);
    expect(corpo).toMatch(/padding-inline:/);
    expect(corpo, "cor fixa no gatilho não acompanha o tema").not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("o gatilho mora em @layer base, para o utilitário do componente vencer", () => {
    const i = CSS.indexOf("select:not([multiple]):not([size]) {");
    const antes = CSS.slice(0, i);
    expect(antes.lastIndexOf("@layer base")).toBeGreaterThan(antes.lastIndexOf("}\n\n["));
  });

  it("claro: option e optgroup com fundo e texto dos tokens", () => {
    const corpo = regra("option,\n  optgroup");
    expect(corpo).toMatch(/background-color:\s*var\(--color-surface\)/);
    expect(corpo).toMatch(/color:\s*var\(--color-text\)/);
  });

  it("escuro: option e optgroup com fundo próprio e texto claro (o defeito do Windows)", () => {
    const corpo = regra('[data-theme="dark"] option,\n[data-theme="dark"] optgroup');
    expect(corpo).toMatch(/background-color:\s*var\(--color-surface-elevated\)/);
    expect(corpo).toMatch(/color:\s*var\(--color-text\)/);
  });

  it("a opção escolhida fica destacada nos dois temas", () => {
    expect(regra("option:checked")).toMatch(/background-color:/);
    expect(regra('[data-theme="dark"] option:checked')).toMatch(/background-color:/);
  });
});
