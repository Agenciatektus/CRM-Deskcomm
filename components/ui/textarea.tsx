import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        // O campo do quadro DS (`.input`) em várias linhas: raio 10, fundo
        // surface-2, borda `line`, foco com a borda de destaque e anel de 3px.
        "flex min-h-20 w-full rounded-field border border-border bg-surface-elevated px-3 py-2.5",
        "text-ui leading-normal text-text placeholder:text-text-subtle",
        "transition-[border-color,box-shadow,background-color] duration-ui ease-emphasized",
        "hover:border-border-strong",
        "focus-visible:outline-hidden focus-visible:border-accent focus-visible:bg-surface focus-visible:ring-3 focus-visible:ring-accent-soft",
        "disabled:cursor-not-allowed disabled:opacity-55",
        "aria-[invalid=true]:border-error aria-[invalid=true]:bg-surface aria-[invalid=true]:ring-3 aria-[invalid=true]:ring-error-bg",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
