import type { SupabaseClient } from "@supabase/supabase-js";

import type { ServiceBoundary } from "@/lib/atendimento/fronteira";
import { beginServiceAtOrigin } from "@/lib/atendimento/origem";
import { audit } from "@/lib/audit";
import { phoneLookupVariants } from "@/lib/channels/phone-variants";
import { flowGraphSchema } from "@/lib/followup/graph-schema";
import { SUPERFICIES_DE_PROSPECCAO } from "@/lib/followup/superficies";
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
 *
 * ═══ A CAMPANHA entra pela mesma porta (migration 9037) ═══
 *
 * A campanha com passos publica uma régua própria (`surface='campaign'`,
 * `lib/campanhas/regua.ts`) e inscreve o destinatário quando a 1ª mensagem SAI.
 * Ela usa `inscreverContatoNaRegua`, logo abaixo, para herdar exatamente os
 * freios desta porta — anti-laço, teto do dia, veto por bloqueio/anonimização/
 * recusa, supressão por telefone e gravação de base legal. Duas diferenças, e
 * só duas:
 *
 *   1. NÃO abre conversa: a campanha já abriu no envio, e um segundo
 *      `beginServiceAtOrigin` reabriria a conversa e dispararia roteamento para
 *      a equipe por causa de um passo que ainda nem existe. A fronteira já
 *      aberta entra por parâmetro.
 *   2. NÃO exige negócio PRONTO: ela ABRE o card, pelo `abrirNegocio`, depois
 *      dos freios (`lib/campanhas/card-da-abordagem.ts`). A cadência recebe o
 *      negócio escolhido na tela do funil; a campanha abre o dela, porque ali o
 *      card não existia antes da abordagem. Quando a abertura não dá (funil sem
 *      etapa de entrada, falha de banco), a inscrição nasce sem `lead_id` e a
 *      régua roda assim: ela é o 2º toque de quem já recebeu o 1º. O anti-laço,
 *      que na cadência é por NEGÓCIO, aqui é por CONTATO — o negócio é criado
 *      por esta inscrição, então comparar por ele não pegaria repetição nenhuma.
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
  | "ja_em_outro_fluxo"
  | "ja_passou_pela_cadencia";

/** Janela em que um negócio não volta para a MESMA cadência (anti-laço de gatilho). */
export const DIAS_SEM_REPETIR_A_CADENCIA = 30;

export type ResultadoDaInscricao =
  | { ok: true; enrollmentId: string }
  | { ok: false; motivo: MotivoDeRecusa };

export type OrigemDaInscricao =
  | { tipo: "manual"; actorUserId: string; requestId: string }
  | { tipo: "gatilho_etapa" | "gatilho_etiqueta"; eventId: string; eventoEm: string }
  /** Varredura de tempo (atendente sem responder / lead parado): não há evento, há a conversa. */
  | { tipo: "gatilho_tempo"; conversationId: string; eventoEm: string }
  /** 1ª mensagem da campanha entregue (migration 9037): a régua começa no 2º toque. */
  | { tipo: "campanha"; campanhaId: string; destinatarioId: string };

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

/**
 * Carrega e valida a régua de prospecção (publicada, número conectado).
 * `motivo` = não inscreve.
 *
 * Serve as DUAS superfícies de prospecção (`SUPERFICIES_DE_PROSPECCAO`): a
 * cadência do funil e a régua da campanha. Tudo que ela confere vale para as
 * duas — pointer publicado, versão ativa com nó de gatilho, número conectado,
 * funil e política completa.
 */
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
  if (!p || !SUPERFICIES_DE_PROSPECCAO.includes(p.surface as never) || p.status !== "active" || !p.active_version_id) {
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
  // NÚMERO INEXISTENTE OU ARQUIVADO recusa nas duas superfícies: ali não há o
  // que reconectar.
  if (!sessao || sessao.archived_at) return { motivo: "numero_desconectado" };
  // DESCONECTADO recusa a cadência, que fala por UM número. A campanha faz
  // rodízio: basta ALGUM número do pool estar no ar, porque a 1ª mensagem saiu
  // por um deles e é nele que a conversa do inscrito nasceu.
  //
  // Sem isto, o afrouxamento que a publicação já tinha ficava pela metade e não
  // entregava o que prometia: campanha com três números e o PRINCIPAL fora do
  // ar passava a poder ser preparada, mandava a abordagem por um secundário — e
  // TODOS levavam `numero_desconectado` aqui. A régua ficava vazia enquanto o
  // principal estivesse fora. Mono-chip num lugar e multi-chip noutro é a raiz
  // da issue #106, e os dois lados fecham juntos.
  if (sessao.status !== "WORKING") {
    const temOutroNoAr =
      p.surface === "campaign" &&
      (await algumNumeroDaCampanhaNoAr(admin, organizationId, p.id as string));
    if (!temOutroNoAr) return { motivo: "numero_desconectado" };
  }
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

/**
 * Algum número do POOL desta campanha está no ar?
 *
 * O pool é o do rodízio (migration 0377), lido pelo pointer — a mesma ligação
 * que `lib/cadencia/envio.ts` faz para decidir por quais números a régua pode
 * falar. Falha de consulta devolve `false`: sem conseguir provar que há número
 * no ar, a recusa é a resposta conservadora (o destinatário já recebeu a 1ª
 * mensagem; o que se perde é o 2º toque, não a abordagem).
 */
async function algumNumeroDaCampanhaNoAr(
  admin: SupabaseClient,
  organizationId: string,
  pointerId: string,
): Promise<boolean> {
  const { data: campanha, error } = await admin
    .from("campaigns")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("followup_pointer_id", pointerId)
    .maybeSingle();
  if (error || !campanha) return false;
  const { data: extras, error: poolErr } = await admin
    .from("campaign_channel_sessions")
    .select("channel_session_id")
    .eq("organization_id", organizationId)
    .eq("campaign_id", (campanha as { id: string }).id);
  if (poolErr) return false;
  const ids = (extras ?? []).map((l) => (l as { channel_session_id: string }).channel_session_id);
  if (ids.length === 0) return false;
  const { count, error: sessErr } = await admin
    .from("channel_sessions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .in("id", ids)
    .eq("status", "WORKING")
    .is("archived_at", null);
  if (sessErr) return false;
  return (count ?? 0) > 0;
}

/** Quantas inscrições ainda cabem HOJE nesta cadência (só leitura — a prévia). */
export async function vagasDeHoje(admin: SupabaseClient, organizationId: string, pointerId: string): Promise<number> {
  const { data, error } = await admin.rpc("fn_cadencia_vagas_de_hoje", { p_org: organizationId, p_pointer: pointerId });
  if (error) throw new Error(`cadencia_vagas: ${error.message}`);
  return typeof data === "number" ? data : 0;
}

/**
 * RESERVA `n` vagas de hoje, atomicamente (lock por cadência, no banco), e
 * devolve quantas foram concedidas. É ela — e não uma contagem seguida de
 * insert — que segura o teto quando dois lotes, ou um lote e o gatilho, chegam
 * juntos.
 */
export async function reservarInscricoes(
  admin: SupabaseClient,
  organizationId: string,
  pointerId: string,
  n: number,
): Promise<number> {
  if (n <= 0) return 0;
  const { data, error } = await admin.rpc("fn_cadencia_reservar_inscricoes", {
    p_org: organizationId,
    p_pointer: pointerId,
    p_n: n,
  });
  if (error) throw new Error(`cadencia_reserva: ${error.message}`);
  return typeof data === "number" ? data : 0;
}

interface NegocioElegivel {
  /** `null` quando a régua da campanha não conseguiu abrir o card (ver `abrirNegocio`). */
  leadId: string | null;
  contactId: string;
}

/**
 * ESTE alvo já passou por ESTA régua na janela anti-laço?
 *
 * Por NEGÓCIO na cadência, por CONTATO na campanha. A diferença não é estética:
 * sem ela, a cadência passaria a barrar o segundo negócio do mesmo contato
 * (mudança de comportamento que ninguém pediu), e a campanha não teria nada para
 * comparar (não há negócio no momento da inscrição).
 */
export async function jaPassouPelaRegua(
  admin: SupabaseClient,
  organizationId: string,
  pointerId: string,
  alvo: { leadId: string } | { contactId: string },
): Promise<boolean> {
  const desde = new Date(Date.now() - DIAS_SEM_REPETIR_A_CADENCIA * 86_400_000).toISOString();
  let q = admin
    .from("followup_enrollments")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("pointer_id", pointerId)
    .gte("started_at", desde);
  q = "leadId" in alvo ? q.eq("lead_id", alvo.leadId) : q.eq("contact_id", alvo.contactId);
  const { count, error } = await q;
  if (error) throw new Error(`cadencia_repeticao: ${error.message}`);
  return (count ?? 0) > 0;
}

/**
 * O CONTATO está apto para prospecção AGORA? Não escreve nada.
 *
 * Saiu de dentro de `avaliarNegocio` quando a campanha passou a inscrever sem
 * negócio: estes três freios — um fluxo vivo por contato, o veto por
 * bloqueio/trava humana/anonimização/recusa de marketing, e a supressão pelo
 * TELEFONE (incluindo gêmeos do mesmo número) — não dependem de negócio nenhum,
 * e copiá-los para o lado da campanha seria duplicar exatamente a parte que o
 * Cassio exigiu que existisse em UM lugar só.
 */
export async function avaliarContato(
  admin: SupabaseClient,
  organizationId: string,
  contactId: string,
): Promise<{ ok: true } | { ok: false; motivo: MotivoDeRecusa }> {
  // UM FLUXO VIVO POR CONTATO — conferido AQUI, antes da reserva de vaga do dia
  // (e antes do dry-run da tela). Só em `inscreverNegocio` ele chegava tarde: a
  // vaga já tinha sido gasta, e um contato preso noutro fluxo esgotava o teto
  // da cadência sozinho, reavaliado a cada minuto pela varredura de tempo.
  // A checagem de lá fica como rede (corrida entre as duas leituras).
  const { count: vivas, error: vivasErr } = await admin
    .from("followup_enrollments")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("contact_id", contactId)
    .in("status", ["active", "waiting_reply", "paused_handoff", "paused_manual"]);
  if (vivasErr) throw new Error(`cadencia_inscricao_viva: ${vivasErr.message}`);
  if ((vivas ?? 0) > 0) return { ok: false, motivo: "ja_em_outro_fluxo" };

  const { data: c, error: cErr } = await admin
    .from("contacts")
    .select("id, phone_number, is_blocked, force_human, is_anonymized, is_merged_into, consent")
    .eq("organization_id", organizationId)
    .eq("id", contactId)
    .maybeSingle();
  if (cErr) throw new Error(`cadencia_contato: ${cErr.message}`);
  if (!c || c.is_anonymized || c.is_merged_into) return { ok: false, motivo: "contato_indisponivel" };
  const consent = (c.consent ?? {}) as { marketing?: { declined_at?: unknown } };
  if (c.is_blocked || c.force_human || consent.marketing?.declined_at) {
    return { ok: false, motivo: "contato_bloqueado_ou_optout" };
  }
  if (!c.phone_number) return { ok: false, motivo: "sem_telefone" };

  // O opt-out é da PESSOA: outro cadastro com o mesmo número que saiu, foi
  // bloqueado ou anonimizado barra este também. Pelas VARIANTES do número (com e
  // sem o nono dígito): a mesma pessoa gravada de dois jeitos não escapa.
  const { data: gemeos, error: gErr } = await admin
    .from("contacts")
    .select("id, is_blocked, is_anonymized, consent")
    .eq("organization_id", organizationId)
    .in("phone_number", phoneLookupVariants(c.phone_number as string))
    .neq("id", c.id as string)
    .limit(20);
  if (gErr) throw new Error(`cadencia_supressao: ${gErr.message}`);
  const suprimido = (gemeos ?? []).some((g) => {
    const gc = (g.consent ?? {}) as { marketing?: { declined_at?: unknown } };
    return g.is_blocked || g.is_anonymized || Boolean(gc.marketing?.declined_at);
  });
  if (suprimido) return { ok: false, motivo: "telefone_suprimido" };

  return { ok: true };
}

/** Negócio + contato aptos para ESTA cadência. Não escreve nada — é o dry-run. */
export async function avaliarNegocio(
  admin: SupabaseClient,
  organizationId: string,
  cadencia: Pick<CadenciaCarregada, "pipelineId" | "id">,
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

  // O MESMO negócio não volta à MESMA cadência dentro da janela: sem isto, uma
  // régua que termina levando o lead de volta à etapa-gatilho (por outro passo,
  // ou por alguém arrastando o card) o reinscreveria todo dia.
  if (await jaPassouPelaRegua(admin, organizationId, cadencia.id, { leadId })) {
    return { ok: false, motivo: "ja_passou_pela_cadencia" };
  }

  const doContato = await avaliarContato(admin, organizationId, lead.contact_id as string);
  if (!doContato.ok) return doContato;

  return { ok: true, negocio: { leadId: lead.id as string, contactId: lead.contact_id as string } };
}

/**
 * Inscreve UM alvo. Quem chama já carregou a régua e JÁ RESERVOU a vaga do dia
 * (`reservarInscricoes`).
 *
 * `fronteiraJaAberta` é o caminho da CAMPANHA: a conversa dela nasceu no envio
 * da 1ª mensagem, e abrir (ou REABRIR) de novo aqui disparia roteamento para a
 * equipe por causa de um passo que ainda não existe.
 */
export async function inscreverNegocio(
  admin: SupabaseClient,
  organizationId: string,
  cadencia: CadenciaCarregada,
  negocio: NegocioElegivel,
  origem: OrigemDaInscricao,
  fronteiraJaAberta?: ServiceBoundary,
): Promise<ResultadoDaInscricao> {
  // ANTES de abrir a conversa: contato já numa régua viva não entra — e abrir
  // (ou REABRIR) a conversa dele à toa dispararia roteamento para a equipe.
  // O índice único ainda é a autoridade (corrida entre esta leitura e o insert
  // cai no 23505 abaixo); isto só evita o efeito colateral no caso comum.
  const { count: vivas, error: vivasErr } = await admin
    .from("followup_enrollments")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("contact_id", negocio.contactId)
    .in("status", ["active", "waiting_reply", "paused_handoff", "paused_manual"]);
  if (vivasErr) throw new Error(`cadencia_inscricao_viva: ${vivasErr.message}`);
  if ((vivas ?? 0) > 0) return { ok: false, motivo: "ja_em_outro_fluxo" };

  const fronteira =
    fronteiraJaAberta ??
    (await beginServiceAtOrigin(admin, organizationId, negocio.contactId, cadencia.channelSessionId));

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

  // Base legal DEPOIS de a inscrição existir: gravar antes deixava a LIA no
  // contato mesmo quando a inscrição era recusada. O envio relê o contato, então
  // a ordem não muda o gate LGPD. A referência leva a cadência de origem.
  const { error: liaErr } = await admin.rpc("fn_cadencia_registrar_base_legal", {
    p_org: organizationId,
    p_contact: negocio.contactId,
    p_ref: `${cadencia.settings.legal_basis_ref} [cadencia:${cadencia.id}]`.slice(0, 400),
  });
  if (liaErr) throw new Error(`cadencia_base_legal: ${liaErr.message}`);

  // Proveniência: a fila responde "por que este contato está aqui?".
  const { error: evErr } = await admin.from("followup_enrollment_events").insert({
    organization_id: organizationId,
    enrollment_id: enrollmentId,
    node_id: cadencia.noDeGatilho,
    event_type: "enrolled_in_cadence",
    payload: {
      lead_id: negocio.leadId,
      origem: origem.tipo,
      ...(origem.tipo === "gatilho_etapa" || origem.tipo === "gatilho_etiqueta"
        ? { event_log_id: origem.eventId }
        : {}),
      ...(origem.tipo === "gatilho_tempo" ? { conversation_id: origem.conversationId } : {}),
      ...(origem.tipo === "campanha"
        ? { campaign_id: origem.campanhaId, campaign_recipient_id: origem.destinatarioId }
        : {}),
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
  input: {
    organizationId: string;
    pointerId: string;
    leadId: string;
    eventoEm: string;
  } & (
    | { eventId: string; origem?: "gatilho_etapa" | "gatilho_etiqueta" }
    | { origem: "gatilho_tempo"; conversationId: string }
  ),
  /**
   * Cache da cadência carregada, por pointer, durante UMA varredura: sem ele,
   * cada candidato recarregava a mesma cadência (3 consultas). Vale só pela
   * duração de quem o criou — cadência desligada no meio da varredura ainda
   * inscreve até o fim dela, e o worker a barra no envio.
   */
  cache?: Map<string, Awaited<ReturnType<typeof carregarCadenciaParaInscricao>>>,
): Promise<ResultadoDaInscricao> {
  let carregada = cache?.get(input.pointerId);
  if (!carregada) {
    carregada = await carregarCadenciaParaInscricao(admin, input.organizationId, input.pointerId);
    cache?.set(input.pointerId, carregada);
  }
  if ("motivo" in carregada) return { ok: false, motivo: carregada.motivo };
  const { cadencia } = carregada;
  if (Date.parse(input.eventoEm) < Date.parse(cadencia.publicadaEm)) {
    return { ok: false, motivo: "anterior_a_publicacao" };
  }
  const avaliacao = await avaliarNegocio(admin, input.organizationId, cadencia, input.leadId);
  if (!avaliacao.ok) return avaliacao;
  // Reserva DEPOIS da avaliação: negócio recusado não gasta vaga do dia.
  if ((await reservarInscricoes(admin, input.organizationId, cadencia.id, 1)) < 1) {
    return { ok: false, motivo: "teto_do_dia" };
  }
  const origem: OrigemDaInscricao =
    input.origem === "gatilho_tempo"
      ? { tipo: "gatilho_tempo", conversationId: input.conversationId, eventoEm: input.eventoEm }
      : { tipo: input.origem ?? "gatilho_etapa", eventId: input.eventId, eventoEm: input.eventoEm };
  return inscreverNegocio(admin, input.organizationId, cadencia, avaliacao.negocio, origem);
}

/**
 * Inscrição do destinatário da CAMPANHA na régua dela, DEPOIS de a 1ª mensagem
 * ter saído (migration 9037).
 *
 * Herda desta porta, sem copiar nada: régua publicada com número conectado,
 * anti-laço de 30 dias (por CONTATO), um fluxo vivo por contato, veto por
 * bloqueio/trava humana/anonimização/recusa de marketing, supressão pelo
 * telefone (com gêmeos do mesmo número), teto de inscrições por dia e gravação
 * da base legal.
 *
 * As duas diferenças, escritas no cabeçalho do arquivo: não abre conversa (a
 * fronteira do envio entra por parâmetro) e não exige negócio PRONTO — ela o
 * abre, por `abrirNegocio`, depois dos freios.
 *
 * ⚠️ NÃO confere `publicadaEm`: o corte "nada retroativo" existe para o gatilho
 * de etapa, onde publicar poderia inscrever o estoque inteiro da etapa de uma
 * vez. Aqui cada inscrição corresponde a UMA mensagem que esta campanha acabou
 * de mandar; não há estoque para varrer.
 *
 * Nunca lança por recusa — recusa é desfecho normal, e o destinatário já
 * recebeu a 1ª mensagem de qualquer forma.
 */
export async function inscreverContatoNaRegua(
  admin: SupabaseClient,
  input: {
    organizationId: string;
    pointerId: string;
    contactId: string;
    /** O negócio quando quem chama já o tem em mãos. Senão, `abrirNegocio`. */
    leadId?: string | null;
    /**
     * ABRE (ou reusa) o card do contato no funil, e devolve o id — ou `null`
     * quando não deu, que não é recusa de inscrição: a régua roda sem negócio e
     * só os passos de CRM ficam sem objeto.
     *
     * Entra como CALLBACK, e não como código aqui dentro, por duas razões. A
     * primeira é de dependência: quem sabe em que funil e com que marca de
     * origem o card nasce é a campanha (`lib/campanhas/card-da-abordagem.ts`),
     * e a porta da cadência não deve conhecer campanha. A segunda é de ORDEM, e
     * é a que importa: ela é chamada aqui, depois do anti-laço, do veto por
     * bloqueio/anonimização/recusa, da supressão por telefone E da reserva da
     * vaga do dia. Card criado antes disso seria card aberto para quem a
     * inscrição recusa no passo seguinte — lixo no funil, e lixo com o nome de
     * quem pediu para não receber.
     */
    abrirNegocio?: () => Promise<string | null>;
    /** A conversa que o envio da campanha abriu. Sem ela, abriria uma segunda. */
    fronteira: ServiceBoundary;
    origem: Extract<OrigemDaInscricao, { tipo: "campanha" }>;
  },
): Promise<ResultadoDaInscricao> {
  const carregada = await carregarCadenciaParaInscricao(admin, input.organizationId, input.pointerId);
  if ("motivo" in carregada) return { ok: false, motivo: carregada.motivo };
  const { cadencia } = carregada;

  if (await jaPassouPelaRegua(admin, input.organizationId, cadencia.id, { contactId: input.contactId })) {
    return { ok: false, motivo: "ja_passou_pela_cadencia" };
  }
  const doContato = await avaliarContato(admin, input.organizationId, input.contactId);
  if (!doContato.ok) return doContato;

  // Reserva DEPOIS da avaliação: contato recusado não gasta vaga do dia.
  if ((await reservarInscricoes(admin, input.organizationId, cadencia.id, 1)) < 1) {
    return { ok: false, motivo: "teto_do_dia" };
  }

  // TODOS os freios já disseram sim. Só agora o card existe.
  const leadId = input.leadId ?? (input.abrirNegocio ? await input.abrirNegocio() : null);

  return inscreverNegocio(
    admin,
    input.organizationId,
    cadencia,
    { leadId, contactId: input.contactId },
    input.origem,
    input.fronteira,
  );
}
