/**
 * A IMAGEM das telas de acesso (login, cadastro, recuperação, MFA) — o lado
 * esquerdo da tela dividida, num lugar só.
 *
 * Mora aqui, e não escrita no componente, para que a imagem possa virar opção
 * da marca da instalação sem caçar caminho: quem passar a servir a imagem do
 * revendedor troca ESTE módulo (e o componente `ImagemDeMarcaDoAcesso` continua
 * igual). Enquanto isso não existe, é a arte do produto: duas composições da
 * mesma cena, sem texto e sem nome de marca desenhados nela — por isso pode
 * morar em `public/`, que é servido a todas as instalações (o que a doutrina de
 * marca própria proíbe é um arquivo com a MARCA do produto ali; ver
 * `lib/branding/desenho.ts`).
 *
 * Cada composição vem em três formatos, com o mesmo nome-base: `.avif` e `.webp`
 * (o navegador escolhe o mais leve que entende) e `.jpg` de reserva. A
 * otimização do `next/image` está desligada nesta imagem Docker
 * (`images.unoptimized`, em `next.config.ts`), então os formatos são arquivos de
 * verdade, gerados uma vez a partir do original.
 */
export const IMAGEM_DA_FACHADA = {
  /** Retrato: o painel da esquerda no desktop (≥ 1024 px). */
  retrato: { base: "/login/marca", largura: 1122, altura: 1402 },
  /** 16:9: a faixa estreita no topo, no tablet e no celular (< 1024 px). */
  faixa: { base: "/login/marca-faixa", largura: 1280, altura: 720 },
} as const;

/** Onde o painel de imagem aparece: a partir daqui, retrato; abaixo, faixa. */
export const BREAKPOINT_DO_PAINEL = "(min-width: 1024px)";
