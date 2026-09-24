import type { SupabaseClient } from "@supabase/supabase-js";

import type { EnrollmentRow } from "@/lib/followup/node-handlers";
import { nomesDosAtendentes } from "@/lib/users/nome-do-atendente";
import { primeiroNome, type ValoresDaCadencia } from "./render";

export interface ContextoDaCadencia {
  pointerId: string;
  valores: ValoresDaCadencia;
}

/**
 * O contexto de um passo de TEXTO da cadência: `null` quando o pointer não é
 * cadência (follow-up comum segue exatamente como antes).
 */
export async function contextoDaCadencia(
  admin: SupabaseClient,
  enrollment: EnrollmentRow,
): Promise<ContextoDaCadencia | null> {
  const org = enrollment.organization_id;
  const { data: pointer, error: pointerErr } = await admin
    .from("followup_flow_pointers")
    .select("id, surface, pipeline_id")
    .eq("organization_id", org)
    .eq("id", enrollment.pointer_id)
    .maybeSingle();
  if (pointerErr) throw new Error(`cadencia_contexto: ${pointerErr.message}`);
  if (!pointer || pointer.surface !== "cadence") return null;
  const valores = await valoresDoNegocio(admin, org, {
    pipelineId: pointer.pipeline_id as string,
    contactId: enrollment.contact_id,
    leadId: enrollment.lead_id ?? null,
  });
  return { pointerId: pointer.id as string, valores };
}

/**
 * Os valores das variáveis para um negócio — a MESMA função para o envio (motor)
 * e para o preview da tela: o preview só é verdade se ler o que o envio lê.
 *
 * Vêm do CONTATO (nome) e do NEGÓCIO no funil da cadência (título, etapa, dono) —
 * nunca do payload. `empresa` prefere o campo personalizado `empresa` do negócio
 * e cai no título do negócio, que é como a importação de lojistas grava a loja.
 */
export async function valoresDoNegocio(
  admin: SupabaseClient,
  org: string,
  alvo: { pipelineId: string; contactId: string; leadId: string | null },
): Promise<ValoresDaCadencia> {
  const contatoQ = admin
    .from("contacts")
    .select("name")
    .eq("organization_id", org)
    .eq("id", alvo.contactId)
    .maybeSingle();
  let negocioQ = admin
    .from("crm_leads")
    .select("id, title, custom_fields, owner_user_id, stage_id")
    .eq("organization_id", org);
  negocioQ = alvo.leadId
    ? negocioQ.eq("id", alvo.leadId)
    : negocioQ
        .eq("contact_id", alvo.contactId)
        .eq("pipeline_id", alvo.pipelineId)
        .order("updated_at", { ascending: false })
        .limit(1);
  const [{ data: contato, error: contatoErr }, { data: negocio, error: negocioErr }] = await Promise.all([
    contatoQ,
    negocioQ.maybeSingle(),
  ]);
  if (contatoErr) throw new Error(`cadencia_contexto: ${contatoErr.message}`);
  if (negocioErr) throw new Error(`cadencia_contexto: ${negocioErr.message}`);

  let etapa: string | null = null;
  if (negocio?.stage_id) {
    const { data: s } = await admin
      .from("crm_stages")
      .select("name")
      .eq("organization_id", org)
      .eq("id", negocio.stage_id as string)
      .maybeSingle();
    etapa = (s?.name as string | undefined) ?? null;
  }

  let atendente: string | null = null;
  if (negocio?.owner_user_id) {
    const nomes = await nomesDosAtendentes([negocio.owner_user_id as string]);
    atendente = primeiroNome(nomes.get(negocio.owner_user_id as string) ?? null);
  }

  const custom =
    negocio?.custom_fields && typeof negocio.custom_fields === "object" && !Array.isArray(negocio.custom_fields)
      ? (negocio.custom_fields as Record<string, unknown>)
      : {};
  const empresaCampo = typeof custom.empresa === "string" ? custom.empresa : null;
  const nome = (contato?.name as string | null | undefined) ?? null;

  return {
    primeiro_nome: primeiroNome(nome),
    nome,
    empresa: empresaCampo ?? ((negocio?.title as string | null | undefined) ?? null),
    etapa,
    atendente,
  };
}
