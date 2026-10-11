/**
 * O mapa protótipo x CRM em forma de dado, para a vitrine `/app/design-system`
 * marcar o que está diferente. A versão legível, com valores e propostas, é
 * `docs/design/design-system/mapa-de-tokens.md`; este arquivo guarda só o
 * STATUS por tema e onde o equivalente mora no protótipo. Se os dois
 * divergirem, o documento é a fonte e este arquivo é que está atrasado.
 *
 * Status:
 *  - `igual`: o CRM já entrega o valor do protótipo;
 *  - `diferente`: existe nos dois, com valor ou forma diferente (proposta no doc);
 *  - `falta`: o protótipo tem e o CRM não tinha. Os tokens criados nesta etapa
 *    continuam `falta` até alguma tela consumi-los;
 *  - `sem-equivalente`: só o CRM tem (o protótipo não desenhou).
 */
export type StatusDoMapa = "igual" | "diferente" | "falta" | "sem-equivalente";

export interface RefDoPrototipo {
  seletor: string;
  arquivo: "Main.dc.html" | "MainVerdash.dc.html" | "DesignSystem.dc.html";
  linha: number;
}

export interface ItemDoMapa {
  claro: StatusDoMapa;
  escuro: StatusDoMapa;
  ref: RefDoPrototipo | null;
}

const M = "Main.dc.html" as const;
const V = "MainVerdash.dc.html" as const;
const D = "DesignSystem.dc.html" as const;

const r = (seletor: string, linha: number, arquivo: RefDoPrototipo["arquivo"] = M): RefDoPrototipo => ({
  seletor,
  arquivo,
  linha,
});
const os = (claro: StatusDoMapa, escuro: StatusDoMapa = claro) => ({ claro, escuro });

export const MAPA = {
  // ── Cor ────────────────────────────────────────────────────────────────
  "cor:bg": { ...os("igual"), ref: r("--chrome", 20) },
  "cor:surface": { ...os("igual"), ref: r("--surface", 21) },
  "cor:surface-elevated": { ...os("igual"), ref: r("--surface-2", 22) },
  "cor:thread": { ...os("falta"), ref: r("--thread", 23) },
  "cor:text": { ...os("igual"), ref: r("--ink", 24) },
  "cor:text-muted": { ...os("igual"), ref: r("--ink-2", 25) },
  "cor:text-subtle": { ...os("igual"), ref: r("--ink-3", 26) },
  "cor:border": { ...os("igual"), ref: r("--line", 27) },
  "cor:border-strong": { ...os("igual"), ref: r("--line-2", 28) },
  "cor:hover": { ...os("falta"), ref: r("--hover", 29) },
  "cor:accent": { ...os("diferente"), ref: r("--accent", 741) },
  "cor:accent-fg": { ...os("igual", "diferente"), ref: r("--accent-fg", 30) },
  "cor:accent-soft": { ...os("diferente", "igual"), ref: r("--accent-soft", 31) },
  "cor:accent-soft-2": { ...os("falta"), ref: r("--accent-soft-2", 32) },
  "cor:accent-text": { ...os("falta"), ref: r("--accent-text", 33) },
  "cor:tint": { ...os("falta"), ref: r("--tint", 37) },
  "cor:success": { ...os("diferente", "igual"), ref: r("--ok", 38) },
  "cor:warning": { ...os("diferente", "igual"), ref: r("--warn", 39) },
  "cor:warning-line": { ...os("falta"), ref: r("--warn-line", 39) },
  "cor:error": { ...os("diferente", "igual"), ref: r("--crit", 40) },
  "cor:info": { ...os("diferente", "igual"), ref: r("--info", 41) },
  "cor:avatar": { ...os("igual"), ref: r("--av1..--av6", 47) },
  "cor:pele-grad": { ...os("igual"), ref: r("--grad", 765, V) },
  "cor:pele-foco": { ...os("igual"), ref: r(":focus-visible", 815, V) },
  // ── Tipografia ─────────────────────────────────────────────────────────
  "tipo:familia": { ...os("diferente"), ref: r(".app font-family", 53) },
  "tipo:mono": { ...os("diferente"), ref: r(".mono", 101) },
  "tipo:escala": { ...os("falta"), ref: r("Tipografia", 328, D) },
  "tipo:pesos": { ...os("diferente"), ref: r(".btn font-weight", 278) },
  // ── Espaço, forma, sombra, movimento ───────────────────────────────────
  "espaco:escala": { ...os("igual"), ref: r("Espaço", 345, D) },
  "espaco:linha": { ...os("diferente"), ref: r("--row-py", 45) },
  "raio:escala": { ...os("diferente"), ref: r("Forma", 353, D) },
  "sombra:pop": { ...os("igual", "diferente"), ref: r("--shadow-pop", 42) },
  "sombra:bolha": { ...os("diferente"), ref: r("--shadow-bub", 43) },
  "sombra:drop": { ...os("igual"), ref: r("--drop", 768, V) },
  "foco:anel": { ...os("diferente", "igual"), ref: r(":focus-visible", 100) },
  "movimento:curva": { ...os("diferente"), ref: r("--ease", 46) },
  // ── Componentes ────────────────────────────────────────────────────────
  "comp:botao-primario": { ...os("diferente"), ref: r(".btn-primary", 280) },
  "comp:botao-secundario": { ...os("diferente"), ref: r(".btn-ghost", 283) },
  "comp:botao-perigo": { ...os("diferente"), ref: r(".btn-danger", 633) },
  "comp:botao-icone": { ...os("diferente"), ref: r(".icon-btn", 158) },
  "comp:input": { ...os("diferente"), ref: r(".inp", 536) },
  "comp:textarea": { ...os("diferente"), ref: r(".obs", 559) },
  "comp:select-nativo": { ...os("diferente"), ref: r(".inp", 536) },
  "comp:select-radix": { ...os("diferente"), ref: r(".inp", 536) },
  "comp:checkbox": { ...os("diferente"), ref: r(".chk", 626) },
  "comp:radio": { ...os("sem-equivalente"), ref: null },
  "comp:switch": { ...os("diferente", "igual"), ref: r(".switch", 258) },
  "comp:chip": { ...os("falta"), ref: r(".chip", 541) },
  "comp:pilula": { ...os("diferente"), ref: r(".pill", 231) },
  "comp:badge": { ...os("diferente"), ref: r(".status", 270) },
  "comp:segmentado": { ...os("igual"), ref: r(".seg", 196) },
  "comp:abas": { ...os("diferente"), ref: r(".pn-tab", 452) },
  "comp:card": { ...os("diferente"), ref: r(".work", 169) },
  "comp:avatar": { ...os("igual"), ref: r(".av", 213) },
  "comp:selo-canal": { ...os("diferente"), ref: r(".chan", 216) },
  "comp:tooltip": { ...os("sem-equivalente"), ref: null },
  "comp:popover": { ...os("diferente"), ref: r(".pop", 246) },
  "comp:menu": { ...os("diferente"), ref: r(".ctxm / .mi", 602) },
  "comp:dialog": { ...os("diferente"), ref: r(".pal / .pal-scrim", 669) },
  "comp:alert-dialog": { ...os("diferente"), ref: r(".confirm", 629) },
  "comp:sheet": { ...os("diferente"), ref: r(".app.drawer-on .panel", 702) },
  "comp:toast": { ...os("diferente"), ref: r(".toast", 636) },
  "comp:skeleton": { ...os("sem-equivalente"), ref: null },
  "comp:tabela": { ...os("sem-equivalente"), ref: null },
  "comp:vazio": { ...os("diferente"), ref: r(".list-empty / .empty-teach", 240) },
  "bolha:entrada": { ...os("igual", "diferente"), ref: r(".row.in .bubble", 313) },
  "bolha:saida": { ...os("diferente", "igual"), ref: r(".row.out .bubble", 314) },
  "bolha:ia": { ...os("diferente", "igual"), ref: r(".row.ai .bubble", 315) },
  "bolha:nota": { ...os("diferente"), ref: r(".row.note .bubble", 316) },
  "bolha:dia": { ...os("diferente", "igual"), ref: r(".day", 296) },
} satisfies Record<string, ItemDoMapa>;

export type IdDoMapa = keyof typeof MAPA;
