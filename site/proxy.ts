import { NextResponse, type NextRequest } from "next/server";

/**
 * CSP por requisição, com nonce.
 *
 * A LP divide a origem `crm.verdash.com.br` com o CRM. Um XSS ou uma dependência
 * comprometida na LP rodaria na mesma origem do sistema e alcançaria `/api/*`
 * com as credenciais de quem está logado (achado P2-1 da revisão do Cassio).
 * Por isso a política é restrita: scripts só da própria origem e com nonce
 * (`strict-dynamic`), nada de terceiros, sem frames, sem `<base>` alheio.
 *
 * O Next lê o nonce deste cabeçalho e o aplica nos scripts que ele mesmo injeta.
 * Medição, analytics e qualquer script externo só entram aqui com decisão
 * explícita e revisão, porque cada um alarga a superfície da origem.
 */
export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV !== "production";

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|_lp/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
