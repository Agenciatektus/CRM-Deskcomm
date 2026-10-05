"use client";

import { ListaDePassos } from "@/components/cadencia/ListaDePassos";
import { useT } from "@/hooks/i18n/useT";
import { MS_POR_HORA, type PassoDaRegua } from "@/lib/regua/timeline";

interface Etapa {
  id: string;
  name: string;
  is_lost?: boolean;
}

/**
 * OS PASSOS DA CAMPANHA — o 2º toque em diante.
 *
 * ═══ Por que é o builder DA CADÊNCIA, e não um parecido ═══
 *
 * `ListaDePassos` já é a tela que o operador aprendeu na cadência de
 * prospecção: mesma ordem, mesmas setas para reordenar, mesmo campo de
 * variações, mesma lista de etapas do funil. Um segundo builder "igual mas da
 * campanha" cobraria o aprendizado duas vezes e divergiria no primeiro ajuste —
 * quem consertasse a espera num lado não consertaria no outro. O que a campanha
 * acrescenta é o CONTEXTO: dizer que a primeira mensagem não está nesta lista.
 *
 * Sem passos, a campanha manda uma mensagem e acaba, como sempre. É o estado
 * padrão, e a tela diz isso em vez de parecer incompleta.
 */
export function PassosDaCampanha({
  passos,
  onChange,
  etapas,
  temFunil,
}: {
  passos: PassoDaRegua[];
  onChange: (passos: PassoDaRegua[]) => void;
  etapas: Etapa[];
  /** Sem funil escolhido, "mover de etapa" e "etiqueta" não têm card em que agir. */
  temFunil: boolean;
}) {
  const t = useT();
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {t(
          "A primeira mensagem é a de cima, e ela sai para todo mundo da lista. Os passos abaixo acontecem depois dela, para quem NÃO respondeu. Quem responde sai da régua na hora.",
        )}
      </p>
      {!temFunil && passos.length > 0 && (
        <p className="text-sm text-error-fg">
          {t(
            "Escolha o funil em «Quem responder» antes de preparar: mover de etapa e etiquetar agem sobre o card do negócio.",
          )}
        </p>
      )}
      {/* ⚠️ Dito na tela porque é a armadilha desta feature: numa campanha o card
          nasce quando a pessoa RESPONDE, e os passos existem para alcançar quem
          NÃO respondeu. Passo de CRM para quem não tem card não tem o que mover,
          e descobrir isso pelo erro na fila de follow-up é descobrir tarde. */}
      {passos.some((p) => p.tipo === "mover_etapa" || p.tipo === "etiqueta") && (
        <p className="text-sm text-warning-fg">
          {t(
            "Mover de etapa e etiquetar valem para quem JÁ tem card no funil, e numa campanha o card nasce quando a pessoa responde. Para quem nunca respondeu, esses passos não encontram card e a régua dele para ali.",
          )}
        </p>
      )}
      <ListaDePassos passos={passos} onChange={onChange} etapas={etapas} />
    </div>
  );
}

/**
 * A régua em LEITURA, para a tela de detalhe.
 *
 * Existe porque "por que esta pessoa recebeu três mensagens?" é uma pergunta que
 * se faz com a campanha já andando, e a tela de edição está fechada nesse
 * momento (só rascunho edita). Sem isto, a régua que está rodando não aparece em
 * lugar nenhum.
 */
export function ResumoDosPassos({
  passos,
  etapas,
}: {
  passos: PassoDaRegua[];
  etapas: Etapa[];
}) {
  const t = useT();
  if (passos.length === 0) return null;
  const nomeDaEtapa = (id: string) => etapas.find((e) => e.id === id)?.name ?? t("etapa removida");

  return (
    <ol className="space-y-1 text-sm">
      {passos.map((passo, i) => (
        <li key={passo.id} className="flex gap-2">
          <span className="text-muted-foreground tabular-nums">{i + 1}.</span>
          <span>
            {passo.tipo === "espera" && (
              <>
                {t("Esperar")} {Math.round(passo.duracaoMs / MS_POR_HORA)} {t("horas")}
              </>
            )}
            {passo.tipo === "mensagem" && (
              <>
                {t("Mensagem")}
                {passo.variantes.length > 1 ? ` (${passo.variantes.length} ${t("variações")})` : ""}:{" "}
                <span className="text-muted-foreground">{primeiraLinha(passo.variantes[0] ?? "")}</span>
              </>
            )}
            {passo.tipo === "mover_etapa" && (
              <>
                {t("Mover para")} <strong>{nomeDaEtapa(passo.stageId)}</strong>
              </>
            )}
            {passo.tipo === "etiqueta" && (
              <>
                {passo.op === "add" ? t("Adicionar etiqueta") : t("Remover etiqueta")}{" "}
                <strong>{passo.tag}</strong>
              </>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** O suficiente para reconhecer o texto, sem derramar a mensagem inteira na lista. */
function primeiraLinha(texto: string): string {
  const linha = texto.split("\n")[0] ?? "";
  return linha.length > 80 ? `${linha.slice(0, 80)}…` : linha;
}
