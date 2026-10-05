/**
 * A RÉGUA DA CAMPANHA — o pointer de follow-up que executa os passos.
 *
 * ═══ A decisão que dispensa um motor novo ═══
 *
 * A cadência de prospecção não tem motor próprio: ela é "um pointer de
 * follow-up com `surface='cadence'`" (`app/api/v1/cadencias/route.ts`), e
 * `lib/regua/timeline.ts` é só a ponte lista → grafo linear. A campanha faz o
 * MESMO caminho, com `surface='campaign'` (migration 9035): o que ela publica
 * aqui é executado pelo motor de follow-up, com o claim, o CAS por `revision`,
 * a janela de envio, o espaçamento sob lock do número e o cancelamento na
 * resposta que já existem — e que já foram revisados.
 *
 * ═══ O que a régua NÃO cobre ═══
 *
 * A 1ª mensagem. Ela sai pelo `campaign-worker` com o `rendered_body` congelado
 * na preparação, porque é ela que o operador confere antes de apertar Iniciar.
 * A inscrição na régua acontece DEPOIS de ela sair com sucesso
 * (`lib/campanhas/rodada.ts`), e é por isso que a régua começa no 2º toque.
 *
 * ═══ Por que a política é DERIVADA, e não uma segunda tela ═══
 *
 * `cadence_settings` é obrigatória num pointer de prospecção publicado (CHECK
 * `followup_flow_pointers_cadencia_completa`). Pedir ao operador que preencha
 * janela, espaçamento e teto OUTRA VEZ, agora com o vocabulário da cadência,
 * criaria a segunda fonte do ritmo — e o dia em que as duas discordassem a
 * campanha andaria num ritmo que a tela dela não mostra. Então a política sai
 * do ritmo que a campanha JÁ tem (`intervalo_segundos`, `janela_*`,
 * `teto_diario`) e da base legal que ela JÁ declarou.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { validarReguaDeProspeccao } from "@/lib/cadencia/validar-publicacao";
import { publishFollowupFlowVersion } from "@/lib/followup/publish";
import { logger } from "@/lib/logger";

import { passosGuardados, problemaNosPassos } from "./passos";
import { grafoDaRegua, nomeDaRegua, politicaDaRegua, type CampanhaComRegua } from "./regua-politica";

// Reexportadas porque quem publica a régua e quem a descreve são a mesma tela:
// obrigar `acoes.ts` a importar de dois módulos para uma coisa só seria detalhe
// de organização interna virando ruído na porta.
export { grafoDaRegua, politicaDaRegua, type CampanhaComRegua } from "./regua-politica";

/** Estados em que uma inscrição ainda roda — os mesmos de `lib/cadencia/envio.ts`. */
const INSCRICOES_VIVAS = ["active", "waiting_reply", "dormente", "paused_handoff", "paused_manual"];

export type ResultadoDaRegua = { ok: true; pointerId: string | null } | { ok: false; mensagem: string };

/**
 * Publica (ou republica) a régua da campanha e devolve o pointer.
 *
 * Idempotente de propósito: a campanha publica ao PREPARAR e republica ao
 * INICIAR. Preparar é quando o operador acabou de mexer no conteúdo; iniciar é
 * quando a campanha retoma, possivelmente com o ritmo trocado na tela de
 * detalhe — e o ritmo é a política da régua. Publicar duas vezes custa uma
 * versão a mais no histórico do fluxo, que é exatamente o que ele registra.
 *
 * Campanha SEM passos não tem régua: o pointer existente (de um rascunho que
 * tinha passos e deixou de ter) é desligado, e a campanha volta a se comportar
 * como antes desta fatia.
 */
export async function publicarReguaDaCampanha(
  admin: SupabaseClient,
  entrada: { campanha: CampanhaComRegua; autorId: string },
): Promise<ResultadoDaRegua> {
  const c = entrada.campanha;
  const passos = passosGuardados(c.passos);

  if (passos.length === 0) {
    if (c.followup_pointer_id) {
      await desligarReguaDaCampanha(admin, c.organization_id, c.followup_pointer_id);
      // E a campanha SOLTA o ponteiro. Deixá-lo apontando para um pointer
      // desligado fazia a rodada consultar a régua a cada envio, levar
      // `cadencia_indisponivel` e contar um fora-da-régua por destinatário —
      // ruído por rodada, para sempre, numa campanha que simplesmente não tem
      // passos. O pointer desligado fica no histórico de fluxos, que é onde
      // histórico mora.
      const { error } = await admin
        .from("campaigns")
        .update({ followup_pointer_id: null })
        .eq("organization_id", c.organization_id)
        .eq("id", c.id);
      if (error) {
        logger.warn("[campanha] não foi possível soltar a régua da campanha", {
          campanha: c.id,
          motivo: error.message,
        });
      }
    }
    return { ok: true, pointerId: null };
  }

  const problema = problemaNosPassos(passos, { pipelineId: c.pipeline_id });
  if (problema) return { ok: false, mensagem: problema };

  const grafo = grafoDaRegua(passos);
  const politica = politicaDaRegua(c);

  // ═══ A MESMA VALIDAÇÃO DE PUBLICAÇÃO DA CADÊNCIA ═══
  //
  // `publishFollowupFlowVersion` é só o wrapper da RPC: ele não valida nada.
  // Sem esta chamada, a régua da campanha ia ao ar com o que `problemaNosPassos`
  // não sabe ver — e o que ele não vê é justamente o que mata a régua CALADA:
  // `{{saudacao}}` num passo (vocabulário da 1ª mensagem, não dos passos) faz o
  // motor pular o passo para a lista inteira; etapa que ficou órfã ao trocar o
  // funil do rascunho faz `efeitos.ts` matar a régua de todos no backoff.
  //
  // Roda ANTES de mexer no pointer: régua recusada não deixa `cadence_settings`
  // nem `draft_graph` novos gravados num pointer que continua no ar com a
  // versão anterior.
  const problemasDaPublicacao = await validarReguaDeProspeccao(
    admin,
    c.organization_id,
    {
      pipeline_id: c.pipeline_id,
      channel_session_id: c.channel_session_id,
      cadence_settings: politica,
      trigger_config: { kind: "manual", cancel_on_reply: true },
    },
    grafo,
    "campaign",
  );
  if (problemasDaPublicacao.length > 0) {
    // A PRIMEIRA mensagem, não todas: o operador conserta uma e prepara de novo,
    // e uma lista de seis frases numa única linha de erro não é lida.
    return { ok: false, mensagem: problemasDaPublicacao[0]!.message };
  }

  // O pointer nasce DEPOIS da validação, e isso é consequência dela: criar antes
  // deixava um pointer órfão a cada tentativa recusada — e, como o nome é
  // determinístico, a tentativa seguinte batia no `unique (organization_id,
  // name)` e a campanha ficava impossível de preparar por causa do primeiro erro
  // de digitação. `criarPointer` ainda trata o 23505 reusando o que achar, para
  // o órfão de uma versão anterior não travar nada.
  const pointerId = c.followup_pointer_id ?? (await criarPointer(admin, c));
  if (!pointerId) return { ok: false, mensagem: "Não foi possível criar a régua desta campanha." };

  // A política, o número e o funil ANTES de publicar: o CHECK
  // `followup_flow_pointers_cadencia_completa` recusa pointer de prospecção
  // `active` sem os três, e a publicação é o que o deixa `active`.
  const { error: erroDoPointer } = await admin
    .from("followup_flow_pointers")
    .update({
      channel_session_id: c.channel_session_id,
      pipeline_id: c.pipeline_id,
      cadence_settings: politica,
      // A régua PARA na resposta, pelo caminho comum de
      // `lib/followup/reactivity.ts`. Continuar insistindo com quem respondeu é
      // o comportamento que queima o número — e, numa campanha, apaga a única
      // métrica que presta.
      trigger_config: { kind: "manual", cancel_on_reply: true },
      draft_graph: grafo,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", c.organization_id)
    .eq("id", pointerId);
  if (erroDoPointer) return { ok: false, mensagem: `Régua da campanha: ${erroDoPointer.message}` };

  const publicada = await publishFollowupFlowVersion(admin, {
    orgId: c.organization_id,
    pointerId,
    graph: grafo,
    createdBy: entrada.autorId,
  });
  if (!publicada.ok) return { ok: false, mensagem: `Régua da campanha: ${publicada.message}` };

  if (c.followup_pointer_id !== pointerId) {
    const { error } = await admin
      .from("campaigns")
      .update({ followup_pointer_id: pointerId })
      .eq("organization_id", c.organization_id)
      .eq("id", c.id);
    // Sem o ponteiro gravado, o próximo "preparar" publicaria uma régua NOVA e
    // a anterior ficaria no ar sem ninguém para inscrever. Falha dura.
    if (error) return { ok: false, mensagem: `Régua da campanha: ${error.message}` };
  }

  return { ok: true, pointerId };
}

async function criarPointer(admin: SupabaseClient, c: CampanhaComRegua): Promise<string | null> {
  const { data, error } = await admin
    .from("followup_flow_pointers")
    .insert({
      organization_id: c.organization_id,
      name: nomeDaRegua(c),
      surface: "campaign",
      pipeline_id: c.pipeline_id,
      channel_session_id: c.channel_session_id,
      cadence_settings: politicaDaRegua(c),
      trigger_config: { kind: "manual", cancel_on_reply: true },
    })
    .select("id")
    .single();
  if (!error && data) return (data as { id: string }).id;

  // 23505 = já existe fluxo com este nome. O nome é determinístico (leva o
  // prefixo do id da campanha), então o dono é esta campanha: é o pointer órfão
  // de uma tentativa que não chegou a publicar. Reusar é o certo — criar nome
  // novo deixaria dois pointers da mesma campanha, e falhar travaria a campanha
  // para sempre por causa de uma tentativa antiga.
  if (error?.code === "23505") {
    const { data: existente } = await admin
      .from("followup_flow_pointers")
      .select("id")
      .eq("organization_id", c.organization_id)
      .eq("name", nomeDaRegua(c))
      .eq("surface", "campaign")
      .maybeSingle();
    if (existente) return (existente as { id: string }).id;
  }
  logger.warn("[campanha] criação da régua falhou", { campanha: c.id, motivo: error?.message });
  return null;
}

/** Desliga a régua: o worker passa a PULAR os passos (`cadencia_indisponivel`). */
export async function desligarReguaDaCampanha(
  admin: SupabaseClient,
  organizationId: string,
  pointerId: string,
): Promise<void> {
  const { error } = await admin
    .from("followup_flow_pointers")
    .update({ status: "disabled", updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("id", pointerId);
  if (error) {
    logger.warn("[campanha] desligar a régua falhou", { pointer: pointerId, motivo: error.message });
  }
}

/**
 * Campanha CANCELADA encerra a régua de quem já estava nela.
 *
 * Só desligar o pointer não bastaria: com a régua desligada o worker PULA cada
 * passo e o motor avança — o inscrito correria a régua inteira em tiques,
 * calado, e um "retomar" depois o encontraria no fim. Cancelar a inscrição é o
 * que diz a verdade na fila de follow-up: esta régua acabou, e acabou porque a
 * campanha foi cancelada.
 *
 * O UPDATE direto é seguro contra o motor: `trg_followup_revision` avança a
 * `revision`, e a escrita atrasada de quem estava com a inscrição em mãos cai
 * no CAS (o mesmo raciocínio de `lib/cadencia/envio.ts`). Idempotente: só
 * alcança o que ainda está vivo.
 */
export async function encerrarReguaDaCampanha(
  admin: SupabaseClient,
  organizationId: string,
  pointerId: string,
  agora: Date,
): Promise<number> {
  const { data, error } = await admin
    .from("followup_enrollments")
    .update({
      status: "cancelled",
      cancel_reason: "campanha_cancelada",
      next_eval_at: null,
      claimed_until: null,
      completed_at: agora.toISOString(),
      updated_at: agora.toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("pointer_id", pointerId)
    .in("status", INSCRICOES_VIVAS)
    .select("id");
  if (error) {
    logger.warn("[campanha] encerrar a régua falhou", { pointer: pointerId, motivo: error.message });
    return 0;
  }
  await desligarReguaDaCampanha(admin, organizationId, pointerId);
  return (data ?? []).length;
}
