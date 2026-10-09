"use client";

import { useT } from "@/hooks/i18n/useT";
import type { Message } from "@/lib/types/messaging";
import { cn } from "@/lib/utils";

import { TEXTO_ACCENT } from "./estilo";

/**
 * A CITAÇÃO, dentro da bolha e acima do texto — o fio.
 *
 * Mostra de quem era e um trecho. `line-clamp-2` porque serve para reconhecer,
 * não para reler: a original está logo acima no histórico. O fundo é um tom
 * do próprio texto (`bg-text/5`), então funciona sobre qualquer cor de bolha,
 * nos dois temas, sem uma regra por autor.
 */
export function CitacaoNaBolha({ citada }: { citada: Message }) {
  const t = useT();
  const escondida = Boolean(citada.revoked_at || citada.metadata?.crm_hidden_at);
  return (
    <div className="-mx-1.5 mb-1.5 mt-0.5 rounded-xl border-l-2 border-accent bg-text/5 px-2.5 py-1.5 text-xs leading-snug">
      <div className={cn("font-semibold", TEXTO_ACCENT)}>
        {citada.direction === "outbound" ? t("Você") : t("Cliente")}
      </div>
      {/*
        A CITADA PODE TER SIDO APAGADA — e aí o texto dela não volta aqui.

        A bolha principal já trata isto ("mostrá-lo seria expor justamente o que
        o cliente pediu para tirar do ar"). A citação é o mesmo texto, num
        segundo lugar da tela — sem esta guarda, o "apagar para todos" do
        cliente sumia da bolha original e continuava legível dentro de cada
        resposta que a citou. O fio permanece (a citação some, não a resposta);
        o conteúdo, não.
      */}
      <div className={cn("line-clamp-2 wrap-anywhere text-text-muted", escondida && "italic")}>
        {citada.revoked_at
          ? t("Esta mensagem foi apagada")
          : citada.metadata?.crm_hidden_at
            ? t("Mensagem ocultada no CRM")
            : citada.body?.trim() || t("(sem texto)")}
      </div>
    </div>
  );
}
