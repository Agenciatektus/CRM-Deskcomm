"use client";
import { useCallback, useState, useSyncExternalStore } from "react";

import { CHAVE_DAS_LARGURAS, LARGURAS_PADRAO, lerLarguras, type Coluna, type Larguras } from "./larguras";

/*
 * O localStorage como loja externa, e não lido num `useState(() => …)`: o
 * servidor não tem navegador, e o primeiro render do cliente precisa bater com
 * o do servidor (a cerca `hidratacao-useState-nao-le-o-navegador` reprova a
 * leitura no inicializador). Com `useSyncExternalStore`, o servidor e a
 * hidratação usam o padrão e o valor salvo entra logo depois, sem aviso de
 * hidratação. Toda leitura e escrita vai em try/catch: aba privada, cota cheia
 * ou armazenamento bloqueado não podem derrubar a Inbox.
 */
const ouvintes = new Set<() => void>();

function lerBruto(): string | null {
  try {
    return window.localStorage.getItem(CHAVE_DAS_LARGURAS);
  } catch (erroDoArmazenamento) {
    void erroDoArmazenamento;
    return null;
  }
}

function assinar(aviso: () => void): () => void {
  ouvintes.add(aviso);
  window.addEventListener("storage", aviso);
  return () => {
    ouvintes.delete(aviso);
    window.removeEventListener("storage", aviso);
  };
}

function gravar(larguras: Larguras): void {
  try {
    window.localStorage.setItem(CHAVE_DAS_LARGURAS, JSON.stringify(larguras));
  } catch (erroDoArmazenamento) {
    // Sem armazenamento a largura vale até recarregar; não há o que avisar.
    void erroDoArmazenamento;
  }
  for (const aviso of ouvintes) aviso();
}

/**
 * As larguras da lista e do painel: o que está salvo, mais o arrasto em curso
 * (que só grava ao soltar, para não escrever no disco a cada pixel).
 */
export function useLargurasDasColunas() {
  const salvo = useSyncExternalStore(assinar, lerBruto, () => null);
  const [arrasto, setArrasto] = useState<Partial<Larguras> | null>(null);
  const base = lerLarguras(salvo);
  const larguras: Larguras = { ...base, ...arrasto };

  const mover = useCallback((coluna: Coluna, valor: number) => {
    setArrasto((atual) => ({ ...atual, [coluna]: valor }));
  }, []);

  const confirmar = useCallback(
    (coluna: Coluna, valor: number) => {
      setArrasto(null);
      gravar({ ...lerLarguras(lerBruto()), [coluna]: valor });
    },
    [],
  );

  const restaurar = useCallback((coluna: Coluna) => {
    setArrasto(null);
    gravar({ ...lerLarguras(lerBruto()), [coluna]: LARGURAS_PADRAO[coluna] });
  }, []);

  return { larguras, mover, confirmar, restaurar };
}
