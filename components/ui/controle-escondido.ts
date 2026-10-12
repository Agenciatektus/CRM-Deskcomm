"use client";

import * as React from "react";

/**
 * O que o controle ESCONDIDO do `Escolha` e do `CampoDeData` precisa devolver
 * ao gatilho que a pessoa vê (P2 do Cassio na #170):
 *
 * - `invalid`: o navegador barra o envio pelo controle escondido (1 px,
 *   `aria-hidden`), e o balão dele apareceria num lugar que ninguém vê. O
 *   evento é interceptado: o balão não sai, o gatilho ganha `aria-invalid`, a
 *   mensagem aparece embaixo dele (`role="alert"`, ligada por
 *   `aria-describedby`) e o foco vai para o PRIMEIRO campo inválido, como no
 *   nativo.
 * - `reset`: `form.reset()` devolve o controle escondido ao padrão, mas não o
 *   estado React; o `aoResetar` sincroniza o visível depois do reset.
 */
let focoReservado = false;

export function useControleEscondido<T extends HTMLSelectElement | HTMLInputElement>({
  gatilho,
  aoResetar,
}: {
  gatilho: React.RefObject<HTMLElement | null>;
  aoResetar: () => void;
}) {
  const ref = React.useRef<T>(null);
  const [invalido, setInvalido] = React.useState(false);
  const resetar = React.useRef(aoResetar);
  React.useEffect(() => {
    resetar.current = aoResetar;
  });

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const form = el.form;
    const aoInvalidar = (evento: Event) => {
      evento.preventDefault();
      setInvalido(true);
      // Vários campos inválidos disparam juntos, na ordem do documento: só o
      // primeiro leva o foco.
      if (!focoReservado) {
        focoReservado = true;
        queueMicrotask(() => {
          focoReservado = false;
        });
        gatilho.current?.focus();
      }
    };
    const aoReset = () => {
      setInvalido(false);
      // O navegador só restaura os valores DEPOIS de disparar o evento.
      setTimeout(() => resetar.current(), 0);
    };
    el.addEventListener("invalid", aoInvalidar);
    form?.addEventListener("reset", aoReset);
    return () => {
      el.removeEventListener("invalid", aoInvalidar);
      form?.removeEventListener("reset", aoReset);
    };
  }, [gatilho]);

  return { ref, invalido, limparInvalido: () => setInvalido(false) };
}

/** Junta ids de `aria-describedby` sem repetir nem deixar espaço sobrando. */
export function juntarDescricao(...ids: (string | undefined | false)[]): string | undefined {
  const lista = ids.filter((i): i is string => !!i).join(" ").trim();
  return lista || undefined;
}
