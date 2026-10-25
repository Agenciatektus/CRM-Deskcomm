/**
 * Passkey do canal nativo: repassa ao FZAP a assertion que a extensao de passkey
 * assinou no WhatsApp Web (`POST /session/passkey/assert`, token da INSTANCIA).
 *
 * O FZAP nunca e exposto ao navegador: o desafio chega por `conexao-nativa` ja
 * filtrado e a assinatura volta por aqui. A assertion e reconstruida campo a campo
 * (`lerAssertion`); nem ela nem o corpo do FZAP entram em log ou erro.
 * Balde proprio: 6 por 60 s por canal (cada tentativa real gasta 1).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { logger } from "@/lib/logger";

import { fzapRequest } from "./client";
import { abrirContexto, ehResposta, type Resposta } from "./conexao-nativa";
import { resumoDoErro, statusNativo } from "./nativo";
import { lerAssertion } from "./passkey-forma";

export const PASSKEY_LIMITE = 6;
export const PASSKEY_JANELA_S = 60;

/** Entrega a assertion ao FZAP, ou `null` se o canal nao e nativo. */
export async function enviarPasskey(
  admin: SupabaseClient,
  org: string,
  canal: string,
  assertionBruta: unknown,
  autorizar: () => Promise<string | null>,
): Promise<Resposta<{ ok: true }> | null> {
  const ctx = await abrirContexto(admin, org, canal, autorizar);
  if (!ctx) return null;
  if (ehResposta(ctx)) return ctx;
  const assertion = lerAssertion(assertionBruta);
  if (!assertion) return { status: 400, estado: "invalid-assertion" };
  const lim = await checkRateLimit(`passkey-nativo:${org}:${canal}`, PASSKEY_LIMITE, PASSKEY_JANELA_S);
  if (!lim.allowed) return { status: 429, estado: "rate-limited", retryAfter: 15 };

  try {
    if ((await statusNativo(ctx.creds)) === "conectado") return { status: 409, estado: "connected" };
    await fzapRequest(ctx.creds, "/session/passkey/assert", { method: "POST", body: assertion });
    return { status: 200, corpo: { ok: true } };
  } catch (e) {
    logger.warn("verdash_nativo_passkey_falhou", { organization_id: org, channel_session_id: canal, motivo: resumoDoErro(e) });
    return { status: 502, estado: "upstream-failed" };
  }
}
