"use client";

import { useRef, useState, type CSSProperties } from "react";
import { toast } from "sonner";

import { PegadorDeColuna } from "@/components/inbox/colunas/PegadorDeColuna";
import {
  LARGURAS_PADRAO,
  LARGURA_DA_LISTA,
  LARGURA_DO_PAINEL,
  MINIMO_DA_CONVERSA,
  limitar,
  type Coluna,
  type Larguras,
} from "@/components/inbox/colunas/larguras";
import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";

import { Exemplo, Secao } from "../_componentes/Secao";
import type { Tema } from "../_componentes/tema";

/** As três colunas da Inbox em tamanho real, com os pegadores de verdade entre elas. */
function Divisorias() {
  const t = useT();
  const cartaoRef = useRef<HTMLDivElement | null>(null);
  const [larguras, setLarguras] = useState<Larguras>(LARGURAS_PADRAO);
  const ajustar = (coluna: Coluna, valor: number) =>
    setLarguras((l) => ({ ...l, [coluna]: limitar(coluna, valor, l, cartaoRef.current?.clientWidth ?? 0, true) }));
  const estilo = {
    "--largura-da-lista": `${larguras.lista}px`,
    "--largura-do-painel": `${larguras.painel}px`,
  } as CSSProperties;
  return (
    <div className="overflow-x-auto pb-2">
      <div
        ref={cartaoRef}
        style={estilo}
        className="relative grid h-40 w-[70rem] grid-cols-[var(--largura-da-lista)_minmax(0,1fr)_var(--largura-do-painel)] overflow-hidden rounded-xl border border-border bg-surface pele-cartao"
      >
        <div className="grid place-items-center border-r border-border bg-surface-elevated text-meta text-text-subtle">
          {t("Lista")} · {larguras.lista} px ({LARGURA_DA_LISTA.min}–{LARGURA_DA_LISTA.max})
        </div>
        <div className="grid place-items-center text-meta text-text-subtle">
          {t("Conversa, mínimo")} {MINIMO_DA_CONVERSA} px
        </div>
        <div className="grid place-items-center border-l border-border bg-surface-elevated text-meta text-text-subtle">
          {t("Lead")} · {larguras.painel} px ({LARGURA_DO_PAINEL.min}–{LARGURA_DO_PAINEL.max})
        </div>
        {(["lista", "painel"] as const).map((coluna) => (
          <PegadorDeColuna
            key={coluna}
            coluna={coluna}
            larguras={larguras}
            cartaoRef={cartaoRef}
            comPainel
            mover={ajustar}
            confirmar={ajustar}
            restaurar={(c) => setLarguras((l) => ({ ...l, [c]: LARGURAS_PADRAO[c] }))}
          />
        ))}
      </div>
    </div>
  );
}

export function SecaoRetorno({ tema }: { tema: Tema }) {
  const t = useT();
  const avisar = () =>
    toast(t("Conversa arquivada."), {
      action: { label: t("Desfazer"), onClick: () => toast(t("Desfeito")) },
    });
  return (
    <Secao id={`retorno-${tema}`} titulo={t("Retorno e redimensionamento")} mapa="ds:retorno" tema={tema}>
      <Secao id={`desfazer-${tema}`} sub titulo={t("Aviso com Desfazer")} mapa="ds:aviso-desfazer" tema={tema}>
        <Exemplo nome={t("O aviso de verdade (sonner), embaixo no centro")} mapa="comp:toast" tema={tema}>
          <Button variant="secondary" className="self-start" onClick={avisar}>
            {t("Mostrar aviso")}
          </Button>
        </Exemplo>
      </Secao>
      <Secao
        id={`divisorias-${tema}`}
        sub
        titulo={t("Divisórias reguláveis")}
        mapa="ds:divisorias"
        tema={tema}
        apoio={t("Arrastar, setas do teclado (Shift para passos maiores) ou duplo clique para voltar ao padrão. Os pegadores só aparecem a partir de 1536 px de tela, como na Inbox.")}
      >
        <Divisorias />
      </Secao>
    </Secao>
  );
}
