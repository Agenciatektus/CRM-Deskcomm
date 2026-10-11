/**
 * O mapa protótipo x CRM em forma de dado, para a vitrine `/app/design-system`
 * marcar, em CADA amostra e componente, o que difere. A versão legível, com
 * valores e propostas, é `docs/design/design-system/mapa-de-tokens.md`; este
 * arquivo guarda o status por tema, o valor do protótipo quando difere e onde o
 * equivalente mora. Se os dois divergirem, o documento é a fonte.
 *
 * Status:
 *  - `igual`: o CRM já entrega o valor do protótipo (sem selo);
 *  - `diferente`: existe nos dois, com valor ou forma diferente. `proto` traz o
 *    valor do protótipo para a vitrine mostrar ao lado do atual;
 *  - `novo`: o protótipo tem, o CRM não tinha, e esta etapa CRIOU (token ou
 *    componente que existe, mas nenhuma tela usa ainda);
 *  - `falta`: o protótipo tem e o CRM continua sem;
 *  - `sem-equivalente`: só o CRM tem (o protótipo não desenhou).
 */
export type StatusDoMapa = "igual" | "diferente" | "novo" | "falta" | "sem-equivalente";

export interface RefDoPrototipo {
  seletor: string;
  arquivo: "Main.dc.html" | "MainVerdash.dc.html" | "DesignSystem.dc.html" | "DesignSystemVerdash.dc.html";
  linha: number;
}

export interface ItemDoMapa {
  claro: StatusDoMapa;
  escuro: StatusDoMapa;
  ref: RefDoPrototipo | null;
  /** Onde o equivalente mora no quadro escuro, quando é outro arquivo. */
  refEscuro?: RefDoPrototipo;
  /** O valor do protótipo, por tema, onde o status é `diferente`. */
  proto?: { claro?: string; escuro?: string };
}

const M = "Main.dc.html" as const;
const V = "MainVerdash.dc.html" as const;
const D = "DesignSystem.dc.html" as const;
const DV = "DesignSystemVerdash.dc.html" as const;

const r = (seletor: string, linha: number, arquivo: RefDoPrototipo["arquivo"] = M): RefDoPrototipo => ({
  seletor,
  arquivo,
  linha,
});
const os = (claro: StatusDoMapa, escuro: StatusDoMapa = claro) => ({ claro, escuro });

export const MAPA = {
  // ── Cor: uma entrada por token, para o selo cair na amostra certa ──────
  "cor:bg": { ...os("igual"), ref: r("--chrome", 20) },
  "cor:surface": { ...os("igual"), ref: r("--surface", 21) },
  "cor:surface-elevated": { ...os("igual"), ref: r("--surface-2", 22) },
  "cor:thread": { ...os("igual"), ref: r("--thread", 23) },
  "cor:hover": { ...os("igual"), ref: r("--hover", 29) },
  "cor:tint": { ...os("igual"), ref: r("--tint", 37) },
  "cor:text": { ...os("igual"), ref: r("--ink", 24) },
  "cor:text-muted": { ...os("igual"), ref: r("--ink-2", 25) },
  "cor:text-subtle": { ...os("igual"), ref: r("--ink-3", 26) },
  "cor:border": { ...os("igual"), ref: r("--line", 27) },
  "cor:border-strong": { ...os("igual"), ref: r("--line-2", 28) },
  "cor:accent": { ...os("igual"), ref: r("--accent", 741) },
  "cor:accent-hover": { ...os("igual", "diferente"), ref: r(".btn-primary:hover", 281), proto: { escuro: "--grad, brightness(1.1)" } },
  "cor:accent-fg": { ...os("igual", "diferente"), ref: r("--accent-fg", 30), proto: { escuro: "#f8f8f8" } },
  "cor:accent-soft": { ...os("igual"), ref: r("--accent-soft", 31) },
  "cor:accent-soft-2": { ...os("igual"), ref: r("--accent-soft-2", 32) },
  "cor:accent-text": { ...os("igual"), ref: r("--accent-text", 33) },
  "cor:success-bg": { ...os("igual"), ref: r("--ok-bg", 38) },
  "cor:success-fg": { ...os("igual"), ref: r("--ok", 38) },
  "cor:warning-bg": { ...os("igual"), ref: r("--warn-bg", 39) },
  "cor:warning-fg": { ...os("igual"), ref: r("--warn", 39) },
  "cor:warning-line": { ...os("igual"), ref: r("--warn-line", 39) },
  "cor:error-bg": { ...os("igual"), ref: r("--crit-bg", 40) },
  "cor:error-fg": { ...os("igual"), ref: r("--crit", 40) },
  "cor:info-bg": { ...os("igual"), ref: r("--info-bg", 41) },
  "cor:info-fg": { ...os("igual"), ref: r("--info", 41) },
  "cor:avatar": { ...os("igual"), ref: r("--av1..--av6", 47) },
  "cor:pele-grad": { ...os("igual"), ref: r("--grad", 765, V) },
  "cor:pele-grad-hover": { ...os("sem-equivalente"), ref: null },
  "cor:pele-foco": { ...os("igual"), ref: r(":focus-visible", 815, V) },
  // ── Tipografia ─────────────────────────────────────────────────────────
  "tipo:familia": { ...os("igual"), ref: r(".app font-family", 53) },
  "tipo:mono": { ...os("igual"), ref: r(".mono", 101) },
  "tipo:escala": { ...os("igual"), ref: r("Tipografia", 328, D) },
  "tipo:pesos": { ...os("igual"), ref: r(".btn font-weight", 278) },
  // ── Espaço, forma, sombra, movimento ───────────────────────────────────
  "espaco:escala": { ...os("igual"), ref: r("Espaço", 345, D) },
  "espaco:linha": { ...os("igual"), ref: r("--row-py", 45) },
  "raio:escala": { ...os("igual"), ref: r("Forma", 353, D) },
  "sombra:pop": { ...os("igual"), ref: r("--shadow-pop", 42) },
  "sombra:bolha": { ...os("igual"), ref: r("--shadow-bub", 43) },
  "sombra:drop": { ...os("igual"), ref: r("--drop", 768, V) },
  "foco:anel": { ...os("igual"), ref: r(":focus-visible", 100) },
  "movimento:curva": { ...os("igual"), ref: r("--ease", 46) },
  // ── Componentes ────────────────────────────────────────────────────────
  "comp:botao-primario": { ...os("igual"), ref: r(".btn-primary", 280) },
  "comp:botao-secundario": { ...os("igual"), ref: r(".btn-ghost", 283) },
  "comp:botao-perigo": { ...os("igual"), ref: r(".btn-danger", 633) },
  "comp:botao-icone": { ...os("igual"), ref: r(".icon-btn", 158) },
  "comp:input": { ...os("igual"), ref: r(".inp", 536) },
  "comp:textarea": { ...os("igual"), ref: r(".obs", 559) },
  "comp:select-nativo": { ...os("diferente"), ref: r(".inp", 536) },
  "comp:select-radix": { ...os("igual"), ref: r(".inp", 536) },
  "comp:checkbox": { ...os("diferente"), ref: r(".chk", 626) },
  "comp:radio": { ...os("sem-equivalente"), ref: null },
  "comp:switch": { ...os("igual"), ref: r(".switch", 258) },
  "comp:chip": { ...os("igual"), ref: r(".chip", 541) },
  "comp:pilula": { ...os("igual"), ref: r(".pill", 231) },
  "comp:badge": { ...os("igual"), ref: r(".status", 270) },
  "comp:segmentado": { ...os("igual"), ref: r(".seg", 196) },
  "comp:abas": { ...os("igual"), ref: r(".pn-tab", 452) },
  "comp:card": { ...os("igual"), ref: r(".work", 169) },
  "comp:avatar": { ...os("igual"), ref: r(".av", 213) },
  "comp:selo-canal": { ...os("igual"), ref: r(".chan", 216) },
  "comp:tooltip": { ...os("sem-equivalente"), ref: null },
  "comp:popover": { ...os("diferente"), ref: r(".pop", 246), proto: { claro: "padding 6 (exceção aceita: o Popover hospeda formulário)", escuro: "padding 6 (exceção aceita: o Popover hospeda formulário)" } },
  "comp:menu": { ...os("igual"), ref: r(".ctxm / .mi", 602) },
  "comp:dialog": { ...os("igual"), ref: r(".pal / .pal-scrim", 669) },
  "comp:alert-dialog": { ...os("diferente"), ref: r(".confirm", 629) },
  "comp:sheet": { ...os("igual"), ref: r(".app.drawer-on .panel", 702) },
  "comp:toast": { ...os("diferente"), ref: r(".toast", 636) },
  "comp:skeleton": { ...os("sem-equivalente"), ref: null },
  "comp:tabela": { ...os("sem-equivalente"), ref: null },
  "comp:vazio": { ...os("diferente"), ref: r(".list-empty / .empty-teach", 240) },
  "bolha:entrada": { ...os("igual"), ref: r(".row.in .bubble", 313) },
  "bolha:saida": { ...os("igual"), ref: r(".row.out .bubble", 314) },
  "bolha:ia": { ...os("igual"), ref: r(".row.ai .bubble", 315) },
  "bolha:nota": { ...os("igual"), ref: r(".row.note .bubble", 316) },
  "bolha:dia": { ...os("igual"), ref: r(".day", 296) },
  // ── Seções dos quadros DS (DesignSystem.dc.html / DesignSystemVerdash.dc.html) ──
  "ds:cor": { ...os("igual"), ref: r("Cor", 274, D), refEscuro: r("Cor", 295, DV) },
  "ds:neutros": { ...os("igual"), ref: r("Neutros", 277, D), refEscuro: r("Neutros", 298, DV) },
  "ds:tema-escuro": { ...os("igual"), ref: r("Tema escuro (desenhado, não invertido)", 292, D), refEscuro: r("Tema escuro (desenhado, não invertido)", 298, DV) },
  "ds:atmosfera": { ...os("igual"), ref: r("Atmosfera", 292, D), refEscuro: r("Atmosfera", 313, DV) },
  "ds:destaque": { ...os("igual"), ref: r("Destaque", 302, D), refEscuro: r("Destaque", 321, DV) },
  "ds:estados": { ...os("igual"), ref: r("Estados", 316, D), refEscuro: r("Estados", 335, DV) },
  "ds:tipografia": { ...os("igual"), ref: r("Tipografia", 328, D), refEscuro: r("Tipografia", 347, DV) },
  "ds:espaco": { ...os("igual"), ref: r("Espaço", 345, D), refEscuro: r("Espaço", 364, DV) },
  "ds:forma": { ...os("igual"), ref: r("Forma", 353, D), refEscuro: r("Forma", 372, DV) },
  "ds:navegacao": { ...os("diferente"), ref: r("Navegação em 2 colunas", 362, D), refEscuro: r("Navegação em 2 colunas", 381, DV) },
  "ds:modulos": { ...os("diferente"), ref: r("Módulos e páginas", 382, D), refEscuro: r("Módulos e páginas", 401, DV) },
  "ds:componentes": { ...os("igual"), ref: r("Componentes básicos", 397, D), refEscuro: r("Componentes básicos", 416, DV) },
  "ds:botoes": { ...os("igual"), ref: r("Botões", 400, D), refEscuro: r("Botões", 419, DV) },
  "ds:indicadores": { ...os("igual"), ref: r("Indicadores e pílulas", 412, D), refEscuro: r("Indicadores e pílulas", 431, DV) },
  "ds:navegacao-campos": { ...os("igual"), ref: r("Navegação e campos", 420, D), refEscuro: r("Navegação e campos", 439, DV) },
  "ds:mensagens": { ...os("igual"), ref: r("Mensagens", 431, D), refEscuro: r("Mensagens", 450, DV) },
  "ds:tipos": { ...os("diferente"), ref: r("Tipos cobertos", 448, D), refEscuro: r("Tipos cobertos", 467, DV), proto: { claro: "nome do colega no rótulo e páginas do documento (dado que o CRM não guarda)", escuro: "nome do colega no rótulo e páginas do documento (dado que o CRM não guarda)" } },
  "ds:coluna-do-lead": { ...os("diferente"), ref: r("Coluna do lead", 466, D), refEscuro: r("Coluna do lead", 485, DV) },
  "ds:seletor-de-data": { ...os("diferente"), ref: r("Seletor de data e horário", 479, D), refEscuro: r("Seletor de data e horário", 498, DV) },
  "ds:negocio": { ...os("igual"), ref: r("Negócio (aba Negócios)", 490, D), refEscuro: r("Negócio (aba Negócios)", 509, DV) },
  "ds:menus": { ...os("diferente"), ref: r("Menus, avisos e busca", 502, D), refEscuro: r("Menus, avisos e busca", 521, DV) },
  "ds:menu-da-conversa": { ...os("diferente"), ref: r("Menu da conversa", 505, D), refEscuro: r("Menu da conversa", 524, DV) },
  "ds:central-de-avisos": { ...os("igual"), ref: r("Central de avisos (sino)", 520, D), refEscuro: r("Central de avisos (sino)", 539, DV) },
  "ds:busca-geral": { ...os("igual"), ref: r("Busca geral (Ctrl K)", 530, D), refEscuro: r("Busca geral (Ctrl K)", 549, DV) },
  "ds:retorno": { ...os("diferente"), ref: r("Retorno e redimensionamento", 545, D), refEscuro: r("Retorno e redimensionamento", 564, DV) },
  "ds:aviso-desfazer": { ...os("diferente"), ref: r("Aviso com Desfazer", 548, D), refEscuro: r("Aviso com Desfazer", 567, DV) },
  "ds:divisorias": { ...os("igual"), ref: r("Divisórias reguláveis", 553, D), refEscuro: r("Divisórias reguláveis", 572, DV) },
  "ds:layout": { ...os("diferente"), ref: r("Layout da Inbox", 561, D), refEscuro: r("Layout da Inbox", 580, DV) },
  "ds:regras": { ...os("diferente"), ref: r("Regras que aprendemos no protótipo", 580, D), refEscuro: r("Regras que aprendemos no protótipo", 599, DV) },
} satisfies Record<string, ItemDoMapa>;

export type IdDoMapa = keyof typeof MAPA;
