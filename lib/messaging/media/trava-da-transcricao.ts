/**
 * A TRAVA DE CUSTO DA TRANSCRIÇÃO — decide ANTES de o áudio sair.
 *
 * Até aqui o único freio da transcrição era o teto de 50 MB do arquivo e o
 * `TETO_DE_SANIDADE_USD` de `transcription.ts`, que só decide o que GRAVAR
 * depois que a conta já foi paga. Um áudio de WhatsApp é coisa de segundos a
 * poucos minutos; um arquivo de 50 MB pode ser horas de gravação, e cada degrau
 * da escada (`escada-de-transcricao.ts`) cobraria por elas.
 *
 * A regra: áudio com mais de `DURACAO_MAXIMA_DA_TRANSCRICAO_SEGUNDOS` não vai a
 * provedor nenhum. De onde vem a duração:
 *
 *  1. Do CANAL (`audioMessage.seconds`, que o FZAP repassa em
 *     `metadata.provider_attachments[].seconds`) — mas SÓ PARA BARRAR. O número
 *     é de quem mandou a mensagem: um cliente WhatsApp modificado declara o que
 *     quiser, e um áudio de horas com `seconds: 5` não pode passar por isso
 *     (P1 do @Cassio_SecRev na #253). Declarou mais de 10 min: barra sem medir.
 *  2. Do ARQUIVO, medido com `ffprobe` SEMPRE que o canal não barrou. É a
 *     medida que decide.
 *  3. Se o ffprobe não mede, do TAMANHO: acima de `TETO_DE_BYTES_SEM_DURACAO`
 *     não sai. É conservador de propósito: nota de voz do WhatsApp é opus a
 *     ~16 kbit/s, 10 min ≈ 1,2 MB; 3 MB só passa calado em áudio de bitrate
 *     alto, e aí é melhor não transcrever do que pagar às cegas.
 */
import { medirDuracaoComFfprobe } from "@/lib/messaging/media/ffprobe-duracao";

/** 10 minutos. O único lugar onde este número mora. */
export const DURACAO_MAXIMA_DA_TRANSCRICAO_SEGUNDOS = 10 * 60;

/** A reserva quando nem o canal nem o ffprobe dizem a duração. */
export const TETO_DE_BYTES_SEM_DURACAO = 3 * 1024 * 1024;

/** Frase fixa: vai para `metadata.media_derived_motivo`, que o operador lê. */
export const MOTIVO_AUDIO_LONGO_DEMAIS = "áudio maior que 10 min não é transcrito";
export const MOTIVO_AUDIO_SEM_DURACAO_GRANDE_DEMAIS =
  "áudio sem duração conhecida e maior que 3 MB não é transcrito (equivale a mais de 10 min)";

export type VereditoDaTrava =
  | { passa: true; segundos: number | null; fonte: "arquivo" | "tamanho" }
  | { passa: false; segundos: number | null; fonte: "canal" | "arquivo" | "tamanho"; motivo: string };

function numeroPositivo(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * A duração que o canal mandou junto da mensagem, se mandou. Só lê o que
 * existe hoje: o `seconds` do anexo que o FZAP grava (`lib/channels/verdash`).
 * WAHA e a Cloud API da Meta não trazem duração no webhook — esses caem no
 * ffprobe.
 */
export function duracaoDeclaradaPeloCanal(metadata: Record<string, unknown> | null | undefined): number | null {
  const anexos = metadata?.provider_attachments;
  if (!Array.isArray(anexos)) return null;
  for (const a of anexos) {
    const s = numeroPositivo((a as Record<string, unknown> | null)?.seconds);
    if (s !== null) return s;
  }
  return null;
}

/**
 * O veredito. `medir` é injetável para teste; o padrão é o ffprobe.
 */
export async function travaDaTranscricao(entrada: {
  audio: Buffer;
  metadata?: Record<string, unknown> | null;
  medir?: (audio: Buffer) => Promise<number | null>;
}): Promise<VereditoDaTrava> {
  // O canal só BARRA: o que ele diz a favor do áudio não vale sem conferência.
  const doCanal = duracaoDeclaradaPeloCanal(entrada.metadata);
  if (doCanal !== null && doCanal > DURACAO_MAXIMA_DA_TRANSCRICAO_SEGUNDOS) {
    return { passa: false, segundos: doCanal, fonte: "canal", motivo: MOTIVO_AUDIO_LONGO_DEMAIS };
  }

  const medida = await (entrada.medir ?? medirDuracaoComFfprobe)(entrada.audio);
  if (medida !== null) {
    return medida > DURACAO_MAXIMA_DA_TRANSCRICAO_SEGUNDOS
      ? { passa: false, segundos: medida, fonte: "arquivo", motivo: MOTIVO_AUDIO_LONGO_DEMAIS }
      : { passa: true, segundos: medida, fonte: "arquivo" };
  }

  return entrada.audio.byteLength > TETO_DE_BYTES_SEM_DURACAO
    ? { passa: false, segundos: null, fonte: "tamanho", motivo: MOTIVO_AUDIO_SEM_DURACAO_GRANDE_DEMAIS }
    : { passa: true, segundos: null, fonte: "tamanho" };
}
