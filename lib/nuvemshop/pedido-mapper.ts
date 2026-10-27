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
 *
 * Cancelado e refunded têm o mesmo peso e o primeiro gravado fica (de propósito:
 * ambos são finais e a API não ordena os dois). Dentro de UMA leitura, cancelled
 * vence refunded.
 *
 * `payload` é uma LISTA FIXA de campos não pessoais (LGPD): nada de customer,
 * contact_*, billing_*, shipping_address, client_details, IP ou CPF.
 */

export class PedidoInvalidoError extends Error {}

const PEDIDO_OK = [
  "id", "number", "status", "payment_status", "shipping_status", "total", "subtotal",
  "discount", "shipping_cost_customer", "shipping_cost_owner", "currency", "gateway",
  "created_at", "updated_at", "paid_at", "closed_at", "cancelled_at", "shipped_at",
] as const;
const ITEM_OK = ["id", "product_id", "variant_id", "name", "sku", "quantity", "price"] as const;
const ENVIO_OK = ["id", "status", "shipped_at", "delivered_at"] as const;

const so = (o: unknown, chaves: readonly string[]): Cru => {
  const base = (o && typeof o === "object" ? o : {}) as Cru;
  return Object.fromEntries(chaves.filter((k) => base[k] !== undefined).map((k) => [k, base[k]]));
};
const lista = (v: unknown): Cru[] => (Array.isArray(v) ? (v as Cru[]) : []);

function payloadSeguro(p: Cru): Cru {
  const pd = p["payment_details"] as Cru | undefined;
  return {
    ...so(p, PEDIDO_OK),
    ...(pd ? { payment_details: so(pd, ["method", "installments"]) } : {}),
    products: lista(p["products"]).map((i) => so(i, ITEM_OK)),
    fulfillments: lista(p["fulfillments"]).map((f) => ({
      ...so(f, ENVIO_OK),
      tracking_info: so(f["tracking_info"], ["code", "url"]),
    })),
  };
}

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
  if (!m) throw new PedidoInvalidoError("total_invalido");
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
  if (typeof p["created_at"] !== "string" || Number.isNaN(Date.parse(p["created_at"]))) {
    throw new PedidoInvalidoError("created_at_ausente");
  }
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
    payload: payloadSeguro(p),
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
