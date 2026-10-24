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
  async rewrites() {
    return [{ source: "/_lp/_next/:path*", destination: "/_next/:path*" }];
  },
};

export default nextConfig;
