import { describe, expect, it } from "vitest";
import { formatProductForRag, type NuvemshopProduct } from "@/lib/ai/rag/format-product";

/**
 * A DESCRIÇÃO DA NUVEMSHOP É MULTI-IDIOMA, E ISSO MATOU O CATÁLOGO INTEIRO.
 *
 * Esta função não tinha teste nenhum. O `name` e o `categories[].name` já
 * passavam por uma resolução de campo por idioma; a `description` estava
 * tipada como `string` e ia direto para `html.replace`.
 *
 * Com a loja real conectada, chegou `{ pt: "<p>…</p>" }` e o worker quebrou com
 * `html.replace is not a function`. O evento `nuvemshop.product_synced` morreu
 * depois de 5 tentativas (`status: dead`), e a fonte de catálogo da loja ficou
 * sem nenhuma versão ativa — o agente respondendo que não sabe o preço, com a
 * tela dizendo "conectado".
 *
 * O que estes casos travam: todo campo que vem do payload de terceiro passa por
 * `localizedText`, e campo que não vira texto não derruba o catálogo.
 */

const base: NuvemshopProduct = { id: "1", name: "Camisa" };

describe("formatProductForRag — campos multi-idioma da loja", () => {
  it("⭐ descrição como objeto por idioma: usa o pt e tira o HTML", () => {
    const texto = formatProductForRag({
      ...base,
      description: { pt: "<p>Algodão <b>egípcio</b></p>" },
    });

    expect(texto).toContain("Descrição: Algodão egípcio");
  });

  it("descrição como string segue funcionando", () => {
    const texto = formatProductForRag({ ...base, description: "<p>Linho puro</p>" });

    expect(texto).toContain("Descrição: Linho puro");
  });

  it("sem descrição: N/A, e nada explode", () => {
    expect(formatProductForRag(base)).toContain("Descrição: N/A");
  });

  // O tipo é promessa NOSSA sobre payload de terceiro, e foi uma promessa
  // dessas que derrubou a indexação. Um catálogo de centenas de produtos não
  // pode morrer inteiro por um campo estranho em um deles.
  it("⭐ campo em formato inesperado não derruba o produto", () => {
    for (const estranho of [42, [], { en: "only english" }, null, { pt: 7 }]) {
      const texto = formatProductForRag({
        ...base,
        description: estranho as never,
      });
      expect(texto).toContain("Descrição: N/A");
    }
  });

  it("nome e categoria também aceitam objeto por idioma", () => {
    const texto = formatProductForRag({
      ...base,
      name: { pt: "Calça social" },
      categories: [{ name: { pt: "Alfaiataria" } }, { name: "Masculino" }],
    });

    expect(texto).toContain("Produto: Calça social");
    expect(texto).toContain("Categorias: Alfaiataria, Masculino");
  });

  it("preço e variantes entram no texto que vai ser embedado", () => {
    const texto = formatProductForRag({
      ...base,
      price: "199.90",
      sku: "CAM-01",
      variants: [{ price: "189.90", sku: "CAM-01-M" }],
      permalink: "https://loja.exemplo/camisa",
    });

    expect(texto).toContain("Preço: R$ 199.90");
    expect(texto).toContain("Preço: R$ 189.90, SKU: CAM-01-M");
    expect(texto).toContain("SKU: CAM-01");
    expect(texto).toContain("Link: https://loja.exemplo/camisa");
  });
});
