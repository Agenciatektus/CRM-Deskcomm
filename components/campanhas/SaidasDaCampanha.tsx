"use client";

import { SaidasDaCadenciaEditor } from "@/components/cadencia/SaidasDaCadencia";
import { useT } from "@/hooks/i18n/useT";
import type { SaidasDaCadencia } from "@/lib/cadencia/saidas";
import { saidasForamEscolhidas, saidasParaATela } from "@/lib/campanhas/saidas-da-campanha";

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
 */
export function ResumoDasSaidas({
  saidas,
  etapas,
}: {
  saidas: SaidasDaCadencia;
  etapas: Etapa[];
}) {
  const t = useT();
  const nomeDaEtapa = (id: string) => etapas.find((e) => e.id === id)?.name ?? t("etapa removida");
  const linhas: string[] = [t("O lead responde")];
  if (saidas.ao_fechar) linhas.push(t("O negócio é ganho ou perdido"));
  if (saidas.humano_assumir) linhas.push(t("Alguém do time manda mensagem ao lead"));
  for (const tag of saidas.etiquetas) linhas.push(`${t("Ganha a etiqueta")} ${tag}`);
  for (const id of saidas.etapas) linhas.push(`${t("Entra na etapa")} ${nomeDaEtapa(id)}`);

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
      {!saidasForamEscolhidas(saidas) && (
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
