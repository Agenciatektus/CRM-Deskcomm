"use client";

import { useT } from "@/hooks/i18n/useT";

/**
 * A atmosfera do tema escuro, com as classes de VERDADE da pele
 * (`app/globals.css`): o brilho da moldura (`pele-moldura`), o cartão sólido com
 * trama e sombra dura (`pele-cartao` + `pele-ruido`) e o fundo do fio com o
 * brilho e a grade de pontos (`fundo-do-fio` + `trama-do-fio`).
 *
 * A caixa leva `data-theme="dark"`: no painel claro ela é a amostra do escuro
 * que o quadro claro mostra; no escuro, é o próprio tema.
 */
export function Atmosfera() {
  const t = useT();
  return (
    <div data-theme="dark" className="rounded-xl text-text">
      <div className="pele-moldura flex flex-col gap-4 rounded-xl border border-border bg-bg p-4">
        <p className="text-label font-semibold text-text-muted">{t("Tema escuro desenhado, não invertido")}</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <figure className="flex flex-col gap-2">
            <div className="fundo-do-fio h-28 overflow-hidden rounded-lg border border-border">
              <div className="trama-do-fio h-full" />
            </div>
            <figcaption className="text-meta text-text-subtle">
              {t("Fundo do chat: grade de pontos e brilho do primário")}
            </figcaption>
          </figure>
          <figure className="flex flex-col gap-2">
            <div className="pele-cartao pele-ruido h-28 rounded-xl border border-border bg-surface" />
            <figcaption className="text-meta text-text-subtle">{t("Cartão sólido, trama e sombra de 4 px")}</figcaption>
          </figure>
          <figure className="flex flex-col gap-2">
            <div className="h-28 overflow-hidden rounded-lg border border-border">
              <div className="pele-moldura h-full bg-bg" />
            </div>
            <figcaption className="text-meta text-text-subtle">
              {t("Brilho da moldura, no canto superior")}
            </figcaption>
          </figure>
        </div>
      </div>
    </div>
  );
}
