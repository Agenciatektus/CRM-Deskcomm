"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useLayoutEffect, useState, type MouseEvent, type ReactNode } from "react";

import { clienteDaVitrine, instalarApiDaVitrine } from "./ApiDaVitrine";

let montados = 0;
let desligar: (() => void) | null = null;

/**
 * Tudo que as amostras precisam para rodar sem tocar no servidor: o React Query
 * da vitrine e o desvio do `fetch` (ver `ApiDaVitrine`).
 *
 * O desvio liga num `useLayoutEffect`: o efeito de layout do pai roda antes de
 * TODOS os `useEffect` dos filhos (a coluna do lead pede o resumo do contato no
 * efeito dela), e não é render. Ligar no inicializador do `useState`, como na
 * primeira versão, tocava o `fetch` durante o render: um render descartado
 * (concorrente, Suspense, erro antes do commit) instalava o desvio sem efeito
 * nenhum para desfazê-lo, e a cerca `hidratacao-useState-nao-le-o-navegador`
 * reprovava (P1-2 do Cassio na #164). No modo estrito, a remontagem refaz o
 * efeito de layout antes dos efeitos dos filhos, então o desvio volta a tempo.
 *
 * O clique em link dentro da vitrine não navega: o "Abrir conversa" de uma
 * amostra apontaria para um id que não existe.
 */
export function ProvedorDaVitrine({ children }: { children: ReactNode }) {
  const [cliente] = useState(clienteDaVitrine);

  useLayoutEffect(() => {
    montados += 1;
    if (!desligar) desligar = instalarApiDaVitrine();
    return () => {
      montados -= 1;
      if (montados === 0 && desligar) {
        desligar();
        desligar = null;
      }
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
