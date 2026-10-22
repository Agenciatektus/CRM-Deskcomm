/**
 * "ESTA EMPRESA DEIXOU A IA LER A MÍDIA QUE CHEGA?" — uma pergunta, um lugar.
 *
 * A leitura de mídia é a derivação textual de `workers/media-derive-worker.ts`:
 * transcrição de áudio, descrição de imagem, texto de documento e quadros de
 * vídeo. Ela custa chamada de IA por arquivo, e numa loja que recebe muita foto
 * (caso real: ~2.150 derivações mortas por semana numa só empresa, sem
 * credencial para ler) o custo e o barulho não pagam o que a IA ganha.
 *
 * Mesmo desenho de `lib/automation/ai-decide-da-org.ts`: o fato é da EMPRESA,
 * mora em `organizations.settings` e tem um leitor só, para o padrão não virar
 * opinião de quem escreve cada linha.
 *
 * ─── O padrão ───────────────────────────────────────────────────────────────
 *
 * **LIGADA.** Desligar por omissão mudaria o atendimento de quem já usa.
 *
 * **`undefined` = não deu para saber, e quem chama trata como LIGADA.** O lado
 * oposto ao do `ai_decide`, de propósito: lá, na dúvida, o modelo não age; aqui,
 * na dúvida, o agente continua lendo o que o cliente mandou. Errar para o lado
 * de ler custa uma derivação; errar para o lado de não ler faz o agente
 * responder sem saber o que estava na foto, e a mídia não é lida de novo.
 * Só um `false` GRAVADO desliga.
 *
 * **Nunca lança.** Fonte que falha vira `undefined`, não exceção no worker.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

/** Chave de `organizations.settings`: um namespace por assunto, como `automacoes`. */
export const CHAVE_DA_MIDIA = "midia";

/** O padrão escrito: ligada, para não mudar quem já usa. */
export const LEITURA_DE_MIDIA_PADRAO = true;

/** O valor gravado em `settings.midia.leitura_pela_ia`; ausente ou lixo = padrão. */
export function leituraDeMidiaDasSettings(settings: unknown): boolean {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return LEITURA_DE_MIDIA_PADRAO;
  const midia = (settings as Record<string, unknown>)[CHAVE_DA_MIDIA];
  if (!midia || typeof midia !== "object" || Array.isArray(midia)) return LEITURA_DE_MIDIA_PADRAO;
  const bruto = (midia as Record<string, unknown>).leitura_pela_ia;
  return typeof bruto === "boolean" ? bruto : LEITURA_DE_MIDIA_PADRAO;
}

export async function leituraDeMidiaLigada(
  supabase: Pick<SupabaseClient, "from">,
  organizationId: string,
): Promise<boolean | undefined> {
  try {
    const { data, error } = await supabase
      .from("organizations")
      .select("settings")
      .eq("id", organizationId)
      .maybeSingle();
    if (error) {
      logger.warn("[midia] não deu para ler o interruptor de leitura de mídia — segue como ligada", {
        organizationId,
        detalhe: error.message,
      });
      return undefined;
    }
    return leituraDeMidiaDasSettings((data as { settings?: unknown } | null)?.settings);
  } catch (erro) {
    logger.warn("[midia] não deu para ler o interruptor de leitura de mídia — segue como ligada", {
      organizationId,
      detalhe: erro instanceof Error ? erro.message : String(erro),
    });
    return undefined;
  }
}
