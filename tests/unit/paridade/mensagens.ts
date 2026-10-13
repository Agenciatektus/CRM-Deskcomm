/**
 * Paridade das MENSAGENS (quadro DS, "Mensagens"; Main.dc.html no que o quadro não
 * desenha). Mesma regra de componentes.ts: o valor vem do protótipo, a classe esperada
 * é traduzida dele, e a checagem procura a classe no arquivo do CRM.
 */
import type { Checagem } from "./componentes";
import { altura, borda, fundo, largura, peso, preenchimento, raio, tamanho, texto, vao } from "./conversores";
import { R_DS, R_MAIN, decl, px } from "./leitor";

const ESTILO = "components/inbox/bolha/estilo.ts";
const META = "components/inbox/bolha/MetaDaBolha.tsx";
const CITACAO = "components/inbox/bolha/CitacaoNaBolha.tsx";
const AUDIO = "components/inbox/media/AudioPlayer.tsx";
const TRANSCRICAO = "components/inbox/bolha/TranscricaoDoAudio.tsx";
const DOC = "components/inbox/media/DocumentCard.tsx";
const IMAGEM = "components/inbox/media/ImageMedia.tsx";
const CONTATO = "components/inbox/media/ContactCard.tsx";
const LINHA = "components/inbox/fio/Divisores.tsx";
const PASSAGEM = "components/inbox/PassagemCard.tsx";
const CANAL = "components/inbox/ChannelLogo.tsx";
const FALHA = "components/inbox/bolha/TentarDeNovo.tsx";

const c = (
  id: string,
  fonte: Checagem["fonte"],
  seletor: string,
  prop: string,
  arquivo: string,
  classes: Checagem["classes"],
): Checagem => ({ id, fonte, seletor, prop, arquivo, classes });

/** `7px 11px 7px 12px` -> [`pt-1.75`, `pr-2.75`, `pb-1.75`, `pl-3`]. */
function quatroLados(v: string): string[] {
  const [t, r, b, l] = v.trim().split(/\s+/).map((x) => px(x) / 4);
  return [`pt-${t}`, `pr-${r}`, `pb-${b}`, `pl-${l}`];
}
/** `oklch(0.62 0.15 150)` -> `bg-[oklch(0.62_0.15_150)]`. */
const fundoLiteral = (v: string) => `bg-[${v.trim().replace(/\s+/g, "_")}]`;
/** Token de bolha (`var(--bub-out)`) -> utilitário do CRM. */
const BOLHA: Record<string, string> = { "bub-out": "bg-bubble-out", "bub-ai": "bg-bubble-ai", tint: "bg-tint", "warn-bg": "bg-warning-bg" };
const fundoDaBolha = (v: string) => BOLHA[/var\(--([a-z-]+)\)/.exec(v)?.[1] ?? ""] ?? fundo(v);

export const CHECAGENS_DE_MENSAGENS: Checagem[] = [
  // ── Bolha ───────────────────────────────────────────────────────────────
  c("bolha:raio", R_DS, ".bubble", "border-radius", ESTILO, (v) => raio(v)),
  c("bolha:texto", R_DS, ".bubble", "font-size", ESTILO, tamanho),
  c("bolha:padding", R_DS, ".bubble", "padding", ESTILO, quatroLados),
  c("bolha:canto-entrada", R_DS, ".row.in .bubble", "border-bottom-left-radius", ESTILO, (v) => (px(v) === 6 ? "rounded-bl-bubble-tail" : "?")),
  c("bolha:canto-entrada-bloco", R_DS, ".row.in:not(.first) .bubble", "border-top-left-radius", ESTILO, (v) => (px(v) === 6 ? "rounded-tl-bubble-tail" : "?")),
  c("bolha:canto-saida", R_DS, ".row.mine .bubble", "border-bottom-right-radius", ESTILO, (v) => (px(v) === 6 ? "rounded-br-bubble-tail" : "?")),
  c("bolha:canto-saida-bloco", R_DS, ".row.mine:not(.first) .bubble", "border-top-right-radius", ESTILO, (v) => (px(v) === 6 ? "rounded-tr-bubble-tail" : "?")),
  c("bolha:entrada-borda", R_DS, ".b-in", "border", ESTILO, borda),
  c("bolha:saida-fundo", R_DS, ".b-out", "background", ESTILO, fundoDaBolha),
  c("bolha:ia-fundo", R_DS, ".b-ai", "background", ESTILO, fundoDaBolha),
  c("bolha:ia-borda", R_DS, ".b-ai", "border", ESTILO, (v) => `border-accent/${/(\d+)%/.exec(v)?.[1]}`),
  c("bolha:nota-fundo", R_DS, ".b-note", "background", ESTILO, fundoDaBolha),
  c("bolha:nota-borda", R_DS, ".b-note", "border", ESTILO, borda),
  c("bolha:apagada-borda", R_DS, ".deleted", "border", ESTILO, borda),
  c("bolha:apagada-texto", R_DS, ".deleted", "color", ESTILO, (v) => [texto(v), "italic"]),
  c("bolha:falhou", R_DS, ".failed", "box-shadow", ESTILO, (v) => `shadow-[${v.replace("var(--crit)", "var(--color-error)").replace(/\s+/g, "_")}]`),
  c("bolha:sem-texto", R_DS, ".no-text", "padding-bottom", ESTILO, (v) => `pb-${px(v) / 4}`),
  c("bolha:so-midia", R_DS, ".media-only", "padding", ESTILO, preenchimento),
  c("bolha:figurinha", R_MAIN, ".bubble.sticker-b", "padding", ESTILO, (v) => `pb-${px(v.split(" ")[2]!) / 4}`),
  c("bolha:linha-max", R_MAIN, ".row", "max-width", ESTILO, (v) => `max-w-[${v.replace(/\s+/g, "")}]`),
  c("bolha:bloco-respiro", R_MAIN, ".row.first", "margin-top", ESTILO, (v) => `pt-${px(v) / 4}`),
  // ── Nome, hora e status ─────────────────────────────────────────────────
  c("autor:tamanho", R_DS, ".who", "font-size", ESTILO, tamanho),
  c("autor:peso", R_DS, ".who", "font-weight", ESTILO, peso),
  c("autor:ia", R_DS, ".who.ai", "color", ESTILO, texto),
  c("autor:nota", R_DS, ".who.note", "color", ESTILO, texto),
  c("meta:tamanho", R_DS, ".meta", "font-size", META, tamanho),
  c("meta:canto", R_DS, ".meta", "right", ESTILO, (v) => `right-${px(v) / 4}`),
  c("meta:baixo", R_DS, ".meta", "bottom", ESTILO, (v) => `bottom-${px(v) / 4}`),
  c("meta:lida", R_DS, ".meta .read", "color", META, (v) => `${texto(v)}`),
  c("meta:sobre-midia", R_DS, ".media-only .meta", "border-radius", ESTILO, (v) => `rounded-[${px(v)}px]`),
  c("meta:sobre-midia-canto", R_DS, ".media-only .meta", "right", ESTILO, (v) => `right-${px(v) / 4}`),
  c("falha:linha", R_DS, ".fail-row", "color", FALHA, texto),
  c("falha:acao", R_DS, ".fail-row u", "color", FALHA, texto),
  // ── Citação, mídia, áudio, documento, contato ───────────────────────────
  c("citacao:raio", R_DS, ".quote", "border-radius", CITACAO, (v) => `rounded-[${px(v)}px]`),
  c("citacao:fundo", R_DS, ".quote", "background", CITACAO, fundoDaBolha),
  c("citacao:texto", R_DS, ".quote", "font-size", CITACAO, tamanho),
  c("citacao:autor", R_DS, ".quote b", "color", CITACAO, texto),
  c("citacao:trecho", R_DS, ".quote span", "color", CITACAO, texto),
  c("midia:largura", R_DS, ".media", "width", IMAGEM, largura),
  c("midia:raio", R_DS, ".media", "border-radius", IMAGEM, (v) => `rounded-[${px(v)}px]`),
  c("audio:largura", R_DS, ".audio", "width", AUDIO, largura),
  c("audio:vao", R_DS, ".audio", "gap", AUDIO, vao),
  c("audio:play", R_DS, ".play", "width", AUDIO, (v) => `size-${px(v) / 4}`),
  c("audio:play-fundo", R_DS, ".play", "background", AUDIO, fundo),
  c("audio:onda", R_DS, ".wave", "height", AUDIO, altura),
  c("audio:ouvido", R_DS, ".wave i.p", "background", AUDIO, (v) => [fundo(v), "dark:bg-(image:--pele-grad)"]),
  c("audio:transcricao", R_DS, ".tr", "color", TRANSCRICAO, texto),
  c("doc:largura", R_DS, ".doc", "width", DOC, largura),
  c("doc:fundo", R_DS, ".doc", "background", DOC, fundoDaBolha),
  c("doc:icone", R_DS, ".doc-ic", "background", DOC, fundo),
  c("doc:icone-altura", R_DS, ".doc-ic", "height", DOC, altura),
  c("contato:largura", R_MAIN, ".vcard", "width", CONTATO, largura),
  c("contato:acao", R_MAIN, ".vcard-btn", "color", CONTATO, texto),
  // ── Marcadores ──────────────────────────────────────────────────────────
  c("dia:raio", R_DS, ".day", "border-radius", LINHA, (v) => raio(v)),
  c("dia:padding", R_DS, ".day", "padding", LINHA, (v) => {
    const [y, x] = v.split(" ").map((p) => px(p) / 4);
    return [`py-${y}`, `px-${x}`];
  }),
  c("dia:cor", R_DS, ".day", "color", LINHA, texto),
  c("novas:cor", R_DS, ".newdiv", "color", LINHA, texto),
  c("novas:vao", R_DS, ".newdiv", "gap", LINHA, vao),
  c("passagem:raio", R_MAIN, ".handoff", "border-radius", PASSAGEM, (v) => raio(v)),
  c("passagem:cabeca", R_MAIN, ".handoff-head", "background", PASSAGEM, fundo),
  c("passagem:cabeca-texto", R_MAIN, ".handoff-head", "color", PASSAGEM, texto),
  // ── Selo do canal ───────────────────────────────────────────────────────
  c("canal:whatsapp", R_MAIN, ".chan-wa", "background", CANAL, fundoLiteral),
  c("canal:instagram", R_MAIN, ".chan-ig", "background", CANAL, fundoLiteral),
];
