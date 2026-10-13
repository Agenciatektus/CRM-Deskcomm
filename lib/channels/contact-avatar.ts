import { PROVIDERS_DE_MENSAGEM } from "./capabilities";
import type { ChannelProvider } from "./types";

export function providersDaFoto(contato: {
  wa_identity?: string | null;
  instagram_igsid?: string | null;
}): ChannelProvider[] {
  return PROVIDERS_DE_MENSAGEM.filter((p) =>
    p === "instagram" ? !!contato.instagram_igsid : !!contato.wa_identity,
  );
}

export function destinatarioDaFoto(
  provider: ChannelProvider,
  contato: { instagram_igsid?: string | null },
  whatsapp: string | null,
): string | null {
  return provider === "instagram" ? (contato.instagram_igsid ?? null) : whatsapp;
}
