import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // `.input` do quadro DS: 38px, raio 10, padding 11, fundo surface-2 e
          // borda `line`; no foco a borda vira a cor de destaque com anel de 3px
          // em accent-soft e o fundo vira surface; erro em crit com anel crit-bg.
          "flex h-9.5 w-full rounded-field border border-border bg-surface-elevated px-2.75 py-0",
          // `mb:text-[16px]`: no celular o Safari dá zoom em campo abaixo de 16px.
          "text-ui text-text placeholder:text-text-subtle mb:text-[16px]",
          "transition-[border-color,box-shadow,background-color] duration-ui ease-emphasized",
          "hover:border-border-strong",
          "focus-visible:outline-hidden focus-visible:border-accent focus-visible:bg-surface focus-visible:ring-3 focus-visible:ring-accent-soft",
          "file:border-0 file:bg-transparent file:text-label file:font-semibold file:text-text",
          "disabled:cursor-not-allowed disabled:opacity-55",
          "aria-[invalid=true]:border-error aria-[invalid=true]:bg-surface aria-[invalid=true]:ring-3 aria-[invalid=true]:ring-error-bg",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
