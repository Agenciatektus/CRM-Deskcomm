"use client";

import { traduzir } from "@/lib/i18n/traducao";
import type { Idioma } from "@/lib/i18n/idiomas";

/** Empresas (BM) que o login alcança, recolhidas atrás do botão Ver do painel de status. */
export function ListaDeEmpresas({
  id,
  empresas,
  idioma,
}: {
  id: string;
  empresas: { id: string; name: string }[];
  idioma: Idioma;
}) {
  const t = (texto: string) => traduzir(texto, idioma);
  return (
    <div id={id} data-testid="meta-lista-de-empresas" className="border-t border-border px-4 py-3">
      <p className="mb-2 text-xs text-text-muted">{t("Empresas (BM) que este login alcança")}</p>
      <ul className="flex flex-wrap gap-2">
        {empresas.map((b) => (
          <li
            key={b.id}
            className="rounded-md border border-border bg-surface-elevated px-2 py-1 text-xs"
          >
            {b.name.replaceAll("�", "")}
          </li>
        ))}
      </ul>
    </div>
  );
}
