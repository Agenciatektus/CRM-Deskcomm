"use client";

import { razaoDeContraste } from "@/lib/branding/contraste";
import { hexDasCamadas } from "@/lib/design-system/cor-computada";
import { cn } from "@/lib/utils";

import { MAPA, type IdDoMapa } from "@/lib/design-system/mapa";

import { SeloDoMapa, ValorDoPrototipo } from "./SeloDoMapa";
import type { Tema } from "./tema";
import { useMedida } from "./useMedida";

/** O fundo pintado do elemento, composto sobre o fundo do pai (para `rgba`). */
function fundoPintado(el: HTMLElement): string | null {
  const pai = el.parentElement ? window.getComputedStyle(el.parentElement).backgroundColor : "";
  const proprio = window.getComputedStyle(el).backgroundColor;
  return hexDasCamadas(pai ? [pai, proprio] : [proprio]);
}

function medirAmostra(el: HTMLElement): { hex: string | null; declarado: string } {
  const token = el.dataset.token ?? "";
  return {
    hex: fundoPintado(el),
    declarado: token ? window.getComputedStyle(el).getPropertyValue(token).trim() : "",
  };
}

/**
 * Uma amostra de cor: a classe de VERDADE que as telas usam (`bg-surface`…),
 * o nome do token, o valor que o navegador computou ali e, DENTRO dela, o selo
 * do mapa com o valor do protótipo ao lado quando difere.
 */
export function Amostra({
  token,
  classe,
  mapa,
  tema,
}: {
  token: string;
  classe: string;
  mapa: IdDoMapa;
  tema: Tema;
}) {
  const [ref, medida] = useMedida<HTMLDivElement, ReturnType<typeof medirAmostra>>(medirAmostra);
  const prototipo = MAPA[mapa].ref;
  return (
    <div
      data-amostra={token}
      className="flex min-w-0 flex-col overflow-hidden rounded-md border border-border bg-surface"
    >
      <div ref={ref} data-token={token} className={cn("h-10 border-b border-border", classe)} />
      <div className="flex min-w-0 flex-col gap-0.5 px-2 py-1.5">
        <code className="truncate text-meta font-semibold">{token}</code>
        <span className="truncate font-mono text-meta text-text-subtle" title={medida?.declarado}>
          {medida?.hex ?? "—"}
        </span>
        <ValorDoPrototipo id={mapa} tema={tema} />
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <SeloDoMapa id={mapa} tema={tema} />
          {prototipo ? (
            <code
              className="truncate text-meta text-text-subtle"
              title={`${prototipo.arquivo}:${prototipo.linha}`}
            >
              {prototipo.seletor}
            </code>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function medirPar(el: HTMLElement): number | null {
  const frente = window.getComputedStyle(el).color;
  const fundo = fundoPintado(el);
  const hexFrente = hexDasCamadas([frente]);
  if (!fundo || !hexFrente) return null;
  return razaoDeContraste(hexFrente, fundo);
}

/** Um par de texto e fundo com a razão de contraste medida na tela. */
export function ParDeContraste({ nome, classe }: { nome: string; classe: string }) {
  const [ref, razao] = useMedida<HTMLDivElement, number | null>(medirPar);
  const passa = razao !== null && razao >= 4.5;
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-surface p-2">
      <div ref={ref} className={cn("rounded-sm px-2 py-1 text-ui font-semibold", classe)}>
        Aa 123
      </div>
      <code className="min-w-0 flex-1 truncate text-meta text-text-muted">{nome}</code>
      <span
        className={cn(
          "font-mono text-meta font-bold",
          razao === null ? "text-text-subtle" : passa ? "text-success-fg" : "text-error-fg",
        )}
      >
        {razao === null ? "—" : `${razao.toFixed(2)}:1 ${passa ? "AA" : "✗"}`}
      </span>
    </div>
  );
}
