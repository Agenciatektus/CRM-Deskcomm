/**
 * Grava o pedido da Nuvemshop em `orders`, liga ao contato existente (sem criar) e, se a org
 * tem o funil "Pedidos do Site", cria/move o card do pedido (`pedido-card.ts`).
 *
 * O webhook chega duplicado e fora de ordem, então o pedido é RELIDO na API e o
 * estado nunca regride (`semRegredir`). Service role: todo filtro leva
 * `organization_id`. shortcut: leitura + upsert não é atômico (dois eventos simultâneos
 * podem regredir até o próximo evento); upgrade = upsert condicional em SQL. Não loga token nem dado do cliente do pedido.
 */
import type { EventHandler, EventRow, HandlerResult } from "@/lib/event-log/dispatcher";
import { createAdminClient } from "@/lib/supabase/admin";
import { eventLogTypeFor, SUBSCRIBED_EVENTS } from "./config";
import { NuvemshopApiClient } from "./api-client";
import { credenciaisDaLoja } from "./credenciais";
import { casarContato } from "./pedido-contato";
import { sincronizarCardDoPedido } from "./pedido-card";
import { mapearPedido, PedidoInvalidoError, semRegredir, type PedidoRow } from "./pedido-mapper";

export const PEDIDOS_HANDLER_KEY = "nuvemshop-pedidos.v1";

// Mesma função que a rota do webhook usa para nomear o que emite.
export const EVENTOS_DE_PEDIDO = SUBSCRIBED_EVENTS.filter((e) => e.startsWith("order/")).map(
  eventLogTypeFor,
);

const r = (status: HandlerResult["status"], detail?: string): HandlerResult => ({
  consumer_key: PEDIDOS_HANDLER_KEY,
  status,
  detail,
});

type Atual = Pick<
  PedidoRow,
  "status" | "fulfillment_status" | "tracking_code" | "updated_at_remote"
> & { is_anonymized: boolean; contact_id: string | null };

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
      .select("status, fulfillment_status, tracking_code, updated_at_remote, is_anonymized, contact_id")
      .match(chave)
      .maybeSingle();
    if (errLeitura) return r("error", `leitura:${errLeitura.code ?? "erro"}`);

    const atual = data as Atual | null;
    // LGPD: titular anonimizado não é reescrito pelo próximo `order/updated`.
    if (atual?.is_anonymized) return r("skipped", "anonimizado");
    const novo = mapearPedido(cru);
    if (
      atual?.updated_at_remote &&
      novo.updated_at_remote &&
      Date.parse(atual.updated_at_remote) > Date.parse(novo.updated_at_remote)
    ) {
      return r("skipped", "pedido_mais_antigo");
    }

    // Só casa quando a linha ainda não tem contato; o que já casou nunca é trocado nem zerado.
    // Sem a chave `contact_id` no upsert a coluna fica como está.
    const casou = atual?.contact_id ? null : await casarContato(admin, row.organization_id, cru);
    const contato = casou && "contactId" in casou ? { contact_id: casou.contactId } : {};

    const { error } = await admin
      .from("orders")
      .upsert(
        { ...chave, ...semRegredir(novo, atual), ...contato, updated_at: new Date().toISOString() },
        { onConflict: "organization_id,external_provider,external_id" },
      );
    if (error) return r("error", `gravacao:${error.code ?? "erro"}`);

    // Card do pedido (4.3): depois do upsert; falha dele nunca derruba nem repete o pedido.
    const gravado = semRegredir(novo, atual);
    const card = await sincronizarCardDoPedido(admin, row.organization_id, {
      externalId: id,
      numero: cru["number"] != null ? String(cru["number"]) : null,
      status: gravado.status,
      statusAnterior: atual?.status ?? null,
      totalCents: gravado.total_cents,
      rastreio: gravado.tracking_code,
      contactId: atual?.contact_id ?? (casou && "contactId" in casou ? casou.contactId : null),
    });
    const detalhes = [
      casou && "motivo" in casou ? casou.motivo : null,
      card.detail === "funil_ausente" ? null : card.detail,
    ].filter(Boolean);
    return r("ok", detalhes.join(",") || undefined);
  } catch (err) {
    // Dado ruim não muda na próxima tentativa: pula em vez de ficar em retry.
    if (err instanceof PedidoInvalidoError) return r("skipped", err.message);
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
