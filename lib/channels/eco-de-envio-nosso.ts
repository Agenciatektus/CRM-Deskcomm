/**
 * A mensagem "enviada pela conta" que o canal ecoou é o eco de um envio que ESTE
 * CRM acabou de fazer (IA, composer, regra, token de servidor) — e não alguém
 * respondendo pelo celular ou pelo app?
 *
 * Nasceu no WAHA (issue #519, consertada no #521) e serve também ao Instagram,
 * cujo `message_echoes` devolve TODO envio, inclusive o que saiu pela API. A
 * linha do envio nasce `queued` sem `external_id` e só ganha o id quando o
 * adapter volta; o eco que chega nessa janela não bate no unique e, sem esta
 * guarda, calava a IA logo depois da própria resposta.
 *
 * A prova exigida é forte: uma linha nossa na MESMA conversa, ainda sem
 * `external_id` (portanto em voo), com o MESMO corpo, dentro da janela. Faltando
 * qualquer uma, a resposta é "não sei" — e "não sei" silencia, porque é o
 * desfecho seguro do lado do atendente humano (#371).
 *
 * Mídia não tem corpo comparável: ali a prova cai para "existe envio nosso de
 * mídia em voo na janela", que é mais permissivo e assumidamente mais fraco.
 *
 * Só decide se MEXE no automático. Quem reaproveitar isto para pular o INSERT
 * reabre o #108 (gravar é tolerante; pausar é estrito).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { semAssinatura } from "@/lib/messaging/assinatura";

/**
 * Quanto tempo um envio nosso pode ficar "em voo" antes de o eco deixar de ser
 * explicável por ele. Folgado de propósito: errar para o lado permissivo custa um
 * minuto de IA ativa; errar para o outro, a IA muda por horas.
 */
const JANELA_DO_ECO_MS = 60_000;

/** `chat` é o nome do WAHA; `text` é o que a tabela `messages` grava. */
const TIPOS_DE_TEXTO = new Set(["chat", "text"]);

export async function ehEcoDeEnvioNosso(
  admin: SupabaseClient,
  organizationId: string,
  conversationId: string,
  eco: { corpo: string | null; midia: boolean },
): Promise<boolean> {
  const desde = new Date(Date.now() - JANELA_DO_ECO_MS).toISOString();
  const { data, error } = await admin
    .from("messages")
    .select("id, body, type")
    .eq("organization_id", organizationId)
    .eq("conversation_id", conversationId)
    .eq("direction", "outbound")
    // `sent_via` separa o que NASCEU aqui do que veio de fora: a linha do
    // celular/app é `external_device` e nunca pode servir de álibi. A lista anda
    // junto do carimbo de `origemDaMensagem` (`app/api/v1/messages/_handler.ts`):
    // `automation` (#652) e `system` (token de servidor, #866) nasceram aqui
    // tanto quanto a IA e o composer.
    .in("sent_via", ["ai", "user", "automation", "system"])
    // Sem `external_id` = ainda não confirmada pelo canal = ainda em voo.
    .is("external_id", null)
    .in("status", ["queued", "sending"])
    .gte("created_at", desde)
    .limit(20);

  if (error) {
    // Falha de leitura não pode virar "é eco": na dúvida, silencia.
    console.error("[eco-de-envio-nosso] checagem de eco falhou", error.message);
    return false;
  }

  const corpo = (eco.corpo ?? "").trim();
  for (const linha of data ?? []) {
    const l = linha as { body: string | null; type?: string | null };
    if (eco.midia) {
      if (!TIPOS_DE_TEXTO.has(l.type ?? "text")) return true;
      continue;
    }
    // Com a assinatura do emissor ligada (upstream #2066), o eco traz `*Nome*\ntexto` e a
    // linha guarda `texto`: sem tirar a linha do nome, o eco do próprio envio
    // assinado seria lido como digitação no celular e calaria a IA.
    const gravado = (l.body ?? "").trim();
    if (corpo.length > 0 && (gravado === corpo || gravado === semAssinatura(corpo).trim())) return true;
  }
  return false;
}
