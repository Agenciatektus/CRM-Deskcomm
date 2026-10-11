"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";

import { clienteDaVitrine, instalarApiDaVitrine } from "./ApiDaVitrine";

let montados = 0;
let desligar: (() => void) | null = null;
let desligarDepois: ReturnType<typeof setTimeout> | null = null;

function ligar() {
  if (desligarDepois) clearTimeout(desligarDepois);
  desligarDepois = null;
  if (!desligar) desligar = instalarApiDaVitrine();
}

/**
 * Tudo que as amostras precisam para rodar sem tocar no servidor: o React Query
 * da vitrine e o desvio do `fetch` (ver `ApiDaVitrine`).
 *
 * O desvio liga JÁ no primeiro render, e não num efeito: efeito de filho roda
 * antes do efeito do pai, e a coluna do lead pede o resumo do contato no efeito
 * dela. Ligar é idempotente, e desligar espera um tique: no modo estrito do
 * React a árvore desmonta e remonta na hora, os efeitos dos filhos rodam de
 * novo ANTES do efeito deste provedor, e um desligar imediato deixava o resumo
 * do contato escapar para a rede (medido no navegador, com o dev server).
 *
 * O clique em link dentro da vitrine não navega: o "Abrir conversa" de uma
 * amostra apontaria para um id que não existe.
 */
export function ProvedorDaVitrine({ children }: { children: ReactNode }) {
  const [cliente] = useState(() => {
    ligar();
    return clienteDaVitrine();
  });

  useEffect(() => {
    montados += 1;
    ligar();
    return () => {
      montados -= 1;
      if (montados > 0) return;
      desligarDepois = setTimeout(() => {
        desligarDepois = null;
        if (montados === 0 && desligar) {
          desligar();
          desligar = null;
        }
      }, 0);
    };
  }, []);

  function naoNavegar(e: MouseEvent<HTMLDivElement>) {
    const alvo = e.target instanceof Element ? e.target.closest("a[href]") : null;
    if (!alvo || alvo.getAttribute("href")?.startsWith("#")) return;
    e.preventDefault();
    e.stopPropagation();
  }

  return (
    <QueryClientProvider client={cliente}>
      <div onClickCapture={naoNavegar}>{children}</div>
    </QueryClientProvider>
  );
}
