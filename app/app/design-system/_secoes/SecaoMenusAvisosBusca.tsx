"use client";

import { useState, type MouseEvent } from "react";

import { MenuDaConversa } from "@/components/inbox/menu/MenuDaConversa";
import type { AlvoDoMenu } from "@/components/inbox/menu/useMenuDaConversa";
import { CentralDeAvisos } from "@/components/shell/CentralDeAvisos";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { conversaDaVitrine } from "@/lib/design-system/amostras/conversa";
import { IDS } from "@/lib/design-system/amostras/ids";
import { DotsThree, MagnifyingGlass } from "@/lib/ui/icons";

import { marcarBuscaAberta } from "../_componentes/ApiDaVitrine";
import { Exemplo, Secao } from "../_componentes/Secao";
import type { Tema } from "../_componentes/tema";

function MenuDaConversaDeExemplo({ tema }: { tema: Tema }) {
  const t = useT();
  const [agora] = useState(() => Date.now());
  const [conversa] = useState(() => conversaDaVitrine(agora));
  const [alvo, setAlvo] = useState<AlvoDoMenu | null>(null);
  function abrir(e: MouseEvent<HTMLButtonElement>) {
    const caixa = e.currentTarget.getBoundingClientRect();
    setAlvo({ id: conversa.id, x: caixa.left, y: caixa.bottom, origem: e.currentTarget, vez: Date.now() });
  }
  return (
    <Exemplo nome={t("Menu da conversa (botão direito ou \"…\")")} mapa="ds:menu-da-conversa" tema={tema}>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={abrir} aria-label={t("Mais ações")}>
          <DotsThree aria-hidden />
          {t("Abrir o menu")}
        </Button>
        <span className="text-meta text-text-subtle">
          {t("Ele nasce no fim da página e se mede antes de aparecer; por isso abre por botão, e não fixo aqui.")}
        </span>
      </div>
      <MenuDaConversa
        alvo={alvo}
        conversation={alvo ? conversa : null}
        onFechar={() => setAlvo(null)}
        meuUserId={IDS.atendente}
        automaticoDaOrg
      />
    </Exemplo>
  );
}

function BuscaGeral({ tema }: { tema: Tema }) {
  const t = useT();
  const [aberta, setAberta] = useState(false);
  function mudar(v: boolean) {
    // Enquanto ESTA paleta está aberta, a busca dela responde com as amostras.
    marcarBuscaAberta(v);
    setAberta(v);
  }
  return (
    <Exemplo nome={t("Busca geral (Ctrl K)")} mapa="ds:busca-geral" tema={tema}>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => mudar(true)}>
          <MagnifyingGlass aria-hidden />
          {t("Abrir a busca")}
        </Button>
        <span className="text-meta text-text-subtle">
          {t("Digite \"mari\": contatos, conversas e leads vêm das amostras; telas e ações são as de verdade.")}
        </span>
      </div>
      <CommandPalette open={aberta} onOpenChange={mudar} />
    </Exemplo>
  );
}

export function SecaoMenusAvisosBusca({ tema }: { tema: Tema }) {
  const t = useT();
  return (
    <Secao
      id={`menus-${tema}`}
      titulo={t("Menus, avisos e busca")}
      mapa="ds:menus"
      tema={tema}
      apoio={t("Menus abrem onde o clique aconteceu e são medidos antes de aparecer. Todo menu fecha ao clicar fora e com Esc.")}
    >
      <MenuDaConversaDeExemplo tema={tema} />
      <Exemplo nome={t("Central de avisos (sino)")} mapa="ds:central-de-avisos" tema={tema}>
        <div className="w-full max-w-sm overflow-hidden rounded-menu border border-border bg-surface shadow-pop">
          <CentralDeAvisos podeResolver onFechar={() => undefined} />
        </div>
        <p className="text-meta text-text-subtle">
          {t("O conteúdo do popover do sino, fixo na página. As ações respondem com as amostras; nada é resolvido de verdade.")}
        </p>
      </Exemplo>
      <BuscaGeral tema={tema} />
    </Secao>
  );
}
