/**
 * Valida o token da Meta colado à mão ANTES de gravar (espelho de
 * `meta-token-sistema.ts` da Verdash).
 *
 * Diferença deliberada: NÃO exige que o `app_id` seja o do CRM, porque o token
 * colado costuma vir de um app do próprio cliente. O `app_id` lido só é devolvido.
 *
 * O token vai só na query das chamadas à Graph (servidor); nunca em log, erro ou
 * retorno. Se a Meta não puder responder, NÃO se grava às cegas.
 */
import { baseDaGraphDeAnuncio } from "./graph-base";
import { listarContas } from "./insights";
import { configuracaoDoMetaAds } from "./oauth/config";

export type MotivoDeRecusaDoToken =
  | "token_invalido"
  | "token_de_pagina"
  | "sem_ads_read"
  | "sem_contas"
  | "validacao_indisponivel";

export type ResultadoDaValidacaoColada =
  | { ok: true; expiraEm: string | null; appId: string | null; contas: string[] }
  | { ok: false; motivo: MotivoDeRecusaDoToken };

interface DadosDoDebug {
  is_valid?: unknown;
  type?: unknown;
  scopes?: unknown;
  expires_at?: unknown;
  app_id?: unknown;
}

async function debugToken(token: string, usarApp: boolean): Promise<DadosDoDebug | "invalido" | "outro_app" | null> {
  const app = usarApp ? configuracaoDoMetaAds() : null;
  try {
    const consulta = new URLSearchParams({
      input_token: token,
      // Sem app OAuth na instalação, o próprio token inspeciona a si mesmo.
      access_token: app ? `${app.appId}|${app.appSecret}` : token,
    });
    const resposta = await fetch(`${baseDaGraphDeAnuncio()}/debug_token?${consulta.toString()}`, {
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!resposta.ok) {
      const corpo = (await resposta.json().catch(() => null)) as { error?: { code?: unknown } } | null;
      const code = corpo?.error?.code;
      if (resposta.status !== 400) return null;
      // Com o app do CRM, 100 = token de outro app: quem decide é o próprio token.
      if (app) return code === 100 ? "outro_app" : null;
      return code === 190 || code === 100 ? "invalido" : null;
    }
    const corpo = (await resposta.json()) as { data?: DadosDoDebug } | null;
    return corpo?.data ?? null;
  } catch {
    return null;
  }
}

export async function validarTokenColado(token: string): Promise<ResultadoDaValidacaoColada> {
  let dados = await debugToken(token, true);
  if (dados === "outro_app") dados = await debugToken(token, false);
  if (dados === null) return { ok: false, motivo: "validacao_indisponivel" };
  if (dados === "invalido" || dados === "outro_app" || dados.is_valid !== true) return { ok: false, motivo: "token_invalido" };

  const tipo = typeof dados.type === "string" ? dados.type.toUpperCase() : "";
  if (tipo === "PAGE") return { ok: false, motivo: "token_de_pagina" };
  if (tipo !== "USER" && tipo !== "SYSTEM_USER") return { ok: false, motivo: "token_invalido" };

  const escopos = Array.isArray(dados.scopes) ? dados.scopes.filter((s): s is string => typeof s === "string") : [];
  if (!escopos.includes("ads_read")) return { ok: false, motivo: "sem_ads_read" };

  const lista = await listarContas(token);
  if (!lista.ok) {
    return { ok: false, motivo: lista.falha === "token_invalido" ? "token_invalido" : "validacao_indisponivel" };
  }
  const contas = lista.dados.map((c) => c.id);
  if (contas.length === 0) return { ok: false, motivo: "sem_contas" };

  const exp = dados.expires_at;
  const expiraEm =
    typeof exp === "number" && Number.isFinite(exp) && exp > 0 ? new Date(exp * 1000).toISOString() : null;
  const appId = typeof dados.app_id === "string" && /^\d+$/.test(dados.app_id) ? dados.app_id : null;
  return { ok: true, expiraEm, appId, contas };
}
