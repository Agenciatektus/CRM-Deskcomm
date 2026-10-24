/**
 * Envio IDEMPOTENTE da instancia NATIVA (FZAP >= v1.35.2).
 *
 * O corpo de /chat/send/* leva `id` (o id do CRM, imutavel e escopado a instancia):
 * repetir o mesmo id nao retransmite, devolve o resultado existente. Quando a
 * resposta se perde (timeout, 502, rede), a pergunta certa e ao FZAP, nao ao envio:
 * `GET /chat/send/status?Id=` diz se aquele id saiu.
 *
 *   sent        -> saiu; tratar como enviado, sem reenviar
 *   processing  -> ainda no ar; aguarda um pouco e pergunta de novo
 *   not_found   -> nunca chegou; reenvia UMA vez com o mesmo id
 *   unknown     -> NAO se sabe; nunca reenviar sozinho (pode duplicar na tela do cliente)
 *
 * O FZAP usa o id do cliente como id da mensagem no WhatsApp, entao `sent` sem id na
 * resposta devolve o proprio id (o eco IsFromMe casa por ele e nao vira 2a bolha).
 *
 * LIMITES CONHECIDOS (nao implementados de proposito):
 *  - Cobertura parcial: so envios com `clientMessageId`. IA, follow-up, handoff e
 *    avisos seguem sem dedup no FZAP e sem a falha rapida de STARTING.
 *  - Premissa: o FZAP serializa o mesmo `id` enquanto esta em `processing`; sem isso,
 *    o reenvio de `not_found` poderia correr contra um envio ainda em voo.
 */
import { fzapRequest } from "./client";
import type { VerdashCredentials } from "./credentials";

export const ENVIO_INCERTO = "verdash_envio_incerto";

type EstadoEnvio = "processing" | "sent" | "unknown" | "not_found";

const TENTATIVAS_PROCESSING = 3;

/** Erro de transporte em que o FZAP pode ter recebido o pedido: so esses consultam o status. */
export function erroDeTransporteIncerto(err: unknown): boolean {
  const m = err instanceof Error ? err.message : "";
  return m.startsWith("verdash_unreachable") || /^verdash_request_failed: 50[234]\b/.test(m);
}

async function estadoDoEnvio(
  creds: VerdashCredentials,
  id: string,
): Promise<{ state: EstadoEnvio | null; id?: string }> {
  const d = await fzapRequest<{ state?: string; id?: string }>(
    creds,
    `/chat/send/status?Id=${encodeURIComponent(id)}`,
  );
  const state = d?.state;
  const ok = state === "processing" || state === "sent" || state === "unknown" || state === "not_found";
  return { state: ok ? state : null, id: d?.id };
}

function incerto(motivo: string): Error {
  return new Error(
    `${ENVIO_INCERTO}: nao foi possivel confirmar se a mensagem saiu (${motivo}). ` +
      "Nao foi reenviada para nao duplicar; confira no WhatsApp antes de tentar de novo.",
  );
}

/**
 * Chama `enviar` (que ja leva o `id` no corpo). Em erro de transporte consulta o
 * status antes de qualquer nova tentativa. Erro que nao e de transporte (400, 401...)
 * propaga igual: o FZAP respondeu, entao nao ha duvida a resolver.
 */
export async function enviarComConsulta(
  creds: VerdashCredentials,
  id: string,
  enviar: () => Promise<{ id?: string }>,
  opts: { esperaMs?: number } = {},
): Promise<{ id?: string }> {
  try {
    return await enviar();
  } catch (err) {
    if (!erroDeTransporteIncerto(err)) throw err;
  }

  const espera = opts.esperaMs ?? 1500;
  for (let i = 0; i < TENTATIVAS_PROCESSING; i++) {
    let r: Awaited<ReturnType<typeof estadoDoEnvio>>;
    try {
      r = await estadoDoEnvio(creds, id);
    } catch {
      throw incerto("consulta de status falhou");
    }
    if (r.state === "sent") return { id: r.id ?? id };
    if (r.state === "not_found") return enviar();
    if (r.state !== "processing") throw incerto(r.state ?? "estado_desconhecido");
    if (espera > 0) await new Promise((res) => setTimeout(res, espera));
  }
  throw incerto("ainda em processamento");
}
