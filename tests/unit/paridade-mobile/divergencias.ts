/**
 * As divergências entre o protótipo mobile e o CRM, cada uma como `id detalhe`. O id é
 * estável (é ele que entra numa lista de exceções); o detalhe diz o valor dos dois lados.
 */
import { existsSync } from "node:fs";

import { PARES } from "../paridade/tokens";
import {
  blocoDoCrm,
  classesDoArquivo,
  coresIguais,
  decl,
  fmt,
  ler,
  lerCor,
  px,
  resolver,
} from "../paridade/leitor";
import {
  ALVOS_DO_CRM,
  CAMPOS_DO_CRM,
  CLASSES_DE_16PX,
  CLASSES_DE_44PX,
  CSS_DO_CRM,
  LAYOUT_RAIZ,
  MANIFESTO,
  PECAS,
  TELAS,
} from "./contrato";
import {
  ALVOS_DE_TOQUE,
  CAMPOS_16PX,
  R_MOBILE,
  abasDoPrototipo,
  medidasDoPrototipo,
  telasDoPrototipo,
  tokensDoMobile,
  type Tema,
} from "./leitor";

/** Tokens só do celular, que o desktop não tem: protótipo -> CRM. */
const PARES_DO_CELULAR: [string, string][] = [
  ["--bar", "--color-mb-barra"],
  ["--note-bg", "--color-note-bg"],
  ["--note-ink", "--color-note-fg"],
];

function tokensDoCrm(tema: Tema): Record<string, string> {
  const raiz = blocoDoCrm(":root");
  return tema === "claro" ? raiz : { ...raiz, ...blocoDoCrm('[data-theme="dark"]') };
}

/** Cores dos dois temas: os mesmos pares da paridade desktop, mais os do celular. */
export function divergenciasDeCor(): string[] {
  const saida: string[] = [];
  for (const tema of ["claro", "escuro"] as const) {
    const p = tokensDoMobile(tema);
    const c = tokensDoCrm(tema);
    for (const [tp, tc] of [...PARES, ...PARES_DO_CELULAR]) {
      if (p[tp] === undefined) continue;
      const esperado = lerCor(resolver(p[tp]!, p), p);
      const atual = c[tc] === undefined ? null : lerCor(resolver(c[tc]!, c), c);
      if (!atual || !coresIguais(esperado, atual)) {
        saida.push(
          `cor:${tema}:${tp} protótipo ${fmt(esperado)} x CRM ${tc}=${atual ? fmt(atual) : "ausente"}`,
        );
      }
    }
    // O accent NÃO entra: no claro ele é a marca do revendedor (o protótipo só mostra
    // um padrão), e no escuro é a pele Verdash, que a paridade desktop já confere.
  }
  return saida;
}

/** Medidas do app: cada token `--mb-*` do `:root` com o valor que o protótipo declara. */
export function divergenciasDeMedida(): string[] {
  const raiz = blocoDoCrm(":root");
  return Object.entries(medidasDoPrototipo())
    .filter(([token, valor]) => raiz[token]?.trim() !== valor)
    .map(
      ([token, valor]) => `medida:${token} protótipo ${valor} x CRM ${raiz[token] ?? "ausente"}`,
    );
}

/** O corte do celular, a área segura e o PWA instalável. */
export function divergenciasDaBase(): string[] {
  const css = ler(CSS_DO_CRM);
  const saida: string[] = [];
  const corte = /@custom-variant\s+mb\s*\(\s*@media\s*\(\s*max-width:\s*([\d.]+)px\s*\)\s*\)/.exec(
    css,
  );
  if (!corte || Number(corte[1]) >= 760 || Number(corte[1]) < 759) {
    saida.push(
      `base:corte-760 @custom-variant mb (max-width < 760px) ${corte ? `= ${corte[1]}px` : "ausente"} em ${CSS_DO_CRM}`,
    );
  }
  if (!css.includes("env(safe-area-inset-bottom"))
    saida.push(`base:area-segura env(safe-area-inset-bottom) ausente em ${CSS_DO_CRM}`);
  if (!/viewportFit:\s*["']cover["']/.test(ler(LAYOUT_RAIZ)))
    saida.push(`base:viewport-cover viewportFit "cover" ausente em ${LAYOUT_RAIZ}`);
  const manifesto = ler(MANIFESTO);
  for (const campo of ["theme_color", "background_color", "orientation"]) {
    if (!manifesto.includes(campo)) saida.push(`pwa:${campo} ausente em ${MANIFESTO}`);
  }
  if (!/purpose:\s*["'][^"']*maskable/.test(manifesto))
    saida.push(`pwa:icone-maskable ícone com purpose "maskable" ausente em ${MANIFESTO}`);
  return saida;
}

/** Barra inferior: as abas do protótipo, na ordem, na peça do CRM. */
export function divergenciasDaBarra(): string[] {
  const peca = PECAS.find((p) => p.id === "barra-inferior")!;
  if (!existsSync(peca.arquivo))
    return [`barra:abas ${peca.arquivo} ausente (abas ${abasDoPrototipo().join(", ")})`];
  const src = ler(peca.arquivo);
  const posicoes = abasDoPrototipo().map((a) => ({ a, i: src.indexOf(`"${a}"`) }));
  const faltam = posicoes.filter((p) => p.i < 0).map((p) => p.a);
  if (faltam.length > 0) return [`barra:abas faltam ${faltam.join(", ")} em ${peca.arquivo}`];
  const ordem = [...posicoes].sort((x, y) => x.i - y.i).map((p) => p.a);
  return ordem.join() === abasDoPrototipo().join()
    ? []
    : [`barra:ordem ${ordem.join(", ")} x protótipo ${abasDoPrototipo().join(", ")}`];
}

/** Peças e telas: o arquivo existe e a peça cita o token da própria medida. */
export function divergenciasDePecas(): string[] {
  const saida: string[] = [];
  for (const p of PECAS) {
    if (!existsSync(p.arquivo)) {
      saida.push(`peca:${p.id} ${p.arquivo} ausente`);
      continue;
    }
    const src = ler(p.arquivo);
    const faltam = p.tokens.filter((t) => !src.includes(t));
    if (faltam.length > 0) saida.push(`peca:${p.id} não usa ${faltam.join(", ")} em ${p.arquivo}`);
  }
  for (const nome of telasDoPrototipo()) {
    const arquivo = TELAS[nome];
    if (!arquivo) saida.push(`tela:${nome} sem arquivo no contrato`);
    else if (!existsSync(arquivo)) saida.push(`tela:${nome} ${arquivo} ausente`);
  }
  return saida;
}

/** Campos com 16px e controles da casca com 44px no celular. */
export function divergenciasDeToque(): string[] {
  const saida: string[] = [];
  for (const arquivo of CAMPOS_DO_CRM) {
    const classes = classesDoArquivo(arquivo);
    if (!CLASSES_DE_16PX.some((c) => classes.has(c)))
      saida.push(`toque:campo-16px ${arquivo} sem ${CLASSES_DE_16PX.join(" | ")}`);
  }
  for (const { arquivo, marcador } of ALVOS_DO_CRM) {
    const src = ler(arquivo);
    const i = src.indexOf(marcador);
    // As classes do controle: o trecho em volta do marcador (o gatilho e o elemento dele).
    const trecho = i < 0 ? src : src.slice(Math.max(0, i - 900), i + 1200);
    if (!CLASSES_DE_44PX.some((c) => trecho.split(/[\s"'`]+/).includes(c))) {
      saida.push(`toque:alvo-44 ${arquivo} (${marcador}) sem ${CLASSES_DE_44PX.join(" | ")}`);
    }
  }
  return saida;
}

/**
 * Sanidade do PRÓPRIO protótipo (a regra que ele promete): alvos de 44px e campos de 16px.
 * Reprova se o protótipo mudar para algo que fere a regra, ou se o leitor não achar o valor.
 */
export function divergenciasDoPrototipo(): string[] {
  const saida: string[] = [];
  for (const a of ALVOS_DE_TOQUE) {
    let v = px(decl(R_MOBILE, a.seletor, a.prop));
    if (a.extra) {
      const inset = /^(-?[\d.]+)px/.exec(decl(R_MOBILE, a.extra, "inset"));
      if (inset) v += -2 * Number(inset[1]);
    }
    if (v < 44) saida.push(`prototipo:alvo ${a.seletor} { ${a.prop} } = ${v}px < 44px`);
  }
  for (const s of CAMPOS_16PX) {
    const v = px(decl(R_MOBILE, s, "font-size"));
    if (v < 16) saida.push(`prototipo:campo ${s} { font-size } = ${v}px < 16px`);
  }
  return saida;
}
