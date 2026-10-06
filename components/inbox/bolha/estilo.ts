import { cn } from "@/lib/utils";

/**
 * O VISUAL DA BOLHA, num lugar só (visual v2, fase 3.5).
 *
 * O Peterson reclamou dos balões "de todo tipo de mensagem", e o defeito era
 * de espaçamento e de leitura, não de um tipo só: a bolha enviada era o accent
 * CHEIO com texto branco (ilegível no escuro e cansativo no claro), o menu
 * reservava uma coluna de 32px à direita de toda bolha e a hora ocupava uma
 * linha inteira embaixo do texto. Aqui ficam as decisões que valem para todos
 * os tipos, com os tokens do CRM — nada de hex, para o tema escuro e a marca
 * própria (que troca o accent) continuarem valendo.
 */

/** Quem fala decide a cor; apagada e figurinha são formas, não autores. */
export type TomDaBolha = "entrada" | "saida" | "ia" | "apagada" | "figurinha";

/** Onde a hora fica: no fim do texto, sobre a imagem, ou numa linha própria. */
export type ModoDaMeta = "no-texto" | "sobre-midia" | "abaixo";

/**
 * Texto no tom do accent com contraste AA nos dois temas: a parada 700 no
 * claro e a 300 no escuro. O `text-accent` puro (parada 600) fica abaixo de
 * 4.5:1 em letra pequena sobre o fundo claro do fio.
 */
export const TEXTO_ACCENT = "text-accent-700 dark:text-accent-300";

const TOM: Record<TomDaBolha, string> = {
  entrada: "border border-border bg-surface text-text shadow-xs",
  // Accent SUAVE com texto escuro, no lugar do accent cheio com texto branco:
  // legível nos dois temas e ainda inconfundível como "nosso lado".
  saida: "bg-accent-soft text-text shadow-xs dark:bg-accent/25",
  // A IA fala do nosso lado, mas não é uma pessoa: borda do accent e fundo
  // quase neutro, para quem lê saber de relance o que foi automático.
  ia: "border border-accent/35 bg-accent/5 text-text shadow-xs dark:bg-accent/10",
  apagada: "border border-dashed border-border-strong bg-transparent text-text-subtle shadow-none",
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
    "relative min-w-0 max-w-full text-sm leading-normal",
    TOM[f.tom],
    f.tom === "figurinha" ? "p-0" : f.modoMeta === "sobre-midia" ? "p-1" : "px-3 py-1.5",
    f.tom !== "figurinha" && "rounded-2xl",
    // O canto achatado fica do lado de quem fala, sempre embaixo; em cima só
    // quando a bolha continua um bloco, para o bloco ler como uma fala só.
    f.tom !== "figurinha" &&
      (f.saida
        ? cn("rounded-br-md", !f.inicio && "rounded-tr-md")
        : cn("rounded-bl-md", !f.inicio && "rounded-tl-md")),
    // Sem coluna reservada para o menu onde há mouse: a setinha aparece por
    // cima, no hover. No toque ela fica sempre visível, então ali a bolha
    // abre espaço para ela não cobrir o fim da primeira linha.
    f.temMenu && f.tom !== "figurinha" && "[@media(hover:none)]:pr-8",
    // Falha é CONTORNO e não fundo: a cor continua dizendo de quem é a
    // mensagem, e o anel não disputa com o anel da busca (que é `ring`).
    f.falhou && "outline-2 -outline-offset-2 outline-error",
    // A marca da busca é ANEL, não cor de fundo: o fundo já diz de quem é a
    // mensagem, e trocá-lo apagaria essa leitura justo na bolha achada.
    f.busca && "ring-2 ring-text ring-offset-2 ring-offset-bg",
  );
}

/** A cor da hora e dos tiques, por tom. */
export function corDaMeta(tom: TomDaBolha, modo: ModoDaMeta): string {
  if (modo === "sobre-midia") return "rounded-md bg-neutral-950/60 px-1.5 py-1 text-neutral-50 backdrop-blur-sm";
  return tom === "saida" ? "text-text-muted" : "text-text-subtle";
}
