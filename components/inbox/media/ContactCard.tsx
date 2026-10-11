"use client";



import { useRouter } from "next/navigation";

import { useState } from "react";

import { toast } from "sonner";

import { useT } from "@/hooks/i18n/useT";

import { UserCircle } from "@/lib/ui/icons";

import { resolveSharedContact } from "@/lib/messaging/contact-card";
import { phoneForDisplay } from "@/lib/channels/phone-variants";

import type { Message } from "@/lib/types/messaging";




interface Props {

  message: Message;

}



/** Cartão de contato compartilhado — toque abre a conversa no inbox (mesma sessão). */

export function ContactCard({ message }: Props) {

  const t = useT();

  const router = useRouter();

  const [loading, setLoading] = useState(false);

  const contact = resolveSharedContact(message);



  if (!contact) {

    return (

      <div className="rounded-lg border border-current/20 bg-background/10 px-3 py-2 text-xs opacity-80">

        {t("Contato")}

      </div>

    );

  }



  const canOpen = !!(contact.contact_id || contact.phone_number?.trim());



  async function handleOpen() {

    if (!canOpen || loading) return;

    setLoading(true);

    try {

      const res = await fetch("/api/v1/conversations/open-with-contact", {

        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({

          channel_session_id: message.channel_session_id,

          contact_id: contact!.contact_id,

          phone_number: contact!.phone_number?.trim() || undefined,

          name: contact!.name,

        }),

      });

      const json = (await res.json()) as {

        data?: { conversation_id: string };

        error?: { message?: string };

      };

      if (!res.ok || !json.data?.conversation_id) {

        throw new Error(json.error?.message ?? t("Não foi possível abrir a conversa."));

      }

      router.push(`/app/inbox?id=${json.data.conversation_id}`);

    } catch (err) {

      toast.error(err instanceof Error ? t(err.message) : t("Não foi possível abrir a conversa."));

    } finally {

      setLoading(false);

    }

  }



  // B13: o cartão mostra QUEM é, e a ação "Conversar com X" é um botão
  // explícito, como no protótipo; antes o cartão inteiro era clicável e nada
  // dizia que clicar abria uma conversa.
  const primeiroNome = (contact.name ?? "").trim().split(/\s+/)[0] || t("este contato");
  return (
    // O `.vcard` do quadro DS: quem é em cima, e "Conversar com" como faixa
    // de ação de largura inteira, separada por um fio do tom do texto.
    <div className="-ml-1 -mr-0.75 -mt-px flex w-65 max-w-full flex-col text-left">
      <span className="flex items-center gap-2.5 px-0.5 pb-2.5 pt-1">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-avatar-4 text-avatar-4-fg">
          <UserCircle size={26} weight="duotone" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{contact.name}</span>
          {contact.phone_number ? (
            <span className="block truncate font-mono text-label font-normal tabular-nums text-text-muted">{phoneForDisplay(contact.phone_number)}</span>
          ) : null}
        </span>
      </span>
      {canOpen && (
        <button
          type="button"
          disabled={loading}
          onClick={handleOpen}
          className="block w-full border-t border-[color-mix(in_oklch,var(--color-text)_12%,transparent)] pb-0.75 pt-2.25 text-center text-ui font-bold text-accent-text transition-colors hover:underline disabled:cursor-wait disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {t("Conversar com")} {primeiroNome}
        </button>
      )}
    </div>
  );

}

