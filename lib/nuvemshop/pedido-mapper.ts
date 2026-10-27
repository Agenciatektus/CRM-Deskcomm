/**
 * Pedido da Nuvemshop (cru) -> linha de `orders`. Função pura.
 *
 * Mapeamento (assumido; a API não documenta todas as combinações):
 *   status            = cancelled se status=cancelled ou payment_status=voided
 *                       refunded  se payment_status=refunded
 *                       delivered se shipping_status=delivered
 *                       shipped   se shipping_status=shipped
 *                       paid      se payment_status=paid|authorized
 *                       pending   no resto (inclui partially_paid)
 *                       (`fulfilled` existe no CHECK, mas a API não distingue: nunca derivado)
 *   fulfillment_status= unpacked  <- unpacked
 *                       packed    <- unshipped, partially_packed
 *                       shipped   <- shipped, partially_fulfilled
 *                       delivered <- delivered
 */

export type StatusPedido =
  | "pending"
  | "paid"
  | "cancelled"
  | "fulfilled"
  | "shipped"
  | "delivered"
  | "refunded";
export type StatusEnvio = "unpacked" | "packed" | "shipped" | "delivered";

export interface PedidoRow {
  status: StatusPedido;
  fulfillment_status: StatusEnvio | null;
  tracking_code: string | null;
  total_cents: number;
  currency: string;
  payment_method: string | null;
  ordered_at: string;
  updated_at_remote: string | null;
  customer_external_id: string | null;
  payload: Record<string, unknown>;
}

type Cru = Record<string, unknown>;

/** "650.00" -> 65000, sem float. Mais de 2 casas truncam. */
export function dinheiroEmCentavos(v: unknown): number {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(String(v ?? "").trim());
  if (!m) throw new Error("total_invalido");
  return Number(m[1]) * 100 + Number(((m[2] ?? "") + "00").slice(0, 2));
}

const ENVIO: Record<string, StatusEnvio> = {
  unpacked: "unpacked",
  unshipped: "packed",
  partially_packed: "packed",
  shipped: "shipped",
  partially_fulfilled: "shipped",
  delivered: "delivered",
};

export function mapearPedido(p: Cru): PedidoRow {
  const pay = String(p["payment_status"] ?? "");
  const ship = String(p["shipping_status"] ?? "");

  let status: StatusPedido = "pending";
  if (p["status"] === "cancelled" || pay === "voided") status = "cancelled";
  else if (pay === "refunded") status = "refunded";
  else if (ship === "delivered") status = "delivered";
  else if (ship === "shipped") status = "shipped";
  else if (pay === "paid" || pay === "authorized") status = "paid";

  const fulfillments = Array.isArray(p["fulfillments"]) ? (p["fulfillments"] as Cru[]) : [];
  const codigo = fulfillments
    .map((f) => (f["tracking_info"] as Cru | undefined)?.["code"])
    .find((c) => typeof c === "string" && c.length > 0);

  const detalhes = p["payment_details"] as Cru | undefined;
  const metodo = detalhes?.["method"] ?? p["gateway"];
  const cliente = p["customer"] as Cru | undefined;
  const moeda =
    typeof p["currency"] === "string" && p["currency"].length === 3 ? p["currency"] : "BRL";

  return {
    status,
    fulfillment_status: ENVIO[ship] ?? null,
    tracking_code: (codigo as string | undefined) ?? null,
    total_cents: dinheiroEmCentavos(p["total"]),
    currency: moeda,
    payment_method: typeof metodo === "string" && metodo ? metodo : null,
    ordered_at: String(p["created_at"]),
    updated_at_remote: typeof p["updated_at"] === "string" ? p["updated_at"] : null,
    customer_external_id: cliente?.["id"] != null ? String(cliente["id"]) : null,
    payload: p,
  };
}

const RANK_STATUS: Record<StatusPedido, number> = {
  pending: 0,
  paid: 1,
  shipped: 2,
  fulfilled: 3,
  delivered: 4,
  cancelled: 5,
  refunded: 5,
};
const RANK_ENVIO: Record<StatusEnvio, number> = { unpacked: 0, packed: 1, shipped: 2, delivered: 3 };

/** Webhook fora de ordem: o estado só avança; cancelado/refunded vence e fica. */
export function semRegredir(
  novo: PedidoRow,
  atual: Pick<PedidoRow, "status" | "fulfillment_status" | "tracking_code"> | null,
): PedidoRow {
  if (!atual) return novo;
  const status = RANK_STATUS[atual.status] >= RANK_STATUS[novo.status] ? atual.status : novo.status;
  const envioAtual = atual.fulfillment_status;
  const envio =
    envioAtual &&
    (!novo.fulfillment_status || RANK_ENVIO[envioAtual] > RANK_ENVIO[novo.fulfillment_status])
      ? envioAtual
      : novo.fulfillment_status;
  return {
    ...novo,
    status,
    fulfillment_status: envio,
    tracking_code: novo.tracking_code ?? atual.tracking_code,
  };
}
