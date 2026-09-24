"use client";
import { useT } from "@/hooks/i18n/useT";
import { useCotaDoNumero } from "@/hooks/cadencia/useCadencias";
import { cn } from "@/lib/utils";

/**
 * "Envios hoje: 84 / 150" do número da cadência.
 *
 * O número de cima vem do `pacing_ledger` (tudo que o número mandou de forma
 * automática hoje, no fuso da organização), e o teto é o menor entre o limite
 * diário e o degrau de aquecimento — o mesmo que a cadeia aplica. Quando quem
 * segura é o AQUECIMENTO, a tela diz isso: subir o limite diário não resolveria,
 * e o operador ia descobrir mexendo no campo errado.
 */
export function CotaDoNumero({ channelSessionId }: { channelSessionId: string | null }) {
  const t = useT();
  const { data, isLoading, isError } = useCotaDoNumero(channelSessionId);
  if (!channelSessionId) return null;
  if (isLoading) return <p className="text-xs text-text-muted">{t("Carregando a cota do número…")}</p>;
  if (isError || !data) return <p className="text-xs text-text-muted">{t("Não foi possível ler a cota do número.")}</p>;

  const teto = data.teto_hoje;
  const uso = teto ? Math.min(1, data.enviados_hoje / teto) : 0;
  const peloAquecimento =
    data.teto_aquecimento !== null && (data.limite_diario === null || data.teto_aquecimento < data.limite_diario);

  return (
    <div className="space-y-1.5" data-testid="cota-do-numero">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-text-muted">{t("Envios hoje")}</span>
        <span className="font-medium tabular-nums text-text">
          {data.enviados_hoje} / {teto ?? "∞"}
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={teto ?? undefined}
        aria-valuenow={data.enviados_hoje}
        aria-label={t("Uso da cota diária do número")}
      >
        <div
          className={cn("h-full rounded-full transition-all", uso >= 1 ? "bg-destructive" : uso >= 0.8 ? "bg-warning" : "bg-primary")}
          style={{ width: `${Math.round(uso * 100)}%` }}
        />
      </div>
      {!data.numero_conectado && (
        <p className="text-xs text-destructive">{t("O número está desconectado: nada sai até reconectar.")}</p>
      )}
      {peloAquecimento && (
        <p className="text-xs text-text-muted">
          {t("O teto de hoje vem do aquecimento do número, não do limite diário.")}
        </p>
      )}
      {uso >= 1 && (
        <p className="text-xs text-text-muted">
          {t("Cota de hoje esgotada: os próximos envios saem na abertura do próximo dia útil.")}
        </p>
      )}
    </div>
  );
}
