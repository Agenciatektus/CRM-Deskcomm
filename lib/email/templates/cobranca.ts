/**
 * O e-mail da cobrança (spec §7a, §7d): aviso da régua à empresa, troca de
 * chave e avisos ao dono da instalação. Visual do `montarEmail` (identidade
 * fixa do produto); a marca da instalação entra só no assunto. O botão é o link
 * de PAGAMENTO quando há um: pagar em um clique é o que recupera a receita.
 */
import { montarEmail } from "@/lib/email/layout";
import type { MarcaDeSaida } from "@/lib/branding/saida";
import type { Idioma } from "@/lib/i18n/idiomas";

export interface EmailDaCobranca {
  titulo: string;
  corpo: string;
  marca: MarcaDeSaida;
  botao: { rotulo: string; href: string } | null;
  rodape: string;
  idioma: Idioma;
  /** Linha pequena acima do título. Padrão: "Cobrança". */
  eyebrow?: string;
  /** Atenção em destaque, no pé do cartão. */
  aviso?: string;
}

export function buildEmailDaCobranca(o: EmailDaCobranca): { subject: string; html: string; text: string } {
  const subject = `${o.titulo} no ${o.marca.nome}`;
  const { html, text } = montarEmail({
    assunto: subject,
    eyebrow: o.eyebrow ?? "Cobrança",
    titulo: o.titulo,
    paragrafos: [o.corpo],
    botao: o.botao ?? undefined,
    aviso: o.aviso,
    rodape: [o.rodape],
  });
  return { subject, html, text };
}
