/**
 * O aviso que o CRM dá ao canal pareado sobre o envio de conversões.
 *
 * Quando o CRM e o canal enviam conversões do mesmo cliente, o CRM é o dono do
 * envio (dono único). Mas só pode reivindicar o posto se o envio estiver
 * SAUDÁVEL: avisar "ativo" com a conexão quebrada deixaria o cliente sem
 * conversão nenhuma, porque o canal se calaria.
 *
 * Regra pura: recebe o estado já lido e devolve o aviso. A leitura mora em
 * `lib/channels/conversoes-do-canal.ts`.
 */

export interface ConexaoParaOAviso {
  habilitada: boolean;
  datasetId: string | null;
  temToken: boolean;
}

export interface RegraParaOAviso {
  enabled: boolean;
  metaEvent: string;
}

/** Contagem do livro-razão da Meta na janela recente. */
export interface HistoricoParaOAviso {
  enviados: number;
  erros: number;
}

export type AvisoDeConversoes =
  | { ativo: false }
  | { ativo: true; pixel_id: string; eventos: string[] };

/** Janela do livro-razão que julga a saúde. */
export const JANELA_DE_SAUDE_DIAS = 3;

const PADRAO_DO_PIXEL = /^\d{5,32}$/;
const PADRAO_DO_EVENTO = /^[A-Za-z]+$/;
const TETO_DE_EVENTOS = 20;

export function montarAvisoDeConversoes(entrada: {
  conexao: ConexaoParaOAviso | null;
  regras: RegraParaOAviso[];
  historico: HistoricoParaOAviso;
}): AvisoDeConversoes {
  const { conexao, regras, historico } = entrada;
  const inativo: AvisoDeConversoes = { ativo: false };

  if (!conexao || !conexao.habilitada || !conexao.temToken) return inativo;
  const pixel = conexao.datasetId?.trim() ?? "";
  if (!PADRAO_DO_PIXEL.test(pixel)) return inativo;

  // Só erro, sem um único envio na janela: o canal é quem pode estar entregando.
  if (historico.erros > 0 && historico.enviados === 0) return inativo;

  // A venda sempre sai como Purchase; as etapas, pelas regras ATIVAS.
  const eventos = [
    ...new Set(["Purchase", ...regras.filter((r) => r.enabled).map((r) => r.metaEvent)]),
  ]
    .filter((e) => PADRAO_DO_EVENTO.test(e))
    .slice(0, TETO_DE_EVENTOS);
  if (eventos.length === 0) return inativo;

  return { ativo: true, pixel_id: pixel, eventos };
}
