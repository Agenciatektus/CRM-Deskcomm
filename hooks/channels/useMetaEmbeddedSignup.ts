"use client";
/**
 * "Conectar com a Meta" (Embedded Signup): abre o popup da Meta e devolve o que ele entrega.
 *
 * O popup entrega duas coisas por caminhos diferentes: o `code` no callback do `FB.login`, e
 * `waba_id` + `phone_number_id` por `postMessage` da janela da Meta. Só mensagens vindas de
 * facebook.com, no formato `WA_EMBEDDED_SIGNUP` com ids só de dígitos, são aceitas; o resto
 * é ignorado. A troca do code por token acontece no SERVIDOR, que nunca confia no navegador
 * para decidir a organização.
 *
 * O SDK é carregado sob demanda, no clique, não no carregamento da tela.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { graphVersion } from "@/lib/graph-version";

interface FbLoginResponse {
  status?: string;
  authResponse?: { code?: string } | null;
}
interface FbSdk {
  init: (p: { appId: string; version: string; cookie?: boolean; xfbml?: boolean }) => void;
  login: (
    cb: (r: FbLoginResponse) => void,
    p: {
      config_id: string;
      response_type: "code";
      override_default_response_type: true;
      extras: { setup: Record<string, never>; sessionInfoVersion: "3"; featureType?: string };
    },
  ) => void;
}
declare global {
  interface Window {
    FB?: FbSdk;
    fbAsyncInit?: () => void;
  }
}

/** Origens que a Meta usa no `postMessage` do Embedded Signup. */
export const ORIGENS_DA_META: readonly string[] = ["https://www.facebook.com", "https://web.facebook.com"];
/** `featureType` que abre o fluxo Coexistence ("conectar o app WhatsApp Business existente"). */
const FEATURE_COEXISTENCE = "whatsapp_business_app_onboarding";
const SDK_SRC = "https://connect.facebook.net/pt_BR/sdk.js";
const SDK_ID = "facebook-jssdk";

export interface DadosDoPopup {
  wabaId: string;
  phoneNumberId: string;
}

/** Lê o `postMessage`. Devolve os ids só se a origem e o formato forem os esperados. */
export function lerMensagemDaMeta(event: { origin: string; data: unknown }): DadosDoPopup | null {
  if (!ORIGENS_DA_META.includes(event.origin)) return null;
  let data = event.data;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (typeof data !== "object" || data === null) return null;
  const msg = data as { type?: unknown; data?: { waba_id?: unknown; phone_number_id?: unknown } };
  if (msg.type !== "WA_EMBEDDED_SIGNUP") return null;
  const waba = msg.data?.waba_id;
  const fone = msg.data?.phone_number_id;
  if (typeof waba !== "string" || typeof fone !== "string" || !/^\d{5,25}$/.test(waba) || !/^\d{5,25}$/.test(fone)) {
    return null;
  }
  return { wabaId: waba, phoneNumberId: fone };
}

function carregarSdk(appId: string): Promise<FbSdk> {
  return new Promise((resolve, reject) => {
    if (window.FB) return resolve(window.FB);
    window.fbAsyncInit = () => {
      if (!window.FB) return reject(new Error("sdk"));
      window.FB.init({ appId, version: graphVersion(), cookie: true, xfbml: false });
      resolve(window.FB);
    };
    if (document.getElementById(SDK_ID)) return;
    const s = document.createElement("script");
    s.id = SDK_ID;
    s.src = SDK_SRC;
    s.async = true;
    s.crossOrigin = "anonymous";
    s.onerror = () => reject(new Error("sdk"));
    document.body.appendChild(s);
  });
}

export type ResultadoDoPopup =
  | { ok: true; code: string; wabaId: string; phoneNumberId: string }
  | { ok: false; motivo: "sdk" | "cancelado" | "sem_dados" };

export function useMetaEmbeddedSignup(config: { appId: string; configId: string; configIdCoexistencia: string }) {
  const [abrindo, setAbrindo] = useState(false);
  const dados = useRef<DadosDoPopup | null>(null);

  useEffect(() => {
    const ouvir = (e: MessageEvent) => {
      const lido = lerMensagemDaMeta(e);
      if (lido) dados.current = lido;
    };
    window.addEventListener("message", ouvir);
    return () => window.removeEventListener("message", ouvir);
  }, []);

  const abrir = useCallback(
    async (coexistencia: boolean): Promise<ResultadoDoPopup> => {
      setAbrindo(true);
      dados.current = null;
      try {
        let fb: FbSdk;
        try {
          fb = await carregarSdk(config.appId);
        } catch {
          return { ok: false, motivo: "sdk" };
        }
        const resposta = await new Promise<FbLoginResponse>((resolve) =>
          fb.login(resolve, {
            config_id: coexistencia ? config.configIdCoexistencia : config.configId,
            response_type: "code",
            override_default_response_type: true,
            extras: {
              setup: {},
              sessionInfoVersion: "3",
              ...(coexistencia ? { featureType: FEATURE_COEXISTENCE } : {}),
            },
          }),
        );
        const code = resposta.status === "connected" ? resposta.authResponse?.code : undefined;
        if (!code) return { ok: false, motivo: "cancelado" };
        // A Meta pode entregar o `postMessage` um instante depois do callback.
        for (let i = 0; i < 10 && !dados.current; i++) await new Promise((r) => setTimeout(r, 200));
        if (!dados.current) return { ok: false, motivo: "sem_dados" };
        const { wabaId, phoneNumberId } = dados.current;
        dados.current = null;
        return { ok: true, code, wabaId, phoneNumberId };
      } finally {
        setAbrindo(false);
      }
    },
    [config.appId, config.configId, config.configIdCoexistencia],
  );

  return { abrindo, abrir };
}
