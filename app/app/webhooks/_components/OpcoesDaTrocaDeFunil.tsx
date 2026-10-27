"use client";

import * as React from "react";

import { useT } from "@/hooks/i18n/useT";

export type ModoDaTroca = "mover" | "criar";

export interface OpcoesDaTroca {
  modo?: ModoDaTroca;
  rodar_automacoes_de_entrada?: boolean;
}

/**
 * "Mover o card" ou "Criar card novo", e "Rodar as automações de entrada da
 * etapa" (só faz sentido ao mover). Controles nativos (radio e checkbox).
 *
 * `modoSemValor` é o comportamento da regra salva antes da opção existir: cada
 * ação mostra o que ela de fato faz quando `modo` falta (ver `OPCOES_DA_TROCA`
 * em `lib/schemas/webhooks.ts`).
 */
export function OpcoesDaTrocaDeFunil({
  config,
  modoSemValor,
  onChange,
}: {
  config: OpcoesDaTroca;
  modoSemValor: ModoDaTroca;
  onChange: (opcoes: OpcoesDaTroca) => void;
}) {
  const t = useT();
  const nome = React.useId();
  const idRodar = React.useId();
  const modo = config.modo ?? modoSemValor;

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{t("Se o card estiver em outro funil")}</legend>
      {(
        [
          ["mover", t("Mover o card"), t("O mesmo card vai para o funil escolhido, com conversa e histórico.")],
          ["criar", t("Criar card novo"), t("O card continua onde está e nasce outro no funil escolhido.")],
        ] as const
      ).map(([valor, rotulo, ajuda]) => (
        <label key={valor} className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name={nome}
            value={valor}
            checked={modo === valor}
            onChange={() =>
              onChange({ ...config, modo: valor, rodar_automacoes_de_entrada: valor === "mover" && config.rodar_automacoes_de_entrada === true })
            }
            className="mt-1 accent-primary"
          />
          <span>
            {rotulo}
            <span className="block text-xs text-muted-foreground">{ajuda}</span>
          </span>
        </label>
      ))}
      {modo === "mover" && (
        <label htmlFor={idRodar} className="flex items-start gap-2 text-sm">
          <input
            id={idRodar}
            type="checkbox"
            checked={config.rodar_automacoes_de_entrada === true}
            onChange={(e) => onChange({ ...config, rodar_automacoes_de_entrada: e.target.checked })}
            className="mt-1"
          />
          <span>
            {t("Rodar as automações de entrada da etapa")}
            <span className="block text-xs text-muted-foreground">
              {t("As automações da etapa de destino rodam como se o card tivesse acabado de entrar. Conversões de anúncio não são enviadas.")}
            </span>
          </span>
        </label>
      )}
    </fieldset>
  );
}
