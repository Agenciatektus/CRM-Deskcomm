import type { NextConfig } from "next";

// A pasta deste arquivo (site/), e não o diretório de onde o build foi chamado: um
// `next build site` rodado da raiz do repositório não pode virar o CRM como raiz.
const AQUI = import.meta.dirname;

/**
 * A LP divide o host `crm.verdash.com.br` com o CRM: o Traefik manda para ela só
 * a raiz `/`, as rotas dela e o prefixo `/_lp`. Tudo que a LP serve como arquivo
 * (JS, CSS, fontes, imagens) sai por `/_lp/...`, porque `/_next/...` é do CRM.
 *
 * `assetPrefix` põe os chunks em `/_lp/_next/...`; o rewrite devolve esse
 * caminho ao `/_next/...` que o servidor Next da LP conhece. Fontes e imagens
 * moram em `public/_lp/` pelo mesmo motivo.
 */
const nextConfig: NextConfig = {
  output: "standalone",
  // `site/` mora dentro do repositório do CRM, que tem `pnpm-lock.yaml`, `proxy.ts` e
  // `next.config.ts` próprios na raiz. Sem fixar a raiz aqui, o Next infere a do CRM
  // ("multiple lockfiles") e tenta compilar o `proxy.ts` dele, que importa `@/lib/*`
  // do CRM.
  turbopack: { root: AQUI },
  outputFileTracingRoot: AQUI,
  poweredByHeader: false,
  assetPrefix: "/_lp",
  /**
   * Cabeçalhos de segurança (a CSP, que muda a cada requisição por causa do nonce,
   * mora em `proxy.ts`). A LP divide a origem com o CRM: ver o cabeçalho de `proxy.ts`.
   * HSTS sem `includeSubDomains`, porque o host é compartilhado.
   */
  async headers() {
    return [
      {
        // Arquivos da LP (icon.svg, imagens, fontes): o `proxy.ts` não passa por aqui. Um SVG
        // aberto direto na barra de endereço é um documento na origem compartilhada; esta política
        // o impede de rodar script. Como sub-recurso (CSS, fonte, imagem) nada disto o afeta.
        source: "/_lp/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; font-src 'self'; frame-ancestors 'none'; sandbox",
          },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
  async rewrites() {
    return [{ source: "/_lp/_next/:path*", destination: "/_next/:path*" }];
  },
};

export default nextConfig;
