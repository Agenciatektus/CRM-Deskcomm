import type { SupabaseClient } from "@supabase/supabase-js";

import type { FlowNode } from "./graph-schema";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Os modelos de mensagem que um grafo cita — `template_id` do passo de modelo e
 * `fallback_template_id` do plano B da mensagem por IA —, conferidos no banco.
 *
 * O motor resolve o id contra `message_templates` e depois `meta_templates`
 * (`followup-turn.ts`); se não acha em nenhuma, o passo lança a cada disparo.
 * Um fluxo importado de outra conta, ou com o modelo apagado, publicava assim.
 */
export function idsDeModeloCitados(nodes: readonly FlowNode[]): string[] {
  const ids = new Set<string>();
  for (const node of nodes) {
    if (node.type !== "action") continue;
    const cfg = node.config;
    if (cfg.mode === "template" && cfg.template_id) ids.add(cfg.template_id);
    if (cfg.mode === "ai_message" && cfg.fallback_template_id) ids.add(cfg.fallback_template_id);
  }
  return [...ids];
}

/** Dos ids citados, os que existem NESTA organização (texto pronto ou modelo do canal). */
export async function carregaModelosCitados(
  client: SupabaseClient,
  orgId: string,
  nodes: readonly FlowNode[],
): Promise<{ ok: true; modelos: Set<string> } | { ok: false; mensagem: string }> {
  // Id que não é uuid não existe em tabela nenhuma — e mandá-lo ao `in` seria
  // erro de sintaxe no Postgres, não "não achei".
  const ids = idsDeModeloCitados(nodes).filter((id) => UUID_RX.test(id));
  if (ids.length === 0) return { ok: true, modelos: new Set() };

  const [prontos, doCanal] = await Promise.all([
    client.from("message_templates").select("id").eq("organization_id", orgId).in("id", ids),
    client.from("meta_templates").select("id").eq("organization_id", orgId).in("id", ids),
  ]);
  // Erro NÃO vira conjunto vazio: vazio leria como "o modelo foi apagado" e o
  // publish recusaria um fluxo certo.
  const erro = prontos.error ?? doCanal.error;
  if (erro) return { ok: false, mensagem: erro.message };

  const modelos = new Set<string>();
  for (const linha of [...(prontos.data ?? []), ...(doCanal.data ?? [])]) modelos.add(String(linha.id));
  return { ok: true, modelos };
}
