"use client";

import { SaidasDaCadenciaEditor } from "@/components/cadencia/SaidasDaCadencia";
import { useT } from "@/hooks/i18n/useT";
import type { SaidasDaCadencia } from "@/lib/cadencia/saidas";
import {
  problemaNasSaidas,
  saidasForamEscolhidas,
  saidasParaATela,
} from "@/lib/campanhas/saidas-da-campanha";

interface Etapa {
  id: string;
  name: string;
}

/**
 * QUANDO A RÉGUA DA CAMPANHA PARA — a seção que o operador abre na campanha.
 *
 * ═══ Por que é o editor DA CADÊNCIA, e não um parecido ═══
 *
 * `SaidasDaCadenciaEditor` já é a tela que o operador aprendeu na cadência de
 * prospecção, e o VALOR que ela edita é o mesmo objeto que o motor de follow-up
 * consome (`cadence_settings.saidas`). Um segundo editor "igual mas da campanha"
 * cobraria o aprendizado duas vezes e divergiria no primeiro ajuste — o mesmo
 * raciocínio de `PassosDaCampanha`, que reusa `ListaDePassos`.
 *
 * O que a campanha acrescenta é o CONTEXTO: dizer que isto só tem efeito quando
 * existem passos, e que a lista de etapas é a do funil escolhido na campanha.
 */
export function SaidasDaCampanhaEditor({
  saidas,
  onChange,
  etapas,
  temPassos,
  temFunil,
}: {
  saidas: SaidasDaCadencia;
  onChange: (s: SaidasDaCadencia) => void;
  etapas: Etapa[];
  /** Sem passos não há régua, e sem régua não há o que parar. */
  temPassos: boolean;
  /** Sem funil escolhido, a lista de etapas vem vazia. */
  temFunil: boolean;
}) {
  const t = useT();
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {t(
          "Estas opções valem para os passos depois da primeira mensagem. Quem sai aqui não recebe os passos seguintes.",
        )}{" "}
        {t(
          "A primeira mensagem não é filtrada por elas: ela sai para todo mundo da lista, inclusive para quem já está na etapa ou com a etiqueta que você escolher.",
        )}
      </p>
      {!temPassos && (
        <p className="text-sm text-muted-foreground">
          {t(
            "Esta campanha não tem passos, então ela manda uma mensagem e acaba. O que você escolher aqui fica guardado e passa a valer se ela ganhar passos.",
          )}
        </p>
      )}
      {temPassos && !temFunil && (
        <p className="text-sm text-warning-fg">
          {t(
            "Escolha o funil em «Quem responder» para poder parar a régua por etapa: a lista de etapas é a do funil da campanha.",
          )}
        </p>
      )}
      <SaidasDaCadenciaEditor saidas={saidas} onChange={onChange} etapas={etapas} />
    </div>
  );
}

/**
 * As saídas em LEITURA, para a tela de detalhe.
 *
 * Existe pelo mesmo motivo que `ResumoDosPassos`: "por que esta pessoa parou de
 * receber?" é pergunta que se faz com a campanha já andando, e a tela de edição
 * está fechada nesse momento. Sem isto, a política que está rodando não aparece
 * em lugar nenhum.
 *
 * ⚠️ Mostra o que a CAMPANHA tem gravado hoje. A régua no ar executa o snapshot
 * da publicação, e os dois só divergem se alguém tiver mexido na coluna por fora
 * do produto (pelo produto, `saidas` só muda em rascunho, e rascunho não tem
 * régua publicada).
 *
 * ⚠️ RECEBE O VALOR CRU, e não o normalizado, por dois motivos que custaram
 * parecer:
 *
 *   1. ILEGÍVEL tem de aparecer como ilegível. A versão anterior recebia o valor
 *      já passado por `saidasDaTela` e, quando a coluna não dava para ler,
 *      mostrava o padrão MAIS o rodapé "esta campanha usa o padrão" — uma
 *      afirmação falsa, dita justamente a quem está auditando por que alguém
 *      recebeu ou parou de receber. Normalizar é certo no EDITOR (lá a pessoa
 *      conserta) e errado no RESUMO (aqui ela investiga).
 *   2. Esta tela é onde a expectativa errada se forma. Quem lê "a régua para
 *      quando entra na etapa Fechamento" conclui que quem está em Fechamento
 *      está poupado da ABORDAGEM — e não está: as saídas governam a régua, do 2º
 *      toque em diante, e a 1ª mensagem sai para todo mundo do recorte. A frase
 *      do editor precisa estar aqui também, porque aqui é onde se pergunta.
 */
export function ResumoDasSaidas({
  saidas,
  etapas,
}: {
  /** CRU, como vem da API: `null`, o objeto do operador, ou algo ilegível. */
  saidas: unknown;
  etapas: Etapa[];
}) {
  const t = useT();
  const problema = problemaNasSaidas(saidas);
  if (problema !== null) {
    return (
      <div className="space-y-1.5" data-testid="resumo-das-saidas">
        <span className="text-sm font-medium">{t("A régua para quando")}</span>
        <p className="text-sm text-error-fg">
          {t(
            "Não foi possível ler esta configuração, então a régua está barrada: ela não vai ao ar até alguém corrigir. Nenhum passo sai enquanto isso.",
          )}
        </p>
      </div>
    );
  }
  const lidas = saidasParaATela(saidas);
  const nomeDaEtapa = (id: string) => etapas.find((e) => e.id === id)?.name ?? t("etapa removida");
  const linhas: string[] = [t("O lead responde")];
  if (lidas.ao_fechar) linhas.push(t("O negócio é ganho ou perdido"));
  if (lidas.humano_assumir) linhas.push(t("Alguém do time manda mensagem ao lead"));
  for (const tag of lidas.etiquetas) linhas.push(`${t("Ganha a etiqueta")} ${tag}`);
  for (const id of lidas.etapas) linhas.push(`${t("Entra na etapa")} ${nomeDaEtapa(id)}`);

  return (
    <div className="space-y-1.5" data-testid="resumo-das-saidas">
      <span className="text-sm font-medium">{t("A régua para quando")}</span>
      <ul className="space-y-1 text-sm">
        {linhas.map((linha) => (
          <li key={linha} className="text-muted-foreground">
            {linha}
          </li>
        ))}
      </ul>
      {/* A RESSALVA, e ela é a mesma do editor de propósito: é aqui que alguém
          abre a tela perguntando "por que esta pessoa foi abordada?". */}
      <p className="text-xs text-muted-foreground">
        {t(
          "Isto vale para os passos depois da primeira mensagem. A primeira sai para todo mundo da lista, inclusive para quem já está nas etapas e etiquetas acima.",
        )}
      </p>
      {!saidasForamEscolhidas(lidas) && (
        <p className="text-xs text-muted-foreground">
          {t("Esta campanha usa o padrão. Para mudar, duplique e ajuste no rascunho.")}
        </p>
      )}
    </div>
  );
}

/**
 * O valor inicial da tela: o que veio da campanha, ou o padrão.
 *
 * Uma porta só, e não `?? PADRAO` em cada tela: `null` vindo da API tem de virar
 * EXATAMENTE o objeto que o servidor usa quando a coluna é nula — duas
 * conversões diferentes fariam a tela prometer uma política e o servidor
 * publicar outra. E o jsonb ILEGÍVEL (escrito por fora do produto) também cai
 * no padrão aqui, pelo motivo que `saidasParaATela` explica: a tela é onde se
 * conserta, então ela precisa renderizar.
 */
export function saidasDaTela(valor: SaidasDaCadencia | null | undefined): SaidasDaCadencia {
  return saidasParaATela(valor);
}
