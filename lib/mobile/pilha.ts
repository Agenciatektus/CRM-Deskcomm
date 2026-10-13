"use client";
import { useEffect, useRef } from "react";

/**
 * Quantas telas do APP há atrás da atual nesta aba do navegador. É o que decide se o
 * "voltar" do celular volta pelo histórico ou vai ao começo da aba: `history.length`
 * conta também o que veio ANTES do CRM (o e-mail, o WhatsApp, o Google), e voltar por
 * ele tiraria a pessoa do app.
 *
 * Fica no `sessionStorage` (por aba, some ao fechar). Carga da página zera: quem
 * chega por link começa sem nada atrás. Ir para outra tela soma 1; o voltar do
 * navegador (popstate) tira 1.
 */
const CHAVE = "crm-telas-do-app-atras";

export function telasAtras(): number {
  try {
    return Number(window.sessionStorage.getItem(CHAVE) ?? "0") || 0;
  } catch {
    return 0;
  }
}

function gravar(n: number) {
  try {
    window.sessionStorage.setItem(CHAVE, String(Math.max(0, n)));
  } catch {
    // Armazenamento bloqueado: o voltar cai no começo da aba, que é o seguro.
  }
}

/** Montado uma vez, na casca do app. Acompanha cada troca de rota. */
export function usePilhaDoApp(rota: string): void {
  const primeira = useRef(true);
  const voltou = useRef(false);
  const ultimaRota = useRef(rota);

  useEffect(() => {
    // Só conta o voltar que TROCA de tela. O da ficha do lead (e o do `?id=` da
    // Inbox) volta para a MESMA rota: não houve tela a mais na ida, então não há
    // tela a menos na volta (P2-2 do Cassio na #181, a pilha derivava -1).
    const aoVoltar = () => {
      if (window.location.pathname !== ultimaRota.current) voltou.current = true;
    };
    window.addEventListener("popstate", aoVoltar);
    return () => window.removeEventListener("popstate", aoVoltar);
  }, []);

  useEffect(() => {
    ultimaRota.current = rota;
    if (primeira.current) {
      primeira.current = false;
      gravar(0);
      return;
    }
    gravar(telasAtras() + (voltou.current ? -1 : 1));
    voltou.current = false;
  }, [rota]);
}
