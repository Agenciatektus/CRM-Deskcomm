"use client";

import { Escolha } from "@/components/ui/escolha";
import { Switch } from "@/components/ui/switch";
import type { EtapaDoFunil } from "@/hooks/pipelines/useAgentMapping";
import type { PatchDeEtapa } from "@/hooks/pipelines/useStages";
import { useT } from "@/hooks/i18n/useT";

type Evento = NonNullable<PatchDeEtapa["evento_de_conversao"]>;

/** O evento que a chave liga quando a etapa ainda não tem um (ganho = compra). */
export function eventoPadrao(etapa: EtapaDoFunil): Evento {
  return etapa.evento_de_conversao ?? (etapa.is_won ? "Purchase" : "QualifiedLead");
}

/**
 * "Enviar evento de conversão (Meta/Google) ao entrar nesta etapa" (migration 9054).
 * Por etapa, desligada numa etapa nova: nem todo negócio precisa avisar a
 * plataforma de anúncio, e o momento certo é da organização.
 */
export function ConversaoDaEtapa({
  etapa,
  ocupado,
  aplicar,
}: {
  etapa: EtapaDoFunil;
  ocupado: boolean;
  aplicar: (etapaId: string, patch: PatchDeEtapa) => void;
}) {
  const t = useT();
  const ligada = etapa.envia_conversao === true;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
        <label className="flex items-center gap-2">
          <Switch
            checked={ligada}
            onCheckedChange={(v) =>
              aplicar(
                etapa.id,
                v ? { envia_conversao: true, evento_de_conversao: eventoPadrao(etapa) } : { envia_conversao: false },
              )
            }
            disabled={ocupado}
            aria-label={`${t("Enviar evento de conversão (Meta/Google) ao entrar em")} «${etapa.name}»`}
            data-testid={`conversao-${etapa.id}`}
          />
          {t("Enviar evento de conversão (Meta/Google) ao entrar nesta etapa")}
        </label>
        {ligada && (
          <Escolha
            value={eventoPadrao(etapa)}
            onValueChange={(v) => aplicar(etapa.id, { evento_de_conversao: v as Evento })}
            disabled={ocupado}
            aria-label={`${t("Evento de conversão de")} «${etapa.name}»`}
            data-testid={`evento-conversao-${etapa.id}`}
            className="h-8 w-auto min-w-48 text-xs"
            opcoes={[
              { value: "Purchase", label: t("Compra (com o valor do negócio)") },
              { value: "QualifiedLead", label: t("Lead qualificado (ação do Google Ads da etapa)") },
            ]}
          />
        )}
      </div>
      {ligada && (
        <p className="text-xs text-text-muted">
          {t(
            "Sai a cada entrada nesta etapa, inclusive na recompra. Trocar de funil não envia. O negócio precisa ter vindo de anúncio.",
          )}
        </p>
      )}
    </div>
  );
}
