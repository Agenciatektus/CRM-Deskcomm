/**
 * O RITMO RECOMENDADO para lista fria — o preset que a campanha nova já nasce
 * sugerindo.
 *
 * ═══ Por que um preset, e não campo vazio ═══
 *
 * Campo vazio herda o ritmo do número, e o ritmo do número foi calibrado para
 * ATENDIMENTO: cada mensagem responde alguém que escreveu (`PACING_DEFAULTS`,
 * throttle de 1,2 s, janela 7h-22h, teto absoluto de 300/dia em
 * `channel_sessions.daily_message_limit`). Lista fria é o outro risco, o que
 * `ritmo.ts` descreve: 30 mensagens em 30 minutos, do mesmo número, para quem
 * nunca falou com a empresa, é o padrão que o WhatsApp bane.
 *
 * Entre deixar o operador adivinhar e sugerir um número, sugerir é o menor
 * risco: adivinhar errado custa o chip do cliente, e chip banido não volta em
 * dias, volta em semanas de aquecimento. O preset é SUGESTÃO: todo campo
 * continua editável, e campo esvaziado volta a herdar o número.
 *
 * ═══ De onde vem cada número (nenhum é inventado aqui) ═══
 *
 * TRÊS derivam de `CADENCE_SETTINGS_PADRAO`, o preset que a cadência de
 * prospecção já usa para a mesma coisa (contato frio, mesmo canal, mesmo risco
 * de bloqueio). A constante da cadência não é tocada: se ela mudar, este preset
 * acompanha, e é por isso que ele é calculado e não escrito.
 *
 *   - `intervaloSegundos` ← `espacamento.max_s`. A cadência sorteia dentro de
 *     [min, max]; a campanha promete UM intervalo ("uma a cada N segundos", ver
 *     `politicaDaRegua`), então o valor honesto é o TETO da faixa, não a média.
 *     Pegar o mínimo recomendaria o ritmo mais rápido que a cadência aceita.
 *   - `janelaInicioHora` / `janelaFimHora` ← `janela.start` / `janela.end`,
 *     em hora cheia. O início arredonda para CIMA e o fim para BAIXO: se a
 *     janela da cadência ganhar meia hora um dia, o preset encurta em vez de
 *     esticar.
 *
 * ⚠️ O que a janela da cadência tem e o preset NÃO copia: `weekdays`, que lá é
 * seg a sex. A campanha não tem conceito de dia da semana — `politicaDaRegua`
 * crava os sete de propósito, e isso é anterior a este módulo. Então o preset
 * NÃO é "a cadência em tudo": ele roda 7 dias, e no mesmo teto diário isso dá
 * 350 contatos frios por semana contra os 250 da cadência, 40% mais no mesmo
 * chip, sábado e domingo incluídos. Fechar essa ponta pede campo de dia na
 * campanha, que é fatia própria. Enquanto não houver, a frase "erra para o
 * lado lento em TODAS as pontas" é falsa, e quem a repetir estará errado.
 *
 * O QUARTO, o teto diário, NÃO vem da cadência. Ele é
 * `TETO_DIARIO_RECOMENDADO`, logo abaixo, e o comentário dele explica por quê.
 * Quem abrir este arquivo e vir três derivados e um solto: o solto é
 * deliberado, e "consertá-lo" para `max_inscricoes_dia` dobraria o volume/dia
 * que o produto recomenda.
 *
 * O quinto, o teto horário, deriva do QUARTO:
 *
 *   - `tetoHorario` ← `tetoDiario / horas da janela`, arredondado para BAIXO.
 *     Não existe número de teto horário em lugar nenhum do repositório, e
 *     cravar um seria o único palpite do preset. Derivar não é palpite: é o que
 *     espalha o volume do dia pelo dia inteiro em vez de deixá-lo sair num
 *     bloco de uma hora, que é exatamente o burst que `ritmo.ts` descreve como
 *     o padrão banido. E é derivação, não constante, para que mexer no teto
 *     diário ou na janela amanhã não deixe o horário incoerente em silêncio.
 *
 * ═══ O que este módulo NÃO faz ═══
 *
 * Não trava nada. Quem decide se pode mandar continua sendo `podeMandarAgora`,
 * e o efetivo continua sendo o mais restritivo entre campanha e número. Aqui só
 * se calcula o que a tela sugere, e o que ela avisa quando o operador escolhe
 * algo mais agressivo.
 */
import { CADENCE_SETTINGS_PADRAO } from "@/lib/cadencia/settings";

import type { RitmoDaCampanha } from "./ritmo";

/**
 * O TETO DIÁRIO RECOMENDADO — 50, e ele vem da OPERAÇÃO, não da cadência.
 *
 * ═══ De onde vem o 50 ═══
 *
 * Da prospecção do Verdash, que manda lista fria por WhatsApp para cliente real
 * desde antes deste módulo existir: `max_envios_por_dia` default 50 em
 * `prospeccao_campanhas`, com `intervalo_minimo_seg` 90. Está registrado em
 * `.learnings/LEARNINGS.md` (o LRN do rate-limit anti-ban da prospecção, por
 * volta da linha 14487, resolvido pela PR #336 que moveu as regras de disparo
 * de POR CAMPANHA para POR INSTÂNCIA).
 *
 * ═══ Por que ele NÃO deriva de `CADENCE_SETTINGS_PADRAO.max_inscricoes_dia` ═══
 *
 * Porque aquele é 100, e o dono escolheu 50 sabendo da diferença. O argumento
 * que decidiu: 100 é o número que o REPOSITÓRIO declara para a cadência; 50 é o
 * número que JÁ RODOU com chip de cliente. Quando a conta de errar é o chip do
 * cliente, e chip bloqueado volta em semanas de aquecimento, o número que
 * sobreviveu em campo vale mais que o número que a constante afirma.
 *
 * Os outros três campos do preset continuam derivando da cadência, e devem. Este
 * não deriva porque a cadência não é a fonte dele. Trocá-lo por
 * `max_inscricoes_dia` "para ficar consistente" seria dobrar o volume diário
 * recomendado por uma razão de estilo, e desfazer uma decisão tomada com o
 * motivo escrito acima.
 *
 * Decisão do dono em 2026-10-10. Mudá-lo é mudar o que o produto recomenda ao
 * cliente: pede a mesma conversa de novo, não um refactor.
 */
export const TETO_DIARIO_RECOMENDADO = 50;

/** Faixas do CHECK da migration 0375 — o preset não pode nascer fora delas. */
const FAIXA = {
  intervaloMin: 1,
  intervaloMax: 86_400,
  horaInicioMax: 23,
  horaFimMax: 24,
  tetoMin: 1,
  tetoMax: 10_000,
} as const;

function limitar(valor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valor));
}

/** "08:00" → 8. O resto da hora vira a fração que o arredondamento consome. */
function horaFracionada(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number(h) + Number(m) / 60;
}

function horaDeInicio(hhmm: string): number {
  return limitar(Math.ceil(horaFracionada(hhmm)), 0, FAIXA.horaInicioMax);
}

function horaDeFim(hhmm: string): number {
  return limitar(Math.floor(horaFracionada(hhmm)), 1, FAIXA.horaFimMax);
}

/**
 * O preset, calculado uma vez a partir da cadência.
 *
 * Janela inválida depois do arredondamento (fim que não passa do início) devolve
 * `null` nos dois campos em vez de um par que a API recusaria: preset que não
 * salva seria pior que preset nenhum, e janela nula herda a do número, que já é
 * protegida.
 */
function calcular(): RitmoDaCampanha {
  const inicio = horaDeInicio(CADENCE_SETTINGS_PADRAO.janela.start);
  const fim = horaDeFim(CADENCE_SETTINGS_PADRAO.janela.end);
  const janelaUtil = fim > inicio;
  const tetoDiario = limitar(TETO_DIARIO_RECOMENDADO, FAIXA.tetoMin, FAIXA.tetoMax);
  return {
    intervaloSegundos: limitar(
      CADENCE_SETTINGS_PADRAO.espacamento.max_s,
      FAIXA.intervaloMin,
      FAIXA.intervaloMax,
    ),
    janelaInicioHora: janelaUtil ? inicio : null,
    janelaFimHora: janelaUtil ? fim : null,
    tetoDiario,
    // Sem janela não há "horas do dia" de que derivar: o teto horário fica nulo
    // e o do número vale. Chutar um aqui seria o palpite que este módulo evita.
    tetoHorario: janelaUtil
      ? limitar(Math.floor(tetoDiario / (fim - inicio)), FAIXA.tetoMin, FAIXA.tetoMax)
      : null,
  };
}

export const RITMO_RECOMENDADO: RitmoDaCampanha = calcular();

/** Qual campo o operador deixou mais agressivo que o recomendado. */
export type MotivoDeAviso = "intervalo" | "teto_diario" | "teto_horario" | "janela";

/**
 * CONTRA QUE NÚMERO o teto horário é comparado.
 *
 * ═══ Por que não é o 5 do preset, direto ═══
 *
 * Com o teto diário em 50 e a janela em dez horas, o horário recomendado é 5, e
 * 5 é baixo o bastante para o aviso disparar em configuração que não tem nada
 * de agressiva. O caso concreto: quem ESTREITA a janela (9h-12h) e mantém 50 por
 * dia precisa de 17 por hora só para os 50 caberem. Comparado com o 5, isso
 * acusaria "mais solto que o recomendado" um ritmo que expõe o número por TRÊS
 * horas em vez de dez. Alarme falso treina o operador a ignorar o aviso antes
 * do dia em que ele importa.
 *
 * Então a referência é o MAIOR entre dois números:
 *
 *   1. o horário recomendado (5), que é o piso: sem teto diário declarado, só
 *      ele responde por quanto sai numa hora;
 *   2. o que o próprio teto diário dele PRECISA para caber na janela dele,
 *      arredondado para cima.
 *
 * ═══ Por que o MAIOR, e não o segundo no lugar do primeiro ═══
 *
 * Porque o teto horário também pode ser FOLGA, e folga não é concentração.
 * Quem põe 10 por dia numa janela de 6 horas precisa de 2 por hora; se ele
 * escreveu 4 por hora, o teto do dia é que o segura, e o horário nunca chega a
 * valer. Trocar o piso pelo número derivado acusaria esse caso, que é o ritmo
 * mais lento possível. Com o máximo, o aviso só sai quando o teto horário
 * permite de fato mais concentração que o recomendado E mais do que o dia dele
 * pede.
 *
 * ⚠️ Nada de sinal se perde quando o diário dele é alto: teto diário acima do
 * recomendado já tem aviso próprio (`teto_diario`). Cobrar a mesma escolha de
 * novo no item do horário leria como dois problemas onde há um.
 */
export function tetoHorarioDeReferencia(
  ritmo: RitmoDaCampanha,
  recomendado: RitmoDaCampanha = RITMO_RECOMENDADO,
): number | null {
  const piso = recomendado.tetoHorario;
  const { tetoDiario, janelaInicioHora, janelaFimHora } = ritmo;
  if (tetoDiario === null || janelaInicioHora === null || janelaFimHora === null) return piso;
  const horas = janelaFimHora - janelaInicioHora;
  if (horas <= 0) return piso;
  const precisaPorHora = Math.ceil(tetoDiario / horas);
  return piso === null ? precisaPorHora : Math.max(piso, precisaPorHora);
}

/**
 * O que avisar sobre um ritmo escolhido à mão.
 *
 * ⚠️ Campo `null` NUNCA avisa. Nulo devolve a decisão ao número, e o número tem
 * a proteção dele (`channel_knobs` + aquecimento + o teto absoluto do CRM) —
 * avisar ali seria alarme falso contra a configuração que o produto chama de
 * padrão desde a 0375. Só se avisa do número que o operador ESCREVEU e que é
 * mais solto que o recomendado.
 *
 * Janela conta como mais agressiva quando começa antes ou termina depois da
 * recomendada: as duas pontas somam tempo de disparo.
 */
export function avisosDeRitmoAgressivo(
  ritmo: RitmoDaCampanha,
  recomendado: RitmoDaCampanha = RITMO_RECOMENDADO,
): MotivoDeAviso[] {
  const avisos: MotivoDeAviso[] = [];
  if (
    ritmo.intervaloSegundos !== null &&
    recomendado.intervaloSegundos !== null &&
    ritmo.intervaloSegundos < recomendado.intervaloSegundos
  ) {
    avisos.push("intervalo");
  }
  if (
    ritmo.tetoDiario !== null &&
    recomendado.tetoDiario !== null &&
    ritmo.tetoDiario > recomendado.tetoDiario
  ) {
    avisos.push("teto_diario");
  }
  const referenciaHoraria = tetoHorarioDeReferencia(ritmo, recomendado);
  if (
    ritmo.tetoHorario !== null &&
    referenciaHoraria !== null &&
    ritmo.tetoHorario > referenciaHoraria
  ) {
    avisos.push("teto_horario");
  }
  const comecaAntes =
    ritmo.janelaInicioHora !== null &&
    recomendado.janelaInicioHora !== null &&
    ritmo.janelaInicioHora < recomendado.janelaInicioHora;
  const terminaDepois =
    ritmo.janelaFimHora !== null &&
    recomendado.janelaFimHora !== null &&
    ritmo.janelaFimHora > recomendado.janelaFimHora;
  if (comecaAntes || terminaDepois) avisos.push("janela");
  return avisos;
}

/**
 * COM QUE RITMO UMA CAMPANHA NOVA NASCE.
 *
 * Regra única: vale o que a organização definiu, e o recomendado onde ela não
 * definiu nada. A tela de Configuração de campanhas já promete isto por
 * escrito ("Toda campanha nova nasce com estes valores") desde que existe, e
 * até esta fatia a promessa era falsa: `app/app/campaigns/new` nunca lia a
 * configuração, e os cinco campos abriam vazios. Prometer na tela e não
 * cumprir no formulário é o defeito que não acusa em lugar nenhum.
 *
 * ⚠️ Só CAMPANHA NOVA. Nada aqui é chamado na edição nem na tela de detalhe: um
 * rascunho já criado tem o ritmo que tem, e repreenchê-lo ao abrir a tela
 * mudaria em silêncio a escolha de quem o criou.
 *
 * Um campo nulo na configuração da organização recebe o recomendado porque hoje
 * nulo ali significa "ninguém nunca abriu esta tela" — a configuração nasce
 * inteira nula para toda organização. Quem quiser de fato herdar o número numa
 * campanha específica esvazia o campo no formulário, que é o controle que já
 * existe e continua valendo.
 */
export function ritmoDaCampanhaNova(config: {
  intervalo_segundos: number | null;
  janela_inicio_hora: number | null;
  janela_fim_hora: number | null;
  teto_diario: number | null;
  teto_horario: number | null;
} | null | undefined): RitmoDaCampanha {
  // ⚠️ A JANELA É UM PAR, e vem inteira de um lado só.
  //
  // Campo a campo, uma organização que gravou só o início (20h, para mandar à
  // noite) ganharia `20h-18h` do recomendado na outra ponta — e o `refine` de
  // `criarCampanhaSchema` ("a janela precisa terminar depois de começar")
  // recusaria o rascunho. O operador veria um erro de validação em campo que
  // ele nem abriu, no caminho que esta fatia existe para desobstruir.
  const organizacaoDeclarouJanela =
    (config?.janela_inicio_hora ?? null) !== null || (config?.janela_fim_hora ?? null) !== null;
  return {
    intervaloSegundos: config?.intervalo_segundos ?? RITMO_RECOMENDADO.intervaloSegundos,
    janelaInicioHora: organizacaoDeclarouJanela
      ? (config?.janela_inicio_hora ?? null)
      : RITMO_RECOMENDADO.janelaInicioHora,
    janelaFimHora: organizacaoDeclarouJanela
      ? (config?.janela_fim_hora ?? null)
      : RITMO_RECOMENDADO.janelaFimHora,
    tetoDiario: config?.teto_diario ?? RITMO_RECOMENDADO.tetoDiario,
    tetoHorario: config?.teto_horario ?? RITMO_RECOMENDADO.tetoHorario,
  };
}
