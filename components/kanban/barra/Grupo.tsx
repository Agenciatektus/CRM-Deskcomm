import type { ReactNode } from "react";

/** Um grupo do painel de filtros: legenda + chips. `fieldset` para o leitor de tela anunciar o grupo. */
export function Grupo({ titulo, apoio, children }: { titulo: string; apoio?: string; children: ReactNode }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 flex items-baseline gap-2 text-xs font-bold tracking-wide text-text-subtle uppercase">
        {titulo}
        {apoio && <span className="font-normal tracking-normal normal-case">{apoio}</span>}
      </legend>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </fieldset>
  );
}
