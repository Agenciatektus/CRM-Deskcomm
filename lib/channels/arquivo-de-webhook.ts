/**
 * O CORPO CRU DO QUE O PROVEDOR MANDOU.
 *
 * ─── Por que isto precisa existir ───────────────────────────────────────────
 *
 * `webhook_events_log` é o único lugar onde o payload original fica guardado. A
 * rota do canal por QR grava lá desde sempre; a rota genérica de canal — por
 * onde entram os canais oficiais — não gravava nada. Barrido antes desta peça:
 * zero escritores naquele caminho.
 *
 * Não é lacuna abstrata. O comentário de `lib/waha/ingest.ts` mostra que a
 * decisão sobre identidades opacas (`@lid`) só foi possível porque esse arquivo
 * existia em produção — "76 de 76", contados no banco. O instrumento que
 * respondeu aquela pergunta faltava justamente no canal NOVO, que é onde ainda
 * há pergunta aberta: se mensagem de grupo chega, e de qual host vem o anexo.
 *
 * ─── Duas escritas, e não uma ───────────────────────────────────────────────
 *
 * A linha nasce ANTES do processamento, com `received`. Se o processo morrer no
 * meio — exceção, OOM, deploy no instante errado — o corpo cru continua lá, que
 * é justamente quando alguém vai querer lê-lo. Gravar só no fim perderia
 * exatamente os casos que motivam o arquivo.
 *
 * ─── O que este módulo NÃO faz ──────────────────────────────────────────────
 *
 * Não interpreta o payload. `event_type` e `external_id` ficam nulos de
 * propósito: lê-los exigiria saber o formato de cada canal, e essa é a decisão
 * que o seam existe para manter longe da rota. O `payload_parsed` guarda o JSON
 * — quem investigar lê `payload_parsed->>'event'` e tem a mesma resposta, sem
 * que ninguém precise ensinar o formato a este arquivo. A exceção é o que não é
 * dado a investigar: mídia inline, string acima do teto e credencial (no corpo
 * E nos cabeçalhos, em qualquer profundidade e formato) saem antes da escrita,
 * trocadas por um marcador (`./enxugar-para-arquivo.ts`). Foi a mídia inline
 * que encheu o banco em 28/09/2026; token em claro medido de novo em 05/10/2026.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

import { cabecalhosParaArquivo } from "./cabecalhos-para-arquivo";
import { arquivoEnxuto } from "./enxugar-para-arquivo";

/**
 * Abre a linha do arquivo. Devolve o id para o fechamento, ou `null` quando não
 * deu — e "não deu" nunca interrompe a ingestão: perder o arquivo é ruim, perder
 * a mensagem do cliente é pior.
 */
export async function abrirArquivoDoWebhook(
  admin: SupabaseClient,
  entrada: {
    organizationId: string;
    channelSessionId: string;
    provider: string;
    rawBody: string;
    headers: Headers;
  },
): Promise<string | null> {
  // Enxuto ANTES de gravar: sem a mídia inline e sem o token da instância. A
  // ingestão não lê daqui — ela usa o corpo da requisição —, então cortar aqui
  // não tira nada de quem processa a mensagem. Ver `./enxugar-para-arquivo.ts`.
  // Corpo que não é JSON (ou é lista/escalar) sai intacto, com `parsed` nulo:
  // é exatamente o caso que ninguém consegue reproduzir depois.
  const { rawBody, parsed } = arquivoEnxuto(entrada.rawBody);

  try {
    const { data, error } = await admin
      .from("webhook_events_log")
      .insert({
        organization_id: entrada.organizationId,
        channel_session_id: entrada.channelSessionId,
        // Vem da SESSÃO, nunca de um literal: a rota não pode nomear canal, e
        // o `lint:channels` reprova quem tenta.
        provider: entrada.provider,
        http_method: "POST",
        headers: cabecalhosParaArquivo(entrada.headers),
        raw_body: rawBody,
        payload_parsed: parsed,
        status: "received",
        attempts: 0,
      })
      .select("id")
      .maybeSingle();

    if (error) {
      logger.warn("[arquivo-webhook] não consegui abrir a linha", {
        detail: error.message.slice(0, 160),
      });
      return null;
    }
    return (data as { id: string } | null)?.id ?? null;
  } catch (err) {
    logger.warn("[arquivo-webhook] não consegui abrir a linha", {
      detail: err instanceof Error ? err.message.slice(0, 160) : "desconhecido",
    });
    return null;
  }
}

/**
 * Fecha a linha com o desfecho.
 *
 * `valid_signature` só é `false` quando a recusa foi POR assinatura. Um payload
 * bem assinado que o parser ignorou não é assinatura inválida, e marcar como se
 * fosse mandaria quem investigar procurar um problema de segredo que não existe.
 */
export async function fecharArquivoDoWebhook(
  admin: SupabaseClient,
  id: string | null,
  desfecho: { status: "processed" | "error"; validSignature: boolean | null; erro?: string | null },
): Promise<void> {
  if (!id) return;
  try {
    await admin
      .from("webhook_events_log")
      .update({
        status: desfecho.status,
        valid_signature: desfecho.validSignature,
        error_message: desfecho.erro ?? null,
        processed_at: new Date().toISOString(),
      })
      .eq("id", id);
  } catch {
    // A linha `received` já está gravada com o corpo cru, que é o que importa.
    // Falhar aqui não pode derrubar a resposta ao provedor.
  }
}
