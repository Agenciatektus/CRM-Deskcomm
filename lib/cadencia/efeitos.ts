import type { SupabaseClient } from "@supabase/supabase-js";

import { moveLeadHandler } from "@/app/api/v1/leads/_handler";
import { logger } from "@/lib/logger";
import type { EfeitoDeCrm, EnrollmentRow } from "@/lib/followup/node-handlers";

/**
 * APLICA O PASSO DE CRM DA CADÊNCIA — o lado com banco de `crm_effect`.
 *
 * ─── Qual negócio ───────────────────────────────────────────────────────────
 *
 * `enrollment.lead_id` quando a inscrição nasceu com ele (inscrição pela tela
 * do funil). Sem ele, o negócio ABERTO do contato NO FUNIL da cadência, o mais
 * recente — nunca "qualquer negócio do contato": o contato pode ter negócio em
 * outro funil, e mover aquele seria mexer onde a cadência não manda.
 *
 * ─── Mover de etapa ─────────────────────────────────────────────────────────
 *
 * Pelo `moveLeadHandler`, o escritor de etapa de todo cliente que não é o board
 * (MCP, automações): ele confere a organização, recusa etapa de OUTRO funil e
 * emite `lead.stage_changed` com o ator. Etapa de PERDA é recusada aqui antes:
 * ela exige motivo, e passo automático não tem motivo para dar.
 *
 * ─── Etiqueta ───────────────────────────────────────────────────────────────
 *
 * Por `fn_cadencia_etiqueta_do_lead` (atômica, só service_role). O evento
 * `lead.tag_added` sai marcado com `caused_by_cadence`, para as automações
 * existentes reagirem sem que uma cadência reinscreva a si mesma.
 *
 * Todo erro SOBE: o motor trata como falha do passo (backoff e, esgotado, o
 * aviso de "parou de tentar"). Passo de CRM que some calado é o pior desfecho.
 */
export async function aplicarEfeitoDaCadencia(
  admin: SupabaseClient,
  enrollment: EnrollmentRow,
  efeito: EfeitoDeCrm,
): Promise<void> {
  const org = enrollment.organization_id;

  const { data: pointer, error: pointerErr } = await admin
    .from("followup_flow_pointers")
    .select("id, surface, pipeline_id")
    .eq("organization_id", org)
    .eq("id", enrollment.pointer_id)
    .maybeSingle();
  if (pointerErr) throw new Error(`cadencia_pointer: ${pointerErr.message}`);
  if (!pointer) throw new Error("cadencia_pointer_nao_encontrado");
  if (!pointer.pipeline_id) throw new Error("cadencia_sem_funil");

  const leadId = await negocioDaInscricao(admin, enrollment, pointer.pipeline_id as string);
  if (!leadId) throw new Error("cadencia_sem_negocio_no_funil");

  if (efeito.tipo === "move_stage") {
    const { data: etapa, error: etapaErr } = await admin
      .from("crm_stages")
      .select("id, organization_id, pipeline_id, is_lost")
      .eq("organization_id", org)
      .eq("id", efeito.stage_id)
      .maybeSingle();
    if (etapaErr) throw new Error(`cadencia_etapa: ${etapaErr.message}`);
    if (!etapa || etapa.pipeline_id !== pointer.pipeline_id) throw new Error("cadencia_etapa_fora_do_funil");
    if (etapa.is_lost) throw new Error("cadencia_etapa_de_perda_exige_motivo");

    await moveLeadHandler(
      admin as never,
      {
        organization_id: org,
        actor: { type: "webhook_source", id: enrollment.id },
        requestId: `cadencia:${enrollment.id}:${enrollment.current_node_id}`,
      },
      leadId,
      { to_stage_id: efeito.stage_id, reason: "Passo da cadência de prospecção" },
    );
    return;
  }

  const { data: tags, error: tagErr } = await admin.rpc("fn_cadencia_etiqueta_do_lead", {
    p_org: org,
    p_lead: leadId,
    p_op: efeito.op,
    p_tag: efeito.tag,
  });
  if (tagErr) throw new Error(`cadencia_etiqueta: ${tagErr.message}`);
  if (tags === null) throw new Error("cadencia_negocio_nao_encontrado");

  if (efeito.op === "add") {
    const { error: eventoErr } = await admin.rpc("emit_event", {
      p_event_type: "lead.tag_added",
      p_entity_kind: "crm_lead",
      p_entity_id: leadId,
      p_payload: { added_tags: [efeito.tag], tags },
      p_metadata: { caused_by_cadence: enrollment.pointer_id, enrollment_id: enrollment.id },
      p_organization_id: org,
    });
    // O efeito já foi aplicado: o evento é aviso para as automações, e falhar
    // aqui não pode desfazer a etiqueta nem reaplicar o passo em loop.
    if (eventoErr) {
      logger.error("[cadencia] emit_event lead.tag_added falhou", {
        organization_id: org,
        enrollment_id: enrollment.id,
        error: eventoErr.message,
      });
    }
  }
}

async function negocioDaInscricao(
  admin: SupabaseClient,
  enrollment: EnrollmentRow,
  pipelineId: string,
): Promise<string | null> {
  const org = enrollment.organization_id;
  if (enrollment.lead_id) {
    const { data, error } = await admin
      .from("crm_leads")
      .select("id, pipeline_id")
      .eq("organization_id", org)
      .eq("id", enrollment.lead_id)
      .maybeSingle();
    if (error) throw new Error(`cadencia_negocio: ${error.message}`);
    if (data && data.pipeline_id === pipelineId) return data.id as string;
    return null;
  }
  const { data, error } = await admin
    .from("crm_leads")
    .select("id")
    .eq("organization_id", org)
    .eq("contact_id", enrollment.contact_id)
    .eq("pipeline_id", pipelineId)
    .eq("status", "open")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`cadencia_negocio: ${error.message}`);
  return (data?.id as string | undefined) ?? null;
}
