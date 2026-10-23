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

/**
 * As entidades nomeadas que aparecem de verdade em descrição de loja PT-BR.
 *
 * Mapa curto de propósito: o resto cai na forma numérica, que é genérica.
 */
const ENTIDADES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  bull: "•",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  aacute: "á", agrave: "à", atilde: "ã", acirc: "â", auml: "ä",
  eacute: "é", egrave: "è", ecirc: "ê", euml: "ë",
  iacute: "í", icirc: "î", iuml: "ï",
  oacute: "ó", otilde: "õ", ocirc: "ô", ouml: "ö", ograve: "ò",
  uacute: "ú", ucirc: "û", uuml: "ü", ugrave: "ù",
  ccedil: "ç", ntilde: "ñ",
  Aacute: "Á", Atilde: "Ã", Acirc: "Â", Agrave: "À",
  Eacute: "É", Ecirc: "Ê",
  Iacute: "Í", Oacute: "Ó", Otilde: "Õ", Ocirc: "Ô",
  Uacute: "Ú", Ccedil: "Ç",
  reg: "®", copy: "©", trade: "™", deg: "°", euro: "€", pound: "£",
  // tipográficas de Word e de importação por CSV, e as ordinais PT-BR
  rsquo: "\u2019", lsquo: "\u2018", ldquo: "\u201c", rdquo: "\u201d",
  sbquo: "\u201a", bdquo: "\u201e", prime: "\u2032", Prime: "\u2033",
  ordm: "º", ordf: "ª", frac12: "½", frac14: "¼", frac34: "¾",
  sup2: "²", sup3: "³", times: "×", middot: "·", laquo: "«", raquo: "»",
};

/**
 * Decodifica entidade HTML.
 *
 * Medido no catálogo real: 601 de 991 trechos indexados levavam entidade crua
 * (`algod&atilde;o puro`, `&nbsp;`, `&bull;`). `stripHtml` tirava as TAGS e
 * deixava isso, então o texto embedado ficava com lixo — piora o casamento
 * semântico, e se a resposta citar a descrição o cliente lê `algod&atilde;o`.
 */
/**
 * O caractere de um código numérico, ou a entidade crua se o código não serve.
 *
 * `String.fromCodePoint` LANÇA `RangeError` fora de 0–0x10FFFF, e este arquivo
 * roda por produto num catálogo de centenas: uma exceção aqui sobe por
 * `pedacosDeCatalogo` e derruba a indexação inteira, com uma mensagem
 * (`Invalid code point 1114112`) que não aponta para produto nenhum. Era o
 * primeiro caminho deste arquivo que podia lançar, contra o invariante que ele
 * declara desde o começo: um produto estranho não derruba os outros.
 *
 * NUL e surrogate solitário não lançam aqui e são piores de diagnosticar —
 * explodem longe da causa, no insert (Postgres `text` não guarda NUL) ou na
 * chamada de embedding. Também ficam crus.
 */
function porCodigo(n: number, inteiro: string): string {
  const valido =
    Number.isInteger(n) && n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff);
  return valido ? String.fromCodePoint(n) : inteiro;
}

/**
 * UMA passada, com alternância, para que nada seja relido.
 *
 * Em duas passadas o `&#38;nbsp;` virava espaço: a numérica devolvia `&` e a
 * nomeada rescaneava a saída, decodificando o que já era texto literal.
 */
function decodificarEntidades(texto: string): string {
  return texto.replace(
    /&#x([0-9a-fA-F]+);|&#(\d+);|&([a-zA-Z][a-zA-Z0-9]{1,9});/g,
    (inteiro, hex, dec, nome) => {
      if (hex !== undefined) return porCodigo(parseInt(hex, 16), inteiro);
      if (dec !== undefined) return porCodigo(Number(dec), inteiro);
      return ENTIDADES[nome as string] ?? inteiro;
    },
  );
}

const semTags = (texto: string) => texto.replace(/<[^>]+>/g, " ");

/**
 * Tira as tags, decodifica, e tira tags DE NOVO.
 *
 * A segunda passada existe porque HTML duplo-escapado é comum em editor de loja
 * e em importação por CSV: `&lt;p&gt;oi&lt;/p&gt;` só vira `<p>oi</p>` depois de
 * decodificar, e aí já tinha passado pela primeira limpeza. O motivo deste
 * conserto é o cliente não ler `algod&atilde;o`; ler `<p>` é o mesmo problema.
 */
function stripHtml(html: string): string {
  return semTags(decodificarEntidades(semTags(html)))
    .replace(/\s{2,}/g, " ")
    .trim();
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
 * O preço a mostrar quando o produto não tem preço próprio: o das variantes.
 *
 * Um valor só quando todas custam igual, e a faixa quando diferem — é o que
 * responde "quanto custa" sem inventar precisão que o produto não tem.
 */
function precoDasVariantes(variants: NuvemshopProduct["variants"]): string {
  if (!Array.isArray(variants)) return "";

  // TUDO OU NADA, e é o ponto todo desta função.
  //
  // Descartar a variante que não parseia e anunciar o resto como preço é pior
  // que `N/A`: com `["199,00", "1.299,00"]` o separador de milhar não converte,
  // sobra um valor só, e o trecho diz `Preço: R$ 199.00` sem faixa e sem sinal
  // de que faltou alguém. O agente afirma R$ 199 para um produto cuja variante
  // GG custa R$ 1.299 — número errado dito com confiança. Se um preço presente
  // não é legível, nenhum preço é anunciado.
  const comPreco = variants
    .map((v) => escalarTexto(v?.price))
    .filter((texto) => texto.trim() !== "");
  if (comPreco.length === 0) return "";

  const valores = comPreco.map((texto) => Number(texto.replace(",", ".")));
  if (valores.some((n) => !Number.isFinite(n) || n <= 0)) return "";

  const menor = Math.min(...valores);
  const maior = Math.max(...valores);
  const dinheiro = (n: number) => n.toFixed(2);
  return menor === maior ? dinheiro(menor) : `${dinheiro(menor)} a R$ ${dinheiro(maior)}`;
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
  // O PREÇO DO PRODUTO PODE MORAR NAS VARIANTES.
  //
  // Na Nuvemshop, produto com variante tem `price` nulo no nível do produto, e
  // o preço real fica em cada variante. Medido no catálogo real: 879 de 991
  // trechos indexados saíam com `Preço: N/A` e o `R$ 199,00` três linhas
  // abaixo. Ou seja, o acervo falhava exatamente na pergunta que o cliente
  // mais faz, e sem erro nenhum para denunciar.
  const precoTexto = escalarTexto(product.price) || precoDasVariantes(product.variants);
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
