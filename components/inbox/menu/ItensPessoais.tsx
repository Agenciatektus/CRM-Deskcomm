"use client";

import { useState } from "react";

import {
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/hooks/i18n/useT";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";
import { useEstadoDaConversa } from "@/hooks/inbox/useEstadoDaConversa";
import { estaSilenciada, type DuracaoDeSilencio } from "@/lib/inbox/estado-por-atendente";
import { Bell, BellSlash, EnvelopeOpen, EnvelopeSimple, Prohibit, PushPin, PushPinSlash } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { CLASSE_DO_ITEM, CLASSE_DO_SUBMENU } from "./estilo";

/** As opções do silêncio, na ordem da tela. */
export const OPCOES_DE_SILENCIO: Array<{ duracao: DuracaoDeSilencio; rotulo: string }> = [
  { duracao: "8h", rotulo: "Por 8 horas" },
  { duracao: "1w", rotulo: "Por 1 semana" },
  { duracao: "sempre", rotulo: "Sempre" },
];

interface Props {
  conversation: ConversationWithContact;
  /** Fixar, silenciar e marcar: qualquer papel, menos suporte somente leitura. */
  podePreferir: boolean;
  /** Bloquear o contato: agent+ e fora do suporte somente leitura. */
  podeBloquear: boolean;
  /** Abre a confirmação (que sobrevive ao menu fechar). */
  onBloquear: (contato: { contactId: string; nome: string }) => void;
  nome: string;
}

/**
 * Os itens POR ATENDENTE do menu da conversa (migration 9042): fixar, silenciar
 * e marcar como não lida valem só para quem clica, como no WhatsApp. Bloquear o
 * contato vale para a empresa inteira, e por isso pede confirmação.
 *
 * `mutate` sem `onSuccess` por chamada: o menu desmonta ao escolher, e quem
 * corrige a linha e refaz a lista é o próprio hook.
 */
export function ItensPessoais({ conversation, podePreferir, podeBloquear, onBloquear, nome }: Props) {
  const t = useT();
  // Com `t`: cada ação confirma num toast com "Desfazer" quando há inverso.
  const estado = useEstadoDaConversa(t);
  // O menu remonta a cada abertura: "agora" é o instante em que ele abriu.
  const [agora] = useState(() => Date.now());
  const id = conversation.id;
  const c = conversation.contacts ?? null;
  const silenciada = estaSilenciada(conversation.muted_until, agora);
  const podeBloquearEste = podeBloquear && !!c?.id && !c.is_blocked;
  if (!podePreferir && !podeBloquearEste) return null;

  const fazer = (acao: Parameters<typeof estado.mutate>[0]["acao"]) => estado.mutate({ conversationId: id, acao });

  return (
    <>
      <DropdownMenuSeparator />
      {podePreferir && (
        <>
          <DropdownMenuItem
            className={CLASSE_DO_ITEM}
            disabled={estado.isPending}
            onSelect={() => fazer({ tipo: conversation.pinned ? "desafixar" : "fixar" })}
          >
            {conversation.pinned ? <PushPinSlash size={16} aria-hidden /> : <PushPin size={16} aria-hidden />}
            {conversation.pinned ? t("Desafixar") : t("Fixar")}
          </DropdownMenuItem>
          {silenciada ? (
            <DropdownMenuItem className={CLASSE_DO_ITEM} onSelect={() => fazer({ tipo: "reativar_som" })}>
              <Bell size={16} aria-hidden /> {t("Reativar som")}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className={CLASSE_DO_ITEM}>
                <BellSlash size={16} aria-hidden />
                <span className="grow">{t("Silenciar")}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent
                  className={CLASSE_DO_SUBMENU}
                  collisionPadding={8}
                  aria-labelledby={undefined}
                  aria-label={t("Silenciar")}
                >
                  {OPCOES_DE_SILENCIO.map((o) => (
                    <DropdownMenuItem
                      key={o.duracao}
                      className={CLASSE_DO_ITEM}
                      onSelect={() => fazer({ tipo: "silenciar", duracao: o.duracao })}
                    >
                      {t(o.rotulo)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
          )}
          {/* E10: alterna. A marcada como não lida oferece "Marcar como lida". */}
          {conversation.marked_unread ? (
            <DropdownMenuItem className={CLASSE_DO_ITEM} onSelect={() => fazer({ tipo: "desmarcar_nao_lida" })}>
              <EnvelopeOpen size={16} aria-hidden /> {t("Marcar como lida")}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem className={CLASSE_DO_ITEM} onSelect={() => fazer({ tipo: "marcar_nao_lida" })}>
              <EnvelopeSimple size={16} aria-hidden /> {t("Marcar como não lida")}
            </DropdownMenuItem>
          )}
        </>
      )}
      {podeBloquearEste && c?.id && (
        <DropdownMenuItem
          className={cn(CLASSE_DO_ITEM, "text-destructive focus:text-destructive [&>svg]:text-destructive")}
          onSelect={() => onBloquear({ contactId: c.id, nome })}
        >
          <Prohibit size={16} aria-hidden /> {t("Bloquear contato")}
        </DropdownMenuItem>
      )}
    </>
  );
}
