/**
 * A parte pura da renovação do token da Meta (espelho de
 * `supabase/functions/_shared/meta-token-renovacao.ts` da Verdash) e a consulta
 * `/debug_token` para quando a troca não devolve `expires_in`.
 */
import { baseDaGraphDeAnuncio } from "../graph-base";
import type { AppDoMetaAdsConfigurado } from "./config";
import type { ErroDaGraph } from "./oauth";

/**
 * 'recusada': só code 190 (token inválido, expirado ou revogado) ou 102 (sessão
 * inválida), sem is_transient. Só isso marca `needs_reconnect`. O resto (limite
 * de chamadas, erro interno, rede, código desconhecido) é 'transitoria'.
 */
export function classificarErroDaMeta(e: ErroDaGraph | null | undefined): "recusada" | "transitoria" {
  if (!e || e.transitorio) return "transitoria";
  return e.code === 190 || e.code === 102 ? "recusada" : "transitoria";
}

/** Texto para `last_token_error`: só códigos, nunca a mensagem da Meta nem o token. */
export function resumoDoErro(e: ErroDaGraph | null | undefined): string {
  return `Meta recusou a renovação (http ${e?.http ?? "?"}, code ${e?.code ?? "?"}, subcode ${e?.subcode ?? "?"}, ${e?.tipo ?? "sem tipo"})`;
}

/**
 * `data` do debug_token. `expires_at` em epoch (segundos); 0 = nunca expira, e
 * só vale com `is_valid === true` (token inválido também devolve 0).
 */
export type ValidadeDoDebug =
  | { ok: true; expiraEm: string }
  | { ok: true; expiraEm: null; nuncaExpira: true }
  | { ok: false };

export function validadeDoDebugToken(data: { expires_at?: unknown; is_valid?: unknown } | null | undefined): ValidadeDoDebug {
  const expiresAt = data?.expires_at;
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt) || expiresAt < 0) {
    return { ok: false };
  }
  if (data?.is_valid === false) return { ok: false };
  if (expiresAt === 0) {
    return data?.is_valid === true ? { ok: true, expiraEm: null, nuncaExpira: true } : { ok: false };
  }
  return { ok: true, expiraEm: new Date(expiresAt * 1000).toISOString() };
}

/**
 * Pergunta à Graph até quando o token vale. O token vai só na query desta
 * chamada ao servidor da Meta; nada é logado nem devolvido além da validade.
 */
export async function consultarValidadeDoToken(
  app: AppDoMetaAdsConfigurado,
  token: string,
): Promise<ValidadeDoDebug> {
  try {
    const consulta = new URLSearchParams({
      input_token: token,
      access_token: `${app.appId}|${app.appSecret}`,
    });
    const resposta = await fetch(`${baseDaGraphDeAnuncio()}/debug_token?${consulta.toString()}`, {
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!resposta.ok) return { ok: false };
    const corpo = (await resposta.json()) as { data?: { expires_at?: unknown; is_valid?: unknown } } | null;
    return validadeDoDebugToken(corpo?.data);
  } catch {
    return { ok: false };
  }
}
