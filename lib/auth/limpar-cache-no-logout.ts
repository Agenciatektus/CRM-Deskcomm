/**
 * Logout limpa o cache HTTP do navegador: `Clear-Site-Data: "cache"`.
 *
 * O 302 da mídia (`/api/v1/messages/{id}/media`) é `private, max-age` e o
 * navegador o guarda. `Vary: Cookie` já impede outra sessão de reaproveitá-lo,
 * mas é a única barreira (parecer do @Cassio_SecRev na #74, P2-2): quem sai tem
 * de deixar o cache limpo, e não depender de o navegador casar o `Vary`.
 *
 * Por que um cookie-marcador, e não o cabeçalho direto: o logout é Server Action
 * (`app/actions/auth/signOut.ts`), e Server Action não escreve cabeçalho de
 * resposta. A ação marca; o `proxy.ts` vê a marca na PRÓXIMA requisição que
 * passa por ele (o próprio redirecionamento ou o login seguinte, que também é
 * uma Server Action na rota pública `/login`), responde com `Clear-Site-Data` e
 * apaga a marca. Ninguém volta a entrar sem passar pelo proxy antes.
 */
import type { NextRequest, NextResponse } from "next/server";

export const COOKIE_LIMPAR_CACHE = "deskcomm-limpar-cache";
export const CABECALHO_LIMPAR_CACHE = '"cache"';

type CookieStoreGravavel = {
  set: (nome: string, valor: string, opcoes: Record<string, unknown>) => unknown;
};

/** Chamada pela ação de logout: pede ao proxy que limpe o cache na próxima resposta. */
export function marcarLimpezaDeCache(store: CookieStoreGravavel, secure: boolean): void {
  store.set(COOKIE_LIMPAR_CACHE, "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    // Uma hora basta: se ninguém voltar em uma hora, o 302 guardado (max-age de
    // no máximo 30 min) já venceu sozinho.
    maxAge: 3600,
  });
}

/** Chamada pelo proxy: com a marca, a resposta limpa o cache e apaga a marca. */
export function aplicarLimpezaDeCache(request: NextRequest, response: NextResponse): void {
  if (!request.cookies.get(COOKIE_LIMPAR_CACHE)) return;
  response.headers.set("Clear-Site-Data", CABECALHO_LIMPAR_CACHE);
  response.cookies.delete(COOKIE_LIMPAR_CACHE);
}
