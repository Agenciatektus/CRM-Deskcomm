import { NextResponse } from "next/server";

/**
 * Volta de OAuth por PÁGINA-PONTE, não por redirect. A sessão é cookie
 * `SameSite=Strict` e um 302 vindo de facebook.com/google.com ainda pertence à
 * navegação iniciada lá: o cookie não viaja e a pessoa cai no `/login`. O HTML
 * volta com 200 no nosso origin e o `location.replace` é disparado por um
 * documento nosso (initiator same-site), então o cookie viaja. O histórico
 * completo está em `app/api/v1/agenda/google/callback/route.ts`.
 *
 * Quem chama limpa o cookie de vínculo na resposta (o path dele é de cada rota).
 */
export function ponteDeVolta(destino: string, mensagem = "Voltando…"): NextResponse {
  // Escapado mesmo o valor vindo de literais nossos: a ponte é genérica, e o
  // dia em que alguém passar algo de fora por aqui não deve ser o dia em que
  // isto vira injeção.
  const seguro = destino
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return new NextResponse(
    `<!doctype html><html lang="pt-br"><head><meta charset="utf-8">` +
      `<meta name="robots" content="noindex">` +
      `<noscript><meta http-equiv="refresh" content="0;url=${seguro}"></noscript>` +
      `<title>Voltando…</title></head><body>` +
      `<p>${mensagem}</p>` +
      `<script>location.replace(${JSON.stringify(destino)})</script>` +
      `<noscript><p><a href="${seguro}">Continuar</a></p></noscript>` +
      `</body></html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}
