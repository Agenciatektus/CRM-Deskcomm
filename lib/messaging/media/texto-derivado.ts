/**
 * O texto que o `workers/media-derive-worker.ts` grava em
 * `messages.media_derived_text`, e o que dele a TELA pode mostrar.
 *
 * Módulo puro (sem servidor), para a bolha do áudio e o worker lerem a mesma
 * constante: o worker reexporta `MARCADOR_NAO_LIDA` para quem o importava de lá.
 */

/**
 * O texto que substitui a string vazia quando a mídia não pôde ser lida. Mora em
 * `derivable.ts` desde a subida 1.73 (o upstream o pôs lá, sem import nenhum,
 * pelo mesmo motivo que o pusemos aqui: a tela precisa dele): UMA fonte só.
 */
import { MARCADOR_NAO_LIDA } from "./derivable";

export { MARCADOR_NAO_LIDA };

/**
 * A transcrição que a bolha do áudio mostra, ou `null` para não mostrar nada.
 *
 * Só áudio (a coluna também guarda a descrição de imagem e o texto de PDF, que
 * não são "transcrição"), só texto com conteúdo, e nunca o marcador de leitura
 * que falhou: ele é recado para o agente, escrito na primeira pessoa dele, e na
 * tela pareceria que o cliente disse aquilo.
 */
export function transcricaoDoAudio(m: { type: string; media_derived_text?: string | null }): string | null {
  if (m.type !== "audio") return null;
  const texto = m.media_derived_text?.trim() ?? "";
  if (texto === "" || texto === MARCADOR_NAO_LIDA) return null;
  return texto;
}
