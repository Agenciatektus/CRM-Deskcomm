import { fail } from "@/lib/api/wrappers";
import { wahaHabilitado } from "@/lib/env";
import { traduzir } from "@/lib/i18n/dicionario";
import type { Idioma } from "@/lib/i18n/idiomas";

export const WAHA_DESABILITADO = "waha_desabilitado";
export const MENSAGEM_WAHA_DESABILITADO =
  "O WhatsApp por WAHA foi desativado. Use Conectar WhatsApp (FZAP).";

/** 403 estável para as rotas que CRIAM/RECONECTAM sessão WAHA; `null` quando o WAHA está ligado. */
export function bloquearSeWahaDesabilitado(
  requestId: string,
  idioma: Idioma,
  headers?: HeadersInit,
) {
  if (wahaHabilitado()) return null;
  return fail(WAHA_DESABILITADO, traduzir(MENSAGEM_WAHA_DESABILITADO, idioma), 403, {
    requestId,
    headers,
  });
}
