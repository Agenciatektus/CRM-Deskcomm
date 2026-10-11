/**
 * As regras-chave dos componentes: (regra do protótipo, propriedade) -> classe que o
 * componente do CRM tem de ter. Onde o quadro DS (`DesignSystem.dc.html`) e o CSS da Inbox
 * (`Main.dc.html`) divergem, vence o QUADRO (decisão do Peterson); o Main só entra no que o
 * quadro não desenha (hover do chip, switch, menu de contexto, `:focus-visible`).
 */
import {
  altura,
  anel,
  borda,
  contorno,
  fundo,
  largura,
  margem,
  peso,
  prefixar,
  preenchimento,
  raio,
  tamanho,
  texto,
  vao,
} from "./conversores";
import { R_DS, R_MAIN, R_VERDASH, decl, px } from "./leitor";

export type Checagem = {
  id: string;
  fonte: Map<string, Record<string, string>>;
  seletor: string;
  prop: string;
  arquivo: string;
  classes: (valor: string) => string | string[];
};

const BOTAO = "components/ui/button.tsx";
const CAMPO = "components/ui/input.tsx";
const AREA = "components/ui/textarea.tsx";
const SELECT = "components/ui/select.tsx";
const CHIP = "components/ui/chip.tsx";
const PILULA = "components/ui/badge.tsx";
const ABAS = "components/ui/tabs.tsx";
const MENU = "components/ui/dropdown-menu.tsx";
const SWITCH = "components/ui/switch.tsx";

const c = (
  id: string,
  fonte: Checagem["fonte"],
  seletor: string,
  prop: string,
  arquivo: string,
  classes: Checagem["classes"],
): Checagem => ({ id, fonte, seletor, prop, arquivo, classes });

const altDoChip = () => decl(R_DS, ".chip", "height");
const altDaPilula = () => decl(R_DS, ".pill", "height");
const altDaTag = () => decl(R_DS, ".tag", "height");
const altDoSwitch = () => decl(R_MAIN, ".switch", "height");

export const CHECAGENS: Checagem[] = [
  // ── Botão (quadro DS, "Botões") ─────────────────────────────────────────
  c("botao:altura", R_DS, ".btn", "height", BOTAO, (v) => `lg:${altura(v)}`),
  c("botao:padding", R_DS, ".btn", "padding", BOTAO, preenchimento),
  c("botao:raio", R_DS, ".btn", "border-radius", BOTAO, (v) => raio(v)),
  c("botao:peso", R_DS, ".btn", "font-weight", BOTAO, peso),
  c("botao:nowrap", R_DS, ".btn", "white-space", BOTAO, () => "whitespace-nowrap"),
  c("botao:vao", R_DS, ".btn", "gap", BOTAO, vao),
  c("botao:tamanho", R_MAIN, ".btn", "font-size", BOTAO, tamanho),
  c("botao:primario-fundo", R_DS, ".btn-primary", "background", BOTAO, fundo),
  c("botao:primario-hover", R_DS, ".btn-primary.hover", "background", BOTAO, () => "hover:bg-accent-hover"),
  c("botao:foco", R_DS, ".btn-primary.focus", "outline", BOTAO, (v) => prefixar("focus-visible:", contorno(v))),
  c("botao:foco-afastado", R_DS, ".btn-primary.focus", "outline-offset", BOTAO, (v) => `focus-visible:outline-offset-${px(v)}`),
  c("botao:desabilitado-fundo", R_DS, ".btn-primary[disabled]", "background", BOTAO, (v) => `disabled:${fundo(v)}`),
  c("botao:desabilitado-texto", R_DS, ".btn-primary[disabled]", "color", BOTAO, (v) => `disabled:${texto(v)}`),
  c("botao:secundario-borda", R_DS, ".btn-ghost", "border", BOTAO, borda),
  c("botao:secundario-fundo", R_DS, ".btn-ghost", "background", BOTAO, fundo),
  c("botao:secundario-hover", R_MAIN, ".btn-ghost:hover", "background", BOTAO, (v) => `hover:${fundo(v)}`),
  c("botao:perigo-fundo", R_DS, ".btn-danger", "background", BOTAO, fundo),
  c("botao:perigo-texto", R_DS, ".btn-danger", "color", BOTAO, () => "text-destructive-foreground"),
  c("botao:sm-altura", R_DS, ".btn-sm", "height", BOTAO, (v) => `lg:${altura(v)}`),
  c("botao:sm-padding", R_DS, ".btn-sm", "padding", BOTAO, preenchimento),
  c("botao:sm-tamanho", R_DS, ".btn-sm", "font-size", BOTAO, tamanho),
  c("botao:sm-raio", R_DS, ".btn-sm", "border-radius", BOTAO, (v) => raio(v)),
  c("botao:icone-tamanho", R_DS, ".icon-btn", "width", BOTAO, (v) => [`lg:${largura(v)}`, `lg:${altura(v)}`]),
  c("botao:icone-cor", R_DS, ".icon-btn", "color", BOTAO, texto),
  c("botao:icone-hover", R_DS, ".icon-btn.hover", "background", BOTAO, (v) => `hover:${fundo(v)}`),
  c("botao:icone-ligado-fundo", R_DS, ".icon-btn.on", "background", BOTAO, (v) => `aria-pressed:${fundo(v)}`),
  c("botao:icone-ligado-texto", R_DS, ".icon-btn.on", "color", BOTAO, (v) => `aria-pressed:${texto(v)}`),
  c("botao:escuro-degrade", R_VERDASH, ".app.dark .btn-primary", "background", BOTAO, () => "dark:bg-(image:--gradient-primary)"),
  c("botao:escuro-desabilitado", R_VERDASH, ".app.dark .btn-primary:disabled", "background", BOTAO, (v) => `dark:disabled:${fundo(v)}`),
  // ── Campo (quadro DS, `.input`) ─────────────────────────────────────────
  ...[CAMPO, SELECT].map((arq) => c(`campo:altura@${arq}`, R_DS, ".input", "height", arq, altura)),
  ...[CAMPO, SELECT].map((arq) => c(`campo:padding@${arq}`, R_DS, ".input", "padding", arq, preenchimento)),
  ...[CAMPO, AREA, SELECT].flatMap((arq) => [
    c(`campo:raio@${arq}`, R_DS, ".input", "border-radius", arq, (v) => raio(v)),
    c(`campo:borda@${arq}`, R_DS, ".input", "border", arq, borda),
    c(`campo:fundo@${arq}`, R_DS, ".input", "background", arq, fundo),
    c(`campo:foco-borda@${arq}`, R_DS, ".input.focus", "border-color", arq, (v) => `focus-visible:border-${borda(v)[0]!.slice(7)}`),
    c(`campo:foco-anel@${arq}`, R_DS, ".input.focus", "box-shadow", arq, (v) => prefixar("focus-visible:", anel(v))),
    c(`campo:foco-fundo@${arq}`, R_DS, ".input.focus", "background", arq, (v) => `focus-visible:${fundo(v)}`),
    c(`campo:erro-borda@${arq}`, R_DS, ".input.error", "border-color", arq, (v) => `aria-[invalid=true]:border-${borda(v)[0]!.slice(7)}`),
    c(`campo:erro-anel@${arq}`, R_DS, ".input.error", "box-shadow", arq, (v) => prefixar("aria-[invalid=true]:", anel(v))),
  ]),
  c("campo:placeholder", R_DS, ".input", "color", CAMPO, (v) => `placeholder:${texto(v)}`),
  // ── Chip (escolha) ──────────────────────────────────────────────────────
  c("chip:altura", R_DS, ".chip", "height", CHIP, altura),
  c("chip:padding", R_DS, ".chip", "padding", CHIP, preenchimento),
  c("chip:raio", R_DS, ".chip", "border-radius", CHIP, (v) => raio(v, altDoChip())),
  c("chip:borda", R_DS, ".chip", "border", CHIP, borda),
  c("chip:tamanho", R_DS, ".chip", "font-size", CHIP, tamanho),
  c("chip:peso", R_DS, ".chip", "font-weight", CHIP, peso),
  c("chip:cor", R_DS, ".chip", "color", CHIP, texto),
  c("chip:fundo", R_DS, ".chip", "background", CHIP, fundo),
  c("chip:nowrap", R_DS, ".chip", "white-space", CHIP, () => "whitespace-nowrap"),
  c("chip:ligado-fundo", R_DS, ".chip.on", "background", CHIP, (v) => `aria-pressed:${fundo(v)}`),
  c("chip:ligado-texto", R_DS, ".chip.on", "color", CHIP, () => "aria-pressed:text-accent-foreground"),
  c("chip:ligado-borda", R_DS, ".chip.on", "border-color", CHIP, (v) => `aria-pressed:${borda(v)[0]}`),
  c("chip:desligado", R_DS, ".chip.off", "opacity", CHIP, (v) => ["disabled:border-dashed", `disabled:opacity-${Math.round(Number(v) * 100)}`]),
  c("chip:hover", R_MAIN, ".chip:hover", "border-color", CHIP, (v) => `hover:${borda(v)[0]}`),
  c("chip:escuro-ligado", R_VERDASH, ".app.dark .chip.on", "background", CHIP, () => "pele-grad-ativo"),
  // ── Pílula (estado) e tag (classificação) ───────────────────────────────
  c("pilula:altura", R_DS, ".pill", "height", PILULA, altura),
  c("pilula:padding", R_DS, ".pill", "padding", PILULA, preenchimento),
  c("pilula:raio", R_DS, ".pill", "border-radius", PILULA, (v) => raio(v, altDaPilula())),
  c("pilula:tamanho", R_DS, ".pill", "font-size", PILULA, tamanho),
  c("pilula:peso", R_DS, ".pill", "font-weight", PILULA, peso),
  c("pilula:nowrap", R_DS, ".pill", "white-space", PILULA, () => "whitespace-nowrap"),
  c("pilula:neutra", R_DS, ".pill", "background", PILULA, fundo),
  ...(["sla-ok", "sla-warn", "sla-crit", "own-ia"] as const).flatMap((s) => [
    c(`pilula:${s}-fundo`, R_DS, `.${s}`, "background", PILULA, fundo),
    c(`pilula:${s}-texto`, R_DS, `.${s}`, "color", PILULA, texto),
  ]),
  c("pilula:sem-dono", R_DS, ".own-fila", "border", PILULA, borda),
  c("tag:raio", R_DS, ".tag", "border-radius", PILULA, (v) => raio(v, altDaTag())),
  c("tag:fundo", R_DS, ".tag", "background", PILULA, fundo),
  // ── Abas e controle segmentado ──────────────────────────────────────────
  c("abas:altura", R_DS, ".tabs span", "height", ABAS, altura),
  c("abas:padding", R_DS, ".tabs span", "padding", ABAS, preenchimento),
  c("abas:tamanho", R_DS, ".tabs span", "font-size", ABAS, tamanho),
  c("abas:cor", R_DS, ".tabs span", "color", ABAS, texto),
  c("abas:ativa", R_DS, ".tabs span.on", "color", ABAS, (v) => `data-[state=active]:${texto(v)}`),
  c("abas:traco", R_DS, ".tabs span.on::after", "height", ABAS, (v) => `after:h-${px(v) / 4}`),
  c("abas:traco-cor", R_DS, ".tabs span.on::after", "background", ABAS, (v) => `data-[state=active]:after:${fundo(v)}`),
  c("abas:escuro-traco", R_VERDASH, ".app.dark .pn-tab.is-on::after", "background", ABAS, () => "dark:data-[state=active]:after:bg-(image:--pele-grad)"),
  c("seg:padding", R_DS, ".seg", "padding", ABAS, preenchimento),
  c("seg:fundo", R_DS, ".seg", "background", ABAS, fundo),
  c("seg:raio", R_DS, ".seg", "border-radius", ABAS, (v) => raio(v)),
  c("seg:opcao-altura", R_DS, ".seg span", "height", ABAS, altura),
  c("seg:opcao-raio", R_DS, ".seg span", "border-radius", ABAS, (v) => raio(v)),
  c("seg:opcao-ativa", R_DS, ".seg span.on", "background", ABAS, (v) => `data-[state=active]:${fundo(v)}`),
  // ── Menu ────────────────────────────────────────────────────────────────
  c("menu:raio", R_DS, ".menu", "border-radius", MENU, (v) => raio(v)),
  c("menu:padding", R_DS, ".menu", "padding", MENU, preenchimento),
  c("menu:item-altura", R_DS, ".mi", "height", MENU, altura),
  c("menu:item-raio", R_DS, ".mi", "border-radius", MENU, (v) => raio(v)),
  c("menu:item-tamanho", R_DS, ".mi", "font-size", MENU, tamanho),
  c("menu:item-vao", R_DS, ".mi", "gap", MENU, vao),
  c("menu:item-hover", R_DS, ".mi.on", "background", MENU, (v) => `focus:${fundo(v)}`),
  c("menu:perigo", R_DS, ".mi.danger", "color", MENU, (v) => `data-[variant=destructive]:${texto(v)}`),
  c("menu:perigo-hover", R_MAIN, ".mi.danger:hover", "background", MENU, (v) => `data-[variant=destructive]:focus:${fundo(v)}`),
  c("menu:separador", R_DS, ".msep", "margin", MENU, margem),
  c("menu:kbd-borda-baixo", R_DS, ".kbd", "border-bottom-width", MENU, (v) => `border-b-${px(v)}`),
  c("menu:kbd-fundo", R_DS, ".kbd", "background", MENU, fundo),
  // ── Switch (o quadro não desenha; vale o Main) ──────────────────────────
  c("switch:largura", R_MAIN, ".switch", "width", SWITCH, largura),
  c("switch:altura", R_MAIN, ".switch", "height", SWITCH, altura),
  c("switch:raio", R_MAIN, ".switch", "border-radius", SWITCH, (v) => raio(v, altDoSwitch())),
  c("switch:trilho", R_MAIN, ".switch", "background", SWITCH, (v) => `data-[state=unchecked]:${fundo(v)}`),
  c("switch:ligado", R_MAIN, ".switch.on", "background", SWITCH, (v) => `data-[state=checked]:${fundo(v)}`),
];
