/**
 * LOGOUT LIMPA O CACHE HTTP DO NAVEGADOR (parecer do @Cassio_SecRev na #74, P2-2).
 *
 * O 302 da mídia é `private, max-age`. `Vary: Cookie` já separa as sessões, mas
 * quem sai tem de deixar o cache limpo. A ação de logout marca; o proxy, na
 * próxima resposta, manda `Clear-Site-Data: "cache"` e apaga a marca.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const gravados = vi.hoisted(() => ({ cookies: [] as Array<{ nome: string; valor: string; opcoes: Record<string, unknown> }> }));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    delete: () => {},
    set: (nome: string, valor: string, opcoes: Record<string, unknown>) => {
      gravados.cookies.push({ nome, valor, opcoes });
    },
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "u-1" } } }),
      signOut: async () => ({ error: null }),
    },
  }),
}));
vi.mock("@/lib/audit", () => ({ audit: async () => {} }));

import { signOut } from "@/app/actions/auth/signOut";
import { signOutEverywhere } from "@/app/actions/settings/signOutEverywhere";
import { COOKIE_LIMPAR_CACHE } from "@/lib/auth/limpar-cache-no-logout";
import { proxy } from "@/proxy";

beforeEach(() => {
  gravados.cookies = [];
});

describe("a ação de logout pede a limpeza", () => {
  it.each([
    ["signOut", signOut],
    ["signOutEverywhere", signOutEverywhere],
  ])("%s grava a marca httpOnly antes de redirecionar", async (_nome, acao) => {
    await expect(acao()).rejects.toThrow("REDIRECT:/login");
    const marca = gravados.cookies.find((c) => c.nome === COOKIE_LIMPAR_CACHE);
    expect(marca, "o logout não marcou a limpeza do cache").toBeDefined();
    expect(marca!.opcoes.httpOnly).toBe(true);
    expect(marca!.opcoes.path).toBe("/");
  });
});

describe("o proxy responde com Clear-Site-Data e apaga a marca", () => {
  it("com a marca: Clear-Site-Data \"cache\" e a marca expirada", async () => {
    const req = new NextRequest("http://crm.teste/login", {
      headers: { cookie: `${COOKIE_LIMPAR_CACHE}=1` },
    });
    const res = await proxy(req);
    expect(res.headers.get("clear-site-data")).toBe('"cache"');
    const apagada = res.cookies.get(COOKIE_LIMPAR_CACHE);
    expect(apagada?.value ?? "").toBe("");
  });

  it("CONTROLE: sem a marca, nenhuma resposta limpa o cache (senão todo login perderia o cache à toa)", async () => {
    const res = await proxy(new NextRequest("http://crm.teste/login"));
    expect(res.headers.get("clear-site-data")).toBeNull();
  });
});
