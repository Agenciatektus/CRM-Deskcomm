"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef } from "react";

import { AvatarDoContato } from "@/components/inbox/AvatarDoContato";
import { CRMSidePanel } from "@/components/inbox/CRMSidePanel";
import { initials, siglaDoTelefone } from "@/components/inbox/item/tempo-da-linha";
import { usePodeLigar } from "@/components/voice/DialButton";
import { useT } from "@/hooks/i18n/useT";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import { pedir } from "@/lib/ui/comandos-da-tela";
import { CaretLeft, ChatCircle, ListChecks } from "@/lib/ui/icons";

import { LigarComConfirmacao } from "./ConversaAberta";

/**
 * A ficha é uma tela EMPILHADA: abrir põe uma entrada no histórico, e o voltar do
 * aparelho (botão do Android, gesto do iOS) fecha a ficha em vez de sair da conversa.
 * Fechar pelo ‹ ou pelo Esc tira a entrada que a ficha pôs.
 */
function useVoltarFechaAFicha(aberta: boolean, aoMudar: (aberta: boolean) => void) {
  const empilhada = useRef(false);
  const aoMudarAtual = useRef(aoMudar);
  useEffect(() => {
    aoMudarAtual.current = aoMudar;
  });
  useEffect(() => {
    if (!aberta) {
      if (empilhada.current) {
        empilhada.current = false;
        window.history.back();
      }
      return;
    }
    window.history.pushState({ ...(window.history.state ?? {}), fichaDoLead: true }, "");
    empilhada.current = true;
    const aoVoltar = () => {
      empilhada.current = false;
      aoMudarAtual.current(false);
    };
    window.addEventListener("popstate", aoVoltar);
    return () => window.removeEventListener("popstate", aoVoltar);
  }, [aberta]);
}

/**
 * A ficha do lead em TELA CHEIA no celular (o item 03 do protótipo), no lugar da
 * gaveta de 90vw. Voltar (o ‹ e o Esc), o topo com avatar de 84px, nome, telefone e
 * quem atende, as ações rápidas (Conversa, Ligar, Tarefa) e, abaixo, o MESMO painel
 * do lead do desktop (`CRMSidePanel`): Próximo passo, barra de etapas e as abas
 * Resumo, Negócios, Empresa e Atividade, com as mesmas regras de escrita.
 *
 * Alvos de 44px: todo botão e aba dentro da ficha ganha `min-height: 44px` no
 * celular (`[&_button]`, `[&_[role=tab]]`), sem mexer no painel do desktop.
 */
export function FichaDoLeadNoCelular({
  aberta,
  aoMudar,
  conversation,
}: {
  aberta: boolean;
  aoMudar: (aberta: boolean) => void;
  conversation: ConversationWithContact;
}) {
  const t = useT();
  useVoltarFechaAFicha(aberta, aoMudar);
  const c = conversation.contacts ?? null;
  const nome = rotuloDoContato(c, t);
  // Ligar só com as condições do botão de chamada, e nunca em grupo.
  const podeLigar = usePodeLigar(!!c?.phone_number) && !conversation.is_group;

  return (
    <Dialog.Root open={aberta} onOpenChange={aoMudar}>
      <Dialog.Portal>
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col bg-background pt-(--mb-area-topo) pb-(--mb-area-baixo) outline-hidden data-[state=open]:animate-slide-in motion-reduce:animate-none"
        >
          <div className="flex min-h-(--mb-barra-altura) shrink-0 items-center gap-1 px-1">
            <Dialog.Close
              aria-label={t("Voltar")}
              className="pele-foco grid size-(--mb-alvo) place-items-center rounded-full text-accent-text hover:bg-hover"
            >
              <CaretLeft size={22} weight="bold" aria-hidden />
            </Dialog.Close>
            <Dialog.Title className="sr-only">{`${t("Ficha de")} ${nome}`}</Dialog.Title>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="flex flex-col items-center gap-1 px-4 pb-3.5 pt-2 text-center">
              <AvatarDoContato
                contato={c}
                nome={nome}
                iniciais={initials(nome, siglaDoTelefone(c?.phone_number))}
                className="size-[84px] text-[28px]"
              />
              <h2 className="mt-2 text-[23px] leading-tight font-bold text-text">{nome}</h2>
              {c?.phone_number && <span className="font-mono text-[14.5px] text-text-muted">{c.phone_number}</span>}
            </div>
            <div className={podeLigar ? "grid grid-cols-3 gap-2 px-4 pb-3" : "grid grid-cols-2 gap-2 px-4 pb-3"}>
              <button
                type="button"
                onClick={() => aoMudar(false)}
                className="pele-foco flex min-h-16 flex-col items-center justify-center gap-1 rounded-[14px] bg-surface text-[13px] font-bold text-accent-text shadow-[0_0_0_1px_var(--color-border)]"
              >
                <ChatCircle size={22} aria-hidden />
                {t("Conversa")}
              </button>
              {podeLigar && c?.id && (
                <div className="flex min-h-16 items-center justify-center rounded-[14px] bg-surface shadow-[0_0_0_1px_var(--color-border)]">
                  <LigarComConfirmacao contactId={c.id} hasPhone={!!c.phone_number} nome={nome} />
                </div>
              )}
              <button
                type="button"
                // A tarefa nasce no "Próximo passo" do painel abaixo: o atalho rola até lá.
                onClick={() => pedir("painel-proximo-passo")}
                className="pele-foco flex min-h-16 flex-col items-center justify-center gap-1 rounded-[14px] bg-surface text-[13px] font-bold text-accent-text shadow-[0_0_0_1px_var(--color-border)]"
              >
                <ListChecks size={22} aria-hidden />
                {t("Tarefa")}
              </button>
            </div>
            <div className="[&_[role=tab]]:min-h-11 [&_button]:min-h-11">
              <CRMSidePanel conversation={conversation} />
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
