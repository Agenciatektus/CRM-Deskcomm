/**
 * Formats a Nuvemshop product into a plain-text document suitable for RAG embedding.
 *
 * Strips HTML from descriptions and produces a labeled, human-readable template
 * that embeds well for semantic search.
 */

export interface NuvemshopProductVariant {
  price?: string;
  sku?: string;
}

export interface NuvemshopProduct {
  id: string;
  name: { pt: string } | string;
  /**
   * Multi-idioma, como o `name` — e era isso que faltava aqui.
   *
   * Tipada como `string`, ela ia direto para `stripHtml`, e com a loja real
   * chegou `{ pt: "<p>…</p>" }`: `html.replace is not a function` matava a
   * indexação do catálogo inteiro, com o evento morrendo depois de 5
   * tentativas. O `name` já tinha o tratamento; a descrição, não.
   */
  description?: { pt?: string } | string;
  price?: string;
  sku?: string;
  permalink?: string;
  variants?: NuvemshopProductVariant[];
  categories?: Array<{ name: { pt: string } | string }>;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim();
}

/**
 * O texto de um campo da API, seja ele string ou objeto por idioma.
 *
 * Aceita `unknown` de propósito: o tipo declarado acima é promessa nossa sobre
 * um payload de terceiro, e foi justamente uma promessa dessas que derrubou a
 * indexação. Campo que não vira texto devolve string vazia, em vez de explodir
 * no meio de um catálogo de centenas de produtos.
 */
function localizedText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const pt = (value as { pt?: unknown }).pt;
    if (typeof pt === "string") return pt;
  }
  return "";
}

/**
 * Converts a Nuvemshop product object into a plain-text RAG document.
 */
export function formatProductForRag(product: NuvemshopProduct): string {
  const name = localizedText(product.name);
  const description = stripHtml(localizedText(product.description));
  const price = product.price ? `R$ ${product.price}` : "N/A";
  const sku = product.sku ?? "N/A";
  const permalink = product.permalink ?? "";

  const variants =
    product.variants && product.variants.length > 0
      ? product.variants
          .map((v) => {
            const parts: string[] = [];
            if (v.price) parts.push(`Preço: R$ ${v.price}`);
            if (v.sku) parts.push(`SKU: ${v.sku}`);
            return parts.join(", ");
          })
          .filter((v) => v.length > 0)
          .join(" | ")
      : "N/A";

  const categories =
    product.categories && product.categories.length > 0
      ? product.categories.map((c) => localizedText(c.name)).join(", ")
      : "N/A";

  const lines: string[] = [
    `Produto: ${name}`,
    `Descrição: ${description || "N/A"}`,
    `Preço: ${price}`,
    `Variantes: ${variants}`,
    `Categorias: ${categories}`,
    `SKU: ${sku}`,
  ];

  if (permalink) {
    lines.push(`Link: ${permalink}`);
  }

  return lines.join("\n");
}
