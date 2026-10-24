import type { ReactNode } from "react";

/**
 * Botão primário: o degradê da marca com texto branco (o mesmo do botão "Novo
 * lead" do CRM). É o único lugar da página onde o degradê preenche uma área.
 * Alvo de toque de 44 px.
 */
const BASE =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-grande font-semibold no-underline transition-[background,border-color] duration-150";

export function BotaoPrimario({
  href,
  children,
  externo = false,
  compacto = false,
}: {
  href: string;
  children: ReactNode;
  externo?: boolean;
  /** Menos respiro lateral no celular (cabeçalho), para caber em 320 px. */
  compacto?: boolean;
}) {
  return (
    <a
      href={href}
      {...(externo ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={`${BASE} ${compacto ? "px-2.5 text-[0.9rem] sm:px-5 sm:text-[0.95rem]" : "px-5 text-[0.95rem]"} bg-(image:--degrade) text-white shadow-[0_4px_0_rgb(0_0_0/0.25)] [text-shadow:0_1px_1px_rgb(0_0_0/0.25)] hover:bg-(image:--degrade-hover)`}
    >
      {children}
    </a>
  );
}

export function BotaoSecundario({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className={`${BASE} border border-border-strong bg-surface px-5 text-[0.95rem] text-text hover:border-text-subtle`}
    >
      {children}
    </a>
  );
}
