/**
 * Layout base dos e-mails transacionais: identidade ESCURA do produto, fixa
 * (sem white-label por organização). Tabelas e estilo inline com `bgcolor`
 * (clientes com modo escuro forçado ignoram CSS); o `<style>` só acrescenta
 * o que degrada bem sem ele: a moldura da página (brilhos de canto do CRM), o
 * fundo e a trama de pontos da coluna de conversa do Inbox, o degradê do
 * botão e o ajuste de celular.
 */
import { env } from "@/lib/env";
import { DEFAULT_APP_NAME } from "@/lib/branding";

export const TOKENS_EMAIL = {
  fundo: "#0d0e11",
  cartao: "#111315",
  caixa: "#202327",
  borda: "#26292d",
  texto: "#f0f2f4",
  suave: "#9aa0a8",
  botao: "#2a52d8",
  botaoFim: "#2b8cad",
  botaoTexto: "#ffffff",
  destaque: "#2bc88f",
  aviso: "#f5a623",
} as const;

const FONTE = "'Atkinson Hyperlegible Next','Atkinson Hyperlegible',system-ui,'Segoe UI',Arial,sans-serif";

/** Uma linha sob o nome, no mesmo tom do site do produto. */
const TAGLINE = "Atendimento, funil e agentes de IA no WhatsApp";

export interface EntradaEmail {
  assunto: string;
  titulo: string;
  paragrafos: string[];
  /** Linha pequena em caixa alta acima do título. */
  eyebrow?: string;
  /** Texto de prévia na lista de e-mails (oculto no corpo). */
  preheader?: string;
  /** Frase de abertura em tom suave, logo abaixo do título. */
  subtitulo?: string;
  botao?: { rotulo: string; href: string };
  /** Código de uso único, em caixa própria. */
  codigo?: string;
  passos?: string[];
  /** Atenção em destaque, no pé do cartão. */
  aviso?: string;
  rodape?: string[];
  nota?: string;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function montarEmail(e: EntradaEmail): { html: string; text: string } {
  const T = TOKENS_EMAIL;
  const nome = DEFAULT_APP_NAME;
  const base = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  const app = (env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  const logo = base
    ? `<img src="${escapeHtml(`${base}/storage/v1/object/public/brand-logos/platform/email-simbolo.png`)}" width="55" height="60" alt="${escapeHtml(nome)}" style="display:block;border:0;outline:none;text-decoration:none;margin:0 auto 16px;width:55px;height:60px">`
    : "";
  const p = (s: string, cor: string = T.suave, tam = 15, mb = 14) =>
    `<p style="margin:0 0 ${mb}px;font-family:${FONTE};font-size:${tam}px;line-height:1.6;color:${cor}">${escapeHtml(s)}</p>`;
  const linha = `<tr><td class="px" style="padding:28px 44px 0"><div style="height:1px;line-height:1px;font-size:0;background:${T.borda}">&nbsp;</div></td></tr>`;

  const botao = e.botao
    ? `<tr><td align="center" class="px" style="padding:28px 44px 8px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" class="cta" bgcolor="${T.botao}" style="background-color:${T.botao};border-radius:12px"><a href="${escapeHtml(e.botao.href)}" target="_blank" style="display:inline-block;padding:16px 40px;font-family:${FONTE};font-size:16px;font-weight:700;color:${T.botaoTexto};text-decoration:none;border-radius:12px">${escapeHtml(e.botao.rotulo)}</a></td></tr></table></td></tr>
<tr><td class="px" style="padding:12px 44px 0"><p style="margin:0 0 6px;text-align:center;font-family:${FONTE};font-size:12px;line-height:1.6;color:${T.suave}">Se o botão não abrir, copie este link no navegador:</p><p style="margin:0;text-align:center;font-family:${FONTE};font-size:12px;line-height:1.6;word-break:break-all"><a href="${escapeHtml(e.botao.href)}" style="color:${T.destaque};text-decoration:underline">${escapeHtml(e.botao.href)}</a></p></td></tr>`
    : "";
  const codigo = e.codigo
    ? `<tr><td class="px" style="padding:24px 44px 0"><p style="margin:0 0 10px;text-align:center;font-family:${FONTE};font-size:11px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${T.suave}">Ou use o código</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="${T.caixa}" style="padding:18px;background:${T.caixa};border:1px solid ${T.borda};border-radius:14px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:28px;font-weight:700;letter-spacing:0.4em;color:${T.texto}">${escapeHtml(e.codigo)}</td></tr></table></td></tr>`
    : "";
  const passos = e.passos?.length
    ? `<tr><td class="px" style="padding:8px 44px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${T.caixa}" style="background:${T.caixa};border:1px solid ${T.borda};border-radius:14px"><tr><td style="padding:18px 20px"><p style="margin:0 0 10px;font-family:${FONTE};font-size:11px;font-weight:600;letter-spacing:0.24em;text-transform:uppercase;color:${T.suave}">O que acontece agora</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${e.passos
        .map(
          (s, i) =>
            `<tr><td width="28" valign="top" style="padding:5px 0;font-family:${FONTE};font-size:15px;font-weight:700;color:${T.destaque}">${i + 1}</td><td style="padding:5px 0;font-family:${FONTE};font-size:15px;line-height:1.5;color:${T.texto}">${escapeHtml(s)}</td></tr>`,
        )
        .join("")}</table></td></tr></table></td></tr>`
    : "";
  const nota = e.nota ? `<tr><td class="px" style="padding:20px 44px 0">${p(e.nota, T.suave, 13, 0)}</td></tr>` : "";
  const aviso = e.aviso
    ? `${linha}<tr><td class="px" style="padding:20px 44px 36px"><p style="margin:0;font-family:${FONTE};font-size:13px;line-height:1.6;color:${T.suave}"><span style="color:${T.aviso};font-weight:700">Atenção:</span> ${escapeHtml(e.aviso)}</p></td></tr>`
    : `<tr><td style="padding:0 0 36px;font-size:0;line-height:0">&nbsp;</td></tr>`;
  const rodape = [...(e.rodape ?? [])].map((s) => p(s, T.suave, 12, 4)).join("");
  const rodapeApp = app
    ? `<p style="margin:0;font-family:${FONTE};font-size:12px;line-height:1.7;color:${T.suave}">${escapeHtml(nome)}, <a href="${escapeHtml(app)}" style="color:${T.suave};text-decoration:underline">${escapeHtml(app.replace(/^https?:\/\//, ""))}</a></p>`
    : p(nome, T.suave, 12, 0);
  const pre = e.preheader ?? e.paragrafos[0] ?? e.titulo;

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escapeHtml(e.assunto)}</title>
<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:wght@400;600;700&display=swap" rel="stylesheet">
<style>
body{margin:0;padding:0;background:${T.fundo}}
.pre{display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;max-height:0;max-width:0;overflow:hidden;font-size:1px;line-height:1px;mso-hide:all}
.grade{background-color:${T.fundo};background-image:radial-gradient(672px 352px at -96px -96px,rgba(42,82,216,0.16),transparent 70%),radial-gradient(576px 288px at 100% -128px,rgba(43,140,173,0.10),transparent 70%);background-repeat:no-repeat}
.cartao{background-color:${T.cartao};background-image:radial-gradient(ellipse 80% 42% at 50% -12%,rgba(43,140,173,0.13),transparent 62%),radial-gradient(circle at 1px 1px,rgba(255,255,255,0.07) 1px,transparent 0);background-size:auto,18px 18px;background-repeat:no-repeat,repeat}
.cta{background-image:linear-gradient(90deg,${T.botao} 0%,${T.botaoFim} 100%);box-shadow:0 14px 36px -10px rgba(42,82,216,0.55)}
@media (max-width:600px){.cont{width:100%!important}.px{padding-left:24px!important;padding-right:24px!important}.h1{font-size:26px!important}}
</style>
</head>
<body bgcolor="${T.fundo}" style="margin:0;padding:0;background:${T.fundo};color:${T.texto}">
<div class="pre">${escapeHtml(pre)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${T.fundo}" class="grade" style="background-color:${T.fundo}"><tr><td align="center" style="padding:44px 16px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${T.cartao}" class="cont cartao" style="width:100%;max-width:600px;background-color:${T.cartao};border:1px solid ${T.borda};border-radius:26px">
<tr><td align="center" class="px" style="padding:48px 44px 4px">${logo}<div style="font-family:${FONTE};font-size:28px;font-weight:700;letter-spacing:-0.02em;line-height:1;color:#ffffff">${escapeHtml(nome)}</div><div style="margin-top:12px;font-family:${FONTE};font-size:12px;line-height:1.5;color:${T.suave}">${escapeHtml(TAGLINE)}</div></td></tr>
${linha}
<tr><td class="px" style="padding:32px 44px 6px">${e.eyebrow ? `<p style="margin:0 0 14px;font-family:${FONTE};font-size:11px;font-weight:600;line-height:1;letter-spacing:0.26em;text-transform:uppercase;color:${T.destaque}">${escapeHtml(e.eyebrow)}</p>` : ""}<h1 class="h1" style="margin:0 0 12px;font-family:${FONTE};font-size:30px;font-weight:700;line-height:1.15;letter-spacing:-0.02em;color:#ffffff">${escapeHtml(e.titulo)}</h1>${e.subtitulo ? p(e.subtitulo, T.suave, 16, 0) : ""}</td></tr>
<tr><td class="px" style="padding:18px 44px 0">${e.paragrafos.map((s) => p(s, T.suave)).join("")}</td></tr>
${passos}
${botao}
${codigo}
${nota}
${aviso}
</table>
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="cont" style="width:100%;max-width:600px;margin-top:24px"><tr><td align="center" style="padding:0 16px">${rodape}${rodapeApp}</td></tr></table>
</td></tr></table>
</body>
</html>`;

  const text = [
    e.titulo,
    ...(e.subtitulo ? [e.subtitulo] : []),
    ...e.paragrafos,
    ...(e.passos ?? []).map((s, i) => `${i + 1}. ${s}`),
    ...(e.botao ? [`${e.botao.rotulo}: ${e.botao.href}`] : []),
    ...(e.codigo ? [`Código: ${e.codigo}`] : []),
    ...(e.nota ? [e.nota] : []),
    ...(e.aviso ? [`Atenção: ${e.aviso}`] : []),
    ...(e.rodape ?? []),
  ].join("\n\n");

  return { html, text };
}
