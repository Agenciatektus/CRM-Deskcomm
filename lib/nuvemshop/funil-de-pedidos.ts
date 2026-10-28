/**
 * Funil que recebe os pedidos da Nuvemshop: o escolhido em `store_metadata.pedidos_pipeline_id`
 * ou o padrão "Pedidos do Site". Compatível = tem as 6 etapas abaixo (por slug), não arquivadas.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const FUNIL_DE_PEDIDOS = "Pedidos do Site";

export const ETAPAS_DE_PEDIDO = [
  { slug: "pedido-novo", name: "Pedido novo" },
  { slug: "aguardando-pagamento", name: "Aguardando pagamento" },
  { slug: "pago-separando", name: "Pago, separando" },
  { slug: "enviado-ou-pronto-para-retirar", name: "Enviado ou pronto para retirar" },
  { slug: "entregue", name: "Entregue", is_won: true },
  { slug: "cancelado-ou-com-problema", name: "Cancelado ou com problema", is_lost: true },
] as const;
export const SLUGS = ETAPAS_DE_PEDIDO.map((e) => e.slug) as string[];

type Linha = { id: string; name?: string; slug?: string; position?: number; pipeline_id?: string; is_archived?: boolean };

export async function funisCompativeis(admin: SupabaseClient, organizationId: string): Promise<Array<{ id: string; name: string }>> {
  const { data: funis } = await admin
    .from("crm_pipelines")
    .select("id, name")
    .eq("organization_id", organizationId)
    .eq("is_archived", false);
  const lista = (funis as Linha[] | null) ?? [];
  if (lista.length === 0) return [];
  const { data: etapas } = await admin
    .from("crm_stages")
    .select("pipeline_id, slug, is_archived")
    .eq("organization_id", organizationId)
    .in("pipeline_id", lista.map((f) => f.id))
    .in("slug", SLUGS);
  const vivas = ((etapas as Linha[] | null) ?? []).filter((e) => !e.is_archived);
  return lista
    .filter((f) => SLUGS.every((s) => vivas.some((e) => e.pipeline_id === f.id && e.slug === s)))
    .map((f) => ({ id: f.id, name: f.name ?? "" }));
}

export async function criarFunilPadrao(admin: SupabaseClient, organizationId: string): Promise<string> {
  const { data: existentes } = await admin
    .from("crm_pipelines")
    .select("slug, position")
    .eq("organization_id", organizationId);
  const usados = (existentes as Linha[] | null) ?? [];
  let slug = "pedidos-do-site";
  for (let n = 2; usados.some((f) => f.slug === slug); n++) slug = `pedidos-do-site-${n}`;
  const position = Math.max(0, ...usados.map((f) => f.position ?? 0)) + 1000;

  const { data: criado, error } = await admin
    .from("crm_pipelines")
    .insert({
      organization_id: organizationId,
      name: FUNIL_DE_PEDIDOS,
      slug,
      position,
      vocabulary: {
        won: "Pago", deal: "Pedido", lead: "Cliente", lost: "Cancelado", stage: "Etapa",
        deal_plural: "Pedidos", lead_plural: "Clientes", stage_plural: "Etapas",
      },
      fontes: [], // text[] NOT NULL: objeto vazio o PostgREST recusa; [] = sem canal de entrada
      is_default: false,
    })
    .select("id")
    .single();
  if (error || !criado) throw new Error("funil_nao_criado");
  const id = (criado as { id: string }).id;

  const { error: etapasErr } = await admin.from("crm_stages").insert(
    ETAPAS_DE_PEDIDO.map((e, i) => {
      const won = "is_won" in e;
      return {
        organization_id: organizationId,
        pipeline_id: id,
        name: e.name,
        slug: e.slug,
        position: (i + 1) * 1000,
        is_won: won,
        is_lost: "is_lost" in e,
        // Conversão fica desligada: o dono liga à mão se quiser mandar Purchase à Meta.
        ...(won ? { evento_de_conversao: "Purchase", envia_conversao: false } : {}),
      };
    }),
  );
  if (etapasErr) {
    await admin.from("crm_pipelines").delete().eq("id", id).eq("organization_id", organizationId);
    throw new Error("etapas_nao_criadas");
  }
  return id;
}

/** Merge em `store_metadata` (nunca troca o objeto). Falso = funil de outra org, incompatível ou sem integração. */
export async function gravarEscolha(admin: SupabaseClient, organizationId: string, pipelineId: string): Promise<boolean> {
  if (!(await funisCompativeis(admin, organizationId)).some((f) => f.id === pipelineId)) return false;
  const { data } = await admin
    .from("tenant_integrations")
    .select("id, store_metadata")
    .eq("organization_id", organizationId)
    .eq("provider", "nuvemshop")
    .maybeSingle();
  const atual = data as { id: string; store_metadata: Record<string, unknown> | null } | null;
  if (!atual) return false;
  const { error } = await admin
    .from("tenant_integrations")
    .update({ store_metadata: { ...(atual.store_metadata ?? {}), pedidos_pipeline_id: pipelineId } })
    .eq("organization_id", organizationId)
    .eq("id", atual.id);
  return !error;
}
