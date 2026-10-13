/**
 * Paridade dos PADRÕES COMPOSTOS (PR C da etapa 2): navegação em 2 colunas,
 * layout da Inbox e seus cortes, seletor de data, aviso com Desfazer, menu da
 * conversa, módulos opcionais e Etiquetas. Os números e as frases vêm do quadro
 * (`DesignSystem.dc.html`), e o CRM é lido no código que os aplica.
 */
import { DURACAO_DO_DESFAZER } from "@/lib/ui/aviso-com-desfazer";
import { LARGURA_DA_LISTA, LARGURA_DO_PAINEL, MINIMO_DA_CONVERSA } from "@/components/inbox/colunas/larguras";
import { menuRecolhido } from "@/lib/navigation/preferencia-do-menu";

import { DS_HTML_TEXTO, R_DS, decl, ler, px } from "./leitor";

type Resultado = { id: string; ok: boolean; detalhe: string };

const numero = (re: RegExp, nome: string): number => {
  const m = re.exec(DS_HTML_TEXTO);
  if (!m?.[1]) throw new Error(`quadro: "${nome}" não encontrado`);
  return Number(m[1]);
};

export function divergenciasDeComposicao(): string[] {
  const barra = ler("components/shell/BarraEmDuasColunas.tsx");
  const sidebar = ler("components/shell/Sidebar.tsx");
  const cabe = ler("hooks/ui/useCabeNoDesktop.ts");
  const layout = ler("components/inbox/InboxLayout.tsx");
  const pegador = ler("components/inbox/colunas/PegadorDeColuna.tsx");
  const toaster = ler("components/ui/sonner.tsx");
  const seletor = ler("components/ui/seletor-de-data-hora.tsx") + ler("components/ui/grade-do-calendario.tsx");
  const resultado = ler("components/shell/ResultadoDoCompromisso.tsx");
  const catalogo = ler("lib/navigation/catalogo.ts");
  const conteudoDoMenu = ler("components/inbox/menu/ConteudoDoMenu.tsx");

  const trilho = px(decl(R_DS, ".rail", "width"));
  const coluna2 = px(decl(R_DS, ".nav2", "width"));
  const corte = numero(/Abaixo de (\d+) px ela nunca fixa/, "nunca fixa");
  const lista = numero(/Lista, (\d+) px/, "Lista, N px");
  const lead = numero(/Lead, (\d+) px/, "Lead, N px");
  const [listaMin, listaMax] = [numero(/Lista (\d+) a \d+ px/, "Lista min"), numero(/Lista \d+ a (\d+) px/, "Lista max")];
  const [leadMin, leadMax] = [numero(/Lead (\d+) a \d+ px/, "Lead min"), numero(/Lead \d+ a (\d+) px/, "Lead max")];
  const conversa = numero(/Chat, mínimo (\d+) px/, "Chat, mínimo");
  const tresColunas = numero(/<b>(\d+) px ou mais<\/b><span>Três colunas/, "três colunas");
  const segundos = numero(/some em (\d+) segundos/, "some em N segundos");
  const resultados: Resultado[] = [
    { id: "nav:trilho", ok: barra.includes(`w-[${trilho}px]`), detalhe: `trilho de ${trilho}px` },
    { id: "nav:coluna", ok: barra.includes(`w-[${coluna2}px]`), detalhe: `2ª coluna de ${coluna2}px` },
    { id: "nav:nunca-fixa", ok: cabe.includes(`(min-width: ${corte}px)`) && sidebar.includes("max-lg:w-[72px]"), detalhe: `abaixo de ${corte}px nunca fixa` },
    {
      id: "nav:inbox-recolhida",
      ok:
        /Na Inbox a 2ª coluna começa recolhida/.test(DS_HTML_TEXTO) &&
        menuRecolhido({ pathname: "/app/inbox", recolhidoGeral: false, fixoNaInbox: false }) &&
        !menuRecolhido({ pathname: "/app/inbox", recolhidoGeral: true, fixoNaInbox: true }) &&
        !menuRecolhido({ pathname: "/app/contacts", recolhidoGeral: false, fixoNaInbox: false }),
      detalhe: "na Inbox começa recolhida e só fixa se o atendente fixar",
    },
    { id: "nav:modulos-opcionais", ok: barra.includes('"Módulos opcionais"') && /Módulos opcionais/.test(DS_HTML_TEXTO), detalhe: "seção Módulos opcionais" },
    { id: "nav:etiquetas", ok: /label: "Etiquetas"/.test(catalogo) && /Etiquetas unificando Tags/.test(DS_HTML_TEXTO), detalhe: "Etiquetas unifica Tags" },
    { id: "layout:lista", ok: LARGURA_DA_LISTA.padrao === lista && LARGURA_DA_LISTA.min === listaMin && LARGURA_DA_LISTA.max === listaMax, detalhe: `lista ${lista} (${listaMin} a ${listaMax})` },
    { id: "layout:lead", ok: LARGURA_DO_PAINEL.padrao === lead && LARGURA_DO_PAINEL.min === leadMin && LARGURA_DO_PAINEL.max === leadMax, detalhe: `lead ${lead} (${leadMin} a ${leadMax})` },
    { id: "layout:conversa", ok: MINIMO_DA_CONVERSA === conversa && layout.includes(`calc(100%-${conversa}px`), detalhe: `conversa mínima ${conversa}` },
    {
      id: "layout:tres-colunas",
      ok: tresColunas === 1280 && layout.includes("xl:grid-cols-[max(280px") && pegador.includes("xl:flex") && !pegador.includes("2xl:flex"),
      detalhe: `três colunas e pegadores a partir de ${tresColunas}px (xl)`,
    },
    { id: "aviso:duracao", ok: DURACAO_DO_DESFAZER === segundos * 1000, detalhe: `Desfazer some em ${segundos} s` },
    {
      id: "aviso:invertido",
      ok:
        decl(R_DS, ".toast", "background") === "var(--ink)" &&
        decl(R_DS, ".toast", "color") === "var(--surface)" &&
        toaster.includes("!bg-text") &&
        toaster.includes("!text-surface") &&
        toaster.includes("!rounded-lg") &&
        toaster.includes(`color-mix(in_oklch,var(--color-accent)_${/(\d+)%/.exec(decl(R_DS, ".toast u", "color"))?.[1]}%,white)`),
      detalhe: "toast invertido por tema, Desfazer na marca clareada",
    },
    {
      id: "data:hoje-em-anel",
      ok: decl(R_DS, ".dp-grid .today", "box-shadow") === "inset 0 0 0 1.5px var(--accent)" && seletor.includes("shadow-[inset_0_0_0_1.5px_var(--color-accent)]"),
      detalhe: "hoje em anel de 1,5px",
    },
    {
      id: "data:passado-riscado",
      ok: decl(R_DS, ".dp-grid .past", "text-decoration") === "line-through" && seletor.includes("disabled:line-through"),
      detalhe: "dia passado riscado",
    },
    { id: "data:atalhos", ok: /Atalhos primeiro/.test(DS_HTML_TEXTO) && seletor.includes("ATALHOS_DE_DIA") && seletor.includes('"1430"'), detalhe: "atalhos, chips de horário e Outro horário com 1430" },
    { id: "menu:teclas", ok: conteudoDoMenu.includes('tecla("A")') && conteudoDoMenu.includes('tecla("E")') && /Atalhos de teclado aparecem no próprio item/.test(DS_HTML_TEXTO), detalhe: "tecla no item do menu" },
    {
      // O topo do trilho é a ORGANIZAÇÃO (`.rail-t` do quadro): sigla em quadrado de 40, raio 11.
      id: "nav:organizacao-no-trilho",
      ok:
        ler("components/shell/TenantSwitcher.tsx").includes(`size-${px(decl(R_DS, ".rail-t", "width")) / 4}`) &&
        ler("components/shell/TenantSwitcher.tsx").includes(`rounded-[${px(decl(R_DS, ".rail-t", "border-radius"))}px]`) &&
        barra.includes('<TenantSwitcher variante="trilho" />'),
      detalhe: "sigla da organização no topo do trilho",
    },
    { id: "aviso:remarcou", ok: /Remarcou/.test(DS_HTML_TEXTO) && resultado.includes('t("Remarcou")'), detalhe: "Remarcou no resultado do compromisso" },
  ];
  return resultados.filter((r) => !r.ok).map((r) => `${r.id} ${r.detalhe}`);
}
