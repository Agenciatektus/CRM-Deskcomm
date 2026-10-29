import { type MarcaDeSaida } from "@/lib/branding/saida";
import { env } from "@/lib/env";
import { montarEmail } from "@/lib/email/layout";
import { WHATSAPP_TEKTUS } from "@/lib/email/templates/invite";

/**
 * Os dois e-mails de ACESSO — confirmar conta e redefinir senha — no formato
 * que o GoTrue renderiza.
 *
 * ─── POR QUE ISTO É DIFERENTE DE `invite.ts` ────────────────────────────────
 *
 * O convite de time é montado e ENVIADO por nós. Estes dois não: quem os
 * renderiza e envia é o GoTrue, um processo de terceiro. Nós só entregamos o
 * MOLDE, e ele preenche `{{ .RedirectTo }}` e `{{ .TokenHash }}` na hora do
 * envio. Por isso a saída aqui é uma string de template Go, não um e-mail
 * pronto — e por isso as chaves duplas NÃO passam por escape: elas são sintaxe
 * do renderizador, não dado.
 *
 * ─── POR QUE `token_hash` E NÃO `{{ .ConfirmationURL }}` ────────────────────
 *
 * O modelo PADRÃO do GoTrue linka para `/auth/v1/verify`, que devolve um `code`
 * PKCE. O verificador desse code vive num cookie `SameSite=Strict`
 * (`lib/supabase/server.ts`), e clique vindo de webmail é navegação
 * cross-site: o cookie não viaja, `exchangeCodeForSession` falha, e a conta é
 * confirmada sem que a sessão feche. `token_hash` não depende de cookie nenhum.
 *
 * Medido numa instalação self-hosted em 2026-09-10: com o modelo padrão, o
 * `api_audit_log` registrava `auth.email_link_rejected` com
 * `"PKCE code verifier not found in storage"`; com estes moldes, o mesmo fluxo
 * fecha a sessão.
 *
 * ─── `&`, NUNCA `?` ────────────────────────────────────────────────────────
 *
 * `.RedirectTo` já chega com `?type=` embutido — `signUp.ts` e
 * `requestPasswordReset.ts` o anexam de propósito, porque é o único jeito de o
 * `type` sobreviver ao hop pelo GoTrue no outro formato. Um `?` aqui duplicaria
 * o separador e o parser de URL do browser pararia de reconhecer `token_hash`.
 */

export type ModeloDeAcesso = "confirmation" | "recovery" | "email_change";

export const MODELOS_DE_ACESSO: readonly ModeloDeAcesso[] = ["confirmation", "recovery", "email_change"];

/** O texto de cada modelo. Assunto entra no `GOTRUE_MAILER_SUBJECTS_*`. */
const COPIA: Record<ModeloDeAcesso, { assunto: (marca: string) => string; titulo: string; corpo: (marca: string) => string; botao: string; rodape: string; detalhe?: string; eyebrow: string }> = {
  confirmation: {
    assunto: (marca) => `Confirme seu e-mail no ${marca}`,
    eyebrow: "Confirmação",
    titulo: "Confirme seu e-mail",
    corpo: (marca) =>
      `Sua conta no ${marca} está quase pronta. Clique no botão abaixo para confirmar seu e-mail e ativar sua conta.`,
    botao: "Confirmar e-mail",
    rodape: "Se você não criou esta conta, ignore este e-mail.",
  },
  recovery: {
    assunto: (marca) => `Redefina sua senha no ${marca}`,
    eyebrow: "Senha",
    titulo: "Redefinir sua senha",
    corpo: (marca) =>
      `Recebemos um pedido para redefinir a senha da sua conta no ${marca}. Clique no botão abaixo para escolher uma nova.`,
    botao: "Definir nova senha",
    rodape:
      "Se não foi você quem pediu, ignore este e-mail. Sua senha continua a mesma.",
  },
  // A troca de e-mail da tela de Perfil (`trocarEmail`). Com a troca segura do
  // GoTrue o MESMO modelo vai para o endereço atual e para o novo, cada um com o
  // seu `TokenHash` — por isso o texto serve aos dois. `.RedirectTo` chega com
  // `?type=email_change` (o `emailRedirectTo` da action).
  email_change: {
    assunto: (marca) => `Confirme a troca de e-mail no ${marca}`,
    eyebrow: "Troca de e-mail",
    titulo: "Confirme a troca de e-mail",
    corpo: (marca) =>
      `Recebemos um pedido para trocar o e-mail de acesso da sua conta no ${marca}. Clique no botão abaixo para confirmar. A troca só vale depois da confirmação.`,
    botao: "Confirmar troca de e-mail",
    // O ENDEREÇO NOVO, escrito no e-mail (P2 do Cassio na #241): quem recebe no
    // endereço ATUAL precisa ver para onde a conta está indo, e é assim que o
    // dono legítimo reconhece um sequestro de sessão. `{{ .NewEmail }}` fica cru
    // de propósito — é o GoTrue quem o substitui (e escapa, no template HTML).
    detalhe: "Novo endereço: {{ .NewEmail }}",
    rodape:
      "Se não foi você quem pediu, ignore este e-mail e avise quem administra a sua empresa. O e-mail da conta continua o mesmo.",
  },
};

/**
 * Os AVISOS de segurança nativos do GoTrue (`GOTRUE_MAILER_NOTIFICATIONS_<X>_ENABLED`).
 * Sem link de verificação: só informam. Mapa modelo da rota, variável do GoTrue
 * (`GOTRUE_MAILER_TEMPLATES_<X>_NOTIFICATION` e `GOTRUE_MAILER_SUBJECTS_<X>_NOTIFICATION`)
 * e variáveis Go disponíveis no molde:
 *
 *   password_changed      -> PASSWORD_CHANGED      -> {{ .Email }}
 *   mfa_factor_enrolled   -> MFA_FACTOR_ENROLLED   -> {{ .Email }}, {{ .FactorType }}
 *   mfa_factor_unenrolled -> MFA_FACTOR_UNENROLLED -> {{ .Email }}, {{ .FactorType }}
 *   identity_linked       -> IDENTITY_LINKED       -> {{ .Email }}, {{ .Provider }}
 *   identity_unlinked     -> IDENTITY_UNLINKED     -> {{ .Email }}, {{ .Provider }}
 *
 * Fora de propósito: `email_changed` (o app já manda `aviso-de-troca-de-email.ts`)
 * e `phone_changed` (o produto não tem fluxo de telefone).
 */
export type ModeloDeAviso =
  | "password_changed"
  | "mfa_factor_enrolled"
  | "mfa_factor_unenrolled"
  | "identity_linked"
  | "identity_unlinked";

export const MODELOS_DE_AVISO: readonly ModeloDeAviso[] = [
  "password_changed",
  "mfa_factor_enrolled",
  "mfa_factor_unenrolled",
  "identity_linked",
  "identity_unlinked",
];

const AVISOS: Record<ModeloDeAviso, { assunto: (marca: string) => string; titulo: string; corpo: (marca: string) => string }> = {
  password_changed: {
    assunto: (marca) => `Sua senha foi alterada no ${marca}`,
    titulo: "Sua senha foi alterada",
    corpo: (marca) => `A senha da conta {{ .Email }} no ${marca} acabou de ser alterada.`,
  },
  mfa_factor_enrolled: {
    assunto: (marca) => `Verificação em duas etapas ativada no ${marca}`,
    titulo: "Verificação em duas etapas ativada",
    corpo: (marca) => `Um método de verificação ({{ .FactorType }}) foi adicionado à conta {{ .Email }} no ${marca}.`,
  },
  mfa_factor_unenrolled: {
    assunto: (marca) => `Verificação em duas etapas removida no ${marca}`,
    titulo: "Verificação em duas etapas removida",
    corpo: (marca) => `Um método de verificação ({{ .FactorType }}) foi removido da conta {{ .Email }} no ${marca}.`,
  },
  identity_linked: {
    assunto: (marca) => `Novo login vinculado à sua conta no ${marca}`,
    titulo: "Novo login vinculado",
    corpo: (marca) => `O login com {{ .Provider }} foi vinculado à conta {{ .Email }} no ${marca}.`,
  },
  identity_unlinked: {
    assunto: (marca) => `Login desvinculado da sua conta no ${marca}`,
    titulo: "Login desvinculado",
    corpo: (marca) => `O login com {{ .Provider }} foi desvinculado da conta {{ .Email }} no ${marca}.`,
  },
};

export function assuntoDoModelo(modelo: ModeloDeAcesso | ModeloDeAviso, marca: MarcaDeSaida): string {
  return (modelo in AVISOS ? AVISOS[modelo as ModeloDeAviso] : COPIA[modelo as ModeloDeAcesso]).assunto(marca.nome);
}

/** O molde de um aviso de segurança. Só o HTML vai ao GoTrue, como em `montarTemplateDeAcesso`. */
export function montarTemplateDeAviso(modelo: ModeloDeAviso, marca: MarcaDeSaida): string {
  const t = AVISOS[modelo];
  const app = (env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  return montarEmail({
    assunto: t.assunto(marca.nome),
    eyebrow: "Segurança",
    titulo: t.titulo,
    paragrafos: [t.corpo(marca.nome), "Se foi você, não precisa fazer nada."],
    // Rota de "esqueci a senha" (`app/(public)/login/forgot`).
    botao: app ? { rotulo: "Proteger minha conta", href: `${app}/login/forgot` } : undefined,
    aviso: "Se não foi você, redefina a senha agora e avise quem administra a sua empresa.",
    rodape: ["Precisa de ajuda? Fale com a Tektus no WhatsApp."],
    rodapeLink: { rotulo: WHATSAPP_TEKTUS.replace("https://", ""), href: WHATSAPP_TEKTUS },
  }).html;
}

/**
 * O molde, com a marca da INSTALAÇÃO já aplicada.
 *
 * Estilo inline apenas e zero asset externo além do logo, pelas mesmas razões
 * de `invite.ts` — inclusive a dimensão no atributo, que o Outlook desktop
 * exige porque descarta `height` de style em imagem.
 */
export function montarTemplateDeAcesso(modelo: ModeloDeAcesso, marca: MarcaDeSaida): string {
  const t = COPIA[modelo];
  // As chaves duplas ficam CRUAS de propósito: o GoTrue as substitui. O
  // `montarEmail` só escapa `& < > " '`, e nenhum aparece nos placeholders; o
  // `&` do href sai como `&amp;`, que o cliente de e-mail lê como `&`.
  const destino = "{{ .RedirectTo }}&token_hash={{ .TokenHash }}";
  // Só o HTML vai ao GoTrue; o `text` do layout é descartado.
  return montarEmail({
    assunto: t.assunto(marca.nome),
    eyebrow: t.eyebrow,
    titulo: t.titulo,
    paragrafos: [t.corpo(marca.nome), ...(t.detalhe ? [t.detalhe] : [])],
    botao: { rotulo: t.botao, href: destino },
    aviso: t.rodape,
  }).html;
}
