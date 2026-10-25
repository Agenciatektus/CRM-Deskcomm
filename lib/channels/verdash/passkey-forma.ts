/**
 * Passkey do canal nativo: as DUAS formas que cruzam a fronteira, validadas a mao
 * e reconstruidas campo a campo (nada do que o FZAP ou o navegador mandam passa
 * por inteiro). Forma desconhecida => `null`/`"invalida"`: falha FECHADO
 * (LRN-20261024-004).
 *
 * Formatos (spec FZAP v1.35.2, `/session/status` e `/session/passkey/assert`):
 *   status.passkey = { requestOptions: { challenge, rpId:"whatsapp.com", allowCredentials:[], userVerification } }
 *   assertion      = { id, rawId, type:"public-key", response:{ clientDataJSON, authenticatorData, signature, userHandle } }
 *                    (binarios em base64url sem padding; rawId, clientDataJSON e signature obrigatorios)
 */

export interface PasskeyOpcoes {
  challenge: string;
  rpId: "whatsapp.com";
  allowCredentials: { id: string; type: "public-key"; transports?: string[] }[];
  userVerification: "required" | "preferred" | "discouraged";
  timeout?: number;
}

export interface Assertion {
  id?: string;
  rawId: string;
  type?: "public-key";
  response: { clientDataJSON: string; authenticatorData?: string; signature: string; userHandle?: string | null };
}

/** Teto do corpo cru da assertion (a real tem ~1 KB). */
export const ASSERTION_MAX_BYTES = 8 * 1024;

const B64 = /^[A-Za-z0-9_+/-]+={0,2}$/;
const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const b64 = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max && B64.test(v);
const TRANSPORTS = ["usb", "nfc", "ble", "hybrid", "internal", "smart-card"];

/** Sem desafio => `null`; desafio em forma desconhecida => `"invalida"`. */
export function lerPasskeyDoStatus(bruto: unknown): PasskeyOpcoes | null | "invalida" {
  if (bruto == null) return null;
  if (!ehObjeto(bruto)) return "invalida";
  const ro = bruto.requestOptions;
  if (ro == null) return null;
  if (!ehObjeto(ro)) return "invalida";
  const permitidas = ro.allowCredentials ?? [];
  if (!b64(ro.challenge, 1024) || ro.rpId !== "whatsapp.com" || !Array.isArray(permitidas) || permitidas.length > 20) return "invalida";
  const uv = ro.userVerification ?? "preferred";
  if (uv !== "required" && uv !== "preferred" && uv !== "discouraged") return "invalida";
  const allowCredentials: PasskeyOpcoes["allowCredentials"] = [];
  for (const c of permitidas) {
    if (!ehObjeto(c) || c.type !== "public-key" || !b64(c.id, 1024)) return "invalida";
    const tr = Array.isArray(c.transports) ? c.transports.filter((x): x is string => typeof x === "string" && TRANSPORTS.includes(x)) : undefined;
    allowCredentials.push(tr ? { id: c.id, type: "public-key", transports: tr } : { id: c.id, type: "public-key" });
  }
  const timeout = typeof ro.timeout === "number" && ro.timeout > 0 && ro.timeout <= 600_000 ? ro.timeout : undefined;
  return { challenge: ro.challenge, rpId: "whatsapp.com", allowCredentials, userVerification: uv, ...(timeout ? { timeout } : {}) };
}

/** A assertion reconstruida so com os campos conhecidos, ou `null` se a forma nao bate. */
export function lerAssertion(bruto: unknown): Assertion | null {
  if (!ehObjeto(bruto) || !ehObjeto(bruto.response)) return null;
  const r = bruto.response;
  if (!b64(bruto.rawId, 2048) || !b64(r.clientDataJSON, 4096) || !b64(r.signature, 2048)) return null;
  if (bruto.id != null && !b64(bruto.id, 2048)) return null;
  if (bruto.type != null && bruto.type !== "public-key") return null;
  if (r.authenticatorData != null && !b64(r.authenticatorData, 2048)) return null;
  if (r.userHandle != null && !b64(r.userHandle, 2048)) return null;
  return {
    ...(typeof bruto.id === "string" ? { id: bruto.id } : {}),
    rawId: bruto.rawId,
    type: "public-key",
    response: {
      clientDataJSON: r.clientDataJSON,
      ...(typeof r.authenticatorData === "string" ? { authenticatorData: r.authenticatorData } : {}),
      signature: r.signature,
      userHandle: typeof r.userHandle === "string" ? r.userHandle : null,
    },
  };
}
