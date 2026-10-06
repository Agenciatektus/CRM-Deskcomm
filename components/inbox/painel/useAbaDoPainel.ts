"use client";

import { useCallback, useSyncExternalStore } from "react";

export const ABAS_DO_PAINEL = ["resumo", "negocios", "empresa", "atividade"] as const;
export type AbaDoPainel = (typeof ABAS_DO_PAINEL)[number];

const CHAVE = "inbox.painel.aba";
const PADRAO: AbaDoPainel = "resumo";

const ouvintes = new Set<() => void>();
/**
 * Para quando o storage está bloqueado (aba privada, política do navegador): a
 * troca de aba continua funcionando nesta sessão, só não sobrevive ao F5.
 */
let semStorage: AbaDoPainel = PADRAO;

function valida(v: string | null): AbaDoPainel | null {
  return (ABAS_DO_PAINEL as readonly string[]).includes(v ?? "") ? (v as AbaDoPainel) : null;
}

function ler(): AbaDoPainel {
  try {
    return valida(window.localStorage.getItem(CHAVE)) ?? PADRAO;
  } catch {
    return semStorage;
  }
}

function assinar(avisar: () => void): () => void {
  ouvintes.add(avisar);
  // Outra aba do navegador trocou: as duas ficam iguais, que é o que
  // "lembrada por navegador" promete.
  window.addEventListener("storage", avisar);
  return () => {
    ouvintes.delete(avisar);
    window.removeEventListener("storage", avisar);
  };
}

/**
 * A aba escolhida do painel do lead, lembrada POR NAVEGADOR (não por conta).
 *
 * `useSyncExternalStore` com `getServerSnapshot` fixo em "resumo": o servidor e
 * a primeira pintura da hidratação desenham SEMPRE o Resumo, e só depois o
 * React lê o `localStorage` e troca, se houver algo salvo. É o mesmo cuidado do
 * `Sidebar` com os grupos fechados, sem o `setState` dentro de efeito que o
 * `react-hooks/set-state-in-effect` acusa. Ler o storage no render inicial
 * faria o HTML do servidor divergir do cliente (erro de hidratação).
 */
export function useAbaDoPainel(): [AbaDoPainel, (aba: AbaDoPainel) => void] {
  const aba = useSyncExternalStore(assinar, ler, () => PADRAO);
  const escolher = useCallback((proxima: AbaDoPainel) => {
    try {
      window.localStorage.setItem(CHAVE, proxima);
    } catch {
      semStorage = proxima;
    }
    for (const avisar of ouvintes) avisar();
  }, []);
  return [aba, escolher];
}
