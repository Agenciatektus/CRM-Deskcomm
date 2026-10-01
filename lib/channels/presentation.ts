/**
 * A REDE que o cliente usou — nunca o transporte que a entregou.
 *
 * `channelBrand` traduz PROVIDER (quem entrega: waha, meta_cloud, zernio,
 * verdash) em REDE (o que o cliente abriu no celular: WhatsApp, Instagram,
 * Messenger). A doutrina de restrição de canal (invariante 1) proíbe o nome do
 * transporte de sair daqui; o nome da REDE, ao contrário, é exatamente o que o
 * produto precisa escrever na tela.
 */

/** As redes que o produto sabe nomear. `unknown` é o balão genérico. */
export type ChannelBrand = "whatsapp" | "instagram" | "messenger" | "unknown";

/** Display identity belongs to the network, never to the transport vendor. */
export function channelBrand(
  session?: { provider?: string | null; social_platform?: string | null } | null,
): ChannelBrand {
  switch (session?.provider) {
    case "waha":
    case "meta_cloud":
    case "zernio":
    case "datafy":
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

/**
 * O NOME da rede, para quando o produto precisa ESCREVER de onde a conversa
 * veio — e não só desenhar o ícone dela.
 *
 * ─── Por que é UMA lista, e não uma por tela ────────────────────────────────
 *
 * Esta tabela nasceu dentro de `components/inbox/ChannelLogo.tsx`, junto do
 * ícone e da cor, porque o Inbox era o único lugar que precisava do nome. O
 * título do card do funil precisava do MESMO nome e não tinha como pedi-lo:
 * `lib/leads/` não importa componente de UI. O resultado, medido em produção em
 * 2026-09-25, foi um Direct de Instagram entrando num card chamado "Novo
 * contato pelo WhatsApp" enquanto o Inbox, ao lado, mostrava o ícone do
 * Instagram na mesma conversa. Duas telas, duas respostas, um dado só.
 *
 * Aqui é o lugar certo porque é onde a REDE já é decidida (`channelBrand`).
 * Rede nova entra uma vez, no tipo, e o `Record` exaustivo reprova quem
 * esquecer de batizá-la.
 */
export const CHANNEL_BRAND_LABEL: Record<ChannelBrand, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
  // Não é o nome de uma rede: é a recusa honesta de chutar uma. Um provider que
  // ninguém mapeou vira "Canal", e não o canal mais comum — chutar o mais comum
  // é precisamente o defeito que esta tabela existe para fechar.
  unknown: "Canal",
};
