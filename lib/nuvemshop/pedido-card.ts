/**
 * Um pedido da Nuvemshop = UM card no funil "Pedidos do Site"; o MESMO card anda de etapa
 * conforme o status do pedido (fatia 4.3). Só age em org que tem o funil com as 6 etapas
 * por slug; sem contato no pedido não há card (nunca cria contato).
 *
 * Vínculo card↔pedido: `crm_leads.source='nuvemshop'` + `external_id=<id do pedido>`
 * (índice único `uniq_crm_leads_org_source_external`), então criar é idempotente.
 * Só avança (posição da etapa maior que a atual): cancelado/refunded é a última etapa e fica.
 * `requestId` com prefixo `rule:` é o anti-laço do motor (não reprocessa os eventos derivados).
 * shortcut: não detecta card movido à mão por um humano para trás (o lead não guarda quem moveu;
 * `last_change_actor_kind` é da etapa); upgrade = guardar a última etapa posta em `custom_fields`.
 * LGPD: nada do comprador entra aqui nem em log; o título leva só o número do pedido.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createLeadHandler, moveLeadHandler } from "@/app/api/v1/leads/_handler";
import type { HandlerCtx } from "@/lib/api/handlers/types";
import type { PedidoRow } from "./pedido-mapper";

export const FUNIL_DE_PEDIDOS = "Pedidos do Site";

const ETAPA_DO_STATUS: Record<PedidoRow["status"], string> = {
  pending: "aguardando-pagamento",
  paid: "pago-separando",
  shipped: "enviado-ou-pronto-para-retirar",
  fulfilled: "enviado-ou-pronto-para-retirar",
  delivered: "entregue",
  cancelled: "cancelado-ou-com-problema",
  refunded: "cancelado-ou-com-problema",
};
const SLUGS = [
  "pedido-novo",
  "aguardando-pagamento",
  "pago-separando",
  "enviado-ou-pronto-para-retirar",
  "entregue",
  "cancelado-ou-com-problema",
];

export type ResultadoDoCard = { status: "ok" | "skipped"; detail: string };

type Etapa = { id: string; slug: string; position: number; is_archived: boolean };

async function sincronizar(
  admin: SupabaseClient,
  organizationId: string,
  pedido: {
    externalId: string;
    numero: string | null;
    status: PedidoRow["status"];
    totalCents: number | null;
    contactId: string | null;
  },
): Promise<ResultadoDoCard> {
  const { data: funis } = await admin
    .from("crm_pipelines")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("name", FUNIL_DE_PEDIDOS)
    .limit(1);
  const funilId = (funis as Array<{ id: string }> | null)?.[0]?.id;
  if (!funilId) return { status: "skipped", detail: "funil_ausente" };

  const { data: etapasRaw } = await admin
    .from("crm_stages")
    .select("id, slug, position, is_archived")
    .eq("organization_id", organizationId)
    .eq("pipeline_id", funilId)
    .in("slug", SLUGS);
  const etapas = ((etapasRaw as Etapa[] | null) ?? []).filter((e) => !e.is_archived);
  if (SLUGS.some((s) => !etapas.some((e) => e.slug === s))) {
    return { status: "skipped", detail: "funil_ausente" };
  }
  if (!pedido.contactId) return { status: "skipped", detail: "sem_contato" };

  // `pedido-novo` fica para quem criar o card à mão: o mapper não distingue "novo" de "aguardando".
  const destino = etapas.find((e) => e.slug === ETAPA_DO_STATUS[pedido.status])!;
  const ctx = {
    organization_id: organizationId,
    actor: { type: "webhook_source", id: "nuvemshop-pedidos" },
    requestId: `rule:nuvemshop-pedidos:${pedido.externalId}`,
  } as HandlerCtx;

  {
    const { data: card } = await admin
      .from("crm_leads")
      .select("id, stage_id")
      .eq("organization_id", organizationId)
      .eq("source", "nuvemshop")
      .eq("external_id", pedido.externalId)
      .maybeSingle();
    const atual = card as { id: string; stage_id: string } | null;

    if (!atual) {
      await createLeadHandler(admin as never, ctx, {
        pipeline_id: funilId,
        stage_id: destino.id,
        title: `Pedido #${pedido.numero ?? pedido.externalId}`,
        contact_id: pedido.contactId,
        value_cents: pedido.totalCents ?? undefined,
        source: "nuvemshop",
        external_id: pedido.externalId,
        tags: [],
      } as Parameters<typeof createLeadHandler>[2]);
      return { status: "ok", detail: "card_criado" };
    }

    const posicaoAtual = etapas.find((e) => e.id === atual.stage_id)?.position;
    if (posicaoAtual === undefined) return { status: "skipped", detail: "card_fora_do_funil" };
    if (destino.position <= posicaoAtual) return { status: "skipped", detail: "sem_mudanca" };
    await moveLeadHandler(admin as never, ctx, atual.id, { to_stage_id: destino.id });
    return { status: "ok", detail: "card_movido" };
  }
}

/** Nada aqui derruba nem repete o upsert do pedido: qualquer falha vira `detail`. */
export async function sincronizarCardDoPedido(
  ...args: Parameters<typeof sincronizar>
): Promise<ResultadoDoCard> {
  try {
    return await sincronizar(...args);
  } catch (err) {
    // Só o código curto: a mensagem do erro pode trazer dado do contato.
    return { status: "skipped", detail: `card_falhou:${(err as { code?: string }).code ?? "erro"}` };
  }
}
