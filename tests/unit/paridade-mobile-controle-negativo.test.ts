/**
 * Controle negativo da paridade mobile: com o protótipo ALTERADO em memória, o leitor
 * tem de ver a mudança e a comparação tem de apontar exatamente o que mudou. Sem isto,
 * um leitor quebrado (que não acha nada e por isso não acha divergência) passaria verde
 * no modo estrito da M5.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async (original) => {
  const fs = await original<typeof import("node:fs")>();
  const trocar = (caminho: string, texto: string) => {
    if (!caminho.endsWith("MobileVerdash.dc.html")) return texto;
    return texto
      .replace("--chrome: oklch(0.958 0.006 255);", "--chrome: oklch(0.9 0.006 255);")
      .replace(
        "right:16px;bottom:calc(84px + var(--safe-b));z-index:5;width:60px;",
        "right:16px;bottom:calc(84px + var(--safe-b));z-index:5;width:64px;",
      )
      .replace(
        ".tb{display:grid;grid-template-columns:repeat(5, minmax(0, 1fr));",
        ".tb{display:grid;grid-template-columns:repeat(4, minmax(0, 1fr));",
      )
      .replace(
        "font:inherit;font-size:16px;color:var(--ink);outline:none;min-height:44px}\n.cmp-in::placeholder",
        "font:inherit;font-size:14px;color:var(--ink);outline:none;min-height:44px}\n.cmp-in::placeholder",
      )
      .replace(
        ".nb-back{display:inline-flex;align-items:center;gap:2px;min-height:44px;",
        ".nb-back{display:inline-flex;align-items:center;gap:2px;min-height:36px;",
      )
      .replace("['funil', 'Funil',", "['funil', 'Pipeline',");
  };
  const readFileSync = ((caminho: string, ...resto: unknown[]) => {
    const texto = (fs.readFileSync as (...a: unknown[]) => unknown)(caminho, ...resto);
    return typeof texto === "string" ? trocar(String(caminho), texto) : texto;
  }) as typeof fs.readFileSync;
  return { ...fs, default: { ...fs, readFileSync }, readFileSync };
});

describe("paridade mobile — controle negativo", () => {
  it("o leitor vê cada valor alterado do protótipo", async () => {
    const { abasDoPrototipo, medidasDoPrototipo } = await import("./paridade-mobile/leitor");
    const medidas = medidasDoPrototipo();
    expect(medidas["--mb-fab"]).toBe("64px");
    expect(medidas["--mb-abas-colunas"]).toBe("4");
    expect(medidas["--mb-campo-fonte"]).toBe("14px");
    expect(abasDoPrototipo()).toContain("Pipeline");
  });

  it("a comparação aponta o que mudou, e só o que mudou", async () => {
    const { divergenciasDeCor, divergenciasDeMedida, divergenciasDoPrototipo } =
      await import("./paridade-mobile/divergencias");
    const cores = divergenciasDeCor().map((d) => d.split(" ")[0]);
    expect(cores).toContain("cor:claro:--chrome");
    // Token que não mudou e bate com o CRM não vira divergência: o leitor não reprova tudo.
    expect(cores).not.toContain("cor:claro:--surface");
    expect(divergenciasDeMedida().find((d) => d.startsWith("medida:--mb-fab "))).toContain(
      "protótipo 64px",
    );
    expect(divergenciasDoPrototipo().map((d) => d.split(" ").slice(0, 2).join(" "))).toEqual([
      "prototipo:alvo .nb-back",
      "prototipo:campo .cmp-in",
    ]);
  });
});
