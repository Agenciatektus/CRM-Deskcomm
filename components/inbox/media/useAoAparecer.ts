"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

const nadaAssinar = () => () => {};

/**
 * A mídia só pede rede quando chega PERTO da tela (ou quando alguém clica).
 *
 * `preload="metadata"` com `src` já posto fazia cada áudio e vídeo do fio baixar
 * cabeçalho ao montar — numa conversa com dezenas de áudios, dezenas de
 * requisições à rota de mídia antes de a pessoa rolar até eles. Aqui o `src` só
 * entra quando o elemento cruza a tela (com `margem` de folga, para a duração
 * já estar lá quando ele aparecer) ou quando `carregar()` é chamado.
 *
 * Sem `IntersectionObserver` (navegador antigo, jsdom) carrega na hora, que é o
 * comportamento de antes — nunca deixa a mídia sem carregar.
 */
export function useAoAparecer<T extends Element>(margem = "200px") {
  const ref = useRef<T | null>(null);
  const [apareceu, setVisivel] = useState(false);
  // Sem observador o navegador não tem como avisar: carrega na hora. Lido por
  // `useSyncExternalStore` (servidor diz `false`) para não divergir na hidratação.
  const semObservador = useSyncExternalStore(
    nadaAssinar,
    () => typeof IntersectionObserver === "undefined",
    () => false,
  );
  const visivel = apareceu || semObservador;

  useEffect(() => {
    if (visivel) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          setVisivel(true);
          io.disconnect();
        }
      },
      { rootMargin: margem },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visivel, margem]);

  const carregar = useCallback(() => setVisivel(true), []);
  return { ref, visivel, carregar };
}
