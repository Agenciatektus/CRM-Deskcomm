/**
 * O CONTRATO entre o protótipo mobile e o CRM: onde cada peça do app de celular TEM de
 * morar para o teste estrito poder conferir. É a especificação da M1 a M5; quem
 * implementar e preferir outro nome muda AQUI (um lugar só), nunca o leitor do protótipo.
 *
 * - Medidas: tokens `--mb-*` no `:root` do `app/globals.css` (lidos por `blocoDoCrm`).
 * - Corte do celular: `@custom-variant mb` no `app/globals.css`, abaixo de 760px.
 * - Peças: um arquivo por peça em `components/mobile/`, e cada uma USA o token da
 *   própria medida (testar a ligação, não só a existência do token).
 * - Telas: um arquivo por tela das 11 do protótipo.
 */

export const CSS_DO_CRM = "app/globals.css";
export const LAYOUT_RAIZ = "app/layout.tsx";
export const MANIFESTO = "app/manifest.ts";

/** Peça -> arquivo e os tokens que ela tem de citar. */
export const PECAS: { id: string; arquivo: string; tokens: string[] }[] = [
  {
    id: "barra-inferior",
    arquivo: "components/mobile/BarraInferior.tsx",
    tokens: [
      "--mb-aba-altura",
      "--mb-aba-pilula-largura",
      "--mb-aba-pilula-altura",
      "--mb-aba-contador",
    ],
  },
  {
    id: "cabecalho-grande",
    arquivo: "components/mobile/CabecalhoGrande.tsx",
    tokens: ["--mb-titulo-fonte", "--mb-titulo-altura"],
  },
  {
    id: "barra-de-tela",
    arquivo: "components/mobile/BarraDeTela.tsx",
    tokens: ["--mb-barra-altura", "--mb-alvo"],
  },
  {
    id: "folha-inferior",
    arquivo: "components/mobile/FolhaInferior.tsx",
    tokens: [
      "--mb-folha-raio",
      "--mb-folha-max",
      "--mb-pegador-largura",
      "--mb-pegador-altura",
      "--mb-folha-item",
    ],
  },
  {
    id: "botao-criar",
    arquivo: "components/mobile/BotaoCriar.tsx",
    tokens: ["--mb-fab", "--mb-fab-raio", "--mb-fab-margem", "--mb-fab-acima"],
  },
  {
    id: "linha-deslizante",
    arquivo: "components/mobile/LinhaDeslizante.tsx",
    tokens: ["--mb-acao-gesto"],
  },
  {
    id: "linha-da-conversa",
    arquivo: "components/mobile/telas/LinhaDaConversa.tsx",
    tokens: ["--mb-avatar-lista", "--mb-linha-nome", "--mb-linha-previa"],
  },
  {
    id: "mais",
    arquivo: "components/mobile/telas/Mais.tsx",
    tokens: ["--mb-perfil-raio", "--mb-grupo-fonte", "--mb-cartao-raio", "--mb-menu-item", "--mb-menu-icone"],
  },
  {
    id: "canais",
    arquivo: "components/mobile/telas/Canais.tsx",
    tokens: ["--mb-canal-raio", "--mb-canal-logo"],
  },
  {
    id: "campo-de-busca",
    arquivo: "components/mobile/CampoDeBusca.tsx",
    tokens: ["--mb-busca-altura", "--mb-busca-raio", "--mb-campo-fonte"],
  },
];

/** As 11 telas do protótipo (o nome é o `t:` do aparelho) -> arquivo da tela no CRM. */
export const TELAS: Record<string, string> = {
  Conversas: "components/mobile/telas/Conversas.tsx",
  "Conversa aberta": "components/mobile/telas/ConversaAberta.tsx",
  "Ficha do lead": "components/mobile/telas/FichaDoLead.tsx",
  "Folha de filtros": "components/mobile/telas/FolhaDeFiltros.tsx",
  "Folha do botão criar": "components/mobile/telas/FolhaCriar.tsx",
  Funil: "components/mobile/telas/Funil.tsx",
  Tarefas: "components/mobile/telas/Tarefas.tsx",
  Avisos: "components/mobile/telas/Avisos.tsx",
  Mais: "components/mobile/telas/Mais.tsx",
  "Canais, dentro do Mais": "components/mobile/telas/Canais.tsx",
  "Busca aberta": "components/mobile/telas/Busca.tsx",
};

/**
 * Campos de texto do CRM que precisam de 16px no celular (Safari dá zoom no foco abaixo
 * disso). Aceita a classe sem variante ou com a variante `mb:` do corte do celular.
 */
export const CAMPOS_DO_CRM = [
  "components/ui/input.tsx",
  "components/ui/textarea.tsx",
  "components/ui/select.tsx",
  "components/inbox/Composer.tsx",
  "components/shell/CommandPalette.tsx",
];
export const CLASSES_DE_16PX = ["text-base", "text-[16px]", "mb:text-base", "mb:text-[16px]"];

/** Controles da casca que o celular toca: alvo de 44px abaixo de 760px. */
export const ALVOS_DO_CRM: { arquivo: string; marcador: string }[] = [
  { arquivo: "components/shell/SearchTrigger.tsx", marcador: "<MagnifyingGlass" },
  { arquivo: "components/shell/AlertsBell.tsx", marcador: "<PopoverTrigger" },
  { arquivo: "components/shell/MobileSidebar.tsx", marcador: "<SheetTrigger" },
];
/** Classes que garantem 44px (h-11 = 2.75rem = 44px na escala do Tailwind). */
export const CLASSES_DE_44PX = [
  "h-11",
  "size-11",
  "min-h-11",
  "mb:h-11",
  "mb:size-11",
  "h-(--mb-alvo)",
  "min-h-(--mb-alvo)",
];
