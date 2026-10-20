import { areAlertsEnabled, getPermission } from "./permission";
import { ensureNotifyServiceWorker } from "./service_worker";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function mesmosBytes(a: ArrayBuffer, b: Uint8Array): boolean {
  if (a.byteLength !== b.length) return false;
  const x = new Uint8Array(a);
  return x.every((v, i) => v === b[i]);
}

/** Liga a inscrição Web Push depois da permissão. Sem VAPID no servidor, no-op. */
export async function syncPushSubscription(): Promise<void> {
  if (typeof window === "undefined") return;
  if (getPermission() !== "granted" || !areAlertsEnabled()) return;
  const reg = await ensureNotifyServiceWorker();
  if (!reg?.pushManager) return;

  const cfg = await fetch("/api/v1/notifications/push").then((r) => r.json()).catch(() => null);
  const publicKey = cfg?.data?.public_key as string | undefined;
  if (!cfg?.data?.enabled || !publicKey) return;

  const chave = urlBase64ToUint8Array(publicKey);
  let sub = await reg.pushManager.getSubscription();
  // Inscrição feita com OUTRA chave (o par do servidor mudou, por exemplo num
  // backup restaurado sem o .env) nunca mais recebe nada, e o navegador não
  // avisa: refaz com a chave atual. O PUT abaixo grava a nova. Navegador que
  // não informa a chave da inscrição fica como está: refazer a cada abertura
  // criaria uma inscrição nova toda vez.
  const chaveDaInscricao = sub?.options.applicationServerKey;
  if (sub && chaveDaInscricao && !mesmosBytes(chaveDaInscricao, chave)) {
    await sub.unsubscribe();
    sub = null;
  }
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: chave as BufferSource,
    });
  }

  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;

  await fetch("/api/v1/notifications/push", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    }),
  });
}
