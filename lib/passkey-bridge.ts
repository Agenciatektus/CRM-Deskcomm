/**
 * Ponte pagina <-> extensao "Passkey Bridge" (Chrome), por `window.postMessage`.
 *
 * A extensao roda um content script em todas as paginas e fala com esta por
 * mensagens de `source` fixo. A passkey do WhatsApp so pode ser assinada numa aba
 * de web.whatsapp.com (rpId=whatsapp.com): a pagina entrega o desafio
 * (`requestOptions`), a extensao assina la e devolve a assertion. A extensao
 * NUNCA fala com o servidor do WhatsApp nem com o FZAP; a assertion volta para
 * esta pagina, que a envia ao CRM (`/passkey-nativo`).
 *
 * Protocolo (o mesmo da extensao em producao):
 *   pagina -> ext  { source:"session-bridge-page", id, type:"PING" | "SIGN", publicKey? }
 *   ext -> pagina  { source:"session-bridge-ext", id, type:"PONG", version? }
 *                | { source:"session-bridge-ext", id, type:"SIGN_RESULT", ok, assertion?, error?, cancelled? }
 * So vale a resposta de mesmo `id`, vinda da propria janela (`ev.source === window`).
 */

const PAGE_SOURCE = "session-bridge-page";
const EXT_SOURCE = "session-bridge-ext";

export const PASSKEY_EXTENSAO_URL = "https://chromewebstore.google.com/detail/mhcjhknfjiehdobdojfofjhccahkbhcd";

export interface ResultadoDaAssinatura {
  ok: boolean;
  assertion?: unknown;
  error?: string;
  cancelled?: boolean;
}

let seq = 0;

function pedir<T>(carga: Record<string, unknown>, timeoutMs: number): Promise<T | null> {
  return new Promise((resolve) => {
    const id = `pk-${Date.now()}-${++seq}`;
    let pronto = false;
    const terminar = (v: T | null) => {
      if (pronto) return;
      pronto = true;
      window.removeEventListener("message", ouvir);
      clearTimeout(relogio);
      resolve(v);
    };
    const ouvir = (ev: MessageEvent) => {
      const d = ev.data as { source?: string; id?: string } | null;
      if (ev.source !== window || !d || d.source !== EXT_SOURCE || d.id !== id) return;
      terminar(d as T);
    };
    const relogio = setTimeout(() => terminar(null), timeoutMs);
    window.addEventListener("message", ouvir);
    window.postMessage({ source: PAGE_SOURCE, id, ...carga }, window.location.origin);
  });
}

/** A extensao esta instalada? (responde PING). */
export async function detectarExtensao(timeoutMs = 1500): Promise<boolean> {
  const r = await pedir<{ type?: string }>({ type: "PING" }, timeoutMs);
  return r?.type === "PONG";
}

/** Pede a assinatura do desafio. Prazo longo: a pessoa faz biometria/PIN no aparelho. */
export async function assinarPasskey(publicKey: unknown, timeoutMs = 120_000): Promise<ResultadoDaAssinatura> {
  const r = await pedir<ResultadoDaAssinatura>({ type: "SIGN", publicKey }, timeoutMs);
  if (!r) return { ok: false, error: "sem-resposta" };
  return { ok: !!r.ok, assertion: r.assertion, error: r.error, cancelled: r.cancelled };
}
