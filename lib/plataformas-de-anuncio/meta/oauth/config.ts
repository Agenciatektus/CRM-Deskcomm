/**
 * O app OAuth da Meta (Login do Facebook) desta INSTALAÇÃO para LER anúncios.
 *
 * Irmão de `lib/plataformas-de-anuncio/google/config.ts`: env-only, e
 * `configuracaoDoMetaAds()` devolve `null` em vez de lançar. Sem as duas
 * variáveis o botão "Conectar com Meta" some e a tela diz o que falta; a opção
 * de colar o token à mão continua inteira.
 */
import { env } from "@/lib/env";

/** O caminho da rota de callback. Tem de estar registrado no app da Meta. */
export const CAMINHO_DO_CALLBACK = "/api/v1/plataformas-de-anuncio/meta/callback";

/** Os nomes das variáveis, para a tela dizer exatamente o que falta. */
export const VARIAVEIS_DO_META_ADS = [
  "META_ADS_OAUTH_APP_ID",
  "META_ADS_OAUTH_APP_SECRET",
] as const;

export interface AppDoMetaAdsConfigurado {
  appId: string;
  appSecret: string;
  /** Absoluto, e idêntico nos dois lados do fluxo. */
  redirectUri: string;
}

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Sem barra dupla, sem barra final. */
export function enderecoDeRetorno(urlDaAplicacao: string = env.NEXT_PUBLIC_APP_URL): string {
  const base = texto(urlDaAplicacao).replace(/\/+$/, "");
  return `${base}${CAMINHO_DO_CALLBACK}`;
}

/** A configuração em vigor, ou `null` quando a instalação não tem app OAuth da Meta. */
export function configuracaoDoMetaAds(): AppDoMetaAdsConfigurado | null {
  const appId = texto(env.META_ADS_OAUTH_APP_ID);
  const appSecret = texto(env.META_ADS_OAUTH_APP_SECRET);
  if (!appId || !appSecret) return null;
  return { appId, appSecret, redirectUri: enderecoDeRetorno() };
}

/** Conectar com a Meta está disponível nesta instalação? */
export function metaAdsEstaConfigurado(): boolean {
  return configuracaoDoMetaAds() !== null;
}

/** O que falta, pelo nome. */
export function faltaParaConectarOMetaAds(): string[] {
  return VARIAVEIS_DO_META_ADS.filter((nome) => !texto(env[nome]));
}
