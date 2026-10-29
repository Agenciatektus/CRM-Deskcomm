/**
 * O aviso à pessoa cujo acesso a uma empresa mudou: papel alterado, acesso
 * removido ou acesso reativado (`app/api/v1/team/[user_id]/{role,revoke,reactivate}`).
 *
 * Nomeia a empresa (a pessoa pode estar em várias) e NÃO nomeia quem fez a
 * mudança: diz "um administrador da empresa". Visual do `montarEmail`; o idioma
 * é o de quem recebe, pelo dicionário da interface.
 */
import { DEFAULT_APP_NAME } from "@/lib/branding";
import { env } from "@/lib/env";
import { montarEmail } from "@/lib/email/layout";
import { WHATSAPP_TEKTUS } from "@/lib/email/templates/invite";
import { traduzir } from "@/lib/i18n/dicionario";
import type { Idioma } from "@/lib/i18n/idiomas";

export type MudancaDeAcesso =
  | { tipo: "papel_alterado"; papel: string; papelAnterior: string }
  | { tipo: "acesso_removido" }
  | { tipo: "acesso_reativado" };

export type AvisoDeMudancaDeAcessoOpcoes = MudancaDeAcesso & {
  empresa: string;
  idioma: Idioma;
};

const ROTULO_DO_PAPEL: Record<string, string> = {
  admin: "Administrador",
  manager: "Gerente",
  agent: "Atendente",
  viewer: "Visualizador",
};

/** Uma passada só: `$&` no nome da empresa não é interpretado e `{anterior}` dentro dele não é substituído. */
const preencher = (texto: string, valores: Record<string, string>) =>
  texto.replace(/\{(\w+)\}/g, (achado, chave: string) => valores[chave] ?? achado);

export function buildAvisoDeMudancaDeAcesso(opts: AvisoDeMudancaDeAcessoOpcoes): {
  subject: string;
  html: string;
  text: string;
} {
  const t = (texto: string) => traduzir(texto, opts.idioma);
  const empresa = opts.empresa;
  const papel = (p: string) => t(ROTULO_DO_PAPEL[p] ?? p);
  const href = (env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  const botao = href
    ? { rotulo: t("Abrir o {marca}").replace("{marca}", DEFAULT_APP_NAME), href }
    : undefined;

  let subject: string;
  let paragrafos: string[];
  let eyebrow = t("Equipe");
  let aviso: string | undefined;
  let comBotao = true;

  if (opts.tipo === "papel_alterado") {
    subject = preencher(t("Seu papel na {empresa} foi alterado"), { empresa });
    paragrafos = [
      preencher(t("Um administrador da empresa {empresa} alterou o seu papel: de {anterior} para {novo}."), {
        empresa,
        anterior: papel(opts.papelAnterior),
        novo: papel(opts.papel),
      }),
    ];
  } else if (opts.tipo === "acesso_removido") {
    subject = preencher(t("Seu acesso à {empresa} foi removido"), { empresa });
    eyebrow = t("Segurança");
    comBotao = false;
    paragrafos = [
      preencher(t("Um administrador da empresa {empresa} removeu o seu acesso. Você não consegue mais entrar nela."), {
        empresa,
      }),
    ];
    aviso = t("Se foi engano, fale com o administrador da empresa.");
  } else {
    subject = preencher(t("Seu acesso à {empresa} foi reativado"), { empresa });
    paragrafos = [
      preencher(t("Um administrador da empresa {empresa} reativou o seu acesso. Você já pode entrar de novo."), {
        empresa,
      }),
    ];
  }

  const { html, text } = montarEmail({
    idioma: opts.idioma,
    assunto: subject,
    eyebrow,
    titulo: subject,
    paragrafos,
    botao: comBotao ? botao : undefined,
    aviso,
    rodape: [t("Dúvidas? Fale com a Tektus no WhatsApp.")],
    rodapeLink: { rotulo: WHATSAPP_TEKTUS.replace("https://", ""), href: WHATSAPP_TEKTUS },
  });
  return { subject, html, text };
}
