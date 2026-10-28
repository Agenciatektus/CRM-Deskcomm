/**
 * O e-mail do alerta de vencimento do acesso à Meta: texto e link vêm de quem
 * chama (`meta/alerta/rodada.ts`); aqui só o visual do `montarEmail`.
 */
import { montarEmail } from "@/lib/email/layout";
import type { MarcaDeSaida } from "@/lib/branding/saida";
import type { Idioma } from "@/lib/i18n/idiomas";

export interface EmailDoAlertaMeta {
  titulo: string;
  corpo: string;
  marca: MarcaDeSaida;
  botao: { rotulo: string; href: string };
  rodape: string;
  idioma?: Idioma;
}

export function buildEmailDoAlertaMeta(o: EmailDoAlertaMeta): { subject: string; html: string; text: string } {
  const subject = `${o.titulo} no ${o.marca.nome}`;
  const { html, text } = montarEmail({
    assunto: subject,
    eyebrow: "Meta Ads",
    titulo: o.titulo,
    paragrafos: [o.corpo],
    botao: o.botao,
    rodape: [o.rodape],
    idioma: o.idioma,
  });
  return { subject, html, text };
}
