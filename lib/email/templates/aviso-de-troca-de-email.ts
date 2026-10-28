/**
 * O aviso ao endereço ANTIGO de que o e-mail de login da conta foi trocado pelo
 * administrador da plataforma (`PATCH /api/v1/admin/tenants/[id]/members/[userId]/email`).
 *
 * É a guarda de quem perde o acesso: a troca é feita por outra pessoa, com
 * `email_confirm: true`, e a dona da caixa antiga é a única que pode dizer "não
 * fui eu". Por isso o texto diz QUANDO e a quem recorrer — e NÃO diz o endereço
 * novo: se a troca for indevida, este e-mail não pode entregar ao destinatário
 * errado o caminho para a conta.
 *
 * Visual do `montarEmail` (identidade fixa do produto). O idioma é
 * o de quem recebe (`user_metadata.locale`), pelo dicionário da interface.
 */
import type { MarcaDeSaida } from "@/lib/branding/saida";
import { montarEmail } from "@/lib/email/layout";
import { traduzir } from "@/lib/i18n/dicionario";
import type { Idioma } from "@/lib/i18n/idiomas";

export interface AvisoDeTrocaDeEmailOpcoes {
  marca: MarcaDeSaida;
  /** A data da troca, já formatada no fuso da organização. */
  data: string;
  idioma: Idioma;
}

export function buildAvisoDeTrocaDeEmail(opts: AvisoDeTrocaDeEmailOpcoes): {
  subject: string;
  html: string;
  text: string;
} {
  const t = (texto: string) => traduzir(texto, opts.idioma);
  const subject = t("O e-mail de login da sua conta foi trocado");
  const quando = t("O e-mail de login da sua conta foi trocado pelo administrador da plataforma em {data}.")
    .replace("{data}", opts.data);
  const oQueFazer = t("Se você não reconhece a mudança, fale com o administrador da sua empresa.");
  const deAgoraEmDiante = t("Este endereço deixa de receber os e-mails de acesso desta conta.");

  const { html, text } = montarEmail({
    idioma: opts.idioma,
    assunto: subject,
    eyebrow: t("Segurança"),
    titulo: subject,
    paragrafos: [quando, oQueFazer],
    nota: deAgoraEmDiante,
  });
  return { subject, html, text };
}
