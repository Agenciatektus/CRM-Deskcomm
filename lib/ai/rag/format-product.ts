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
 *
 * `pt` primeiro, mas NÃO só `pt`. A primeira versão disto lia apenas essa
 * chave, e a revisão mostrou o preço disso: loja com o idioma preenchido em
 * `es` indexava centenas de linhas `Descrição: N/A` e produtos com
 * `Produto: ` vazio — embedding pago que nunca casa com a pergunta do cliente.
 * O mesmo desfecho da falha que este arquivo conserta, agora sem o crash que
 * ao menos avisava. A própria loja declara `main_language` em
 * `lib/nuvemshop/api-client.ts`, então o idioma não é fixo; como esse dado não
 * é gravado na conexão, a saída é usar o texto que existir.
 */
function localizedText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const pt = (value as { pt?: unknown }).pt;
    if (typeof pt === "string" && pt.trim()) return pt;
    const outro = Object.values(value as Record<string, unknown>).find(
      (v) => typeof v === "string" && v.trim(),
    );
    if (typeof outro === "string") return outro;
  }
  return "";
}

/**
 * Campo escalar da API: aqui número TAMBÉM é texto.
 *
 * Existe porque mandar `price` e `sku` pela porta do `localizedText` corrigiu o
 * `[object Object]` e criou outro buraco: eles entravam por interpolação de
 * template, que aceitava número, e passaram a virar `N/A`. Com preço numérico o
 * catálogo indexaria inteiro, sem crash, com todo produto em `Preço: N/A` — e o
 * cliente que pergunta quanto custa recebe silêncio. Pior que a descrição
 * faltando, porque preço é o que mais se pergunta.
 *
 * Que essa API manda número onde a nossa tipagem promete string já está medido
 * nesta casa: o `id` do produto é coagido com `String()` no worker e no webhook,
 * apesar de `id: string` no tipo.
 */
function escalarTexto(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return localizedText(value);
}

/**
 * O campo veio preenchido e ainda assim não virou texto.
 *
 * Serve para distinguir as duas coisas que `localizedText` devolve iguais:
 * lojista que não escreveu descrição (campo ausente ou vazio, normal) de
 * formato que deixou de ser legível (chave nova, campo renomeado, tipo
 * trocado). Só o segundo é defeito, e é o que o worker conta para avisar.
 */
export function campoIlegivel(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return false;
  if (Array.isArray(value)) return true;
  if (typeof value !== "object") return true;
  // Objeto VAZIO é o mesmo fato que campo ausente: lojista que não escreveu.
  // Sem esta linha, uma loja que entregue `description: {}` abriria aviso em
  // massa como se a API tivesse mudado — o falso positivo que este corte existe
  // para evitar.
  if (Object.keys(value as object).length === 0) return false;
  // Ter string, ainda que VAZIA, significa que o formato continua legível e o
  // lojista é que não escreveu. Ilegível é não haver texto nenhum onde devia.
  return !Object.values(value as Record<string, unknown>).some((v) => typeof v === "string");
}

/**
 * Converts a Nuvemshop product object into a plain-text RAG document.
 */
export function formatProductForRag(product: NuvemshopProduct): string {
  const name = localizedText(product.name);
  const description = stripHtml(localizedText(product.description));
  // Pela mesma porta: estes entram por interpolação de template, que aceita
  // objeto sem reclamar e escreve `[object Object]`. Não derruba nada, e é pior
  // nisso — envenena o trecho que vai para o acervo, e o agente responde o
  // preço com `[object Object]` para o cliente.
  const precoTexto = escalarTexto(product.price);
  const price = precoTexto ? `R$ ${precoTexto}` : "N/A";
  const sku = escalarTexto(product.sku) || "N/A";
  const permalink = escalarTexto(product.permalink);

  // `Array.isArray` e não só `length`: com `variants: "189.90"` a guarda de
  // tamanho passa reto e o `.map` levanta o MESMO `TypeError` que derrubou o
  // catálogo inteiro pela descrição. É a mesma classe de defeito.
  const variants =
    Array.isArray(product.variants) && product.variants.length > 0
      ? product.variants
          .map((v) => {
            const parts: string[] = [];
            const vPrice = escalarTexto(v.price);
            const vSku = escalarTexto(v.sku);
            if (vPrice) parts.push(`Preço: R$ ${vPrice}`);
            if (vSku) parts.push(`SKU: ${vSku}`);
            return parts.join(", ");
          })
          .filter((v) => v.length > 0)
          .join(" | ") || "N/A"
      : "N/A";

  const categories =
    Array.isArray(product.categories) && product.categories.length > 0
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
