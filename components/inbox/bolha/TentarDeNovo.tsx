"use client";

import { useState } from "react";

import { useT } from "@/hooks/i18n/useT";

/**
 * "Não foi enviada. Tentar de novo" (B15, o texto do protótipo), embaixo da
 * bolha de saída que falhou. Some depois do clique: o reenvio vira uma bolha
 * nova no fim do fio, e a que falhou fica como histórico, com o selo "Falhou".
 * Quem decide se o botão aparece é o fio (`useReenvioDoFio`); quem recusa o
 * repetido é o servidor.
 */
export function TentarDeNovo({ onReenviar }: { onReenviar: () => void }) {
  const t = useT();
  const [enviado, setEnviado] = useState(false);
  if (enviado) return null;
  return (
    <p className="mx-2 mt-1.25 flex items-center gap-2 text-meta font-semibold text-error-fg" data-testid="tentar-de-novo">
      {t("Não foi enviada.")}
      <button
        type="button"
        onClick={() => {
          setEnviado(true);
          onReenviar();
        }}
        className="inline-flex items-center gap-1 rounded-sm font-bold text-accent-text underline-offset-3 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {t("Tentar de novo")}
      </button>
    </p>
  );
}
