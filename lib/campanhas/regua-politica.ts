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
    max_inscricoes_dia:
      c.teto_diario === null
        ? MAX_INSCRICOES_DIA_TETO
        : Math.min(MAX_INSCRICOES_DIA_TETO, Math.max(1, c.teto_diario)),
    // ⚠️ `ao_fechar: false` é DELIBERADO, e é a única diferença de política
    // entre a régua da campanha e a da cadência. `motivoDeSaida` trata
    // "nenhum negócio no funil" como negócio REMOVIDO quando `ao_fechar` está
    // ligado — e na campanha o card só nasce quando a pessoa RESPONDE. Com o
    // padrão, toda régua morreria no primeiro passo, com o motivo "o negócio
    // foi fechado", de quem nunca teve negócio. E o caso que o `ao_fechar`
    // existe para cobrir já está coberto duas vezes: quem responde sai pelo
    // `cancel_on_reply`, e quem é assumido por uma pessoa sai pelo
    // `humano_assumir`, que fica LIGADO.
    saidas: { etiquetas: [], etapas: [], ao_fechar: false, humano_assumir: true },
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
