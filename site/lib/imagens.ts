/**
 * Mapa de disponibilidade das imagens decorativas da LP. Cada id é um arquivo em
 * `site/public/_lp/img/<id>.{avif,webp,jpg}`. Quando o arquivo não existir, marque `disponivel: false`
 * e o `ImagemDeSlot` renderiza só a luz CSS do slot. Largura e altura são as do arquivo (evitam CLS).
 */
export const IMAGENS = {
  "hero-fluxo": { largura: 1672, altura: 941, disponivel: true },
  "hero-poster-video": { largura: 1672, altura: 941, disponivel: true },
  "vacuo-mensagens": { largura: 1916, altura: 821, disponivel: true },
  "plantao-tres-pecas": { largura: 1916, altura: 821, disponivel: true },
  "conta-equilibrio": { largura: 1448, altura: 1086, disponivel: true },
  "implantacao-montagem": { largura: 1122, altura: 1402, disponivel: true },
  "garantia-anel": { largura: 1254, altura: 1254, disponivel: true },
  "cta-noite": { largura: 1916, altura: 821, disponivel: true },
} as const;

export type IdImagem = keyof typeof IMAGENS;

export const PASTA_IMAGENS = "/_lp/img";
