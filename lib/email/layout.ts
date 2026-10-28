/**
 * Layout base dos e-mails transacionais: identidade ESCURA do produto, fixa
 * (sem white-label por organização). Tabelas, 560 px, tudo inline, `bgcolor`
 * nas tabelas porque clientes de e-mail com modo escuro forçado ignoram CSS.
 */
import { env } from "@/lib/env";
import { DEFAULT_APP_NAME } from "@/lib/branding";

export const TOKENS_EMAIL = {
  fundo: "#0d0e11",
  cartao: "#181a1c",
  borda: "#26292d",
  texto: "#f0f2f4",
  suave: "#9aa0a8",
  botao: "#2a52d8",
  botaoTexto: "#ffffff",
  destaque: "#2bc88f",
} as const;

const FONTE = "'Atkinson Hyperlegible',system-ui,'Segoe UI',Arial,sans-serif";

export interface EntradaEmail {
  assunto: string;
  titulo: string;
  paragrafos: string[];
  botao?: { rotulo: string; href: string };
  passos?: string[];
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
  const logo = base
    ? `<td style="padding-right:12px;vertical-align:middle"><img src="${escapeHtml(`${base}/storage/v1/object/public/brand-logos/platform/email-simbolo.png`)}" alt="${escapeHtml(nome)}" height="40" style="height:40px;width:auto;border:0;display:block"></td>`
    : "";
  const p = (s: string, cor: string = T.texto, tam = 15) =>
    `<p style="margin:0 0 16px;font-size:${tam}px;line-height:1.5;color:${cor};font-family:${FONTE}">${escapeHtml(s)}</p>`;

  const botao = e.botao
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px"><tr><td bgcolor="${T.botao}" style="background:${T.botao};border-radius:6px"><a href="${escapeHtml(e.botao.href)}" style="display:inline-block;padding:12px 24px;font-family:${FONTE};font-size:15px;font-weight:600;color:${T.botaoTexto};text-decoration:none">${escapeHtml(e.botao.rotulo)}</a></td></tr></table>${p("Se o botão não abrir, copie este link no navegador:", T.suave, 13)}<p style="margin:0 0 16px;font-size:13px;word-break:break-all;color:${T.destaque};font-family:${FONTE}">${escapeHtml(e.botao.href)}</p>`
    : "";
  const passos = e.passos?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px">${e.passos
        .map(
          (s, i) =>
            `<tr><td width="28" valign="top" style="padding:4px 0;font-family:${FONTE};font-size:15px;font-weight:600;color:${T.destaque}">${i + 1}.</td><td style="padding:4px 0;font-family:${FONTE};font-size:15px;line-height:1.5;color:${T.texto}">${escapeHtml(s)}</td></tr>`,
        )
        .join("")}</table>`
    : "";
  const nota = e.nota ? p(e.nota, T.suave, 13) : "";
  const rodape = (e.rodape ?? []).map((s) => p(s, T.suave, 12)).join("");

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escapeHtml(e.assunto)}</title>
</head>
<body bgcolor="${T.fundo}" style="margin:0;padding:0;background:${T.fundo};color:${T.texto}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${T.fundo}" style="background:${T.fundo}"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px">
<tr><td style="padding:0 0 20px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${logo}<td style="vertical-align:middle;font-family:${FONTE};font-size:18px;font-weight:600;color:${T.texto}">${escapeHtml(nome)}</td></tr></table></td></tr>
<tr><td bgcolor="${T.cartao}" style="background:${T.cartao};border:1px solid ${T.borda};border-radius:12px;padding:32px 28px">
<h1 style="margin:0 0 16px;font-family:${FONTE};font-size:22px;line-height:1.3;color:${T.texto}">${escapeHtml(e.titulo)}</h1>
${e.paragrafos.map((s) => p(s)).join("")}${passos}${botao}${nota}
</td></tr>
<tr><td style="padding:20px 4px 0">${rodape}</td></tr>
</table>
</td></tr></table>
</body>
</html>`;

  const text = [
    e.titulo,
    ...e.paragrafos,
    ...(e.passos ?? []).map((s, i) => `${i + 1}. ${s}`),
    ...(e.botao ? [`${e.botao.rotulo}: ${e.botao.href}`] : []),
    ...(e.nota ? [e.nota] : []),
    ...(e.rodape ?? []),
  ].join("\n\n");

  return { html, text };
}
