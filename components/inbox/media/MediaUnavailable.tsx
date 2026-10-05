"use client";
import { useT } from "@/hooks/i18n/useT";
import { cn } from "@/lib/utils";
import { ImageIcon } from "@/lib/ui/icons";

/**
 * Fallback compartilhado quando a mídia não carrega (expirada/removida).
 *
 * `expirada`: o ponteiro do canal venceu antes de o CRM guardar os bytes (o
 * anexo do Instagram vale pouco tempo). Dizer "expirada" é a verdade e poupa o
 * atendente de recarregar a tela esperando que apareça.
 */
export function MediaUnavailable({
  kind,
  className,
  expirada = false,
}: {
  kind: string;
  className?: string;
  expirada?: boolean;
}) {
  const t = useT();
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-1 rounded-lg bg-background/40 text-muted-foreground",
        className || "h-24 w-56",
      )}
    >
      <ImageIcon size={20} weight="duotone" aria-hidden />
      <span className="text-xs">{expirada ? t("Mídia expirada") : t("Mídia indisponível")}</span>
      <span className="sr-only">{t(kind)}</span>
    </div>
  );
}
