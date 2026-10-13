"use client";

import type { Locale } from "date-fns";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";

export function formatMoney(cents: number | null, currency: string | null): string {
  if (cents == null) return "—";
  const cur = currency ?? "BRL";
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: cur }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${cur}`;
  }
}

export function shortDate(iso: string, locale: Locale): string {
  return format(new Date(iso), "dd/MM/yy HH:mm", { locale });
}

/**
 * O que cada seção mostra quando não tem lista para mostrar.
 *
 * Peça única porque são várias seções tomando a MESMA decisão, e foi por essa
 * decisão viver repetida que elas mentiam juntas. Erro sem saída também é beco,
 * por isso o botão.
 *
 * `vazio` chega JÁ traduzido: quem conhece a frase é quem chama, e `t()` sobre
 * um parâmetro livre é o que o guarda de i18n proíbe (o valor não passa pelo
 * dicionário de forma verificável).
 */
export function SemLista({
  vazio,
  erro,
  onTentarDeNovo,
}: {
  vazio: string;
  erro: boolean;
  onTentarDeNovo: () => void;
}) {
  const t = useT();
  if (!erro) return <p className="mt-2 text-xs text-muted-foreground">{vazio}</p>;
  return (
    <div className="mt-2 space-y-1">
      <p className="text-xs text-error-fg">{t("Não consegui ler estes dados.")}</p>
      <Button size="sm" variant="outline" onClick={onTentarDeNovo}>
        {t("Tentar de novo")}
      </Button>
    </div>
  );
}
