/**
 * ADIAR COM UM CLIQUE: +1 h, amanhã e próxima semana.
 *
 * A conta é feita NO NAVEGADOR, no fuso de quem clica, e a rota recebe o
 * instante pronto (`due_date`, ISO). Assim "amanhã às 9h" é 9h de quem marcou,
 * e não 9h do servidor — a mesma decisão do `QuandoFazer` do painel do lead.
 *
 * Regras (cada uma tem caso no teste):
 *  - **+1 h** parte do MAIOR entre agora e o prazo. Tarefa atrasada há dias,
 *    adiada "+1 h", vence daqui a uma hora, e não uma hora depois do prazo
 *    vencido (que continuaria no passado e a rota recusaria);
 *  - **amanhã** e **próxima semana** mantêm a HORA do prazo atual (a reunião
 *    das 15h vai para amanhã às 15h); sem prazo, 9h;
 *  - **próxima semana** = a segunda-feira que vem (hoje segunda: a de daqui a
 *    7 dias), que é o "semana que vem" de quem trabalha por semana.
 */
export const MODOS_DE_ADIAR = ["uma_hora", "amanha", "proxima_semana"] as const;
export type ModoDeAdiar = (typeof MODOS_DE_ADIAR)[number];

const HORA_PADRAO = 9;

function naHoraDe(dia: Date, referencia: Date | null): Date {
  const d = new Date(dia);
  if (referencia) d.setHours(referencia.getHours(), referencia.getMinutes(), 0, 0);
  else d.setHours(HORA_PADRAO, 0, 0, 0);
  return d;
}

export function prazoAdiado(modo: ModoDeAdiar, prazoAtual: string | null, agora: Date = new Date()): Date {
  const prazo = prazoAtual ? new Date(prazoAtual) : null;
  const valido = prazo && Number.isFinite(prazo.getTime()) ? prazo : null;

  if (modo === "uma_hora") {
    const base = valido && valido.getTime() > agora.getTime() ? valido : agora;
    const d = new Date(base.getTime() + 60 * 60_000);
    d.setSeconds(0, 0);
    return d;
  }

  const dia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  if (modo === "amanha") {
    dia.setDate(dia.getDate() + 1);
  } else {
    // getDay(): 0 = domingo, 1 = segunda. Dias até a PRÓXIMA segunda (1..7).
    const ate = ((8 - dia.getDay()) % 7) || 7;
    dia.setDate(dia.getDate() + ate);
  }
  return naHoraDe(dia, valido);
}
