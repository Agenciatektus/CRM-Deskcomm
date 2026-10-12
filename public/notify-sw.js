/*
 * O service worker do app: bandeja + Web Push (desde sempre) e, desde a M1.2 do app de
 * celular, a tela "sem conexão" do app instalado.
 *
 * O nome do arquivo NÃO muda: a assinatura de push fica presa ao registro deste
 * script, e trocar o arquivo derrubaria as notificações de quem já as ativou.
 *
 * SEM CACHE. Nenhuma resposta é guardada (nem página, nem API, nem dado de cliente):
 * a tela "sem conexão" é montada aqui mesmo, do zero, só quando a NAVEGAÇÃO falha
 * por rede. Pedido que não é navegação (API, imagem, script) nem passa por aqui.
 */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

const TEXTOS_SEM_CONEXAO = {
  pt: { titulo: "Sem conexão", texto: "Não foi possível abrir esta página. Confira a internet do aparelho e tente de novo.", botao: "Tentar de novo", lang: "pt-BR" },
  es: { titulo: "Sin conexión", texto: "No fue posible abrir esta página. Revisa la conexión del dispositivo e inténtalo de nuevo.", botao: "Intentar de nuevo", lang: "es" },
  en: { titulo: "No connection", texto: "This page could not be opened. Check the device's internet connection and try again.", botao: "Try again", lang: "en" },
};

function paginaSemConexao(idioma) {
  const chave = String(idioma || "").slice(0, 2).toLowerCase();
  const t = TEXTOS_SEM_CONEXAO[chave] || TEXTOS_SEM_CONEXAO.pt;
  return `<!doctype html><html lang="${t.lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${t.titulo}</title><style>
:root{color-scheme:light dark;--bg:#eef1f5;--fg:#1d2430;--muted:#4f5866;--btn:#1d2430;--btn-fg:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#0d0e11;--fg:#f8f8f8;--muted:#c9ccd1;--btn:#f8f8f8;--btn-fg:#0d0e11}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font:16px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:24px max(24px,env(safe-area-inset-right)) max(24px,env(safe-area-inset-bottom)) max(24px,env(safe-area-inset-left));box-sizing:border-box}
main{max-width:340px;text-align:center}h1{font-size:22px;margin:0 0 8px}p{margin:0 0 20px;color:var(--muted)}
button{min-height:44px;padding:0 20px;border:0;border-radius:12px;background:var(--btn);color:var(--btn-fg);font:inherit;font-weight:700;cursor:pointer}
</style></head><body><main><h1>${t.titulo}</h1><p>${t.texto}</p>
<button type="button" onclick="location.reload()">${t.botao}</button></main></body></html>`;
}

self.addEventListener("fetch", (event) => {
  const pedido = event.request;
  if (pedido.mode !== "navigate" || pedido.method !== "GET") return;
  event.respondWith(
    fetch(pedido).catch(
      () =>
        new Response(paginaSemConexao(self.navigator && self.navigator.language), {
          status: 503,
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
        }),
    ),
  );
});

self.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "show-os-notify") return;
  const title = event.data.title || "";
  const opts = event.data.opts || {};
  event.waitUntil(self.registration.showNotification(title, opts));
});

/* Clique na bandeja foca a janela e abre a conversa. */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || "";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientes) => {
      const origem = self.location.origin;
      const url = href ? new URL(href, origem).href : origem + "/app/inbox";
      const alvo = clientes.find((c) => "focus" in c);
      if (alvo) {
        return alvo.focus().then(() => {
          if ("navigate" in alvo) return alvo.navigate(url);
          alvo.postMessage({ type: "notify-open", href: url });
        });
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    }),
  );
});

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      const clientes = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const visiveis = clientes.filter((c) => c.visibilityState === "visible").length;
      if (visiveis > 0) return;
      let data = { title: "Nova mensagem", body: "", tag: "msg", href: "/app/inbox", icon: "" };
      try {
        if (event.data) data = { ...data, ...event.data.json() };
      } catch {
        // payload não-JSON
      }
      await self.registration.showNotification(data.title, {
        body: data.body,
        tag: data.tag,
        icon: data.icon || undefined,
        badge: self.location.origin + "/icon",
        renotify: true,
        data: { href: data.href || "/app/inbox" },
      });
    })(),
  );
});
