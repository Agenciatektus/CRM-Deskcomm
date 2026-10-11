import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Chip de escolha — o `.chip` do protótipo da Inbox v2 (Main.dc.html:541).
 *
 * Botão de alternar, em pílula de 30px: desligado é contorno na linha forte;
 * ligado (`aria-pressed`) é o accent cheio e, no escuro, o degradê de texto da
 * pele (`pele-grad-ativo`, que lê o mesmo `aria-pressed`). Desativado segue o
 * `.dp-times .chip:disabled`: tracejado e apagado.
 *
 * Nasceu na Etapa 1 do design system para a vitrine `/app/design-system`. As
 * telas que hoje desenham chip à mão (atalhos de prazo, motivos de perda) NÃO
 * foram trocadas: isso é a etapa de substituição, com aprovação.
 */
const chipVariants = cva(
  [
    "pele-grad-ativo inline-flex h-7.5 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-3",
    "text-label font-semibold",
    "transition-[background-color,border-color,color] duration-ui ease-emphasized",
    "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:cursor-not-allowed disabled:border-dashed disabled:opacity-40",
    "[&_svg]:size-3.5 [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      tom: {
        padrao:
          "border-border-strong bg-surface text-text-muted hover:border-text-subtle hover:text-text aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-accent-foreground",
      },
    },
    defaultVariants: { tom: "padrao" },
  },
);

export interface ChipProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed">,
    VariantProps<typeof chipVariants> {
  /** Ligado. Vira `aria-pressed`, que é o que a cor e a pele leem. */
  ligado?: boolean;
}

const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(
  ({ className, tom, ligado = false, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      aria-pressed={ligado}
      className={cn(chipVariants({ tom }), className)}
      {...props}
    />
  ),
);
Chip.displayName = "Chip";

export { Chip, chipVariants };
