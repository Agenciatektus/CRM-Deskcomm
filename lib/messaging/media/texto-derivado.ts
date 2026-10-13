/**
 * O texto que o `workers/media-derive-worker.ts` grava em
 * `messages.media_derived_text`, e o que dele a TELA pode mostrar.
 *
 * Módulo puro (sem servidor), para a bolha do áudio e o worker lerem a mesma
 * constante: o worker reexporta `MARCADOR_NAO_LIDA` para quem o importava de lá.
 */

/**
 * O texto que substitui a string vazia quando a mídia não pôde ser lida.
 *
 * Não é cosmético: o agente recebe este texto como derivado da mensagem, então
 * ele passa a SABER que chegou algo que não conseguiu interpretar, em vez de
 * concluir que a mensagem veio vazia. A diferença aparece na resposta ao
 * cliente — "não consegui abrir sua foto, pode me dizer o que é?" no lugar de
 * um silêncio que parece descaso.
 */
export const MARCADOR_NAO_LIDA = "[o cliente enviou uma mídia que não consegui interpretar]";

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
