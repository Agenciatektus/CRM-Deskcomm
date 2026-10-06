"use client";

import { CitationButton } from "@/components/ai/CitationButton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/hooks/i18n/useT";
import type { Citation } from "@/lib/ai/citations/types";
import type { Message } from "@/lib/types/messaging";
import { Check, Checks, WarningOctagon } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { corDaMeta, type ModoDaMeta, type TomDaBolha } from "./estilo";

function AckIndicator({ status, t }: { status: string; t: (texto: string) => string }) {
  // Lida em `text-info` (token), não num azul fixo: o azul do WhatsApp não
  // existe na paleta do CRM e sumia sobre a bolha suave do accent.
  if (status === "read") return <Checks size={14} weight="bold" className="text-info" aria-label={t("Lida")} />;
  if (status === "delivered") return <Checks size={14} weight="bold" aria-label={t("Entregue")} />;
  if (status === "sent") return <Check size={14} weight="bold" aria-label={t("Enviada")} />;
  return null;
}

interface Props {
  message: Message;
  tom: TomDaBolha;
  modo: ModoDaMeta;
  hora: string;
  editada: boolean;
  falhou: boolean;
  citacoes: Citation[] | null;
}

/**
 * A HORA, os tiques e os selos de estado, DENTRO da bolha.
 *
 * No modo `no-texto` ela flutua no canto de baixo, por cima do espaçador que o
 * corpo deixa no fim do texto (ver `larguraDaMeta`). Sobre imagem ela vira uma
 * pílula escura, legível em cima de qualquer foto. Nos outros casos (áudio,
 * documento, cartão, editor aberto) ela ocupa uma linha curta alinhada à
 * direita, para nunca cobrir um controle.
 */
export function MetaDaBolha({ message, tom, modo, hora, editada, falhou, citacoes }: Props) {
  const t = useT();
  const saida = message.direction === "outbound";
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap text-[0.6875rem] leading-none",
        corDaMeta(tom, modo),
        modo === "no-texto" && "absolute bottom-1.5 right-2.5",
        modo === "sobre-midia" && "absolute bottom-2.5 right-2.5",
        modo === "abaixo" && "mt-1 flex justify-end",
      )}
    >
      {editada && (
        // Ao lado da hora, não no corpo: o texto mostrado JÁ é o novo, e o
        // que falta é avisar que ele mudou. Sem isso, um combinado de preço
        // ou endereço é lido como se sempre tivesse dito aquilo — e a
        // divergência só aparece quando alguém cobra o que não foi.
        <span title={t("O autor editou esta mensagem")}>{t("editada")}</span>
      )}
      <span>{hora}</span>
      {citacoes && <CitationButton citations={citacoes} messageId={message.id} />}
      {saida && !falhou && <AckIndicator status={message.status} t={t} />}
      {falhou && (
        // Provider local: o painel do inbox não tem TooltipProvider ancestral e
        // este Tooltip só monta em mensagem failed — sem o provider, abrir uma
        // conversa com falha de envio derrubava o painel inteiro (error boundary).
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-0.5 font-semibold text-error">
                <WarningOctagon size={11} weight="fill" aria-hidden /> {t("Falhou")}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {message.error_message ? t(message.error_message) : (message.error_code ?? t("Erro desconhecido"))}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
