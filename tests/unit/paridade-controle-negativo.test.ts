/**
 * Controle negativo do teste de paridade: com o protótipo ALTERADO em memória, a
 * comparação tem de reprovar e apontar exatamente o que mudou. Sem isto, um leitor
 * quebrado (que não acha nada e por isso não acha divergência) passaria verde.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async (original) => {
  const fs = await original<typeof import("node:fs")>();
  const trocar = (caminho: string, texto: string) => {
    if (caminho.endsWith("Main.dc.html")) {
      return texto
        .replace("--chrome: oklch(0.958 0.006 255);", "--chrome: oklch(0.9 0.006 255);")
        .replace("--warn: oklch(0.47 0.11 65);", "--warn: oklch(0.6 0.11 65);");
    }
    if (caminho.endsWith("DesignSystem.dc.html")) {
      return texto
        .replace(".btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:36px", ".btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:40px")
        .replace(".chip{display:inline-flex;align-items:center;height:30px;padding:0 11px;border-radius:15px", ".chip{display:inline-flex;align-items:center;height:30px;padding:0 11px;border-radius:6px")
        .replace("16 / 700</span>", "18 / 700</span>");
    }
    return texto;
  };
  const readFileSync = ((caminho: string, ...resto: unknown[]) => {
    const texto = (fs.readFileSync as (...a: unknown[]) => unknown)(caminho, ...resto);
    return typeof texto === "string" ? trocar(String(caminho), texto) : texto;
  }) as typeof fs.readFileSync;
  return { ...fs, default: { ...fs, readFileSync }, readFileSync };
});

describe("paridade — controle negativo", () => {
  it("o protótipo alterado reprova nos tokens e nos componentes", async () => {
    const { divergenciasDeTokens } = await import("./paridade/tokens");
    const { CHECAGENS } = await import("./paridade/componentes");
    const { classesDoArquivo, decl } = await import("./paridade/leitor");

    const tokens = divergenciasDeTokens().map((d) => d.split(" ")[0]);
    expect(tokens).toContain("cor:claro:--chrome");
    expect(tokens).toContain("cor:claro:--warn");
    expect(tokens).toContain("tipo:title-sm:tamanho");

    const falhas = CHECAGENS.filter((ch) => {
      const classes = classesDoArquivo(ch.arquivo);
      return [ch.classes(decl(ch.fonte, ch.seletor, ch.prop))].flat().some((c) => !classes.has(c));
    }).map((ch) => ch.id);
    expect(falhas).toEqual(["botao:altura", "chip:raio"]);
  });
});
