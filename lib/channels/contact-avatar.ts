/**
 * Por qual canal se pede a foto de um contato, e com qual endereço.
 *
 * Mora em lib/channels/ porque nomeia provider: o cron de fotos só pergunta
 * "quais canais servem para este contato?" e "qual endereço mando?", sem saber
 * qual canal é (doutrina `restricao-de-canal`).
 */
import { PROVIDERS_DE_MENSAGEM } from "./capabilities";
import type { ChannelProvider } from "./types";

/**
 * Canais que conseguem achar este contato. O IGSID só vale no Instagram, e o
 * WhatsApp só serve a quem tem identidade de WhatsApp: pedir a foto de um
 * contato só de Instagram a uma sessão de WhatsApp (ou o contrário) é chamada
 * gasta que volta "sem foto".
 */
export function providersDaFoto(contato: {
  wa_identity?: string | null;
  instagram_igsid?: string | null;
}): ChannelProvider[] {
  return PROVIDERS_DE_MENSAGEM.filter((p) =>
    p === "instagram" ? !!contato.instagram_igsid : !!contato.wa_identity,
  );
}

/** O endereço que o canal espera: IGSID no Instagram, chatId no WhatsApp. */
export function destinatarioDaFoto(
  provider: ChannelProvider,
  contato: { instagram_igsid?: string | null },
  chatIdWhatsapp: string | null,
): string | null {
  return provider === "instagram" ? (contato.instagram_igsid ?? null) : chatIdWhatsapp;
}
