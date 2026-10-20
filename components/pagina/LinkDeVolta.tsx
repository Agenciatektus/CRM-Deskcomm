import Link from "next/link";
import type { ReactNode } from "react";

import { ArrowBendUpLeft } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/**
 * "↶ <Pai>" acima do título de uma página de 2º nível (o detalhe de uma
 * campanha, de um agente, de um contato): o mesmo link que a ficha da campanha já
 * usava, agora num lugar só. Some no celular (`mb:hidden`), onde o voltar é da
 * casca (`BarraDeTela`).
 *
 * O texto chega JÁ traduzido (`t("Agentes")` no cliente, `traduzir` no servidor):
 * traduzir aqui um parâmetro livre é o que a cerca de i18n reprova.
 */
export function LinkDeVolta({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-sm text-sm text-muted-foreground hover:text-text focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:outline-hidden mb:hidden",
        className,
      )}
    >
      <ArrowBendUpLeft size={14} aria-hidden />
      {children}
    </Link>
  );
}
