"use client";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/hooks/i18n/useT";
import { CaretRight } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/**
 * Os quatro estados de uma lista, num lugar só: carregando (esqueleto), erro (com
 * "Tentar novamente"), vazio (o `EmptyState` da tela) e a lista. No celular os
 * estados ganham o respiro de 16px; a lista encosta nas bordas.
 */
export function EstadoDaLista({
  carregando,
  erro,
  aoTentarDeNovo,
  vazio,
  quantidade,
  children,
}: {
  carregando: boolean;
  erro?: string | null;
  aoTentarDeNovo?: () => void;
  vazio: ReactNode;
  quantidade: number;
  children: ReactNode;
}) {
  const t = useT();
  if (carregando) {
    return (
      <div className="flex flex-col gap-2 mb:px-4" aria-busy>
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-12 w-full mb:h-16" />
        ))}
      </div>
    );
  }
  if (erro) {
    return (
      <Card className="p-6 text-center mb:mx-4">
        <p className="text-sm text-error-fg">{erro}</p>
        {aoTentarDeNovo ? (
          <Button size="sm" variant="outline" className="mt-3" onClick={aoTentarDeNovo}>
            {t("Tentar novamente")}
          </Button>
        ) : null}
      </Card>
    );
  }
  if (quantidade === 0) return <Card className="p-2 mb:mx-4">{vazio}</Card>;
  return <>{children}</>;
}

/**
 * Tabela no desktop, cartões empilhados no celular (o tratamento "Empilhada" do
 * catálogo mobile). Os dois existem no HTML e o CSS escolhe: sem `matchMedia`, sem
 * piscar na hidratação.
 */
export function TabelaOuCartoes<T>({
  itens,
  chave,
  tabela,
  cartao,
  rotulo,
}: {
  itens: readonly T[];
  chave: (item: T) => string;
  tabela: ReactNode;
  cartao: (item: T) => ReactNode;
  /** Nome da lista para leitor de tela (o `aria-label` da lista do celular). */
  rotulo: string;
}) {
  return (
    <>
      <Card className="overflow-hidden mb:hidden">{tabela}</Card>
      <ul aria-label={rotulo} className="hidden flex-col border-y border-border bg-surface mb:flex">
        {itens.map((item) => (
          <li key={chave(item)} className="border-b border-border last:border-b-0">
            {cartao(item)}
          </li>
        ))}
      </ul>
    </>
  );
}

export interface CampoDoCartao {
  rotulo: string;
  valor: ReactNode;
}

/**
 * Uma linha da lista do celular como cartão chave-valor: título (16px, o nome da
 * linha do protótipo), selo à direita, apoio e os campos que a tabela mostra em
 * colunas. Abre por link (`href`) ou por toque (`aoAbrir`); alvo mínimo de 44px.
 */
export function CartaoEmpilhado({
  titulo,
  apoio,
  selo,
  campos = [],
  href,
  aoAbrir,
}: {
  titulo: ReactNode;
  apoio?: ReactNode;
  selo?: ReactNode;
  campos?: CampoDoCartao[];
  href?: string;
  aoAbrir?: () => void;
}) {
  const corpo = (
    <>
      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-2">
          <span className="min-w-0 flex-1 truncate text-(length:--mb-linha-nome) font-semibold text-text">{titulo}</span>
          {selo ? <span className="shrink-0">{selo}</span> : null}
        </span>
        {apoio ? <span className="mt-0.5 block truncate text-sm text-text-muted">{apoio}</span> : null}
        {campos.length > 0 ? (
          <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-sm">
            {campos.map((c) => (
              <div key={c.rotulo} className="contents">
                <dt className="text-text-subtle">{c.rotulo}</dt>
                <dd className="min-w-0 truncate text-text">{c.valor}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </span>
      {href || aoAbrir ? <CaretRight size={18} className="mt-0.5 shrink-0 text-text-subtle" aria-hidden /> : null}
    </>
  );
  const classe = cn("pele-foco flex min-h-(--mb-alvo) w-full items-start gap-3 px-4 py-3 text-left", (href || aoAbrir) && "hover:bg-hover");
  if (href) {
    return (
      <Link href={href} className={classe}>
        {corpo}
      </Link>
    );
  }
  if (aoAbrir) {
    return (
      <button type="button" onClick={aoAbrir} className={classe}>
        {corpo}
      </button>
    );
  }
  return <div className={classe}>{corpo}</div>;
}
