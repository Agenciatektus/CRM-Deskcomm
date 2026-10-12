"use client";
import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { CommandPalette } from "@/components/shell/CommandPalette";
import { useT } from "@/hooks/i18n/useT";
import { abaDaRota, conversaAberta, ehRaizDeAba, RAIZ_DA_ABA } from "@/lib/mobile/abas";
import type { FunilDoMenu } from "@/lib/navigation/funis-no-menu";
import { destinoDaRota } from "@/lib/navigation/rota-atual";
import { usePilhaDoApp } from "@/lib/mobile/pilha";
import { useAlturaDoTeclado } from "@/lib/mobile/useAlturaDoTeclado";
import { useEhCelular } from "@/lib/mobile/useEhCelular";
import { MagnifyingGlass } from "@/lib/ui/icons";

import { BarraDeTela } from "./BarraDeTela";
import { BarraInferior, ROTULOS_DAS_ABAS } from "./BarraInferior";
import { BotaoCriar } from "./BotaoCriar";
import { CabecalhoGrande } from "./CabecalhoGrande";
import { AcoesDosAvisos } from "./telas/Avisos";
import { MenuMais } from "./MenuMais";
import { AcoesDaListaDeConversas } from "./telas/AcoesDaListaDeConversas";

/**
 * A lupa do cabeçalho do celular. Abre a mesma busca geral do topo do desktop, numa
 * instância própria e SEM o atalho Ctrl K (o atalho é do gatilho do desktop; dois
 * ouvintes abririam duas buscas).
 */
function BuscaDoCelular() {
  const t = useT();
  const [aberta, setAberta] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        aria-label={t("Abrir a busca")}
        className="pele-foco grid size-(--mb-alvo) place-items-center rounded-full text-text hover:bg-hover"
      >
        <MagnifyingGlass size={22} aria-hidden />
      </button>
      <CommandPalette open={aberta} onOpenChange={setAberta} />
    </>
  );
}

/** O topo do celular: título grande no começo da aba, barra com voltar no resto. */
function CabecalhoDoCelular() {
  const t = useT();
  const rota = usePathname() ?? "";
  const idNaUrl = useSearchParams()?.get("id") ?? null;
  // A conversa aberta desenha a própria barra (com voltar e a ficha).
  if (conversaAberta(rota, idNaUrl)) return null;
  const aba = abaDaRota(rota);
  if (ehRaizDeAba(rota)) {
    // Em Conversas a busca mora no topo da lista (o campo do protótipo) e o
    // cabeçalho tem o ⋮ da lista; nas outras abas, a lupa.
    const acoes =
      aba === "conversas" ? (
        <AcoesDaListaDeConversas />
      ) : aba === "avisos" ? (
        // O ⋯ de Avisos ("Marcar todos resolvidos") ao lado da lupa.
        <>
          <AcoesDosAvisos />
          <BuscaDoCelular />
        </>
      ) : (
        <BuscaDoCelular />
      );
    return <CabecalhoGrande titulo={t(ROTULOS_DAS_ABAS[aba])} acoes={acoes} />;
  }
  const destino = destinoDaRota(rota);
  const voltarPara = aba === "mais" ? "/app" : RAIZ_DA_ABA[aba];
  return <BarraDeTela titulo={destino ? t(destino.label) : ""} voltarPara={voltarPara} acoes={<BuscaDoCelular />} />;
}

/**
 * A casca do app de celular (abaixo de 760px): topo, barra inferior, FAB e o menu
 * "Mais". Tudo com `hidden mb:*`: de 760px para cima nada disto aparece, e o topo e a
 * barra lateral de sempre continuam (eles é que somem abaixo de 760, na `AppShell`).
 */
export function CascaDoCelular({ funis }: { funis: readonly FunilDoMenu[] }) {
  const [maisAberto, setMaisAberto] = useState(false);
  usePilhaDoApp(usePathname() ?? "");
  useAlturaDoTeclado(useEhCelular());
  return (
    <>
      <div className="hidden mb:contents">
        <CabecalhoDoCelular />
      </div>
      <BarraInferior maisAberto={maisAberto} aoAbrirMais={() => setMaisAberto(true)} />
      <BotaoCriar />
      <MenuMais aberto={maisAberto} aoMudar={setMaisAberto} funis={funis} />
    </>
  );
}
