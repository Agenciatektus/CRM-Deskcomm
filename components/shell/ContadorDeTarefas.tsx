"use client";

import { useTarefasAtrasadas } from "@/hooks/tasks/useTarefasAtrasadas";
import { useT } from "@/hooks/i18n/useT";

/**
 * Quantas tarefas venceram na sua mão: o número ao lado de "Tarefas" na coluna
 * 2 (S14 da auditoria). Tom crítico suave (o `.nav2-count.soft` do protótipo),
 * o mesmo dos avisos: é pendência atrasada, não marca. Zero não desenha nada.
 */
export function ContadorDeTarefas() {
  const t = useT();
  const { data } = useTarefasAtrasadas();
  const atrasadas = data ?? 0;
  if (!atrasadas) return null;
  const rotulo = atrasadas === 1 ? t("1 tarefa atrasada") : `${atrasadas} ${t("tarefas atrasadas")}`;
  return (
    <span
      data-testid="contador-de-tarefas"
      aria-label={rotulo}
      title={rotulo}
      className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-error-bg px-1.5 text-xs font-bold leading-none text-error-fg tabular-nums"
    >
      {atrasadas}
    </span>
  );
}
