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
  /** Preenchido = os eventos vão como teste e não contam: o canal precisa enviar. */
  testEventCode: string | null;
}

/** Resumo do livro-razão da Meta na janela recente. */
export interface HistoricoParaOAviso {
  enviados: number;
  erros: number;
  /** Status do envio mais recente da janela (só `sent` ou `error`); `null` sem nenhum. */
  ultimoEnvio: "sent" | "error" | null;
  /** Houve `skipped` por credencial (cifra, credencial incompleta, conexão desligada) depois do último `sent`. */
  credencialQuebradaDepoisDoUltimoSent: boolean;
}

export type AvisoDeConversoes =
  | { ativo: false }
  | { ativo: true; pixel_id: string; eventos: string[] };

/** Janela do livro-razão que julga a saúde. */
export const JANELA_DE_SAUDE_DIAS = 3;

/** Motivos de `skipped` que dizem "a credencial não deixa enviar". */
export const MOTIVOS_DE_CREDENCIAL = [
  "cifra_indisponivel",
  "credencial_incompleta",
  "conexao_desabilitada",
] as const;

const PADRAO_DO_PIXEL = /^\d{5,32}$/;

/**
 * "Ativo" só com prova de envio saudável. Na dúvida o canal envia: duplicar é o
 * lado seguro, calar não. O aviso declara SÓ a venda (`Purchase`); Lead, Contact e
 * etapas continuam saindo pelo canal.
 */
export function montarAvisoDeConversoes(entrada: {
  conexao: ConexaoParaOAviso | null;
  historico: HistoricoParaOAviso;
}): AvisoDeConversoes {
  const { conexao, historico } = entrada;
  const inativo: AvisoDeConversoes = { ativo: false };

  if (!conexao || !conexao.habilitada || !conexao.temToken) return inativo;
  if (conexao.testEventCode?.trim()) return inativo;
  const pixel = conexao.datasetId?.trim() ?? "";
  if (!PADRAO_DO_PIXEL.test(pixel)) return inativo;

  if (historico.enviados <= 0) return inativo;
  if (historico.ultimoEnvio !== "sent") return inativo;
  if (historico.credencialQuebradaDepoisDoUltimoSent) return inativo;

  return { ativo: true, pixel_id: pixel, eventos: ["Purchase"] };
}
