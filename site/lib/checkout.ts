import { linkWhatsapp } from "./conteudo";
import { mensagemDeAssinatura, type Periodo, type Plano } from "./preco";

/**
 * Payment Links da Stripe (conta Agência Tektus, modo real), um por plano e período.
 * São endereços públicos de pagamento, não segredos. O anual é cobrado de uma vez.
 */
export const LINKS_STRIPE: Record<Plano, Record<Periodo, string>> = {
  "com-ia": {
    mensal: "https://buy.stripe.com/28E3cv4jiem0bHa1UM6Ri00",
    anual: "https://buy.stripe.com/7sY14n2ba6Ty7qU7f66Ri01",
  },
  "sem-ia": {
    mensal: "https://buy.stripe.com/5kQ4gz5nmcdScLe0QI6Ri02",
    anual: "https://buy.stripe.com/dRm28rg201ze26AdDu6Ri03",
  },
};

/**
 * Destino do botão de assinatura. Sem implantação, vai direto ao pagamento na Stripe.
 * Com implantação, segue pelo WhatsApp até a cobrança da implantação (cartão em 3x e Pix) existir.
 */
export function linkDeAssinatura(plano: Plano, periodo: Periodo, comImplantacao: boolean): string {
  if (comImplantacao) return linkWhatsapp(mensagemDeAssinatura(plano, periodo, comImplantacao));
  return LINKS_STRIPE[plano][periodo];
}
