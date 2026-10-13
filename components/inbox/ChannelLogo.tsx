"use client";

import { ChatCircle, InstagramLogo, MessengerLogo, WhatsappLogo } from "@/lib/ui/icons";
import { channelBrand, CHANNEL_BRAND_LABEL, type ChannelBrand } from "@/lib/channels/presentation";
import { useT } from "@/hooks/i18n/useT";
import { cn } from "@/lib/utils";
import type { ChannelSummary } from "@/hooks/inbox/useConversationsRealtime";

/**
 * Só o que é VISUAL mora aqui. O NOME da rede vem de `CHANNEL_BRAND_LABEL`,
 * porque o card do funil escreve o mesmo nome e uma segunda lista aqui foi
 * exatamente como as duas telas passaram a discordar sobre a mesma conversa.
 */
const brands: Record<ChannelBrand, { Icon: typeof ChatCircle; color: string }> = {
  whatsapp: { Icon: WhatsappLogo, color: "text-[#128c4a] dark:text-[#25d366]" },
  instagram: { Icon: InstagramLogo, color: "text-[#c13584] dark:text-[#f472b6]" },
  messenger: { Icon: MessengerLogo, color: "text-[#0866ff] dark:text-[#60a5fa]" },
  unknown: { Icon: ChatCircle, color: "text-muted-foreground" },
};

/**
 * O SELO do canal sobre o avatar (`.chan` do quadro DS): disco de 18px na cor
 * da rede, com o ícone branco por cima. As cores são as do protótipo
 * (`.chan-wa`, `.chan-ig`); o Messenger não foi desenhado e segue a mesma regra.
 */
export const DISCO: Record<ChannelBrand, string> = {
  whatsapp: "bg-[oklch(0.62_0.15_150)]",
  instagram: "bg-[oklch(0.58_0.2_0)]",
  messenger: "bg-[oklch(0.55_0.2_260)]",
  unknown: "bg-text-subtle",
};

export function ChannelLogo({ channel, size = 18, className, selo = false }: {
  channel?: ChannelSummary | null;
  size?: number;
  className?: string;
  /** Desenha o selo (disco colorido, ícone branco) em vez do ícone colorido solto. */
  selo?: boolean;
}) {
  const t = useT();
  const marca = channelBrand(channel);
  const { Icon, color: corDoIcone } = brands[marca];
  const color = selo ? cn(DISCO[marca], "rounded-full text-white") : corDoIcone;
  const label = CHANNEL_BRAND_LABEL[marca];
  // Só o genérico é traduzido: "WhatsApp" e "Instagram" são nomes próprios.
  const name = marca === "unknown" ? t("Canal") : label;
  return <span role="img" aria-label={name} title={name} className={cn("inline-flex shrink-0 items-center justify-center", color, className)}>
    <Icon size={size} weight="fill" aria-hidden />
  </span>;
}
