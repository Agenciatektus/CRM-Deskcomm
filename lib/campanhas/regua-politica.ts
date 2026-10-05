/**
 * A POLÍTICA DA RÉGUA DA CAMPANHA — tudo que se decide sem tocar no banco.
 *
 * Mora separado de `regua.ts` porque é a parte PROVÁVEL: derivar janela,
 * espaçamento, teto e base legal do ritmo que a campanha já tem é onde as
 * decisões difíceis estão (o `24` que não é hora válida em HH:MM, o
 * `ao_fechar` desligado), e testar isso não deveria pedir um cliente de banco.
 * `regua.ts` fica com o I/O: publicar, desligar, encerrar.
 */
import {
  CADENCE_SETTINGS_PADRAO,
  ESPACAMENTO_MAXIMO_S,
  ESPACAMENTO_MINIMO_S,
  MAX_INSCRICOES_DIA_TETO,
  type CadenceSettings,
} from "@/lib/cadencia/settings";
import { grafoDaTimeline, type PassoDaRegua } from "@/lib/regua/timeline";

/**
 * O que a política precisa saber da campanha. É o mesmo recorte que
 * `lib/campanhas/acoes.ts` carrega, e de propósito: a régua não lê colunas que
 * a ação que a publica não tenha em mãos.
 */
export interface CampanhaComRegua {
  id: string;
  organization_id: string;
  name: string;
  channel_session_id: string;
  pipeline_id: string | null;
  base_legal: string;
  lia_ref: string | null;
  intervalo_segundos: number | null;
  janela_inicio_hora: number | null;
  janela_fim_hora: number | null;
  teto_diario: number | null;
  passos: unknown;
  followup_pointer_id: string | null;
}

function emHoraCheia(hora: number): string {
  return `${String(hora).padStart(2, "0")}:00`;
}

/**
 * A política de envio da régua, derivada da campanha — PURA.
 *
 * Janela: as horas da campanha, nos SETE dias da semana. A campanha nunca
 * restringiu dia (só hora), e inventar "seg–sex" aqui faria a régua calar no
 * sábado de uma campanha que mandou a 1ª mensagem no sábado.
 *
 * Espaçamento: o intervalo da campanha, aparado na faixa que a cadência aceita,
 * com `min = max`. A campanha promete "uma a cada N segundos", não "entre N e
 * M": sortear uma faixa aqui mudaria o ritmo que o operador escolheu. Quando a
 * campanha não escolheu intervalo, vale o padrão da cadência — que sorteia, e é
 * o espalhamento que o anti-padrão pede.
 *
 * Teto de inscrições/dia: o teto diário da campanha quando há um. Ele já limita
 * os ENVIOS da 1ª mensagem, e a inscrição é 1:1 com eles — então o teto não
 * aperta mais nada no caminho normal, e segura o anormal (repreparação, rodada
 * repetida) sem precisar de número novo na tela.
 */
/**
 * O TETO DE ENVIO POR DIA de uma campanha COM passos.
 *
 * ═══ Por que o teto da régua passa a valer no ENVIO ═══
 *
 * A régua aceita no máximo `max_inscricoes_dia` entradas por dia, e a inscrição
 * é tentada UMA vez, logo depois do envio: `campaign_recipients` só é relido com
 * `status = 'pending'`, e quem já está `sent` nunca volta. Então, com o envio
 * solto e a inscrição limitada, uma campanha de 2.000 sem teto próprio mandava a
 * abordagem para 2.000 pessoas e dava a régua a 500 — as outras 1.500 ficavam
 * sem o 2º toque PARA SEMPRE, não "no dia seguinte". E a tela afirmava o
 * contrário, que é pior que não dizer nada.
 *
 * Com passos, portanto, a campanha não manda mais do que a régua absorve no
 * mesmo dia. Os dois números são o mesmo (`max_inscricoes_dia`), contados em
 * lugares diferentes: o envio é cobrado antes de sair, a vaga é reservada
 * depois. Ninguém perde mensagem — a campanha só leva mais dias, e mandar
 * devagar é o que a prospecção fria quer de todo jeito.
 *
 * ⚠️ O QUE MUDA NUMA CAMPANHA JÁ PREPARADA: nada na lista e nada no texto. Uma
 * campanha com passos, sem `teto_diario` e com mais de 500 elegíveis passa a
 * mandar 500 por dia em vez de tudo o que o ritmo permitisse — ela termina mais
 * tarde, e todo mundo que receber vai ter régua. Campanha SEM passos não passa
 * por aqui: `teto_diario` continua sendo exatamente o que o operador escreveu,
 * ou nenhum teto.
 */
export function tetoDeEnvioComRegua(tetoDiario: number | null): number {
  return Math.min(MAX_INSCRICOES_DIA_TETO, Math.max(1, tetoDiario ?? MAX_INSCRICOES_DIA_TETO));
}

export function politicaDaRegua(c: CampanhaComRegua): CadenceSettings {
  const inicio = c.janela_inicio_hora;
  const fim = c.janela_fim_hora;
  // `24` é hora válida no CHECK da campanha (`janela_fim_hora <= 24`) e inválida
  // no HH:MM da cadência: "24:00" não casa o regex. 23:59 é o mesmo fim de dia.
  const fimTexto = fim === null ? null : fim === 24 ? "23:59" : emHoraCheia(fim);
  const inicioTexto = inicio === null ? null : emHoraCheia(inicio);
  const janelaValida = inicioTexto !== null && fimTexto !== null && inicioTexto < fimTexto;

  const intervalo = c.intervalo_segundos;
  const espacamentoS =
    intervalo === null
      ? null
      : Math.min(ESPACAMENTO_MAXIMO_S, Math.max(ESPACAMENTO_MINIMO_S, Math.round(intervalo)));

  return {
    janela:
      janelaValida && inicioTexto !== null && fimTexto !== null
        ? { start: inicioTexto, end: fimTexto, weekdays: [0, 1, 2, 3, 4, 5, 6] }
        : { ...CADENCE_SETTINGS_PADRAO.janela, weekdays: [0, 1, 2, 3, 4, 5, 6] },
    espacamento:
      espacamentoS === null
        ? CADENCE_SETTINGS_PADRAO.espacamento
        : { min_s: espacamentoS, max_s: espacamentoS },
    legal_basis_ref: baseLegalDaRegua(c),
    // O MESMO número que o envio passa a respeitar (`tetoDeEnvioComRegua`):
    // uma fonte só, senão a campanha manda mais do que a régua absorve e a
    // diferença some sem rastro.
    max_inscricoes_dia: tetoDeEnvioComRegua(c.teto_diario),
    // ⚠️ `ao_fechar: true`, igual à cadência, e a HISTÓRIA deste campo importa:
    // ele esteve desligado enquanto o card da campanha nascia só na resposta.
    // Naquele desenho `motivoDeSaida` lia "sem negócio" como negócio REMOVIDO e
    // matava toda régua no primeiro passo. Com o card nascendo na ABORDAGEM a
    // premissa caiu, e mantê-lo desligado deixaria a régua falando com quem o
    // vendedor JÁ marcou como perdido por fora do WhatsApp: `cancel_on_reply`
    // não pega (a pessoa não respondeu no canal) e `humano_assumir` só pega se
    // alguém falou NO canal. Quem separa os dois significados de "sem negócio"
    // agora é `FatosDaSaida.nasceuComNegocio`, e não o desligamento deste campo:
    // a régua cujo card não deu para criar segue viva.
    saidas: { etiquetas: [], etapas: [], ao_fechar: true, humano_assumir: true },
  };
}

/**
 * A referência da base legal que vai para o contato na inscrição.
 *
 * Interesse legítimo tem a LIA da campanha (a rota já a exige). Consentimento
 * não tem referência própria: entra o nome da campanha, que é o que responde
 * "com base em quê esta pessoa recebeu isto?" quando alguém perguntar.
 */
export function baseLegalDaRegua(c: CampanhaComRegua): string {
  const lia = (c.lia_ref ?? "").trim();
  if (lia !== "") return `${lia} [campanha:${c.id}]`.slice(0, 200);
  const base = c.base_legal === "legitimate_interest" ? "interesse legítimo" : "consentimento";
  return `Campanha "${c.name}" (${base}) [campanha:${c.id}]`.slice(0, 200);
}

/**
 * O nome do pointer. Carrega o prefixo do id da campanha porque
 * `followup_flow_pointers` tem `unique (organization_id, name)` e duas
 * campanhas podem ter o mesmo nome. Gravado só na CRIAÇÃO: renomear a campanha
 * não renomeia a régua, porque um nome novo pode colidir com o de outro fluxo —
 * e perder a publicação por causa do rótulo seria o remédio pior que a doença.
 */
export function nomeDaRegua(c: CampanhaComRegua): string {
  return `Campanha · ${c.name.slice(0, 40)} (${c.id.slice(0, 8)})`;
}

/**
 * Lista → grafo linear, pelo conversor que a cadência também usa.
 *
 * Exportada para o teste ler o MESMO grafo que vai ao ar: um conversor próprio
 * no teste provaria o conversor do teste.
 */
export function grafoDaRegua(passos: readonly PassoDaRegua[]) {
  return grafoDaTimeline([...passos]);
}
