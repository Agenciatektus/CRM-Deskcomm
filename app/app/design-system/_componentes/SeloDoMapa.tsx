"use client";

import { Badge } from "@/components/ui/badge";
import { useT } from "@/hooks/i18n/useT";
import { MAPA, type IdDoMapa, type ItemDoMapa, type StatusDoMapa } from "@/lib/design-system/mapa";

import type { Tema } from "./tema";

const VARIANTE: Record<Exclude<StatusDoMapa, "igual">, "warning" | "info" | "error" | "neutral"> = {
  diferente: "warning",
  novo: "info",
  falta: "error",
  "sem-equivalente": "neutral",
};

/**
 * O selo do que NÃO está igual ao protótipo, lido do mapa
 * (`lib/design-system/mapa.ts`), sempre DENTRO da amostra ou do componente a
 * que se refere. Igual não ganha selo: a ausência é a notícia.
 */
export function SeloDoMapa({ id, tema }: { id: IdDoMapa; tema: Tema }) {
  const t = useT();
  const status = MAPA[id][tema];
  if (status === "igual") return null;
  const rotulo =
    status === "diferente"
      ? t("Diferente do protótipo")
      : status === "novo"
        ? t("Novo nesta etapa")
        : status === "falta"
          ? t("Falta")
          : t("Só no CRM");
  return (
    <Badge variant={VARIANTE[status]} className="px-2 text-meta" data-status={status}>
      {rotulo}
    </Badge>
  );
}

/** O valor do protótipo, quando a amostra difere dele: fica ao lado do atual. */
export function ValorDoPrototipo({ id, tema }: { id: IdDoMapa; tema: Tema }) {
  const t = useT();
  const item: ItemDoMapa = MAPA[id];
  const valor = item[tema] === "diferente" ? item.proto?.[tema] : undefined;
  if (!valor) return null;
  return (
    <span className="truncate font-mono text-meta text-warning-fg" title={valor}>
      {t("Protótipo")}: {valor}
    </span>
  );
}

/**
 * Onde o equivalente mora no protótipo. É referência (arquivo:linha + seletor),
 * e não link: o protótipo vive em `docs/`, que não vai para a imagem do
 * produto, e roda num runtime de design que o app não serve.
 */
export function RefDoPrototipo({ id, tema }: { id: IdDoMapa; tema?: Tema }) {
  const t = useT();
  const item: ItemDoMapa = MAPA[id];
  const ref = tema === "escuro" && item.refEscuro ? item.refEscuro : item.ref;
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
