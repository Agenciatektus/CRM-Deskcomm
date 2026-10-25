/**
 * As chamadas de rede do OAuth da Meta: código por token curto, token curto por
 * token longo (~60 dias) e, em melhor esforço, quem é o usuário e o que ele
 * concedeu.
 *
 * Nenhuma lança. Segredo, código e token vão no CORPO (POST) ou no cabeçalho,
 * nunca na URL, e nada disso é logado aqui.
 */
import { baseDaGraphDeAnuncio } from "../graph-base";
import type { AppDoMetaAdsConfigurado } from "./config";
import { lerRespostaDeToken, type LeituraDeToken } from "./oauth";

const PRAZO_MS = 10_000;

async function pedirToken(corpo: URLSearchParams, agora: Date): Promise<LeituraDeToken> {
  let resposta: Response;
  try {
    resposta = await fetch(`${baseDaGraphDeAnuncio()}/oauth/access_token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: corpo.toString(),
      signal: AbortSignal.timeout(PRAZO_MS),
      cache: "no-store",
    });
  } catch (erro) {
    const nome = erro instanceof Error ? erro.name : "erro";
    return { ok: false, motivo: "resposta_invalida", detalhe: `sem resposta da Meta: ${nome}` };
  }

  let bruto: unknown;
  try {
    bruto = await resposta.json();
  } catch {
    return {
      ok: false,
      motivo: "resposta_invalida",
      detalhe: `HTTP ${resposta.status} com corpo ilegível`,
    };
  }
  if (!resposta.ok && (typeof bruto !== "object" || bruto === null || !("error" in bruto))) {
    return { ok: false, motivo: "erro_da_meta", detalhe: `HTTP ${resposta.status}` };
  }
  return lerRespostaDeToken(bruto, { agora, status: resposta.status });
}

/** Troca o `code` do consentimento pelo token CURTO. */
export function trocarCodigoPorToken(
  app: AppDoMetaAdsConfigurado,
  code: string,
  opcoes: { agora: Date },
): Promise<LeituraDeToken> {
  return pedirToken(
    new URLSearchParams({
      client_id: app.appId,
      client_secret: app.appSecret,
      redirect_uri: app.redirectUri,
      code,
    }),
    opcoes.agora,
  );
}

/** Troca o token curto pelo de LONGA duração. */
export function trocarPorTokenLongo(
  app: AppDoMetaAdsConfigurado,
  tokenCurto: string,
  opcoes: { agora: Date },
): Promise<LeituraDeToken> {
  return pedirToken(
    new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: app.appId,
      client_secret: app.appSecret,
      fb_exchange_token: tokenCurto,
    }),
    opcoes.agora,
  );
}

/**
 * Renova um token longo AINDA VÁLIDO por outro de ~60 dias (mesma troca
 * `fb_exchange_token`). Não lança; token e segredo vão no corpo e nunca são logados.
 */
export function renovarTokenLongo(
  app: AppDoMetaAdsConfigurado,
  tokenAtual: string,
  opcoes: { agora: Date },
): Promise<LeituraDeToken> {
  return trocarPorTokenLongo(app, tokenAtual, opcoes);
}

/** O código ao token de longa duração, em dois passos. */
export async function obterTokenLongo(
  app: AppDoMetaAdsConfigurado,
  code: string,
  opcoes: { agora: Date },
): Promise<LeituraDeToken> {
  const curto = await trocarCodigoPorToken(app, code, opcoes);
  if (!curto.ok) return curto;
  return trocarPorTokenLongo(app, curto.token.access_token, opcoes);
}

async function lerJson(caminho: string, token: string): Promise<Record<string, unknown> | null> {
  try {
    const resposta = await fetch(`${baseDaGraphDeAnuncio()}${caminho}`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(PRAZO_MS),
      cache: "no-store",
    });
    if (!resposta.ok) return null;
    const corpo: unknown = await resposta.json();
    return typeof corpo === "object" && corpo !== null ? (corpo as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * O id do usuário Meta e as permissões que ele concedeu. Melhor esforço: a
 * conexão vale sem isso. Se a lista não pôde ser lida, `scopes` é `null`: gravar a
 * lista PEDIDA como se fosse a concedida esconderia o `ads_read` desmarcado.
 */
export async function lerPerfilDoToken(
  token: string,
): Promise<{ metaUserId: string | null; scopes: string[] | null }> {
  const [eu, permissoes] = await Promise.all([
    lerJson("/me?fields=id", token),
    lerJson("/me/permissions", token),
  ]);
  const id = typeof eu?.id === "string" && eu.id ? eu.id : null;
  if (!Array.isArray(permissoes?.data)) return { metaUserId: id, scopes: null };
  const lista = permissoes.data as unknown[];
  const concedidas = lista
    .filter((p): p is { permission: string; status: string } => {
      const o = p as Record<string, unknown> | null;
      return typeof o?.permission === "string" && o.status === "granted";
    })
    .map((p) => p.permission);
  return { metaUserId: id, scopes: concedidas };
}
