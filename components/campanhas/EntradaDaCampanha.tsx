"use client";

import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";

interface Etapa {
  id: string;
  name: string;
  is_won?: boolean;
  is_lost?: boolean;
}

/**
 * QUEM ENTRA NA CAMPANHA — a escolha entre os dois modos de público (9038).
 *
 * ═══ Por que a escolha é explícita, e a lista é o padrão ═══
 *
 * LISTA é o que a campanha sempre foi: o recorte vira uma lista congelada, o
 * operador confere o número e o texto, e aperta. CONTÍNUO é a campanha que fica
 * de pé: quem cai na etapa escolhida é abordado, um por vez, sem lista.
 *
 * O rádio nasce em LISTA e não há caminho que ligue o contínuo sozinho — nem
 * duplicar uma campanha de lista, nem salvar um rascunho antigo. Modo de público
 * que muda sem alguém escolher é o modo de falha mais caro desta tela: ele manda
 * mensagem.
 *
 * ═══ Por que o teto e a janela aparecem como EXIGÊNCIA aqui ═══
 *
 * No modo lista o volume do dia é limitado por algo que o operador olhou (a
 * prévia). No contínuo não há prévia do que ainda não chegou: o teto do dia é o
 * que limita quantos estranhos recebem mensagem, e a janela é o que impede que
 * recebam de madrugada. A tela cobra os dois ANTES de o operador tentar
 * preparar, porque descobrir isso no erro do botão é descobrir tarde.
 */
export function EntradaDaCampanha({
  continua,
  onContinuaChange,
  etapaId,
  onEtapaChange,
  etapas,
  temFunil,
  tetoPorDia,
  janelaInicio,
  janelaFim,
}: {
  continua: boolean;
  onContinuaChange: (continua: boolean) => void;
  etapaId: string;
  onEtapaChange: (etapaId: string) => void;
  /** As etapas do funil escolhido em "Vira card no funil". */
  etapas: Etapa[];
  /** Sem funil escolhido não há etapa possível — e o contínuo precisa de uma. */
  temFunil: boolean;
  tetoPorDia: number | null;
  janelaInicio: number | null;
  janelaFim: number | null;
}) {
  const t = useT();
  const faltaTeto = continua && tetoPorDia === null;
  const faltaJanela = continua && (janelaInicio === null || janelaFim === null);

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("Quem entra nesta campanha")}</legend>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="entrada-da-campanha"
            className="mt-1"
            checked={!continua}
            onChange={() => onContinuaChange(false)}
          />
          <span>
            {t("Lista fixa")}
            <span className="block text-muted-foreground">
              {t(
                "O recorte acima vira uma lista. Você confere quantas pessoas são e o texto antes de iniciar, e depois disso a lista não muda.",
              )}
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="entrada-da-campanha"
            className="mt-1"
            checked={continua}
            onChange={() => onContinuaChange(true)}
          />
          <span>
            {t("Contínua, por etapa do funil")}
            <span className="block text-muted-foreground">
              {t(
                "A campanha fica de pé e aborda quem entrar na etapa escolhida, a partir do momento em que você iniciar. Quem já está na etapa hoje não é abordado.",
              )}
            </span>
          </span>
        </label>
      </fieldset>

      {continua && (
        <div className="space-y-3 border-l-2 border-border pl-3">
          <div className="space-y-2">
            <Label htmlFor="entrada-etapa">{t("Abordar quem entrar na etapa")}</Label>
            <select
              id="entrada-etapa"
              className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
              value={etapaId}
              onChange={(e) => onEtapaChange(e.target.value)}
              disabled={!temFunil}
            >
              <option value="">{t("Escolha a etapa")}</option>
              {/* Etapa de GANHO e de PERDA ficam fora: abordar com a copy de
                  primeiro contato quem já comprou, ou quem já disse não, é o
                  erro que não se desfaz. O gatilho também recusa negócio
                  fechado, então esta é a segunda porta, não a única. */}
              {etapas
                .filter((e) => !e.is_won && !e.is_lost)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
            </select>
            {!temFunil && (
              <p className="text-sm text-warning-fg">
                {t("Escolha primeiro o funil, em “Quem responder”. A etapa é dele.")}
              </p>
            )}
          </div>

          <p className="text-sm text-muted-foreground">
            {t(
              "A pessoa recebe uma vez só: se o card entrar e sair da etapa várias vezes, a abordagem não repete. Quem respondeu, quem pediu para parar e quem está em outra campanha ainda em andamento ficam de fora.",
            )}
          </p>

          {(faltaTeto || faltaJanela) && (
            <p className="text-sm text-warning-fg">
              {faltaTeto && faltaJanela
                ? t(
                    "Preencha o máximo por dia e o horário de envio, em “Ritmo desta campanha”. Sem lista para conferir antes de apertar, são eles que limitam quantas pessoas a campanha aborda por dia e impedem que a abordagem saia de madrugada.",
                  )
                : faltaTeto
                  ? t(
                      "Preencha o máximo por dia, em “Ritmo desta campanha”. Sem lista para conferir antes de apertar, é ele que limita quantas pessoas novas a campanha aborda por dia.",
                    )
                  : t(
                      "Preencha o horário de envio, em “Ritmo desta campanha”. O gatilho dispara a qualquer hora, e sem janela a abordagem sai de madrugada.",
                    )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
