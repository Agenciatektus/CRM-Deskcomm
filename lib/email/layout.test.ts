import fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const envFalso = vi.hoisted(() => ({ NEXT_PUBLIC_SUPABASE_URL: "https://sb.exemplo.com" }));
vi.mock("@/lib/env", () => ({ env: envFalso }));

import { montarEmail, TOKENS_EMAIL as T } from "@/lib/email/layout";

const base = {
  assunto: "Assunto",
  titulo: "Titulo",
  paragrafos: ["Ola"],
  botao: { rotulo: "Abrir", href: "https://app.exemplo.com/x?a=1&b=2" },
};

function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}
const contraste = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
};

describe("montarEmail", () => {
  beforeEach(() => {
    envFalso.NEXT_PUBLIC_SUPABASE_URL = "https://sb.exemplo.com";
  });

  it("traz logo, botao e meta de esquema escuro", () => {
    const { html } = montarEmail(base);
    expect(html).toContain("https://sb.exemplo.com/storage/v1/object/public/brand-logos/platform/email-simbolo.png");
    expect(html).toContain("Abrir");
    expect(html).toContain("a=1&amp;b=2");
    expect(html).toContain('name="color-scheme" content="dark"');
  });

  it("escapa HTML em texto e href", () => {
    const { html } = montarEmail({ ...base, titulo: "<script>x</script>", botao: { rotulo: "a", href: 'x"><script>' } });
    expect(html).not.toContain("<script>");
  });

  it("texto puro nao tem tags", () => {
    const { text } = montarEmail({ ...base, passos: ["um", "dois"], nota: "n", rodape: ["r"] });
    expect(text).not.toMatch(/<[a-z/][^>]*>/i);
    expect(text).toContain("https://app.exemplo.com/x?a=1&b=2");
  });

  it("sem base de URL, omite a imagem", () => {
    envFalso.NEXT_PUBLIC_SUPABASE_URL = "";
    expect(montarEmail(base).html).not.toContain("<img");
  });

  it("sem travessao no template", () => {
    const fonte = fs.readFileSync("lib/email/layout.ts", "utf8");
    expect(fonte).not.toMatch(/[\u2014\u2013]/);
    expect(montarEmail(base).html).not.toMatch(/[\u2014\u2013]/);
  });

  it("contraste minimo de 4,5:1", () => {
    expect(contraste(T.texto, T.fundo)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(T.suave, T.cartao)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(T.botaoTexto, T.botao)).toBeGreaterThanOrEqual(4.5);
  });
});
