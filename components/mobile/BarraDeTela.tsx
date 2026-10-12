"use client";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

import { useT } from "@/hooks/i18n/useT";
import { telasAtras } from "@/lib/mobile/pilha";
import { CaretLeft } from "@/lib/ui/icons";

/**
 * A barra das telas empilhadas (o `.nb` do protótipo): voltar à esquerda, título e
 * ações. O voltar é o HISTÓRICO do navegador, o mesmo do botão voltar do Android e do
 * gesto do iOS, mas só quando a tela anterior é do app (`telasAtras`, em
 * `lib/mobile/pilha.ts`). Quem chegou por link vai para `voltarPara`, e não para fora
 * do CRM.
 * `data-cabecalho-do-celular` faz a casca descontar a altura dela (`--mb-casca-topo`).
 */
export function BarraDeTela({
  titulo,
  voltarPara,
  acoes,
}: {
  titulo: string;
  voltarPara: string;
  acoes?: ReactNode;
}) {
  const t = useT();
  const router = useRouter();
  const voltar = () => {
    if (telasAtras() > 0) router.back();
    else router.push(voltarPara);
  };
  return (
    <header
      data-cabecalho-do-celular=""
      className="sticky top-0 z-20 flex min-h-(--mb-barra-altura) items-center gap-0.5 border-b border-border bg-background/95 px-1 backdrop-blur"
    >
      <button
        type="button"
        onClick={voltar}
        aria-label={t("Voltar")}
        className="pele-foco grid size-(--mb-alvo) shrink-0 place-items-center rounded-full text-accent-text hover:bg-hover"
      >
        <CaretLeft size={22} weight="bold" aria-hidden />
      </button>
      <h1 className="min-w-0 flex-1 truncate text-base font-bold text-text">{titulo}</h1>
      {acoes && <div className="flex shrink-0 items-center">{acoes}</div>}
    </header>
  );
}
