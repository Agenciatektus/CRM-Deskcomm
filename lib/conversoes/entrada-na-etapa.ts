/**
 * A conversão sai pela ENTRADA na etapa (decisão do Peterson, 19/10/2026; migration 9054).
 *
 * Cada etapa do funil tem a chave "Enviar evento de conversão ao entrar nesta
 * etapa" (`crm_stages.envia_conversao`) e o evento que ela manda
 * (`crm_stages.evento_de_conversao`, vocabulário fechado abaixo). Nem todo negócio
 * precisa: depende de cada etapa. O padrão de uma etapa nova é DESLIGADO.
 *
 * ─── Idempotência por ENTRADA ───────────────────────────────────────────────
 *
 * Uma entrada é (negócio, etapa, `crm_leads.stage_changed_at`): o gatilho
 * `fn_stamp_stage_changed_at` carimba o instante a cada troca de `stage_id`. O
 * livro-razão (`ad_conversion_dispatches`) guarda a entrada que enviou
 * (`entrada_em`). Assim:
 *  - o `lead.won` e o `lead.stage_changed` do MESMO arrasto leem o mesmo carimbo
 *    e saem UMA vez; reprocessar o evento também;
 *  - a recompra (o card sai e volta a uma etapa ligada) tem carimbo novo, mais
 *    recente que o da linha, e envia de novo, com id de deduplicação próprio.
 *
 * Troca de funil (`fn_mover_lead_de_funil`) não emite evento de etapa, e a
 * entrada pedida pela opção "rodar automações de entrada" (#207) é pulada pelos
 * dois consumidores (`ehEntradaPelaTroca`): trocar de funil nunca envia conversão.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Os eventos que o sistema sabe enviar por etapa. `QualifiedLead` usa a ação do Google da etapa. */
export const EVENTOS_DE_CONVERSAO_DA_ETAPA = ["Purchase", "QualifiedLead"] as const;
export type EventoDeConversaoDaEtapa = (typeof EVENTOS_DE_CONVERSAO_DA_ETAPA)[number];

export interface EtapaComConversao {
  envia_conversao: boolean | null;
  evento_de_conversao: string | null;
}

/** A etapa manda ESTE evento ao receber um negócio? */
export function etapaEnvia(etapa: EtapaComConversao | null, evento: EventoDeConversaoDaEtapa) {
  return etapa?.envia_conversao === true && etapa.evento_de_conversao === evento;
}

export async function lerConversaoDaEtapa(
  admin: SupabaseClient,
  organizationId: string,
  stageId: string,
): Promise<EtapaComConversao | null> {
  const { data, error } = await admin
    .from("crm_stages")
    .select("envia_conversao, evento_de_conversao")
    .eq("organization_id", organizationId)
    .eq("id", stageId)
    .maybeSingle();
  if (error) throw new Error("Não foi possível ler a configuração da etapa.");
  return data as EtapaComConversao | null;
}

export type Entrada = { tipo: "saiu" } | { tipo: "ok"; entradaEm: string | null; nova: boolean };

/**
 * Qual entrada este evento representa.
 *  - card ainda na etapa: a entrada é o carimbo atual;
 *  - card já saiu, mas a linha guarda a entrada desta etapa ainda não enviada
 *    (nova tentativa de um envio em curso): segue com ela;
 *  - senão, o card saiu antes de o evento ser processado: não há o que enviar.
 * `nova` = a linha do livro-razão é de uma entrada ANTERIOR (recompra).
 */
export function resolverEntrada(
  lead: { stage_id?: string | null; stage_changed_at?: string | null },
  etapaAlvo: string | null | undefined,
  registro: { status: string; entrada_em?: string | null; created_at?: string | null } | null,
): Entrada {
  if (lead.stage_id !== etapaAlvo) {
    if (registro && registro.status !== "sent" && registro.entrada_em)
      return { tipo: "ok", entradaEm: registro.entrada_em, nova: false };
    return { tipo: "saiu" };
  }
  const entradaEm = lead.stage_changed_at ?? null;
  const anterior = registro?.entrada_em ?? registro?.created_at;
  const nova = Boolean(
    registro && entradaEm && anterior && Date.parse(entradaEm) > Date.parse(anterior),
  );
  return { tipo: "ok", entradaEm, nova };
}
