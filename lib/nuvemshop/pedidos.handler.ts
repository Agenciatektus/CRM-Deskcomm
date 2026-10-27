/**
 * Grava o pedido da Nuvemshop em `orders` (só ingestão: sem contato, card ou funil).
 *
 * O webhook chega duplicado e fora de ordem, então o pedido é RELIDO na API e o
 * estado nunca regride (`semRegredir`). Service role: todo filtro leva
 * `organization_id`. Não loga token nem dado do cliente do pedido.
 */
import type { EventHandler, EventRow, HandlerResult } from "@/lib/event-log/dispatcher";
import { createAdminClient } from "@/lib/supabase/admin";
import { NuvemshopApiClient } from "./api-client";
import { credenciaisDaLoja } from "./credenciais";
import { mapearPedido, semRegredir, type PedidoRow } from "./pedido-mapper";

export const PEDIDOS_HANDLER_KEY = "nuvemshop-pedidos.v1";

// Nomes que o webhook emite: `nuvemshop.${event.replace("/", "_")}`.
export const EVENTOS_DE_PEDIDO = [
  "nuvemshop.order_created",
  "nuvemshop.order_updated",
  "nuvemshop.order_paid",
  "nuvemshop.order_cancelled",
];

const r = (status: HandlerResult["status"], detail?: string): HandlerResult => ({
  consumer_key: PEDIDOS_HANDLER_KEY,
  status,
  detail,
});

type Atual = Pick<
  PedidoRow,
  "status" | "fulfillment_status" | "tracking_code" | "updated_at_remote"
>;

export async function processPedido(row: EventRow): Promise<HandlerResult> {
  const id = row.payload["id"] != null ? String(row.payload["id"]) : "";
  if (!id) return r("skipped", "pedido_sem_id");

  const cred = await credenciaisDaLoja(row.organization_id);
  if (!cred) return r("skipped", "loja_nao_conectada");

  try {
    const cru = await new NuvemshopApiClient(cred).getOrder(id, {
      aggregates: "fulfillment_orders",
    });
    if (!cru) return r("skipped", "pedido_nao_encontrado");

    const admin = createAdminClient();
    const chave = {
      organization_id: row.organization_id,
      external_provider: "nuvemshop",
      external_id: id,
    };
    const { data, error: errLeitura } = await admin
      .from("orders")
      .select("status, fulfillment_status, tracking_code, updated_at_remote")
      .match(chave)
      .maybeSingle();
    if (errLeitura) return r("error", `leitura:${errLeitura.code ?? "erro"}`);

    const atual = data as Atual | null;
    const novo = mapearPedido(cru);
    if (
      atual?.updated_at_remote &&
      novo.updated_at_remote &&
      Date.parse(atual.updated_at_remote) > Date.parse(novo.updated_at_remote)
    ) {
      return r("skipped", "pedido_mais_antigo");
    }

    const { error } = await admin
      .from("orders")
      .upsert(
        { ...chave, ...semRegredir(novo, atual), updated_at: new Date().toISOString() },
        { onConflict: "organization_id,external_provider,external_id" },
      );
    if (error) return r("error", `gravacao:${error.code ?? "erro"}`);
    return r("ok");
  } catch (err) {
    // Só a mensagem curta: o corpo do erro da API pode trazer dado do cliente.
    return r("error", err instanceof Error ? err.message.slice(0, 80) : "erro");
  }
}

export const pedidosNuvemshopHandler: EventHandler = {
  key: PEDIDOS_HANDLER_KEY,
  naOrgParada: "roda",
  events: EVENTOS_DE_PEDIDO,
  handle: processPedido,
};
