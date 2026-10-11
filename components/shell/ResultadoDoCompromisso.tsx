"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";

/**
 * "Compareceu" / "Faltou" / "Reagendar" no aviso `appointment_outcome_required`
 * do sino (T18 da auditoria do visual v2).
 *
 * Sem rota nova: é o MESMO `PATCH /api/v1/agenda/agendamentos` que o detalhe do
 * compromisso usa (`DetalheDoCompromisso`), com o papel dele (`agent`), a
 * organização da sessão, a regra de que só PESSOA registra desfecho e a
 * auditoria `agenda.appointment_outcome_recorded`. Sem `revision`: a rota usa a
 * atual. Quem resolve o aviso é o próprio banco (`fn_appointment_change` fecha
 * os avisos do compromisso quando o status vira `completed` ou `no_show`), então
 * o aviso some sem um segundo pedido.
 *
 * "Reagendar" leva ao compromisso na Agenda, onde a remarcação tem as regras de
 * horário livre; remarcar dali também fecha o aviso (a revisão muda).
 */
export function ResultadoDoCompromisso({
  compromissoId,
  hrefDoCompromisso,
  onNavegar,
}: {
  compromissoId: string;
  hrefDoCompromisso: string | null;
  onNavegar: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const registrar = useMutation({
    mutationFn: (status: "completed" | "no_show") =>
      apiClient.patch("/api/v1/agenda/agendamentos", { id: compromissoId, status }),
    onError: showApiError,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["agent-inbox"] });
      void qc.invalidateQueries({ queryKey: ["agenda"] });
    },
  });

  return (
    <div className="flex flex-wrap gap-1.5" data-testid="resultado-do-compromisso">
      <Button
        size="sm"
        className="h-7 px-2.5 text-xs"
        disabled={registrar.isPending}
        onClick={() => registrar.mutate("completed")}
      >
        {t("Compareceu")}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2.5 text-xs"
        disabled={registrar.isPending}
        onClick={() => registrar.mutate("no_show")}
      >
        {t("Faltou")}
      </Button>
      {hrefDoCompromisso && (
        <Button asChild size="sm" variant="ghost" className="h-7 px-2.5 text-xs">
          <Link href={hrefDoCompromisso} onClick={onNavegar}>
            {t("Reagendar")}
          </Link>
        </Button>
      )}
    </div>
  );
}
