"use client";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useId, useTransition } from "react";

import { toggleSidebar } from "@/app/actions/shell/toggleSidebar";
import { ConnectionHealthDot } from "@/components/connections/ConnectionHealthDot";
import { ColunaDoGrupo, type Secao } from "@/components/shell/ColunaDoGrupo";
import { ContadorDaFila } from "@/components/shell/ContadorDaFila";
import { ContadorDeCasos } from "@/components/shell/ContadorDeCasos";
import { usePeekDoTrilho } from "@/components/shell/usePeekDoTrilho";
import { VersionFooter } from "@/components/shell/VersionFooter";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import type { Idioma } from "@/lib/i18n/idiomas";
import { useIdioma } from "@/lib/i18n/IdiomaProvider";
import type { FunilDoMenu } from "@/lib/navigation/funis-no-menu";
import {
  GRUPO_NO_RODAPE,
  hubSections,
  type NavDestination,
  type NavGroup,
  type NavGroupId,
  sidebarGroups,
} from "@/lib/navigation/registry";
import { grupoDaRota, rotaCasa } from "@/lib/navigation/rota-atual";
import {
  CaretDoubleLeft,
  CaretDoubleRight,
  ChartBar,
  ChatsCircle,
  Gear,
  Kanban,
  Plugs,
  Robot,
} from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/**
 * O ícone de cada grupo no trilho. Mora aqui, e não no registro, porque é
 * desenho desta barra: o hub, o ⌘K e a gaveta do celular não desenham grupo
 * com ícone, e pôr o campo no `catalogo.ts` (que é do upstream) seria conflito
 * de merge para servir a um leitor só.
 */
const ICONE_DO_GRUPO: Record<Exclude<NavGroupId, "organizacao">, PhosphorIcon> = {
  atendimento: ChatsCircle,
  crm: Kanban,
  ia: Robot,
  canais: Plugs,
  analise: ChartBar,
};

/**
 * Rótulo CURTO de um grupo, só no trilho de 72px e só no idioma em que a
 * tradução normal não cabe. "Conversas" vira "Conversaciones" em espanhol, que
 * no trilho sairia "Conversa…"; ali usamos "Chats". No título da coluna e na
 * trilha do cabeçalho, que têm espaço, vale a tradução de sempre.
 *
 * Mapa aqui, e não um "Conversas" com outra tradução no dicionário: a chave do
 * dicionário é o texto em português, uma só para o produto inteiro, e trocá-la
 * mudaria cabeçalhos de tabela que dizem "Conversas" em outro sentido. Mora
 * nesta barra pelo mesmo motivo do `ICONE_DO_GRUPO`: é desenho dela.
 */
const ROTULO_CURTO_NO_TRILHO: Partial<Record<NavGroupId, Partial<Record<Idioma, string>>>> = {
  atendimento: { es: "Chats" },
};

/**
 * O botão do trilho nas medidas do `.rail-btn` do protótipo: até 64px de largura
 * (`max-w-full` encolhe para o que a coluna de 72px deixa) e rótulo 10.5px
 * semibold com tracking levemente fechado. Com 56px e `px-1` o rótulo tinha 48px
 * e "Atendimento" saía "Atendi…"; e a soma botão + padding da coluna passava da
 * largura, o que desenhava uma barra horizontal embaixo do trilho.
 */
const BOTAO_DO_TRILHO =
  "relative flex min-h-14 w-16 max-w-full flex-col items-center justify-center gap-1 rounded-xl px-0.5 py-1.5 text-[10.5px] leading-[1.1] font-semibold tracking-[-0.01em] transition-colors";
const BOTAO_MARCADO = "bg-card text-foreground ring-1 ring-border";
const BOTAO_SOLTO = "text-muted-foreground hover:bg-accent/50 hover:text-foreground";

/**
 * A barra do desktop em DUAS colunas: um trilho de 72px com um botão por grupo e,
 * ao lado, as telas do grupo escolhido.
 *
 * Por que trocou a lista única: a densidade da barra antiga era medida em pixel
 * e cada tela nova empurrava um grupo para trás de um hub. Com uma coluna por
 * grupo, o limite passa a ser o de UM grupo, e a coluna mostra o inventário
 * inteiro dele (o mesmo do hub).
 *
 * Não decide permissão: `sidebarGroups()` diz quais grupos este papel vê e
 * `hubSections()` quais telas, os mesmos dois que já alimentavam a barra antiga
 * e os hubs. O estado de abrir/fechar mora em `usePeekDoTrilho`.
 */
export function BarraEmDuasColunas({
  collapsed,
  funis = [],
  marca,
}: {
  collapsed: boolean;
  funis?: readonly FunilDoMenu[];
  /** A marca já resolvida (`MarcaDaBarra`, onde mora a proteção do logo). */
  marca: ReactNode;
}) {
  const t = useT();
  const idioma = useIdioma();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const { user, activeOrg } = useAuth();
  const args = [
    user.is_platform_admin && !user.support,
    activeOrg?.role ?? null,
    activeOrg?.interface_settings,
    activeOrg?.modulos_ligados ?? [],
    activeOrg?.capacidades_ligadas ?? [],
  ] as const;
  const todos = sidebarGroups(...args);
  const noTrilho = todos.filter((g) => g.group.id !== GRUPO_NO_RODAPE);
  const rodape = todos.find((g) => g.group.id === GRUPO_NO_RODAPE)?.group ?? null;

  /**
   * As telas de um grupo na coluna 2.
   *
   * Grupo COM hub mostra o inventário inteiro (`hubSections`): a coluna tem o
   * espaço que o hub existia para dar. Grupo SEM hub mostra só o que já ia para
   * o menu (`sidebarGroups`), porque ali "sem `sidebar`" é decisão de produto e
   * não falta de espaço: Nuvemshop saiu de Canais a pedido do dono, e listar o
   * inventário a traria de volta sem ninguém ter pedido.
   */
  function secoesDe(grupo: NavGroup, itensDoMenu: NavDestination[]): Secao[] {
    if (!grupo.hub) return [{ section: "", items: itensDoMenu }];
    return hubSections(grupo.id, ...args);
  }

  const {
    escolhido,
    peekAberto,
    escolher,
    fechar,
    colunaRef,
    raizRef,
    onKeyDown,
    onBlur,
    registrarBotao,
  } = usePeekDoTrilho({ collapsed, pathname });
  const daRota = grupoDaRota(pathname);
  const selecionaveis = todos.map((g) => g.group.id);
  // Organização entra como selecionável só pela ROTA: no trilho ela é o link
  // Ajustes, mas dentro de Configurações a coluna 2 mostra as telas dela.
  const mostrado =
    [escolhido, daRota].find((id): id is NavGroupId => !!id && selecionaveis.includes(id)) ??
    noTrilho[0]?.group.id ??
    null;
  const grupoMostrado = todos.find((g) => g.group.id === mostrado) ?? null;
  const colunaVisivel = !collapsed || peekAberto;
  const colunaId = useId();
  const rodapeAtivo =
    !!rodape?.hub && (daRota === GRUPO_NO_RODAPE || rotaCasa(pathname, rodape.hub.href));

  return (
    <div ref={raizRef} onKeyDown={onKeyDown} onBlur={onBlur} className="relative flex h-full">
      {/* Sem `border-r`: trilho e coluna são UM bloco da cor da moldura, como no
          protótipo; a divisão entre eles é a diferença de conteúdo, não um fio. */}
      <div className="flex w-[72px] shrink-0 flex-col items-center">
        {/* `data-marca-da-barra`: a caixa que o e2e da moldura do logo mede. */}
        <div data-marca-da-barra className="flex h-14 w-full items-center justify-center px-2">
          {marca}
        </div>
        <nav
          aria-label={t("Grupos da navegação")}
          // `overflow-x-hidden` + `scrollbar-none`: com só `overflow-y-auto` o eixo
          // x vira `auto` junto, e qualquer pixel a mais desenhava a barra de
          // rolagem horizontal embaixo do trilho. A rolagem vertical continua.
          className="scrollbar-none flex w-full flex-1 flex-col items-center gap-1 overflow-y-auto overflow-x-hidden px-1 py-2"
        >
          {noTrilho.map(({ group, items }) => {
            const Icone = ICONE_DO_GRUPO[group.id as keyof typeof ICONE_DO_GRUPO];
            // Com a coluna à vista, o fundo segue o grupo MOSTRADO nela; recolhida e
            // sem "peek", segue o grupo da rota, o único que faz sentido marcar.
            const marcado = colunaVisivel ? mostrado === group.id : daRota === group.id;
            const daRotaAtual = daRota === group.id;
            const telas = secoesDe(group, items).flatMap((s) => s.items);
            return (
              <button
                key={group.id}
                ref={registrarBotao(group.id)}
                type="button"
                onClick={() => escolher(group.id, mostrado)}
                title={t(group.label)}
                aria-pressed={collapsed ? undefined : mostrado === group.id}
                aria-expanded={collapsed ? peekAberto && mostrado === group.id : undefined}
                aria-controls={collapsed && peekAberto ? colunaId : undefined}
                className={cn(BOTAO_DO_TRILHO, marcado ? BOTAO_MARCADO : BOTAO_SOLTO)}
              >
                {/* O ícone em `text-primary` marca o grupo DA ROTA; o fundo marca o
                    grupo MOSTRADO na coluna. Em repouso são o mesmo; quem está
                    espiando outro grupo continua vendo de onde saiu. */}
                <Icone
                  size={20}
                  weight={daRotaAtual ? "fill" : "regular"}
                  className={cn(daRotaAtual && "text-primary")}
                  aria-hidden
                />
                <span className="max-w-full truncate">
                  {ROTULO_CURTO_NO_TRILHO[group.id]?.[idioma] ?? t(group.label)}
                </span>
                {telas.some((d) => d.contador === "fila") && <ContadorDaFila compacto />}
                {telas.some((d) => d.contador === "casos") && <ContadorDeCasos compacto />}
                {telas.some((d) => d.healthDot) && (
                  <ConnectionHealthDot className="absolute top-1.5 right-1.5" />
                )}
              </button>
            );
          })}
        </nav>
        <div className="flex w-full flex-col items-center gap-1 border-t px-1 py-2">
          {rodape?.hub && (
            <Link
              href={rodape.hub.href}
              title={t(rodape.hub.label)}
              aria-current={pathname === rodape.hub.href ? "page" : undefined}
              onClick={fechar}
              className={cn(BOTAO_DO_TRILHO, rodapeAtivo ? BOTAO_MARCADO : BOTAO_SOLTO)}
            >
              <Gear size={20} className={cn(rodapeAtivo && "text-primary")} aria-hidden />
              <span className="max-w-full truncate">{t("Ajustes")}</span>
            </Link>
          )}
          <button
            type="button"
            onClick={() => startTransition(() => toggleSidebar(collapsed))}
            disabled={isPending}
            className="flex h-8 w-14 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            aria-label={collapsed ? t("Expandir sidebar") : t("Recolher sidebar")}
          >
            {collapsed ? (
              <CaretDoubleRight size={14} aria-hidden />
            ) : (
              <CaretDoubleLeft size={14} aria-hidden />
            )}
          </button>
        </div>
      </div>

      {colunaVisivel && grupoMostrado && (
        <div
          id={colunaId}
          ref={colunaRef}
          className={cn(
            "flex w-[232px] shrink-0 flex-col",
            // Recolhida, a coluna vira sobreposição: sai do fluxo para não empurrar
            // o conteúdo (a barra continua com 72px, a medida que a casca conhece).
            collapsed && "absolute top-0 left-[72px] z-40 h-full border-r bg-background shadow-lg",
          )}
        >
          <ColunaDoGrupo
            grupo={grupoMostrado.group}
            secoes={secoesDe(grupoMostrado.group, grupoMostrado.items)}
            pathname={pathname}
            funis={funis}
            onNavigate={fechar}
            acaoDoTitulo={
              // O « ao lado do título (o `.nav2-head` do protótipo): o MESMO
              // `toggleSidebar` do botão do rodapé do trilho, mais perto de quem
              // acabou de escolher a tela. Só com a coluna fixa: no "peek" ela já
              // fecha sozinha ao sair, e não há o que recolher.
              collapsed ? undefined : (
                <button
                  type="button"
                  onClick={() => startTransition(() => toggleSidebar(collapsed))}
                  disabled={isPending}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={t("Recolher menu")}
                  title={t("Recolher menu")}
                >
                  <CaretDoubleLeft size={14} aria-hidden />
                </button>
              )
            }
          />
          <div className="border-t p-2">
            <VersionFooter collapsed={false} onNavigate={fechar} />
          </div>
        </div>
      )}
    </div>
  );
}
