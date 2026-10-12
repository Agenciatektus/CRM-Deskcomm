import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * O MOLDE DE PÁGINA do design system (quadro Inbox v2 + protótipo mobile), para as
 * telas de lista e de ficha fora da Inbox, do Funil e das Tarefas (que têm tela
 * própria no celular).
 *
 * Desktop: coluna centralizada, no respiro do `main` da AppShell. Celular (`mb:`):
 * a página encosta nas bordas (desconta o `p-6` do `main`) e cada peça põe o próprio
 * respiro de 16px, como as telas do protótipo; o topo com voltar é da casca
 * (`BarraDeTela`), e por isso o título da página some no celular.
 *
 * Só CSS decide desktop x celular: nada lê o navegador no primeiro render.
 */
export function Pagina({ children, className, testId }: { children: ReactNode; className?: string; testId?: string }) {
  return (
    <div
      data-testid={testId}
      className={cn("mx-auto flex w-full max-w-6xl flex-col gap-5 mb:-mx-6 mb:-mt-6 mb:w-auto mb:gap-3", className)}
    >
      {children}
    </div>
  );
}

/**
 * O cabeçalho da página: título (`text-title-lg`), descrição e ações. No celular o
 * título e a descrição saem (a barra da casca já diz onde se está), a não ser numa
 * ficha (`tituloNoCelular`), em que o título é o nome do registro. As ações viram
 * uma faixa rolável; a ação principal da tela vai para o `BotaoDaTela` (o "+" do
 * protótipo), e quem a declara aqui marca o botão com `mb:hidden`.
 */
export function CabecalhoDaPagina({
  titulo,
  descricao,
  acoes,
  antes,
  tituloNoCelular = false,
}: {
  titulo: ReactNode;
  descricao?: ReactNode;
  acoes?: ReactNode;
  /** O que vem acima do título (o "voltar" de uma ficha no desktop, por exemplo). */
  antes?: ReactNode;
  tituloNoCelular?: boolean;
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 mb:px-4 mb:pt-3">
      <div className={cn("min-w-0", !tituloNoCelular && "mb:hidden")}>
        {antes}
        <h1 className="break-words text-title-lg">{titulo}</h1>
        {descricao ? <p className="mt-1 text-sm text-muted-foreground">{descricao}</p> : null}
      </div>
      {acoes ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 mb:-mx-4 mb:flex-nowrap mb:overflow-x-auto mb:px-4 mb:empty:hidden">
          {acoes}
        </div>
      ) : null}
    </header>
  );
}

/** Um bloco da página com o respiro do celular (16px dos lados). */
export function SecaoDaPagina({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("flex flex-col gap-3 mb:px-4", className)}>{children}</section>;
}
