"use client";

import { ListaDePassos } from "@/components/cadencia/ListaDePassos";
import { useT } from "@/hooks/i18n/useT";
import { tetoDeEnvioComRegua } from "@/lib/campanhas/regua-politica";
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
  quantosCards = null,
  tetoPorDia = null,
}: {
  passos: PassoDaRegua[];
  onChange: (passos: PassoDaRegua[]) => void;
  etapas: Etapa[];
  /** Sem funil escolhido, "mover de etapa" e "etiqueta" não têm card em que agir. */
  temFunil: boolean;
  /**
   * Quantas pessoas a lista pega, quando a tela já sabe (a prévia da audiência).
   * Vira o NÚMERO de cards que iniciar a campanha vai criar. Sem ele a frase
   * fica correta e vaga; com ele o operador decide antes, que é o ponto.
   */
  quantosCards?: number | null;
  /** `teto_diario` da campanha (`null` = sem teto próprio). */
  tetoPorDia?: number | null;
}) {
  const t = useT();
  // QUANTOS POR DIA. Com passos, este número é o teto dos DOIS lados: a régua
  // aceita tantas entradas por dia, e a campanha passa a não mandar mais que
  // isso (`tetoDeEnvioComRegua`). A frase antiga dizia que o resto "entra na
  // régua nos dias seguintes" — e não entrava: a inscrição é tentada uma vez,
  // logo depois do envio, e quem já recebeu nunca é relido. Aviso
  // tranquilizador e errado é pior que silêncio.
  const entramPorDia = tetoDeEnvioComRegua(tetoPorDia);
  const passaDoTeto = quantosCards !== null && quantosCards > entramPorDia;
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
            "Escolha o funil em «Quem responder» antes de preparar: com passos, cada pessoa abordada vira card, e card precisa de funil.",
          )}
        </p>
      )}
      {/* ⚠️ Dito na tela porque é a consequência que o operador NÃO adivinha:
          com passos, a campanha põe no funil todo mundo que ela abordar, não só
          quem responder. Numa lista de 500 isso são 500 cards, e descobrir pelo
          quadro cheio é descobrir tarde. */}
      {passos.length > 0 && (
        <p className="text-sm text-warning-fg">
          {t(
            "Com passos, cada pessoa abordada vira card no funil escolhido, já na primeira mensagem (sem passos, o card só nasce quando ela responde). É o que faz mover de etapa e etiquetar funcionarem, e é também o que enche o quadro:",
          )}{" "}
          <strong>
            {quantosCards === null
              ? t("um card por pessoa da lista")
              : `${quantosCards} ${t("cards, um por pessoa da lista")}`}
          </strong>
          {". "}
          {t("Quem já tem negócio aberto nesse funil não ganha card novo.")}
          {passaDoTeto && (
            <>
              {" "}
              {t("Com passos, a campanha manda no máximo")} <strong>{entramPorDia}</strong>{" "}
              {t(
                "por dia, que é o que a régua absorve: a lista leva mais dias para terminar, e todo mundo que receber vai ter os passos.",
              )}
            </>
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
