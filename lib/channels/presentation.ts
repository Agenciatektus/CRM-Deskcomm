/** Display identity belongs to the network, never to the transport vendor. */
export function channelBrand(
  session?: { provider?: string | null; social_platform?: string | null } | null,
) {
  switch (session?.provider) {
    case "waha":
    case "meta_cloud":
    case "zernio":
    case "wacalls":
    // O canal hospedado é WhatsApp como qualquer outro: o que muda é quem
    // mantém a conexão, e isso é transporte — não identidade de rede. Sem esta
    // linha ele caía no default e o Inbox mostrava o ícone genérico de "canal",
    // como se a conversa não tivesse procedência.
    case "verdash":
      return "whatsapp";
    // A rede é o Instagram, e o transporte é o mesmo do caso acima. O ícone e a
    // cor já existiam em `ChannelLogo` esperando por alguém que os pedisse.
    case "instagram":
      return "instagram";
    case "zernio_social":
      if (session.social_platform === "instagram") return "instagram";
      if (session.social_platform === "facebook") return "messenger";
      return "unknown";
    default:
      return "unknown";
  }
}
