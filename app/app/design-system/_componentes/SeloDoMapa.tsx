"use client";

import { Badge } from "@/components/ui/badge";
import { useT } from "@/hooks/i18n/useT";
import { MAPA, type IdDoMapa, type StatusDoMapa } from "@/lib/design-system/mapa";

import type { Tema } from "./tema";

const VARIANTE: Record<Exclude<StatusDoMapa, "igual">, "warning" | "info" | "neutral"> = {
  diferente: "warning",
  falta: "info",
  "sem-equivalente": "neutral",
};

/**
 * O selo discreto do que NÃO está igual ao protótipo, lido do mapa
 * (`lib/design-system/mapa.ts`). Igual não ganha selo: a ausência é a notícia.
 */
export function SeloDoMapa({ id, tema }: { id: IdDoMapa; tema: Tema }) {
  const t = useT();
  const status = MAPA[id][tema];
  if (status === "igual") return null;
  const rotulo =
    status === "diferente"
      ? t("Diferente do protótipo")
      : status === "falta"
        ? t("Falta no CRM")
        : t("Só no CRM");
  return (
    <Badge variant={VARIANTE[status]} className="px-2 text-meta" data-status={status}>
      {rotulo}
    </Badge>
  );
}

/**
 * Onde o equivalente mora no protótipo. É referência (arquivo:linha + seletor),
 * e não link: o protótipo vive em `docs/`, que não vai para a imagem do
 * produto, e roda num runtime de design que o app não serve.
 */
export function RefDoPrototipo({ id }: { id: IdDoMapa }) {
  const t = useT();
  const ref = MAPA[id].ref;
  if (!ref) return <span className="text-meta text-text-subtle">{t("Sem par no protótipo")}</span>;
  return (
    <span className="text-meta text-text-subtle">
      {t("Ver no protótipo")}:{" "}
      <code className="rounded-sm bg-surface-elevated px-1 text-text-muted">{ref.seletor}</code>{" "}
      <span className="font-mono">
        {ref.arquivo}:{ref.linha}
      </span>
    </span>
  );
}
