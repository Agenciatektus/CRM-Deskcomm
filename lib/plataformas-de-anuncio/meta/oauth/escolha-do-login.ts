/**
 * O que a pessoa MARCOU no diálogo de login da Meta.
 *
 * `me/businesses` e `me/adaccounts` devolvem tudo o que o usuário alcança, não o
 * que ele escolheu no diálogo. A escolha só aparece em `granular_scopes` do
 * `debug_token`: `business_management` com os `target_ids` das empresas (BM)
 * marcadas.
 *
 * Melhor esforço e nunca lança: sem escolha legível (token colado à mão, de outro
 * app, `debug_token` falhou, lista vazia) devolve `null`, e quem chama segue com
 * o comportamento de sempre. Token e segredo não entram em log nem em erro.
 */
import { baseDaGraphDeAnuncio } from "../graph-base";
import { configuracaoDoMetaAds } from "./config";

const PRAZO_MS = 10_000;

export async function empresasEscolhidasNoLogin(token: string): Promise<string[] | null> {
  const app = configuracaoDoMetaAds();
  if (!app) return null;
  try {
    const url = `${baseDaGraphDeAnuncio()}/debug_token?${new URLSearchParams({ input_token: token })}`;
    const resposta = await fetch(url, {
      // App access token no cabeçalho: o segredo não vai para a URL.
      headers: { authorization: `Bearer ${app.appId}|${app.appSecret}` },
      signal: AbortSignal.timeout(PRAZO_MS),
      cache: "no-store",
    });
    if (!resposta.ok) return null;
    const corpo = (await resposta.json()) as {
      data?: {
        is_valid?: boolean;
        app_id?: string;
        granular_scopes?: Array<{ scope?: string; target_ids?: unknown }>;
      };
    };
    const d = corpo.data;
    // Token de outro app não tem a escolha deste diálogo.
    if (!d || d.is_valid !== true || d.app_id !== app.appId) return null;
    const ids = (d.granular_scopes ?? [])
      .filter((g) => g.scope === "business_management" && Array.isArray(g.target_ids))
      .flatMap((g) => g.target_ids as unknown[])
      .filter((id): id is string => typeof id === "string" && /^\d+$/.test(id));
    return ids.length > 0 ? [...new Set(ids)] : null;
  } catch {
    // Mensagem fixa (nada): o erro do fetch pode carregar a URL, e a URL carrega o token.
    return null;
  }
}
