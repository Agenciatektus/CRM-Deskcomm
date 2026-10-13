import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Badge = a PÍLULA do quadro DS (`.pill`, "Indicadores e pílulas"): quadrada,
 * raio 6, 22px, 12/600, nunca quebra o texto. Pílula quadrada é ESTADO; a tag
 * arredondada (`variant="tag"`) é CLASSIFICAÇÃO; o chip (`components/ui/chip`)
 * é ESCOLHA.
 * Variantes: default (IA, accent-soft), neutral, success, warning, error, info,
 * fila (sem dono: contorno tracejado) e tag.
 * Compat: secondary -> neutral, destructive -> error, outline -> neutral sem fundo.
 */
const badgeVariants = cva(
  [
    "inline-flex h-5.5 shrink-0 items-center gap-1 whitespace-nowrap rounded-pill border px-2",
    "text-meta font-semibold",
    "transition-colors duration-ui ease-emphasized",
    "[&_svg]:size-3 [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "border-transparent bg-accent-soft text-accent-text",
        neutral: "border-border bg-surface-elevated text-text-muted",
        success: "border-transparent bg-success-bg text-success-fg",
        warning: "border-transparent bg-warning-bg text-warning-fg",
        error: "border-transparent bg-error-bg text-error-fg",
        info: "border-transparent bg-info-bg text-info-fg",
        fila: "border-dashed border-border-strong bg-surface text-error-fg",
        // `.tag`: arredondada, peso normal, fundo surface.
        tag: "rounded-full border-border bg-surface font-normal text-text-muted",
        // shadcn aliases
        secondary: "border-border bg-surface-elevated text-text-muted",
        destructive: "border-transparent bg-error-bg text-error-fg",
        outline: "border-border bg-transparent text-text",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
