"use client";

import { useT } from "@/hooks/i18n/useT";
import type { Message } from "@/lib/types/messaging";
import { cn } from "@/lib/utils";

import { rotuloDaAutoria } from "./autoria";

/**
 * A CITAÇÃO, dentro da bolha e acima do texto — o fio.
 *
 * O `.quote` do quadro DS: bloco tingido (`--tint`, um tom do próprio texto,
 * que funciona sobre qualquer bolha nos dois temas), autor em 12/700 na cor
 * da marca e o trecho em duas linhas (`line-clamp-2`): serve para reconhecer,
 * não para reler, porque a original está logo acima no histórico.
 */
export function CitacaoNaBolha({ citada, viewerUserId }: { citada: Message; viewerUserId?: string | null }) {
  const t = useT();
  const escondida = Boolean(citada.revoked_at || citada.metadata?.crm_hidden_at);
  // O autor como a bolha da citada o escreve (IA, Você, Atendente…); recebida é "Cliente".
  const autor = rotuloDaAutoria(citada, viewerUserId, t);
  return (
    <div className="-ml-1.5 -mr-1.25 -mt-0.5 mb-1.75 block rounded-[11px] bg-tint px-2.5 pb-1.75 pt-1.5 text-label font-normal leading-[1.35]">
      <div className="mb-px text-meta font-bold text-accent-text">
        {autor ? t(autor) : t("Cliente")}
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
      <div className={cn("line-clamp-2 wrap-anywhere text-text-muted", escondida && "italic")} data-trecho>
        {citada.revoked_at
          ? t("Esta mensagem foi apagada")
          : citada.metadata?.crm_hidden_at
            ? t("Mensagem ocultada no CRM")
            : citada.body?.trim() || t("(sem texto)")}
      </div>
    </div>
  );
}
