"use client";
import { usePathname } from "next/navigation";

import { useT } from "@/hooks/i18n/useT";
import { NAV_GROUPS } from "@/lib/navigation/registry";
import { destinoDaRota } from "@/lib/navigation/rota-atual";

import { AguardandoResposta } from "./AguardandoResposta";
import { AlertsBell } from "./AlertsBell";
import { AvisoDePropostaEmDestaque } from "./AvisoDePropostaEmDestaque";
import { BotaoDeDisponibilidade } from "./BotaoDeDisponibilidade";
import { MobileSidebar } from "./MobileSidebar";
import { TenantSwitcher } from "./TenantSwitcher";
import { UserMenu } from "./UserMenu";
import { SearchTrigger } from "./SearchTrigger";

/**
 * "Grupo › Página" da rota atual, pelo MESMO registro que monta a barra lateral
 * (`destinoDaRota`, destino de `href` mais longo que casa). Com a barra em duas
 * colunas, a coluna do grupo pode estar mostrando outro grupo (ou nem aparecer,
 * recolhida); a trilha é o lugar fixo que diz onde a pessoa está.
 *
 * Sem destino que case (quadro de um funil, onboarding) não há trilha: inventar
 * um rótulo ali seria dizer o nome de uma tela que o registro não conhece.
 * Escondida abaixo de `md`, onde o cabeçalho já disputa espaço com a busca.
 */
function TrilhaDaRota() {
  const t = useT();
  const pathname = usePathname();
  const destino = destinoDaRota(pathname);
  const grupo = destino ? NAV_GROUPS.find((g) => g.id === destino.group) : undefined;
  if (!destino || !grupo) return null;
  return (
    <nav aria-label={t("Onde você está")} className="hidden min-w-0 md:block">
      <div className="flex min-w-0 items-center gap-2">
        <ol className="flex min-w-0 items-center gap-1.5 text-sm">
          <li className="truncate text-muted-foreground">{t(grupo.label)}</li>
          <li aria-hidden className="text-muted-foreground">
            ›
          </li>
          <li aria-current="page" className="truncate font-semibold text-foreground">
            {t(destino.label)}
          </li>
        </ol>
        {/* Fora da lista de propósito: a trilha é "Grupo › Página"; a nota é um
          dado da página, e o leitor de tela não deve ouvi-la como um nível. */}
        {destino.contador === "fila" && <AguardandoResposta />}
      </div>
    </nav>
  );
}

export function TopBar() {
  return (
    // Sem `border-b` e com o respiro do `.topbar` do protótipo (6px à esquerda,
    // 12px à direita): a trilha começa colada na barra lateral e o topo é a
    // mesma moldura dela, não uma faixa separada por um fio.
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 bg-background/95 pl-3 pr-3 backdrop-blur md:gap-3 md:pl-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <MobileSidebar />
        <TenantSwitcher />
        <TrilhaDaRota />
      </div>
      {/* A busca ocupa o meio e cresce até os 440px do protótipo (o limite mora
          no próprio gatilho); o `flex-1` aqui só reserva o espaço. */}
      <div className="flex min-w-0 flex-1 justify-center">
        <SearchTrigger />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <BotaoDeDisponibilidade />
        <AlertsBell />
        <AvisoDePropostaEmDestaque />
        <UserMenu />
      </div>
    </header>
  );
}
