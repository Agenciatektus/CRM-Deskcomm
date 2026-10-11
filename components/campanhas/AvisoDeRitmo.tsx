"use client";
/**
 * O AVISO DE RITMO MAIS SOLTO QUE O RECOMENDADO.
 *
 * ═══ Por que avisa e não bloqueia ═══
 *
 * O preset é sugestão (ver `lib/campanhas/ritmo-recomendado.ts`). Travar o
 * campo acima do recomendado tiraria do operador a campanha que ele precisa
 * mandar rápido por um motivo que o produto não conhece, e empurraria a solução
 * para fora da tela. O que ele não pode é descobrir depois: a conta de um ritmo
 * agressivo é cobrada no chip do cliente, e chip bloqueado volta em semanas.
 *
 * ═══ Por que SÓBRIO ═══
 *
 * Sem ícone de perigo, sem vermelho, sem travar o botão. É `warning-fg`, e só
 * aparece quando há de fato um número escrito mais solto que o recomendado:
 * campo vazio herda o número e não avisa nada (`avisosDeRitmoAgressivo`).
 * Aviso que aparece sempre deixa de ser lido, e o dia em que ele importar vai
 * ser um dia em que ninguém olha.
 */
import { useT } from "@/hooks/i18n/useT";
import {
  avisosDeRitmoAgressivo,
  RITMO_RECOMENDADO,
  tetoHorarioDeReferencia,
} from "@/lib/campanhas/ritmo-recomendado";
import type { RitmoDaCampanha } from "@/lib/campanhas/ritmo";

export function AvisoDeRitmo({ ritmo }: { ritmo: RitmoDaCampanha }) {
  const t = useT();
  const avisos = avisosDeRitmoAgressivo(ritmo);
  if (avisos.length === 0) return null;

  const janela = `${RITMO_RECOMENDADO.janelaInicioHora ?? 0}h-${RITMO_RECOMENDADO.janelaFimHora ?? 24}h`;
  // O número que o aviso MOSTRA é o mesmo contra o qual ele comparou
  // (`tetoHorarioDeReferencia`), e não a constante do preset: com janela
  // estreitada a referência é maior que o 5 recomendado, e mostrar o 5 diria
  // "mais que 5" sobre uma comparação que não foi essa.
  const referenciaHoraria = tetoHorarioDeReferencia(ritmo);

  return (
    <div className="space-y-1 text-sm text-warning-fg">
      <p>
        {t(
          "Algum valor aqui está mais solto que o recomendado para lista fria. Dá para rodar assim, com risco maior de bloqueio do número.",
        )}
      </p>
      <ul>
        {avisos.map((motivo) => (
          <li key={motivo}>
            {/* Literais dentro de `t()`, um por caso: a cerca de i18n varre o
                AST e não vê chave montada em tempo de execução, então um
                `t(RECORD[motivo])` passaria sem tradução e sem acusar. */}
            {motivo === "intervalo" && (
              <>
                {t("Intervalo menor que o recomendado:")}{" "}
                {RITMO_RECOMENDADO.intervaloSegundos}s.
              </>
            )}
            {motivo === "teto_diario" && (
              <>
                {t("Mais mensagens por dia que o recomendado:")} {RITMO_RECOMENDADO.tetoDiario}.
              </>
            )}
            {motivo === "teto_horario" && (
              <>
                {t("Mais mensagens por hora que o recomendado:")} {referenciaHoraria}.
              </>
            )}
            {motivo === "janela" && (
              <>
                {t("Horário mais largo que o recomendado:")} {janela}.
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
