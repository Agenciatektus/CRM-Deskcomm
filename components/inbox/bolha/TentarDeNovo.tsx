"use client";

import { useState } from "react";

import { useT } from "@/hooks/i18n/useT";
import { ArrowsClockwise } from "@/lib/ui/icons";

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
    <p className="mt-1 flex items-center justify-end gap-1.5 text-xs text-error-fg" data-testid="tentar-de-novo">
      {t("Não foi enviada.")}
      <button
        type="button"
        onClick={() => {
          setEnviado(true);
          onReenviar();
        }}
        className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
      >
        <ArrowsClockwise size={12} aria-hidden />
        {t("Tentar de novo")}
      </button>
    </p>
  );
}
