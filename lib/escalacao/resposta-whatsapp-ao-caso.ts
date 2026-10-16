/** Resposta do número interno ao caso da IA, sem criar contato/conversa. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { phoneLookupVariants } from "@/lib/channels/phone-variants";
import {
  ehNumeroInternoDeAviso,
  registrarMensagemIgnorada,
  type ChatIdentidade,
} from "./numero-interno-de-aviso";

const RESPOSTA = /^(RESPONDER|PERGUNTAR)\s+([0-9a-f-]{36})\s+([\s\S]+)$/i;
const CasoId = z.string().uuid();

export type ComandoDeRespostaDoSuporte = {
  caseId: string;
  action: "resolved" | "need_lead_info";
  body: string;
};

/** O formato é explícito para que uma mensagem não resolva o caso errado. */
export function parseComandoDeRespostaDoSuporte(
  texto: string | null | undefined,
): ComandoDeRespostaDoSuporte | null {
  if (!texto) return null;
  const m = RESPOSTA.exec(texto.trim());
  if (!m) return null;
  const caseId = CasoId.safeParse(m[2]);
  const action = m[1]?.toUpperCase();
  const body = m[3]?.trim() ?? "";
  if (!caseId.success || !action || body.length === 0 || body.length > 4000) return null;
  return {
    caseId: caseId.data,
    action: action === "PERGUNTAR" ? "need_lead_info" : "resolved",
    body,
  };
}

/**
 * Intercepta apenas mensagens do telefone que recebeu avisos. Todo o resto
 * segue pelo ingestor normal. O RPC valida canal, destino e entrega do caso na
 * mesma transação em que grava a resposta e enfileira a retomada da IA.
 */
export async function consumirRespostaDoSuporteNoWhatsApp(
  admin: SupabaseClient,
  entrada: {
    organizationId: string;
    channelSessionId: string;
    identidade: ChatIdentidade;
    direction: "inbound" | "outbound";
    texto: string | null;
    externalId: string;
  },
): Promise<boolean> {
  const interno = await ehNumeroInternoDeAviso(admin, entrada.organizationId, entrada.identidade);
  if (!interno) return false;

  const comando = entrada.direction === "inbound"
    ? parseComandoDeRespostaDoSuporte(entrada.texto)
    : null;
  const phone = entrada.identidade.kind === "phone" ? entrada.identidade.phone : null;
  if (!comando || !phone || !entrada.externalId) {
    await registrarMensagemIgnorada(admin, entrada.organizationId, {
      direction: entrada.direction,
      sessionId: entrada.channelSessionId,
    });
    return true;
  }

  const { data, error } = await admin.rpc("fn_responder_caso_por_whatsapp" as never, {
    p_org: entrada.organizationId,
    p_case: comando.caseId,
    p_session: entrada.channelSessionId,
    p_phone_variants: phoneLookupVariants(phone),
    p_action: comando.action,
    p_body: comando.body,
    p_message_key: `${entrada.channelSessionId}:${entrada.externalId}`,
  } as never);
  if (error) throw new Error(`case_reply_whatsapp_failed: ${error.message}`);

  const resultado = typeof data === "string" ? data : null;
  if (resultado !== "accepted" && resultado !== "duplicate") {
    await registrarMensagemIgnorada(admin, entrada.organizationId, {
      direction: entrada.direction,
      sessionId: entrada.channelSessionId,
    });
  }
  return true;
}
