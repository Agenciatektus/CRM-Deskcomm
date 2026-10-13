import { cn } from "@/lib/utils";

/**
 * O VISUAL DA BOLHA, num lugar só: o `.bubble` do quadro DS (DesignSystem.dc.html,
 * "Mensagens") e do Main.dc.html, com os tokens do CRM — nada de hex, para o
 * tema escuro e a marca própria (que troca o accent) continuarem valendo.
 *
 * Raio 18 com 6 no canto de quem enviou; mensagens seguidas da mesma pessoa se
 * agrupam (6 também no canto de cima, a partir da segunda). Texto 15/1,42.
 * `tests/unit/paridade-com-o-prototipo.test.ts` confere estas classes contra o
 * protótipo.
 */

/** Quem fala decide a cor; apagada e figurinha são formas, não autores. */
export type TomDaBolha = "entrada" | "saida" | "ia" | "nota" | "apagada" | "figurinha";

/** Onde a hora fica: no fim do texto, sobre a imagem, ou no canto de baixo com espaço reservado. */
export type ModoDaMeta = "no-texto" | "sobre-midia" | "abaixo";

/** Texto no tom da marca com contraste AA nos dois temas (`--accent-text` do quadro). */
export const TEXTO_ACCENT = "text-accent-text";

/** A linha do fio: respiro de bloco (14 na primeira fala, 2 nas seguintes) e largura máxima. */
export function classesDaLinha(f: { inicio: boolean; saida: boolean }): string {
  return cn(
    "group flex w-full min-w-0 px-2.5 lg:px-7",
    f.inicio ? "pt-3.5" : "pt-0.5",
    f.saida ? "justify-end" : "justify-start",
  );
}

/** A coluna da fala (nome + bolha): 80% do fio, no máximo 580px. */
// `mb:max-w-[84%]`: no celular o balão ocupa a largura do protótipo (o `.bub`, 84%).
export const COLUNA_DA_FALA = "flex min-w-0 max-w-[min(80%,580px)] mb:max-w-[84%] flex-col";

/** `.who`: o nome acima da primeira bolha do bloco, 12/700, na cor do autor. */
export function classesDoAutor(tom: "pessoa" | "ia" | "nota"): string {
  return cn(
    "mx-2 mb-1 flex items-center gap-1.25 text-meta font-bold",
    tom === "ia" ? "text-accent-text" : tom === "nota" ? "text-warning-fg" : "text-text-subtle",
  );
}

const TOM: Record<TomDaBolha, string> = {
  // `--bub-in`: superfície com borda (no escuro, surface-2).
  entrada: "border border-border bg-bubble-in text-text",
  // `--bub-out`: 15% da marca na superfície (30% no escuro).
  saida: "pele-bolha-saida bg-bubble-out text-text",
  // `--bub-ai`: 7% da marca, borda de 26% (no escuro, a borda é o degradê).
  ia: "pele-bolha-ia border border-accent/26 bg-bubble-ai text-text",
  // `.b-note`: fundo de aviso com borda tracejada, sem sombra.
  nota: "border border-dashed border-warning-line bg-warning-bg text-text shadow-none",
  // `.deleted`: sem fundo, tracejada, itálico em ink-3.
  apagada: "border border-dashed border-border-strong bg-transparent text-text-subtle italic shadow-none",
  // Figurinha não tem balão; a hora fica embaixo dela.
  figurinha: "bg-transparent shadow-none",
};

export function classesDaBolha(f: {
  tom: TomDaBolha;
  saida: boolean;
  inicio: boolean;
  falhou: boolean;
  busca: boolean;
  temMenu: boolean;
  modoMeta: ModoDaMeta;
}): string {
  return cn(
    "relative min-w-0 max-w-full text-message wrap-anywhere shadow-bubble",
    TOM[f.tom],
    f.tom === "figurinha"
      ? "pb-5.5"
      : f.modoMeta === "sobre-midia"
        ? "p-1"
        : cn("pb-1.75 pl-3 pr-2.75 pt-1.75", f.modoMeta === "abaixo" && "pb-6"),
    f.tom !== "figurinha" && "rounded-bubble",
    // O canto achatado fica do lado de quem fala, sempre embaixo; em cima só
    // quando a bolha continua um bloco, para o bloco ler como uma fala só.
    f.tom !== "figurinha" &&
      (f.saida
        ? cn("rounded-br-bubble-tail", !f.inicio && "rounded-tr-bubble-tail")
        : cn("rounded-bl-bubble-tail", !f.inicio && "rounded-tl-bubble-tail")),
    // Sem coluna reservada para o menu onde há mouse: a setinha aparece por
    // cima, no hover. No toque ela fica sempre visível, então ali a bolha
    // abre espaço para ela não cobrir o fim da primeira linha.
    f.temMenu && f.tom !== "figurinha" && "[@media(hover:none)]:pr-8",
    // `.failed`: anel de 1,5px em crit por DENTRO; a cor continua dizendo de quem é.
    f.falhou && "shadow-[inset_0_0_0_1.5px_var(--color-error)]",
    // A marca da busca é ANEL, não cor de fundo: o fundo já diz de quem é a
    // mensagem, e trocá-lo apagaria essa leitura justo na bolha achada.
    f.busca && "ring-2 ring-text ring-offset-2 ring-offset-bg",
  );
}

/** A cor da hora e dos tiques, por tom (`.meta`; na enviada, ink-2 a 85% com a marca). */
export function corDaMeta(tom: TomDaBolha, modo: ModoDaMeta): string {
  if (modo === "sobre-midia") {
    return "rounded-[9px] bg-[oklch(0.15_0.01_260/0.62)] px-1.75 py-1 text-white backdrop-blur-[4px]";
  }
  return tom === "saida" ? "text-[color-mix(in_oklch,var(--color-text-muted)_85%,var(--color-accent))]" : "text-text-subtle";
}

/** Onde a meta mora dentro da bolha (`.meta` e `.media-only .meta`). */
export function posicaoDaMeta(tom: TomDaBolha, modo: ModoDaMeta): string {
  if (modo === "sobre-midia") return "absolute bottom-3 right-3";
  if (tom === "figurinha") return "absolute bottom-0 right-1";
  return "absolute bottom-1.5 right-2.5";
}
