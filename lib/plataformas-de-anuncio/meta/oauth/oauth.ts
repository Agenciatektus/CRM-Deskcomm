/**
 * O consentimento e a leitura da resposta de token da Meta: a parte pura.
 *
 * Sem rede, sem `process.env` e sem relógio próprio. A mensagem de erro da
 * Graph NUNCA é copiada para o resultado: ela pode ecoar trecho de token ou de
 * código. Só o status HTTP e o código/tipo do erro seguem adiante.
 */
import { VERSAO_PADRAO_DA_GRAPH } from "@/lib/graph-version";

/**
 * Os escopos pedidos: IDÊNTICOS aos da Verdash (`IntegracoesPage.tsx`, diálogo
 * clássico do mesmo app Meta), para um único login servir leitura e envio de
 * conversões. O CRM continua só LENDO nesta conexão; `ads_management` é pedido
 * junto, não usado aqui. O CRM não usa `ads_management` hoje: a razão é paridade
 * com a Verdash (decisão do Peterson, 25/10/2026).
 */
export const ESCOPOS_DA_META = [
  "ads_read",
  "ads_management",
  "business_management",
  "pages_show_list",
  "pages_read_engagement",
] as const;

/** A tela de consentimento (Login do Facebook), na mesma versão da Graph do eixo. */
export const ENDERECO_DE_CONSENTIMENTO = `https://www.facebook.com/${VERSAO_PADRAO_DA_GRAPH}/dialog/oauth`;

export interface AppDaMetaAds {
  appId: string;
  redirectUri: string;
}

/** A URL para onde mandamos o admin autorizar. Lança quando falta app, retorno ou state. */
export function montarUrlDeConsentimento(app: AppDaMetaAds, opcoes: { state: string }): string {
  const appId = app.appId?.trim();
  const redirectUri = app.redirectUri?.trim();
  if (!appId) throw new Error("META_ADS_OAUTH_APP_ID ausente: não há app para pedir consentimento");
  if (!redirectUri)
    throw new Error("redirect_uri ausente: a Meta exige o endereço de retorno registrado");
  if (!opcoes.state?.trim())
    throw new Error("state ausente: sem ele o retorno da Meta não é verificável");

  const parametros = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: ESCOPOS_DA_META.join(","),
    state: opcoes.state,
  });
  return `${ENDERECO_DE_CONSENTIMENTO}?${parametros.toString()}`;
}

export interface TokenDaMeta {
  access_token: string;
  /** Instante absoluto, ISO-8601; `null` quando a Meta não informou o prazo. */
  expira_em: string | null;
}

export type MotivoDeTokenIlegivel = "resposta_invalida" | "erro_da_meta" | "sem_access_token";

/** O erro da Graph reduzido ao que é seguro guardar: códigos, nunca a mensagem. */
export interface ErroDaGraph {
  http?: number;
  code?: number;
  subcode?: number;
  tipo?: string;
  transitorio?: boolean;
}

export type LeituraDeToken =
  | { ok: true; token: TokenDaMeta }
  | { ok: false; motivo: MotivoDeTokenIlegivel; detalhe: string; erro?: ErroDaGraph };

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Lê a resposta de `oauth/access_token`. Nunca lança e nunca repete o corpo da Graph. */
export function lerRespostaDeToken(
  bruto: unknown,
  opcoes: { agora: Date; status?: number },
): LeituraDeToken {
  if (typeof bruto !== "object" || bruto === null) {
    return {
      ok: false,
      motivo: "resposta_invalida",
      detalhe: `resposta não é objeto: ${typeof bruto}`,
    };
  }
  const r = bruto as Record<string, unknown>;

  if (r.error !== undefined && r.error !== null) {
    const e = (typeof r.error === "object" ? r.error : {}) as Record<string, unknown>;
    const codigo = typeof e.code === "number" ? e.code : "?";
    const tipo = texto(e.type) ?? "?";
    return {
      ok: false,
      motivo: "erro_da_meta",
      detalhe: `HTTP ${opcoes.status ?? "?"}, codigo ${codigo}, tipo ${tipo.slice(0, 40)}`,
      erro: {
        http: opcoes.status,
        code: typeof e.code === "number" ? e.code : undefined,
        subcode: typeof e.error_subcode === "number" ? e.error_subcode : undefined,
        tipo: tipo === "?" ? undefined : tipo.slice(0, 40),
        transitorio: e.is_transient === true,
      },
    };
  }

  const accessToken = texto(r.access_token);
  if (!accessToken) {
    return { ok: false, motivo: "sem_access_token", detalhe: "resposta sem `access_token`" };
  }

  const bruta = typeof r.expires_in === "string" ? Number(r.expires_in.trim()) : r.expires_in;
  const expiresIn = typeof bruta === "number" && Number.isFinite(bruta) && bruta > 0 ? bruta : null;
  return {
    ok: true,
    token: {
      access_token: accessToken,
      expira_em:
        expiresIn === null
          ? null
          : new Date(opcoes.agora.getTime() + expiresIn * 1000).toISOString(),
    },
  };
}
