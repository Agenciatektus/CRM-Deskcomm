"use client";
import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { SidebarSimple } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/**
 * Mostrar ou ocultar os detalhes do lead.
 *
 * São DOIS botões e o CSS escolhe qual aparece, sem media query em JavaScript:
 * `useMediaQuery` decide depois da hidratação, e a primeira pintura mostraria o
 * botão errado. A partir do `xl` o painel é uma coluna do grid e o botão a
 * esconde ou mostra; entre `md` e `xl` o painel é deslizante e o botão o abre.
 * Abaixo do `md` a barra do celular já tem a porta "Ficha".
 */
export function AlternarPainel({
  aberto,
  onAlternar,
  onAbrirFicha,
}: {
  aberto: boolean;
  onAlternar: () => void;
  onAbrirFicha?: () => void;
}) {
  const t = useT();
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className={cn("hidden w-9 px-0 xl:inline-flex", aberto && "text-accent")}
        aria-label={t("Mostrar ou ocultar detalhes do lead")}
        aria-pressed={aberto}
        title={t("Detalhes do lead")}
        onClick={onAlternar}
      >
        <SidebarSimple size={18} aria-hidden />
      </Button>
      {onAbrirFicha && (
        <Button
          size="sm"
          variant="ghost"
          className="hidden w-9 px-0 md:inline-flex xl:hidden"
          aria-label={t("Mostrar ou ocultar detalhes do lead")}
          title={t("Detalhes do lead")}
          onClick={onAbrirFicha}
        >
          <SidebarSimple size={18} aria-hidden />
        </Button>
      )}
    </>
  );
}
