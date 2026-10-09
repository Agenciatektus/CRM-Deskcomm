import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  classeDaCorDoAvatar,
  indiceDaCorDoAvatar,
  TOTAL_DE_CORES_DO_AVATAR,
} from "@/lib/inbox/cor-do-avatar";
import { razaoDeContraste } from "@/lib/branding/contraste";

/**
 * A cor do avatar por pessoa (Inbox v2): o mesmo contato tem a mesma cor na
 * lista, no cabeçalho da conversa e no painel, e o texto é legível nos dois
 * temas. As três coisas que podem quebrar calado estão aqui: a escolha mudar
 * de uma renderização para outra, a classe apontar para um token que não tem
 * ponte no `@theme` (classe sem CSS), e um par novo cair abaixo de 4.5:1.
 */

const CSS = fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

/** Valor literal de um token dentro do bloco `<seletor> { … }`. */
function tokenNoBloco(seletor: string, token: string): string {
  const i = CSS.search(new RegExp(`^${seletor.replace(/[[\]"=]/g, "\\$&")}\\s*\\{`, "m"));
  if (i < 0) throw new Error(`bloco ${seletor} ausente`);
  const fim = CSS.indexOf("\n}", i);
  const m = CSS.slice(i, fim).match(new RegExp(`^\\s*${token}:\\s*(#[0-9a-f]{6})\\s*;`, "im"));
  if (!m?.[1]) throw new Error(`${token} ausente em ${seletor}`);
  return m[1];
}

const IDS = [
  "c0000000-0000-4000-8000-000000000001",
  "c0000000-0000-4000-8000-000000000002",
  "7f3a2b1c-9d8e-4f6a-b5c4-d3e2f1a0b9c8",
  "Mariana Couto",
  "Rafael Nogueira",
];

describe("cor do avatar — escolha estável", () => {
  it("a mesma semente dá sempre o mesmo par", () => {
    for (const id of IDS) {
      expect(indiceDaCorDoAvatar(id)).toBe(indiceDaCorDoAvatar(id));
      expect(classeDaCorDoAvatar(id)).toBe(classeDaCorDoAvatar(id));
    }
  });

  it("o índice cai sempre dentro da paleta, inclusive sem semente", () => {
    for (const s of [...IDS, "", "   ", null, undefined]) {
      const i = indiceDaCorDoAvatar(s);
      expect(i).toBeGreaterThanOrEqual(1);
      expect(i).toBeLessThanOrEqual(TOTAL_DE_CORES_DO_AVATAR);
      expect(classeDaCorDoAvatar(s)).toBe(`bg-avatar-${i} text-avatar-${i}-fg`);
    }
  });

  it("espalha: cem ids distintos usam as seis cores", () => {
    // Um hash que concentrasse tudo numa cor deixaria a lista monocromática,
    // que é exatamente o estado de antes.
    const usados = new Set<number>();
    for (let n = 0; n < 100; n++) usados.add(indiceDaCorDoAvatar(`contato-${n}`));
    expect(usados.size).toBe(TOTAL_DE_CORES_DO_AVATAR);
  });
});

describe("cor do avatar — tokens e contraste", () => {
  it("cada par tem ponte no @theme (senão a classe não gera CSS)", () => {
    for (let i = 1; i <= TOTAL_DE_CORES_DO_AVATAR; i++) {
      expect(CSS).toContain(`--color-avatar-${i}: var(--color-avatar-${i});`);
      expect(CSS).toContain(`--color-avatar-${i}-fg: var(--color-avatar-${i}-fg);`);
    }
  });

  it.each([":root", '[data-theme="light"]', '[data-theme="dark"]'])(
    "o texto fica a 4.5:1 ou mais do fundo em %s",
    (seletor) => {
      for (let i = 1; i <= TOTAL_DE_CORES_DO_AVATAR; i++) {
        const fundo = tokenNoBloco(seletor, `--color-avatar-${i}`);
        const texto = tokenNoBloco(seletor, `--color-avatar-${i}-fg`);
        expect(razaoDeContraste(fundo, texto), `par ${i} em ${seletor}`).toBeGreaterThanOrEqual(4.5);
      }
    },
  );
});
