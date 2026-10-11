/**
 * A vitrine `/app/design-system` é só do dono do servidor.
 *
 * Duas provas: a regra (`podeVerDesignSystem`) recusa todo papel de tenant,
 * inclusive `admin`, e o operador em sessão de suporte; e a página CHAMA a
 * regra antes de renderizar, com `notFound()`. A segunda é estática de
 * propósito: um teste só da função ficaria verde com a página sem guarda.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { podeVerDesignSystem } from "@/lib/design-system/acesso";

describe("quem vê a vitrine do design system", () => {
  it("o dono do servidor vê", () => {
    expect(podeVerDesignSystem({ is_platform_admin: true, support: null })).toBe(true);
  });

  it.each(["viewer", "agent", "manager", "admin"])("papel %s do tenant NÃO vê", (role) => {
    expect(podeVerDesignSystem({ is_platform_admin: false, support: null, role } as never)).toBe(false);
  });

  it("sem sessão não vê", () => {
    expect(podeVerDesignSystem(null)).toBe(false);
    expect(podeVerDesignSystem(undefined)).toBe(false);
  });

  it("o operador em sessão de suporte não vê, mesmo sendo dono do servidor", () => {
    expect(podeVerDesignSystem({ is_platform_admin: true, support: { orgId: "x" } })).toBe(false);
  });
});

describe("a página aplica a guarda antes de renderizar", () => {
  const fonte = readFileSync("app/app/design-system/page.tsx", "utf8");

  it("chama podeVerDesignSystem e responde notFound()", () => {
    expect(fonte).toMatch(/if\s*\(\s*!podeVerDesignSystem\(user\)\s*\)\s*notFound\(\)/);
  });

  it("a guarda vem antes do render da vitrine", () => {
    const guarda = fonte.indexOf("notFound()");
    const render = fonte.indexOf("<VitrineDoDesignSystem");
    expect(guarda).toBeGreaterThan(-1);
    expect(render).toBeGreaterThan(guarda);
  });

  it("é noindex", () => {
    expect(fonte).toMatch(/robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/);
  });
});
