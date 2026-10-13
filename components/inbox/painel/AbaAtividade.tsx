"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { activityLabel, actorLabel, actorShape } from "@/lib/leads/activity-vocabulary";
import { cn } from "@/lib/utils";

import { SemLista, shortDate } from "./SemLista";
import type { ActivityRow } from "./tipos";

/**
 * A aba Atividade: a lista que o `crm-summary` já traz. Não busca nada próprio,
 * para a aba não ter uma versão do contato diferente da que as outras mostram.
 */
export function AbaAtividade({ activities, carregando, erro, onTentarDeNovo }: {
  activities: ActivityRow[] | null;
  carregando: boolean;
  erro: boolean;
  onTentarDeNovo: () => void;
}) {
  const t = useT();
  const localeDaData = useLocaleDeData();
  return (
    <section data-testid="inbox-atividade">
      <h3 className="text-xs font-semibold text-text">{t("Atividade")}</h3>
      {carregando ? (
        <Skeleton className="mt-2 h-14 w-full" />
      ) : activities && activities.length > 0 ? (
        // P26: linha do tempo com pontos (uma linha vertical e o marcador de
        // cada evento sobre ela), e não uma pilha de cartões com borda.
        <ul className="relative mt-3 space-y-3 border-l border-border pl-4">
          {activities.map((a) => (
            <li key={a.id} className="relative text-xs">
              {/* Rótulo do vocabulário único (activity-vocabulary), nunca o tipo
                  cru. Marcador por ator, forma e não cor (§5). */}
              <div className="flex items-center gap-1.5 font-medium">
                <span
                  className={cn(
                    // O ponto mora SOBRE a linha do tempo (à esquerda do texto).
                    "absolute -left-5.5 top-1 h-2.5 w-2.5 shrink-0 ring-2 ring-surface",
                    actorShape(a.actor_kind) === "filled" && "rounded-full bg-accent",
                    actorShape(a.actor_kind) === "ring" && "rounded-full border border-accent bg-surface",
                    actorShape(a.actor_kind) === "dashed" && "rounded-full border border-dashed border-border-strong bg-surface",
                  )}
                  aria-hidden
                />
                {t(activityLabel(a.type))}
              </div>
              {/* A escrita é canônica em português; quem escolheu espanhol
                  precisa da tradução na LEITURA (#600). */}
              {a.reason && <div className="mt-0.5 truncate text-muted-foreground">{t(a.reason)}</div>}
              <div className="text-muted-foreground">
                {a.performed_by_name ?? t(actorLabel(a.actor_kind))} · {shortDate(a.performed_at, localeDaData)}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <SemLista vazio={t("Sem atividade.")} erro={erro} onTentarDeNovo={onTentarDeNovo} />
      )}
    </section>
  );
}
