"use client";

import { useAuth } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { useMinhaDisponibilidade, useUpdateAvailability } from "@/hooks/team/useAttendants";
import { roleAtLeast } from "@/lib/auth/types";
import { cn } from "@/lib/utils";

/**
 * "Disponível / Indisponível" no topo: a MESMA chave de plantão da aba
 * Atendimento de Equipe (`attendant_availability.is_available`). Lê só o
 * PRÓPRIO estado (`useMinhaDisponibilidade`, rota `/availability/me`, sem
 * admin client nem dados da equipe) e grava pelo PATCH de sempre
 * (`useUpdateAvailability`), que invalida o roster e esta chave juntos.
 *
 * Quem vê: `agent`+ da organização, que é o mínimo da rota. Abaixo disso o
 * botão não existe (a pessoa não entra no roteamento). Acompanhamento de suporte
 * em modo leitura também não vê: o clique gravaria em nome de outra pessoa.
 *
 * A chave diz só a DECISÃO de atender; quem está de plantão
 * AGORA ainda depende da jornada (`estaDePlantao`), e por isso o rótulo é
 * "Disponível", não "De plantão".
 */
export function BotaoDeDisponibilidade() {
  const t = useT();
  const { user, activeOrg } = useAuth();
  const podeAtender =
    roleAtLeast(activeOrg?.role, "agent") && user.support?.access_mode !== "support_readonly";
  // Só pergunta quando o botão pode existir: abaixo de agent a rota recusaria.
  const minha = useMinhaDisponibilidade(podeAtender);
  const atualizar = useUpdateAvailability(t("Disponibilidade atualizada."));

  // Antes da resposta (ou com erro) o botão não aparece: afirmar um estado sem
  // tê-lo lido seria mentir. Sem linha (`null`) é "nunca ligou", que é
  // Indisponível de fato, e o clique cria a linha pelo PATCH de sempre.
  if (!podeAtender || !minha.isSuccess) return null;
  const ligado = minha.data?.data?.is_available ?? false;
  return (
    <button
      type="button"
      // Sem `aria-label`: o nome acessível é o próprio texto visível (o ESTADO),
      // e o `title` diz o que o clique faz (WCAG 2.5.3).
      title={ligado ? t("Clique para ficar indisponível") : t("Clique para ficar disponível")}
      disabled={atualizar.isPending}
      onClick={() => atualizar.mutate({ userId: user.id, patch: { is_available: !ligado } })}
      data-testid="botao-de-disponibilidade"
      className="hidden h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-border bg-surface pr-3 pl-2.5 text-[13px] font-semibold text-text transition-colors hover:border-border-strong focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 sm:inline-flex"
    >
      {/* O ponto com halo do `.avail` do protótipo. A cor não é a única pista:
          o texto ao lado diz o estado. */}
      <span
        className={cn(
          "h-2 w-2 rounded-full ring-[3px]",
          ligado ? "bg-success ring-success-bg" : "bg-text-subtle ring-surface-elevated",
        )}
        aria-hidden
      />
      {ligado ? t("Disponível") : t("Indisponível")}
    </button>
  );
}
