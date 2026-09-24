import type { SupabaseClient } from "@supabase/supabase-js";

import { beginServiceAtOrigin } from "@/lib/atendimento/origem";
import { audit } from "@/lib/audit";
import { dayStartInTz } from "@/lib/agent-engine/pacing/engine";
import { flowGraphSchema } from "@/lib/followup/graph-schema";
import { cadenceSettingsSchema, type CadenceSettings } from "./settings";

/**
 * A PORTA ÚNICA DE ENTRADA NUMA CADÊNCIA — inscrição manual (em lote, pela tela
 * do funil) e automática (gatilho de etapa). Tudo que o Cassio exigiu como freio
 * no lugar do "interruptor" do agente de IA mora aqui, e em um lugar só:
 *
 *   - cadência PUBLICADA, com número conectado e funil;
 *   - negócio ABERTO no funil da cadência, com contato (IDOR: todo id é relido
 *     com a organização da sessão/do evento — nunca confiado ao body);
 *   - contato apto: sem bloqueio, trava humana, anonimização, recusa de
 *     marketing — e sem OUTRO contato do mesmo telefone nessa situação;
 *   - teto de inscrições por DIA (fuso da organização) da cadência;
 *   - gatilho automático só pega evento POSTERIOR à publicação (nada retroativo:
 *     publicar não pode inscrever o estoque inteiro da etapa de uma vez).
 *
 * Passou: grava a base legal (LIA da cadência) no contato — só se ele não tiver
 * nenhuma e nunca por cima de recusa —, abre a conversa NO NÚMERO DA CADÊNCIA
 * (a mensagem sai por ali) e insere a inscrição com o negócio (`lead_id`).
 *
 * A conversa nasce na inscrição, e não no envio, porque `beginServiceAtOrigin` é
 * só para quem AUTORIZA o atendimento — nunca para job/tick/retry. Por isso a
 * inscrição em lote é limitada ao teto do dia: as conversas vazias duram só até
 * a régua chegar nelas.
 */

export type MotivoDeRecusa =
  | "cadencia_indisponivel"
  | "numero_desconectado"
  | "negocio_fora_do_funil"
  | "negocio_fechado"
  | "negocio_sem_contato"
  | "contato_indisponivel"
  | "contato_bloqueado_ou_optout"
  | "telefone_suprimido"
  | "sem_telefone"
  | "teto_do_dia"
  | "anterior_a_publicacao"
  | "ja_em_outro_fluxo";

export type ResultadoDaInscricao =
  | { ok: true; enrollmentId: string }
  | { ok: false; motivo: MotivoDeRecusa };

export type OrigemDaInscricao =
  | { tipo: "manual"; actorUserId: string; requestId: string }
  | { tipo: "gatilho_etapa"; eventId: string; eventoEm: string };

interface CadenciaCarregada {
  id: string;
  versionId: string;
  noDeGatilho: string;
  publicadaEm: string;
  channelSessionId: string;
  pipelineId: string;
  settings: CadenceSettings;
  fuso: string;
}

/** Carrega e valida a cadência (publicada, número conectado). `null` = não inscreve. */
export async function carregarCadenciaParaInscricao(
  admin: SupabaseClient,
  organizationId: string,
  pointerId: string,
): Promise<{ cadencia: CadenciaCarregada } | { motivo: MotivoDeRecusa }> {
  const { data: p, error } = await admin
    .from("followup_flow_pointers")
    .select("id, status, surface, active_version_id, channel_session_id, pipeline_id, cadence_settings")
    .eq("organization_id", organizationId)
    .eq("id", pointerId)
    .maybeSingle();
  if (error) throw new Error(`cadencia_inscricao: ${error.message}`);
  if (!p || p.surface !== "cadence" || p.status !== "active" || !p.active_version_id) {
    return { motivo: "cadencia_indisponivel" };
  }
  const settings = cadenceSettingsSchema.safeParse(p.cadence_settings);
  if (!settings.success || !p.channel_session_id || !p.pipeline_id) return { motivo: "cadencia_indisponivel" };

  const [{ data: sessao }, { data: versao }, { data: org }] = await Promise.all([
    admin
      .from("channel_sessions")
      .select("id, status, archived_at")
      .eq("organization_id", organizationId)
      .eq("id", p.channel_session_id as string)
      .maybeSingle(),
    admin
      .from("followup_flow_versions")
      .select("graph, created_at")
      .eq("organization_id", organizationId)
      .eq("id", p.active_version_id as string)
      .maybeSingle(),
    admin.from("organizations").select("timezone").eq("id", organizationId).maybeSingle(),
  ]);
  if (!sessao || sessao.archived_at || sessao.status !== "WORKING") return { motivo: "numero_desconectado" };
  if (!versao) return { motivo: "cadencia_indisponivel" };
  const grafo = flowGraphSchema.safeParse(versao.graph);
  const gatilho = grafo.success ? grafo.data.nodes.find((n) => n.type === "trigger") : undefined;
  if (!gatilho) return { motivo: "cadencia_indisponivel" };

  return {
    cadencia: {
      id: p.id as string,
      versionId: p.active_version_id as string,
      noDeGatilho: gatilho.id,
      publicadaEm: versao.created_at as string,
      channelSessionId: p.channel_session_id as string,
      pipelineId: p.pipeline_id as string,
      settings: settings.data,
      fuso: ((org?.timezone as string | null | undefined) ?? "America/Sao_Paulo") || "America/Sao_Paulo",
    },
  };
}

/** Quantas inscrições esta cadência já fez HOJE (meia-noite no fuso da organização). */
export async function inscricoesDeHoje(
  admin: SupabaseClient,
  organizationId: string,
  cadencia: Pick<CadenciaCarregada, "id" | "fuso">,
  agora: Date = new Date(),
): Promise<number> {
  const desde = dayStartInTz(agora, cadencia.fuso).toISOString();
  const { count, error } = await admin
    .from("followup_enrollments")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("pointer_id", cadencia.id)
    .gte("started_at", desde);
  if (error) throw new Error(`cadencia_teto: ${error.message}`);
  return count ?? 0;
}

interface NegocioElegivel {
  leadId: string;
  contactId: string;
}

/** Negócio + contato aptos para ESTA cadência. Não escreve nada — é o dry-run. */
export async function avaliarNegocio(
  admin: SupabaseClient,
  organizationId: string,
  cadencia: Pick<CadenciaCarregada, "pipelineId">,
  leadId: string,
): Promise<{ ok: true; negocio: NegocioElegivel } | { ok: false; motivo: MotivoDeRecusa }> {
  const { data: lead, error } = await admin
    .from("crm_leads")
    .select("id, pipeline_id, status, contact_id")
    .eq("organization_id", organizationId)
    .eq("id", leadId)
    .maybeSingle();
  if (error) throw new Error(`cadencia_negocio: ${error.message}`);
  if (!lead || lead.pipeline_id !== cadencia.pipelineId) return { ok: false, motivo: "negocio_fora_do_funil" };
  if (lead.status !== "open") return { ok: false, motivo: "negocio_fechado" };
  if (!lead.contact_id) return { ok: false, motivo: "negocio_sem_contato" };

  const { data: c, error: cErr } = await admin
    .from("contacts")
    .select("id, phone_number, is_blocked, force_human, is_anonymized, is_merged_into, consent")
    .eq("organization_id", organizationId)
    .eq("id", lead.contact_id as string)
    .maybeSingle();
  if (cErr) throw new Error(`cadencia_contato: ${cErr.message}`);
  if (!c || c.is_anonymized || c.is_merged_into) return { ok: false, motivo: "contato_indisponivel" };
  const consent = (c.consent ?? {}) as { marketing?: { declined_at?: unknown } };
  if (c.is_blocked || c.force_human || consent.marketing?.declined_at) {
    return { ok: false, motivo: "contato_bloqueado_ou_optout" };
  }
  if (!c.phone_number) return { ok: false, motivo: "sem_telefone" };

  // O opt-out é da PESSOA: outro cadastro com o mesmo número que saiu, foi
  // bloqueado ou anonimizado barra este também.
  const { data: gemeos, error: gErr } = await admin
    .from("contacts")
    .select("id, is_blocked, is_anonymized, consent")
    .eq("organization_id", organizationId)
    .eq("phone_number", c.phone_number as string)
    .neq("id", c.id as string)
    .limit(20);
  if (gErr) throw new Error(`cadencia_supressao: ${gErr.message}`);
  const suprimido = (gemeos ?? []).some((g) => {
    const gc = (g.consent ?? {}) as { marketing?: { declined_at?: unknown } };
    return g.is_blocked || g.is_anonymized || Boolean(gc.marketing?.declined_at);
  });
  if (suprimido) return { ok: false, motivo: "telefone_suprimido" };

  return { ok: true, negocio: { leadId: lead.id as string, contactId: lead.contact_id as string } };
}

/**
 * Inscreve UM negócio. Quem chama já carregou a cadência (e, no lote, já
 * conferiu o teto do dia para o lote inteiro).
 */
export async function inscreverNegocio(
  admin: SupabaseClient,
  organizationId: string,
  cadencia: CadenciaCarregada,
  negocio: NegocioElegivel,
  origem: OrigemDaInscricao,
): Promise<ResultadoDaInscricao> {
  // Base legal ANTES da conversa: sem ela o gate LGPD de 1º toque barraria o
  // envio de qualquer forma, e a conversa ficaria aberta à toa. `false` = o
  // contato já tinha base (ou recusou, o que a avaliação já teria barrado).
  const { error: liaErr } = await admin.rpc("fn_cadencia_registrar_base_legal", {
    p_org: organizationId,
    p_contact: negocio.contactId,
    p_ref: cadencia.settings.legal_basis_ref,
  });
  if (liaErr) throw new Error(`cadencia_base_legal: ${liaErr.message}`);

  const fronteira = await beginServiceAtOrigin(admin, organizationId, negocio.contactId, cadencia.channelSessionId);

  const { data: criado, error: insErr } = await admin
    .from("followup_enrollments")
    .insert({
      organization_id: organizationId,
      pointer_id: cadencia.id,
      version_id: cadencia.versionId,
      contact_id: negocio.contactId,
      lead_id: negocio.leadId,
      current_node_id: cadencia.noDeGatilho,
      status: "active",
      agent_id: null,
      service_boundary: fronteira,
      conversation_id: fronteira.conversation_id,
    })
    .select("id")
    .single();
  if (insErr || !criado) {
    if (insErr?.code === "23505") return { ok: false, motivo: "ja_em_outro_fluxo" };
    throw new Error(`cadencia_inscricao: ${insErr?.message ?? "insert_sem_linha"}`);
  }
  const enrollmentId = criado.id as string;

  // Proveniência: a fila responde "por que este contato está aqui?".
  const { error: evErr } = await admin.from("followup_enrollment_events").insert({
    organization_id: organizationId,
    enrollment_id: enrollmentId,
    node_id: cadencia.noDeGatilho,
    event_type: "enrolled_in_cadence",
    payload: {
      lead_id: negocio.leadId,
      origem: origem.tipo,
      ...(origem.tipo === "gatilho_etapa" ? { event_log_id: origem.eventId } : {}),
    },
    idempotency_key: `cadencia-inscricao:${enrollmentId}`,
  });
  if (evErr && evErr.code !== "23505") throw new Error(`cadencia_proveniencia: ${evErr.message}`);

  if (origem.tipo === "manual") {
    void audit({
      action: "followup_enrollment.created",
      actorUserId: origem.actorUserId,
      organizationId,
      resourceType: "followup_enrollment",
      resourceId: enrollmentId,
      requestId: origem.requestId,
      metadata: { pointer_id: cadencia.id, lead_id: negocio.leadId, surface: "cadence" },
    });
  }
  return { ok: true, enrollmentId };
}

/**
 * Inscrição AUTOMÁTICA por evento (gatilho de etapa): carrega, confere que o
 * evento é posterior à publicação e que o teto do dia não estourou, avalia e
 * inscreve. Nunca lança por recusa — recusa é desfecho normal, devolvido.
 */
export async function inscreverPorGatilho(
  admin: SupabaseClient,
  input: { organizationId: string; pointerId: string; leadId: string; eventId: string; eventoEm: string },
): Promise<ResultadoDaInscricao> {
  const carregada = await carregarCadenciaParaInscricao(admin, input.organizationId, input.pointerId);
  if ("motivo" in carregada) return { ok: false, motivo: carregada.motivo };
  const { cadencia } = carregada;
  if (Date.parse(input.eventoEm) < Date.parse(cadencia.publicadaEm)) {
    return { ok: false, motivo: "anterior_a_publicacao" };
  }
  if ((await inscricoesDeHoje(admin, input.organizationId, cadencia)) >= cadencia.settings.max_inscricoes_dia) {
    return { ok: false, motivo: "teto_do_dia" };
  }
  const avaliacao = await avaliarNegocio(admin, input.organizationId, cadencia, input.leadId);
  if (!avaliacao.ok) return avaliacao;
  return inscreverNegocio(admin, input.organizationId, cadencia, avaliacao.negocio, {
    tipo: "gatilho_etapa",
    eventId: input.eventId,
    eventoEm: input.eventoEm,
  });
}
