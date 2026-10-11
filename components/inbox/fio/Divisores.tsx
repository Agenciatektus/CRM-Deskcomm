"use client";

import { useT } from "@/hooks/i18n/useT";

/**
 * Os marcadores do fio do quadro DS ("Mensagens"): o dia (`.day`, pílula de raio
 * 12 que gruda no topo ao rolar, ver ChatThread) e a divisória de novas
 * (`.newdiv`, "N mensagens novas" entre dois fios da marca a 35%). Componentes
 * próprios para o fio e a vitrine `/app/design-system` desenharem a mesma coisa.
 */
export function DivisorDoDia({ rotulo }: { rotulo: string }) {
  return (
    <div className="flex justify-center px-4 pb-1.5 pt-4">
      <span className="pele-dia rounded-lg border border-border bg-surface px-3 py-0.75 text-meta text-text-muted shadow-bubble">
        {rotulo}
      </span>
    </div>
  );
}

/** `quantas`: recebidas a partir da primeira não lida; 0 cai no texto genérico. */
export function DivisorDeNovas({ quantas }: { quantas: number }) {
  const t = useT();
  const texto =
    quantas > 1 ? `${quantas} ${t("mensagens novas")}` : quantas === 1 ? t("1 mensagem nova") : t("Novas mensagens");
  return (
    <div
      role="separator"
      aria-label={texto}
      data-testid="divisor-novas"
      className="flex items-center gap-2.5 px-2.5 pb-1 pt-4 text-meta font-bold text-accent-text lg:px-7"
    >
      <span aria-hidden className="h-px flex-1 bg-accent/35" />
      <span aria-hidden>{texto}</span>
      <span aria-hidden className="h-px flex-1 bg-accent/35" />
    </div>
  );
}
