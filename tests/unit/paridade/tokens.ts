/**
 * Tokens: cores dos dois temas, estados, misturas derivadas da marca, sombras, raios,
 * escala tipográfica e famílias de fonte. Cada divergência sai como `id detalhe`.
 */
import {
  CSS,
  DS_HTML_TEXTO,
  R_DS,
  R_MAIN,
  R_VERDASH,
  accentPadrao,
  blocoDoCrm,
  blocoDoTema,
  coresIguais,
  decl,
  fmt,
  ler,
  lerCor,
  px,
  resolver,
  type Cor,
} from "./leitor";

type Tema = "claro" | "escuro";

/** Token do protótipo -> token do CRM. */
export const PARES: [string, string][] = [
  ["--chrome", "--color-bg"],
  ["--surface", "--color-surface"],
  ["--surface-2", "--color-surface-elevated"],
  ["--thread", "--color-thread"],
  ["--ink", "--color-text"],
  ["--ink-2", "--color-text-muted"],
  ["--ink-3", "--color-text-subtle"],
  ["--line", "--color-border"],
  ["--line-2", "--color-border-strong"],
  ["--hover", "--color-hover"],
  ["--tint", "--color-tint"],
  ["--accent-fg", "--color-accent-fg"],
  ["--bub-in", "--color-bubble-in"],
  ["--ok", "--color-success-fg"],
  ["--ok-bg", "--color-success-bg"],
  ["--warn", "--color-warning-fg"],
  ["--warn-bg", "--color-warning-bg"],
  ["--warn-line", "--color-warning-line"],
  ["--crit", "--color-error-fg"],
  ["--crit-bg", "--color-error-bg"],
  ["--info", "--color-info-fg"],
  ["--info-bg", "--color-info-bg"],
  ...[1, 2, 3, 4, 5, 6].flatMap((i): [string, string][] => [
    [`--av${i}`, `--color-avatar-${i}`],
    [`--av${i}i`, `--color-avatar-${i}-fg`],
  ]),
];

/** Os tokens do protótipo de um tema: o escuro é o Verdash por cima do `.app.dark` do Main. */
function tokensDoPrototipo(tema: Tema): Record<string, string> {
  const claro = R_MAIN.get(".app")!;
  if (tema === "claro") return claro;
  return { ...claro, ...R_MAIN.get(".app.dark")!, ...R_VERDASH.get(".app.dark")! };
}

function tokensDoCrm(tema: Tema): Record<string, string> {
  const raiz = blocoDoCrm(":root");
  return tema === "claro" ? raiz : { ...raiz, ...blocoDoCrm('[data-theme="dark"]') };
}

/** Misturas da marca: `color-mix(in oklch, var(--accent) N%, ALVO)` ou valor fixo. */
const MISTURAS: { proto: string; crm: string; alvo: string }[] = [
  { proto: "--accent-soft", crm: "--mix-accent-soft", alvo: "--color-surface" },
  { proto: "--accent-soft-2", crm: "--mix-accent-soft-2", alvo: "--color-surface" },
  { proto: "--accent-text", crm: "--mix-accent-text", alvo: "--accent-text-alvo" },
  { proto: "--bub-out", crm: "--mix-bubble-out", alvo: "--color-surface" },
  { proto: "--bub-ai", crm: "--mix-bubble-ai", alvo: "--bubble-ai-base" },
];

function lerMistura(valor: string): { pct: number; alvo: string } | null {
  const m = /^color-mix\(in oklch,\s*var\(--accent\)\s+([\d.]+)%,\s*(.+)\)$/.exec(valor.trim());
  return m ? { pct: Number(m[1]), alvo: m[2]!.trim() } : null;
}

function divergenciasDeCor(tema: Tema): string[] {
  const p = tokensDoPrototipo(tema);
  const c = tokensDoCrm(tema);
  const saida: string[] = [];
  for (const [tp, tc] of PARES) {
    if (p[tp] === undefined) continue;
    const esperado = lerCor(resolver(p[tp]!, p), p);
    const atual = c[tc] === undefined ? null : lerCor(resolver(c[tc]!, c), c);
    if (!atual || !coresIguais(esperado, atual)) {
      saida.push(`cor:${tema}:${tp} protótipo ${fmt(esperado)} x CRM ${tc}=${atual ? fmt(atual) : "ausente"}`);
    }
  }
  // O accent padrão (sem marca): o protótipo o recebe por prop, com um default.
  const accent = lerCor(resolver(c["--color-accent"]!, c), c);
  if (!coresIguais({ hex: accentPadrao(tema), alfa: 1 }, accent)) {
    saida.push(`cor:${tema}:--accent protótipo ${accentPadrao(tema)} x CRM --color-accent=${fmt(accent)}`);
  }
  for (const m of MISTURAS) {
    const v = p[m.proto]!;
    const mix = lerMistura(v);
    const pct = c[m.crm];
    const alvo = c[m.alvo] ?? "";
    if (mix) {
      const alvoProto = mix.alvo.replace("var(--surface)", "var(--color-surface)").replace("black", "#000000");
      const okAlvo = m.alvo === "--color-surface" ? alvoProto === "var(--color-surface)" : alvo === alvoProto;
      if (pct !== `${mix.pct}%` || !okAlvo) {
        saida.push(`mistura:${tema}:${m.proto} protótipo ${mix.pct}% de ${mix.alvo} x CRM ${pct} de ${alvo || m.alvo}`);
      }
    } else {
      // Valor fixo no protótipo: o CRM tem de misturar 0% da marca com o próprio valor.
      const esperado = lerCor(v, p);
      const ok = pct === "0%" && alvo !== "" && coresIguais(esperado, lerCor(alvo, c));
      if (!ok) saida.push(`mistura:${tema}:${m.proto} protótipo fixo ${fmt(esperado)} x CRM ${pct} de ${alvo}`);
    }
  }
  // Hover do botão primário: claro = marca a 86% com preto (`.btn-primary:hover`).
  const hover = lerMistura(tema === "claro" ? decl(R_MAIN, ".btn-primary:hover", "background") : "");
  const pctHover = c["--mix-accent-hover"];
  if (!hover || `${hover.pct}%` !== pctHover || lerCor(c["--accent-hover-alvo"] ?? "", c).hex !== lerCor(hover.alvo).hex) {
    saida.push(`mistura:${tema}:accent-hover protótipo ${hover ? `${hover.pct}% ${hover.alvo}` : "degradê"} x CRM ${pctHover}`);
  }
  return saida;
}

/** Sombras: geometria e cor de cada camada (`0 12px 32px -8px cor`). */
function lerSombra(valor: string, tokens: Record<string, string>): string {
  if (valor.trim() === "none") return "none";
  return valor
    .split(/,(?![^(]*\))/)
    .map((camada) => {
      const partes = camada.trim().match(/(?:[a-z-]+\([^)]*\)|\S+)/g) ?? [];
      const medidas = partes.filter((x) => /^-?[\d.]+(px)?$/.test(x)).map((x) => px(x === "0" ? "0px" : x));
      while (medidas.length < 4) medidas.push(0);
      const cor = partes.find((x) => !/^-?[\d.]+(px)?$/.test(x))!;
      return `${medidas.join(" ")} ${fmt(lerCor(resolver(cor, tokens), tokens))}`;
    })
    .join(", ");
}

function divergenciasDeSombra(tema: Tema): string[] {
  const p = tokensDoPrototipo(tema);
  const c = tokensDoCrm(tema);
  const saida: string[] = [];
  for (const [tp, tc] of [["--shadow-pop", "--shadow-pop"], ["--shadow-bub", "--shadow-bubble"]] as const) {
    const pp = { ...p, "--line-2": p["--line-2"]! };
    const esperado = lerSombra(p[tp]!.replace(/var\(--line-2\)/g, pp["--line-2"]!), p);
    const atual = lerSombra(c[tc]!.replace(/var\(--color-border-strong\)/g, c["--color-border-strong"]!), c);
    const norm = (s: string) => s.replace(/#([0-9a-f]{6})/g, (h) => h);
    if (norm(esperado) !== norm(atual) && !sombrasProximas(esperado, atual)) {
      saida.push(`sombra:${tema}:${tp} protótipo ${esperado} x CRM ${atual}`);
    }
  }
  return saida;
}

function sombrasProximas(a: string, b: string): boolean {
  const ca = a.split(", ");
  const cb = b.split(", ");
  if (ca.length !== cb.length) return false;
  return ca.every((x, i) => {
    const [ma, ka] = [x.split(" ").slice(0, 4).join(" "), x.split(" ")[4]!];
    const [mb, kb] = [cb[i]!.split(" ").slice(0, 4).join(" "), cb[i]!.split(" ")[4]!];
    const cor = (s: string): Cor => ({ hex: s.split("/")[0]!, alfa: s.includes("/") ? Number(s.split("/")[1]) : 1 });
    return ma === mb && coresIguais(cor(ka), cor(kb));
  });
}

/** Raios por objeto: a regra do protótipo -> o token do CRM. */
const RAIOS: [Map<string, Record<string, string>>, string, string, string][] = [
  [R_DS, ".pill", "border-radius", "--radius-pill"],
  [R_DS, ".btn", "border-radius", "--radius-control"],
  [R_DS, ".input", "border-radius", "--radius-field"],
  [R_DS, ".menu", "border-radius", "--radius-menu"],
  [R_DS, ".bubble", "border-radius", "--radius-bubble"],
  [R_DS, ".row.mine .bubble", "border-bottom-right-radius", "--radius-bubble-tail"],
];

/** A escala do quadro DS ("Tipografia"): rótulo da linha -> papel `text-*` do CRM. */
const PAPEIS: Record<string, string> = {
  "Título de página": "title-lg",
  "Nome no painel": "title-md",
  "Nome no cabeçalho": "title-sm",
  Mensagem: "message",
  "Texto de interface": "ui",
  "Rótulo, botão": "label",
  Meta: "meta",
  "Rótulo da 1ª coluna": "rail",
};

function divergenciasDeTipo(): string[] {
  const raiz = blocoDoCrm(":root");
  const tema = blocoDoTema();
  const saida: string[] = [];
  const linhas = [...DS_HTML_TEXTO.matchAll(/<span class="k">([^<]+)<\/span>.*?<span class="m mono">([^<]+)<\/span>/g)];
  if (linhas.length < 8) saida.push(`tipo:quadro só ${linhas.length} linhas de escala lidas`);
  for (const [, rotulo, spec] of linhas) {
    const papel = PAPEIS[rotulo!.trim()];
    if (!papel) continue;
    const [tam, peso, terceiro] = spec!.split(/[/,]/).map((s) => s.trim());
    const tamCrm = raiz[`--font-size-${papel}`];
    if (tamCrm !== `${tam}px`) saida.push(`tipo:${papel}:tamanho quadro ${tam} x CRM ${tamCrm}`);
    const pesoCrm = new RegExp(`--text-${papel}--font-weight:\\s*(\\d+)`).exec(tema)?.[1] ?? "400";
    if (pesoCrm !== peso) saida.push(`tipo:${papel}:peso quadro ${peso} x CRM ${pesoCrm}`);
    if (terceiro && /^[\d.]+$/.test(terceiro) && raiz[`--line-height-${papel}`] !== terceiro) {
      saida.push(`tipo:${papel}:entrelinha quadro ${terceiro} x CRM ${raiz[`--line-height-${papel}`]}`);
    }
    if (terceiro?.endsWith("em")) {
      const ls = new RegExp(`--text-${papel}--letter-spacing:\\s*([-\\d.]+em)`).exec(tema)?.[1];
      if (ls !== terceiro) saida.push(`tipo:${papel}:espacamento quadro ${terceiro} x CRM ${ls}`);
    }
  }
  return saida;
}

function divergenciasDeFonte(): string[] {
  const layout = ler("app/layout.tsx");
  const saida: string[] = [];
  const familia = (v: string) => /"([^"]+)"/.exec(v)?.[1] ?? "";
  const arquivo = (f: string) => f.toLowerCase().replace(/ /g, "-");
  const sans = familia(decl(R_MAIN, ".app", "font-family"));
  const mono = familia(decl(R_MAIN, ".mono", "font-family"));
  const blocoDe = (variavel: string) => {
    const i = layout.indexOf(`variable: "${variavel}"`);
    return layout.slice(layout.lastIndexOf("localFont({", i), i);
  };
  if (!blocoDe("--font-atkinson").includes(`./fonts/${arquivo(sans)}-`)) saida.push(`fonte:sans protótipo ${sans} não é a --font-atkinson`);
  if (!blocoDe("--font-mono").includes(`./fonts/${arquivo(mono)}-`)) saida.push(`fonte:mono protótipo ${mono} não é a --font-mono`);
  const pesos = /pesos de (\d+) a (\d+)/.exec(DS_HTML_TEXTO);
  for (let w = Number(pesos?.[1] ?? 0); pesos && w <= Number(pesos[2]); w += 100) {
    if (!blocoDe("--font-atkinson").includes(`weight: "${w}"`)) saida.push(`fonte:peso ${w} do quadro não está embarcado`);
  }
  return saida;
}

/** O bloco `[data-theme="dark"] body` (tokens da pele Verdash). */
function blocoDaPele(): Record<string, string> {
  return blocoDoCrm('[data-theme="dark"] body');
}

const paradasHex = (v: string) => [...v.matchAll(/oklch\([^)]*\)|#[0-9a-f]{6}/gi)].map((m) => lerCor(m[0]));

/** Degradê, foco, véu, botão de perigo, entrada e movimento reduzido. */
function divergenciasDeRegras(): string[] {
  const saida: string[] = [];
  const pele = blocoDaPele();
  const proto = tokensDoPrototipo("escuro");
  // Degradê da logo (Verdash `--grad`) = `--pele-grad`, e é ele que pinta a ação.
  const grad = paradasHex(proto["--grad"]!);
  const peleGrad = paradasHex(pele["--pele-grad"] ?? "");
  if (grad.length !== peleGrad.length || grad.some((c, i) => !coresIguais(c, peleGrad[i]!))) {
    saida.push(`regra:degrade protótipo ${grad.map(fmt).join(" ")} x CRM ${peleGrad.map(fmt).join(" ")}`);
  }
  // A ação (botão, chip ligado) usa as MESMAS cores, com o meio esticado até 85%.
  const acao = paradasHex(pele["--pele-grad-acao"] ?? "").filter((c, i, l) => i === 0 || l[i - 1]!.hex !== c.hex);
  if (acao.length !== grad.length || grad.some((c, i) => !coresIguais(c, acao[i]!))) saida.push("regra:degrade-acao cores diferentes do --grad");
  if (pele["--gradient-primary"] !== "var(--pele-grad-acao)") saida.push(`regra:degrade-acao CRM --gradient-primary=${pele["--gradient-primary"]}`);
  for (const classe of [".pele-grad:not(", ".pele-grad-ativo:not("]) {
    const i = CSS.indexOf(classe);
    const corpo = CSS.slice(i, CSS.indexOf("}", i));
    if (i < 0 || !corpo.includes("var(--pele-grad-acao)")) saida.push(`regra:degrade-${classe} não usa o degradê da logo`);
  }
  // Foco (Main `:focus-visible`) = anel na cor do accent em vigor, afastado e com raio.
  const raiz = blocoDoCrm(":root");
  const [esp, , corFoco] = decl(R_MAIN, ":focus-visible", "outline").split(" ");
  const foco = /\n {2}:focus-visible \{([^}]*)\}/.exec(CSS)?.[1] ?? "";
  const outline = /outline:\s*([^;]+);/.exec(foco)?.[1] ?? "";
  const [espCrm, , corCrm] = outline.split(" ");
  if (espCrm !== esp || corFoco !== "var(--accent)" || resolver(corCrm ?? "", raiz) !== resolver(raiz["--color-accent"]!, raiz)) {
    saida.push(`regra:foco protótipo ${esp} ${corFoco} x CRM ${outline}`);
  }
  const raioFoco = decl(R_MAIN, ":focus-visible", "border-radius");
  if (resolver(/border-radius:\s*([^;]+);/.exec(foco)?.[1] ?? "", raiz) !== raioFoco) saida.push(`regra:foco-raio protótipo ${raioFoco}`);
  if (!/outline-offset:\s*2px/.test(foco) || decl(R_MAIN, ":focus-visible", "outline-offset") !== "2px") saida.push("regra:foco-afastado");
  const focoEscuro = lerCor(decl(R_VERDASH, ".app.dark :focus-visible", "outline-color"));
  if (!coresIguais(focoEscuro, lerCor(pele["--pele-foco"] ?? "#000000"))) saida.push(`regra:foco-escuro protótipo ${fmt(focoEscuro)} x CRM --pele-foco=${pele["--pele-foco"]}`);
  if (!CSS.includes('[data-theme="dark"] :focus-visible {\n  outline-color: var(--pele-foco);')) saida.push("regra:foco-escuro a regra não usa --pele-foco");
  // Véu dos diálogos (`.pal-scrim`).
  const veu = lerCor(decl(R_MAIN, ".pal-scrim", "background"));
  for (const tema of ["claro", "escuro"] as const) {
    const c = tokensDoCrm(tema);
    if (!coresIguais(veu, lerCor(c["--color-overlay"]!))) saida.push(`regra:veu:${tema} protótipo ${fmt(veu)} x CRM ${c["--color-overlay"]}`);
  }
  // Botão de perigo: texto branco no claro (quadro) e escuro sobre o vermelho claro (Main).
  const brancoDs = lerCor(decl(R_DS, ".btn-danger", "color"));
  if (!coresIguais(brancoDs, lerCor(raiz["--destructive-foreground"]!))) saida.push(`regra:perigo-texto:claro x CRM ${raiz["--destructive-foreground"]}`);
  const textoEscuro = lerCor(decl(R_MAIN, ".app.dark .btn-danger", "color"));
  const escuro = tokensDoCrm("escuro");
  if (!coresIguais(textoEscuro, lerCor(escuro["--destructive-foreground"]!))) saida.push(`regra:perigo-texto:escuro protótipo ${fmt(textoEscuro)} x CRM ${escuro["--destructive-foreground"]}`);
  if (!coresIguais(lerCor(proto["--crit"]!), lerCor(escuro["--color-error"]!))) saida.push(`regra:perigo-fundo:escuro protótipo crit x CRM --color-error=${escuro["--color-error"]}`);
  // Entrada dos menus (`popIn .16s`) e movimento reduzido.
  const dur = /popIn\s+([\d.]+)s/.exec(decl(R_MAIN, ".pop", "animation"))?.[1];
  if (!blocoDoTema().includes(`--animate-pop-in: pop-in ${Number(dur) * 1000}ms`)) saida.push(`regra:entrada protótipo popIn ${dur}s`);
  if (!/prefers-reduced-motion: reduce\) \{\n {2}\*,[\s\S]*?animation: none !important;\n {4}transition: none !important;/.test(CSS)) {
    saida.push("regra:movimento-reduzido");
  }
  return saida;
}

export function divergenciasDeTokens(): string[] {
  const raiz = blocoDoCrm(":root");
  const saida = [
    ...divergenciasDeCor("claro"),
    ...divergenciasDeCor("escuro"),
    ...divergenciasDeSombra("claro"),
    ...divergenciasDeSombra("escuro"),
    ...divergenciasDeTipo(),
    ...divergenciasDeFonte(),
    ...divergenciasDeRegras(),
  ];
  for (const [fonte, sel, prop, token] of RAIOS) {
    const esperado = decl(fonte, sel, prop);
    if (raiz[token] !== esperado) saida.push(`raio:${token} protótipo ${sel} ${esperado} x CRM ${raiz[token]}`);
  }
  const linha = decl(R_MAIN, ".app", "--row-py");
  const compacta = decl(R_MAIN, ".app.compact", "--row-py");
  if (raiz["--row-py"] !== linha) saida.push(`espaco:linha protótipo ${linha} x CRM ${raiz["--row-py"]}`);
  if (!CSS.includes(`[data-densidade="compacta"] {\n  --row-py: ${compacta};`)) saida.push(`espaco:compacto protótipo ${compacta} sem modo compacto no CRM`);
  const curva = decl(R_MAIN, ".app", "--ease");
  if (raiz["--ease-emphasized"] !== curva) saida.push(`movimento:curva protótipo ${curva} x CRM ${raiz["--ease-emphasized"]}`);
  return saida;
}
