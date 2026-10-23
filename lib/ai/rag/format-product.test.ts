import { describe, expect, it } from "vitest";
import {
  campoIlegivel,
  formatProductForRag,
  type NuvemshopProduct,
} from "@/lib/ai/rag/format-product";

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
 * `localizedText`, campo que não vira texto não derruba o catálogo, e campo em
 * idioma que não é `pt` NÃO vira silêncio.
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

  // A primeira versão desta cerca esperava "N/A" aqui, ou seja, travava o
  // SILÊNCIO como se fosse o comportamento desejado. Loja com o idioma
  // preenchido em outra chave indexaria centenas de linhas vazias, com
  // embedding pago que nunca casa com a pergunta do cliente.
  it("⭐ idioma que não é pt: usa o texto que existir, nunca vira vazio", () => {
    expect(
      formatProductForRag({ ...base, description: { es: "<p>Algodón</p>" } as never }),
    ).toContain("Descrição: Algodón");

    // `pt` presente mas vazio não deve ganhar do idioma que tem conteúdo
    expect(
      formatProductForRag({ ...base, description: { pt: "", es: "Algodón" } as never }),
    ).toContain("Descrição: Algodón");

    expect(formatProductForRag({ ...base, name: { es: "Camisa" } as never })).toContain(
      "Produto: Camisa",
    );
  });

  // O tipo é promessa NOSSA sobre payload de terceiro, e foi uma promessa
  // dessas que derrubou a indexação. Um catálogo de centenas de produtos não
  // pode morrer inteiro por um campo estranho em um deles.
  //
  // O `as never` fura o contrato de propósito: o que se mede aqui é o runtime.
  // Ele desliga a checagem, então não copie o padrão para fora deste caso.
  it("⭐ formato inesperado não derruba o produto — em NENHUM dos campos", () => {
    for (const estranho of [42, [], { pt: 7 }, { pt: {} }]) {
      expect(
        formatProductForRag({ ...base, description: estranho as never }),
      ).toContain("Descrição: N/A");
    }

    // a cerca anterior prometia "os campos" e variava só a descrição; foi por
    // isso que estes dois crashes passaram verdes.
    expect(() =>
      formatProductForRag({ ...base, variants: "189.90" as never }),
    ).not.toThrow();
    expect(formatProductForRag({ ...base, variants: "189.90" as never })).toContain(
      "Variantes: N/A",
    );

    expect(() =>
      formatProductForRag({ ...base, categories: "Masculino" as never }),
    ).not.toThrow();
    expect(formatProductForRag({ ...base, categories: "Masculino" as never })).toContain(
      "Categorias: N/A",
    );
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

  // Não derruba nada, e é pior nisso: envenena o trecho que vai para o acervo
  // e o agente responde o preço com `[object Object]` para o cliente.
  it("⭐ preço e SKU multi-idioma não viram `[object Object]` no acervo", () => {
    const texto = formatProductForRag({
      ...base,
      price: { pt: "199.90" } as never,
      sku: { pt: "CAM-01" } as never,
      variants: [{ price: { pt: "189.90" } as never, sku: "CAM-01-M" }],
    });

    expect(texto).not.toContain("[object Object]");
    expect(texto).toContain("Preço: R$ 199.90");
    expect(texto).toContain("Preço: R$ 189.90");
    expect(texto).toContain("SKU: CAM-01");
  });

  // Regressão nascida do conserto anterior: ao mandar os escalares pela porta
  // do `localizedText`, eles perderam a interpolação de template, que aceitava
  // número, e viravam `N/A`. Com preço numérico o catálogo indexaria inteiro,
  // sem crash, com todo produto em `Preço: N/A` — e o cliente que pergunta
  // quanto custa recebe silêncio. Que esta API manda número onde o tipo promete
  // string já está medido em casa: o `id` é coagido com `String()` no worker e
  // no webhook.
  it("⭐ preço e SKU numéricos continuam no texto — nunca viram N/A", () => {
    const texto = formatProductForRag({
      ...base,
      price: 199.9 as never,
      sku: 12345 as never,
      variants: [{ price: 189.9 as never, sku: 12345 as never }],
    });

    expect(texto).toContain("Preço: R$ 199.9");
    expect(texto).toContain("SKU: 12345");
    expect(texto).toContain("Preço: R$ 189.9, SKU: 12345");
    // só nos campos escalares: a descrição ausente deste produto base é N/A
    // por direito, e asserir o texto inteiro media a coisa errada.
    expect(texto).not.toContain("Preço: N/A");
    expect(texto).not.toContain("SKU: N/A");
    expect(texto).not.toContain("Variantes: N/A");
  });

  // ─── medido no catálogo real da loja, depois de indexar ──────────────────
  //
  // 879 de 991 trechos saíam com `Preço: N/A` e o `R$ 199,00` três linhas
  // abaixo, em `Variantes:`. Na Nuvemshop, produto com variante tem `price`
  // nulo no nível do produto. O acervo falhava na pergunta que o cliente mais
  // faz, e sem erro nenhum para denunciar.
  it("⭐ produto sem preço próprio usa o preço das variantes", () => {
    const texto = formatProductForRag({
      ...base,
      variants: [
        { price: "199.00", sku: "13320" },
        { price: "199.00", sku: "13322" },
      ],
    });

    expect(texto).toContain("Preço: R$ 199.00");
    expect(texto).not.toContain("Preço: N/A");
  });

  it("⭐ variantes com preços diferentes viram faixa, sem inventar precisão", () => {
    const texto = formatProductForRag({
      ...base,
      variants: [
        { price: "99.00", sku: "A" },
        { price: "199.00", sku: "B" },
        { price: "149.00", sku: "C" },
      ],
    });

    expect(texto).toContain("Preço: R$ 99.00 a R$ 199.00");
  });

  it("preço próprio do produto continua ganhando da variante", () => {
    const texto = formatProductForRag({
      ...base,
      price: "250.00",
      variants: [{ price: "199.00", sku: "A" }],
    });

    expect(texto).toContain("Preço: R$ 250.00");
  });

  // Descartar a variante que não parseia e anunciar o resto é PIOR que N/A: o
  // separador de milhar não converte, sobra um valor, e o agente afirma R$ 199
  // para um produto cuja GG custa R$ 1.299 — número errado dito com confiança.
  it("⭐ preço ilegível em alguma variante: nenhum preço é anunciado", () => {
    const texto = formatProductForRag({
      ...base,
      variants: [{ price: "199,00", sku: "M" }, { price: "1.299,00", sku: "GG" }],
    });

    expect(texto).toContain("Preço: N/A");
    expect(texto).not.toContain("Preço: R$ 199.00\n");
  });

  it("vírgula decimal simples continua sendo lida", () => {
    expect(
      formatProductForRag({ ...base, variants: [{ price: "199,00", sku: "M" }] }),
    ).toContain("Preço: R$ 199.00");
  });

  it("variante sem preço no meio de outras com preço não derruba a leitura", () => {
    const texto = formatProductForRag({
      ...base,
      variants: [{ price: "199.00", sku: "M" }, { sku: "G" }, { price: "", sku: "GG" }],
    });

    expect(texto).toContain("Preço: R$ 199.00");
  });

  it("sem preço em lugar nenhum segue N/A", () => {
    expect(formatProductForRag({ ...base, variants: [{ sku: "A" }] })).toContain("Preço: N/A");
    expect(formatProductForRag(base)).toContain("Preço: N/A");
  });

  // 601 de 991 trechos levavam entidade crua para o acervo. `stripHtml` tirava
  // as TAGS e deixava isso: piora o casamento semântico, e se a resposta citar
  // a descrição o cliente lê `algod&atilde;o`.
  it("⭐ entidade HTML é decodificada, não vai crua para o acervo", () => {
    const texto = formatProductForRag({
      ...base,
      description: {
        pt: "<p>Algod&atilde;o puro&nbsp;&bull; gola cl&aacute;ssica &amp; c&ocirc;moda</p>",
      },
    });

    expect(texto).toContain("Algodão puro • gola clássica & cômoda");
    expect(texto).not.toContain("&atilde;");
    expect(texto).not.toContain("&nbsp;");
    expect(texto).not.toContain("&amp;");
  });

  it("entidade numérica decimal e HEXADECIMAL", () => {
    const texto = formatProductForRag({
      ...base,
      description: "Camisa &#233;poca &#x1F600; &#8220;top&#8221; &#x41;",
    });

    expect(texto).toContain("época");
    // positiva para o ramo hex: sem isto, apagar o ramo passava verde, porque
    // `not.toMatch(/&#\d+;/)` não casa `&#x...` (o `&#` vem seguido de `x`).
    expect(texto).toContain("\u{1F600}");
    expect(texto).toContain("A");
    expect(texto).toContain("\u201ctop\u201d");
    expect(texto).not.toMatch(/&#x?[0-9a-fA-F]+;/);
  });

  // ESTE caso é o que impedia o catálogo inteiro de cair. `fromCodePoint` lança
  // `RangeError` fora de 0–0x10FFFF, e a exceção sobe de `formatProductForRag`
  // até `indexarFonte`: um caractere ruim em UM produto derrubaria os 879, com
  // uma mensagem que não aponta para produto nenhum.
  it("⭐ código numérico inválido fica cru e NÃO derruba o produto", () => {
    for (const ruim of ["&#x110000;", "&#1114112;", "&#xFFFFFFF;", "&#999999999999;"]) {
      let texto = "";
      expect(() => {
        texto = formatProductForRag({ ...base, description: `Camisa ${ruim} fim` });
      }).not.toThrow();
      expect(texto).toContain(ruim);
    }
  });

  it("⭐ NUL e surrogate solitário também ficam crus (explodiriam longe da causa)", () => {
    const texto = formatProductForRag({ ...base, description: "a &#0; b &#xD800; c" });

    expect(texto).toContain("&#0;");
    expect(texto).toContain("&#xD800;");
    expect(texto).not.toContain("\u0000");
  });

  // Em duas passadas, a numérica devolvia `&` e a nomeada rescaneava a saída:
  // `&#38;nbsp;` virava espaço, quando é o texto literal `&nbsp;`.
  it("⭐ nada é relido: `&#38;nbsp;` é o texto `&nbsp;`, não um espaço", () => {
    const texto = formatProductForRag({ ...base, description: "x &#38;nbsp; y" });

    expect(texto).toContain("&nbsp;");
  });

  it("`&amp;X;` continua protegido da dupla decodificação", () => {
    const texto = formatProductForRag({ ...base, description: "a &amp;nbsp; b &amp;amp; c" });

    expect(texto).toContain("&nbsp;");
    expect(texto).toContain("&amp;");
  });

  // HTML duplo-escapado é comum em editor de loja e em importação por CSV: só
  // vira tag DEPOIS de decodificar, quando a primeira limpeza já passou.
  it("⭐ HTML duplo-escapado não devolve tag literal ao acervo", () => {
    const texto = formatProductForRag({
      ...base,
      description: "&lt;p&gt;Algod&atilde;o puro&lt;/p&gt;",
    });

    expect(texto).toContain("Algodão puro");
    expect(texto).not.toContain("<p>");
    expect(texto).not.toContain("</p>");
  });

  it("entidades tipográficas de Word/CSV e ordinais PT-BR", () => {
    const texto = formatProductForRag({
      ...base,
      description: "Tamanho 2&ordm; &rsquo;slim&rsquo; &ldquo;fit&rdquo; 1&frac12; 5&times;",
    });

    expect(texto).toContain("2º");
    expect(texto).toContain("\u2019slim\u2019");
    expect(texto).toContain("\u201cfit\u201d");
    expect(texto).toContain("1½");
    expect(texto).toContain("5×");
  });

  it("entidade desconhecida fica como está, em vez de virar lixo", () => {
    const texto = formatProductForRag({ ...base, description: "Marca &naoexiste; aqui" });

    expect(texto).toContain("&naoexiste;");
  });

  it("variante sem nada legível fecha com N/A, não com rótulo vazio", () => {
    const texto = formatProductForRag({
      ...base,
      variants: [{ price: {} as never, sku: {} as never }],
    });

    expect(texto).toContain("Variantes: N/A");
  });
});

/**
 * O predicado que o worker usa para contar o que deixou de ser legível.
 *
 * A distinção é o que impede o alarme de virar falso positivo: lojista que não
 * escreveu descrição é normal; campo preenchido que não vira texto é defeito.
 */
describe("campoIlegivel", () => {
  it("campo ausente ou vazio NÃO é ilegível — é lojista sem descrição", () => {
    expect(campoIlegivel(undefined)).toBe(false);
    expect(campoIlegivel(null)).toBe(false);
    expect(campoIlegivel("")).toBe(false);
    expect(campoIlegivel({ pt: "" })).toBe(false);
    // objeto vazio é o mesmo fato: sem isto, loja que entregue `{}` para
    // produto sem descrição abriria aviso em massa como mudança de API.
    expect(campoIlegivel({})).toBe(false);
  });

  it("texto em qualquer idioma NÃO é ilegível", () => {
    expect(campoIlegivel("Camisa")).toBe(false);
    expect(campoIlegivel({ pt: "Camisa" })).toBe(false);
    expect(campoIlegivel({ es: "Camisa" })).toBe(false);
  });

  it("⭐ campo preenchido que não vira texto É ilegível", () => {
    expect(campoIlegivel(42)).toBe(true);
    expect(campoIlegivel({ pt: 7 })).toBe(true);
    expect(campoIlegivel({ pt: { nested: "x" } })).toBe(true);
    expect(campoIlegivel([{ pt: "Camisa" }])).toBe(true);
  });
});
