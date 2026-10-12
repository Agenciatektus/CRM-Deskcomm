/**
 * Leitor do protótipo MOBILE (`docs/design/mobile/MobileVerdash.dc.html`, versão 37 do
 * artefato de Design aprovado pelo Peterson). Tudo aqui LÊ o arquivo: nenhum valor do
 * protótipo é transcrito à mão, para que mudar o protótipo mude o resultado do teste.
 *
 * Reaproveita o leitor de CSS da paridade desktop (`tests/unit/paridade/leitor.ts`).
 */
import { decl, estiloDoHtml, ler, px, regras } from "../paridade/leitor";

export const CAMINHO_DO_PROTOTIPO = "docs/design/mobile/MobileVerdash.dc.html";

export const HTML_MOBILE = ler(CAMINHO_DO_PROTOTIPO);
export const R_MOBILE = regras(estiloDoHtml(HTML_MOBILE));

export type Tema = "claro" | "escuro";

/** Tokens do protótipo: o claro é `.mb` (marca do revendedor), o escuro é `.mb.dark` (pele Verdash). */
export function tokensDoMobile(tema: Tema): Record<string, string> {
  const claro = R_MOBILE.get(".mb");
  if (!claro) throw new Error("protótipo mobile: bloco .mb sumiu");
  if (tema === "claro") return claro;
  const escuro = R_MOBILE.get(".mb.dark");
  if (!escuro) throw new Error("protótipo mobile: bloco .mb.dark sumiu");
  return { ...claro, ...escuro };
}

/** As abas da barra inferior, na ordem: `const TABS = [['conversas', 'Conversas', ...], ...]`. */
export function abasDoPrototipo(): string[] {
  const i = HTML_MOBILE.indexOf("const TABS = [");
  if (i < 0) throw new Error("protótipo mobile: lista TABS sumiu");
  const linha = HTML_MOBILE.slice(i, HTML_MOBILE.indexOf("\n", i));
  return [...linha.matchAll(/\['[a-z]+',\s*'([^']+)'/g)].map((m) => m[1]!);
}

/** As 11 telas do quadro, pelo nome que o protótipo dá a cada aparelho. */
export function telasDoPrototipo(): string[] {
  const i = HTML_MOBILE.indexOf("\n  starts() {");
  if (i < 0) throw new Error("protótipo mobile: starts() sumiu");
  const corpo = HTML_MOBILE.slice(i, HTML_MOBILE.indexOf("\n  }\n", i));
  return [...corpo.matchAll(/\{ n: '\d+', t: '([^']+)'/g)].map((m) => m[1]!);
}

/** `repeat(5, minmax(0, 1fr))` -> 5. */
export function colunasDoRepeat(valor: string): number {
  const m = /^repeat\(\s*(\d+)\s*,/.exec(valor.trim());
  if (!m) throw new Error(`não é repeat(): ${valor}`);
  return Number(m[1]);
}

/** O primeiro número em px de um valor composto (`24px 24px 0 0` -> 24, `calc(84px + x)` -> 84). */
export function primeiroPx(valor: string): number {
  const m = /(-?[\d.]+)px/.exec(valor);
  if (!m) throw new Error(`sem px: ${valor}`);
  return Number(m[1]);
}

/** `88%` -> "88%". Lança se não for porcentagem. */
export function porcentagem(valor: string): string {
  if (!/^[\d.]+%$/.test(valor.trim())) throw new Error(`não é %: ${valor}`);
  return valor.trim();
}

/**
 * As medidas do app no celular, lidas do protótipo. A chave é o token que o CRM tem de
 * declarar em `:root` do `app/globals.css` (ver o contrato em `contrato.ts`).
 */
export function medidasDoPrototipo(): Record<string, string> {
  const d = (sel: string, prop: string) => decl(R_MOBILE, sel, prop);
  const p = (sel: string, prop: string) => `${px(d(sel, prop))}px`;
  const p1 = (sel: string, prop: string) => `${primeiroPx(d(sel, prop))}px`;
  return {
    "--mb-alvo": p(".ib", "width"),
    "--mb-abas-colunas": String(colunasDoRepeat(d(".tb", "grid-template-columns"))),
    "--mb-aba-altura": p(".tab", "min-height"),
    "--mb-aba-fonte": p(".tab", "font-size"),
    "--mb-aba-pilula-largura": p(".tab-pill", "width"),
    "--mb-aba-pilula-altura": p(".tab-pill", "height"),
    "--mb-aba-pilula-raio": p(".tab-pill", "border-radius"),
    "--mb-aba-contador": p(".tb-badge", "height"),
    "--mb-titulo-fonte": p(".lt h2", "font-size"),
    "--mb-titulo-altura": p(".lt", "min-height"),
    "--mb-barra-altura": p(".nb", "min-height"),
    "--mb-busca-altura": p(".sf", "min-height"),
    "--mb-busca-raio": p(".sf", "border-radius"),
    "--mb-chip-altura": p(".chip", "height"),
    "--mb-avatar-lista": p(".av", "width"),
    "--mb-linha-nome": p(".cv-name", "font-size"),
    "--mb-linha-previa": p(".cv-prev", "font-size"),
    "--mb-acao-gesto": p(".sw-a", "width"),
    "--mb-folha-raio": p1(".sheet", "border-radius"),
    "--mb-folha-max": porcentagem(d(".sheet", "max-height")),
    "--mb-folha-item": p(".si", "min-height"),
    "--mb-pegador-largura": p(".grab", "width"),
    "--mb-pegador-altura": p(".grab", "height"),
    "--mb-fab": p(".fab", "width"),
    "--mb-fab-raio": p(".fab", "border-radius"),
    "--mb-fab-margem": p(".fab", "right"),
    "--mb-fab-acima": p1(".fab", "bottom"),
    "--mb-campo-fonte": p(".cmp-in", "font-size"),
  };
}

/**
 * Alvos de toque: todo controle do protótipo tem pelo menos 44px na menor dimensão
 * declarada (o `.chip` tem 36 e ganha 4px em cima e embaixo pelo `::after`).
 */
export const ALVOS_DE_TOQUE: { seletor: string; prop: string; extra?: string }[] = [
  { seletor: ".ib", prop: "height" },
  { seletor: ".btn", prop: "min-height" },
  { seletor: ".btn-sm", prop: "min-height" },
  { seletor: ".nb-back", prop: "min-height" },
  { seletor: ".sf", prop: "min-height" },
  { seletor: ".send", prop: "height" },
  { seletor: ".cmp-box", prop: "min-height" },
  { seletor: ".ptab", prop: "min-height" },
  { seletor: ".stab", prop: "min-height" },
  { seletor: ".tab", prop: "min-height" },
  { seletor: ".aud-play", prop: "height" },
  { seletor: ".toast button", prop: "min-height" },
  { seletor: ".tk-chk", prop: "height" },
  { seletor: ".chip", prop: "height", extra: ".chip::after" },
];

/** Campos de texto: 16px, senão o Safari do iPhone dá zoom no foco. */
export const CAMPOS_16PX = [".cmp-in", ".bs-in input", ".ta", ".sf"];
