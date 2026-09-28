import type { SupabaseClient } from "@supabase/supabase-js";

import { carregarCadenciaParaInscricao, inscreverPorGatilho, type ResultadoDaInscricao } from "./inscrever";

/**
 * GATILHOS DE TEMPO DA CADÊNCIA — a varredura que roda no tick do follow-up.
 *
 *   - `agent_sla`: o cliente escreveu e ninguém respondeu há N minutos
 *     (`awaiting_since`, a mesma régua da Fila e da pílula "Aguardando há…");
 *   - `lead_idle`: nós falamos por último e o lead não responde há N minutos.
 *
 * QUEM PODE ENTRAR é decidido no banco (`fn_cadencia_candidatas_de_tempo`,
 * migration 9017): a janela de 24 h depois do limiar, quem espera quem, o
 * negócio aberto do funil, e a exclusão de quem a porta recusaria de todo jeito
 * (inscrição viva, mesma cadência em 30 dias, contato bloqueado/sem marketing).
 *
 * ⚠️ POR QUE NÃO NO CÓDIGO. A versão anterior buscava a janela e decidia aqui.
 * A varredura roda todo minuto: os MESMOS recusados voltavam a cada tick,
 * ocupavam o limite e deixavam de fora quem violou o limiar depois (revisão
 * @Cassio_SecRev, P1-1). O que o banco devolve agora é só quem entra.
 *
 * A porta (`inscreverPorGatilho`) continua sendo a autoridade: reconfere,
 * reserva a vaga do dia e aplica a LGPD. Não retroage: `evento_em` (o instante
 * da violação) tem de ser posterior à publicação.
 */

export const MAX_CANDIDATAS_POR_CADENCIA = 50;
/** Teto de conduções expiradas encerradas por tick (o resto fica para o minuto seguinte). */
export const MAX_CONDUCOES_EXPIRADAS_POR_TICK = 200;

export interface CadenciaDeTempo {
  id: string;
  organization_id: string;
}

export interface CandidataDeTempo {
  conversation_id: string;
  contact_id: string;
  lead_id: string;
  evento_em: string;
}

export interface VarreduraDeTempoDb {
  cadenciasDeTempo(): Promise<CadenciaDeTempo[]>;
  candidatas(c: CadenciaDeTempo): Promise<CandidataDeTempo[]>;
  /**
   * Conduções da IA da cadência vivas com `expira_em` vencido (14 dias). Opcional
   * para os fakes antigos. Sem handoff: 14 dias sem o lead responder não pedem
   * uma pessoa, e a conversa volta ao fluxo normal.
   */
  conducoesExpiradas?(limite: number): Promise<Array<{ id: string; organization_id: string }>>;
  /** `fn_cadencia_encerrar_conducao(org, id, 'expirou')` — CAS, `true` só para quem encerrou. */
  encerrarConducaoExpirada?(organizationId: string, conducaoId: string): Promise<boolean>;
}

export interface VarreduraDeTempoDeps {
  db: VarreduraDeTempoDb;
  inscrever: (input: {
    organizationId: string;
    pointerId: string;
    leadId: string;
    eventoEm: string;
    origem: "gatilho_tempo";
    conversationId: string;
  }) => Promise<ResultadoDaInscricao>;
}

export interface ResumoDaVarreduraDeTempo {
  cadencias: number;
  candidatas: number;
  inscritos: number;
  recusas: Record<string, number>;
  /** Conduções da IA encerradas por expiração neste tick. */
  conducoesExpiradas: number;
}

export async function varrerGatilhosDeTempo(deps: VarreduraDeTempoDeps): Promise<ResumoDaVarreduraDeTempo> {
  const resumo: ResumoDaVarreduraDeTempo = {
    cadencias: 0,
    candidatas: 0,
    inscritos: 0,
    recusas: {},
    conducoesExpiradas: 0,
  };
  if (deps.db.conducoesExpiradas !== undefined && deps.db.encerrarConducaoExpirada !== undefined) {
    for (const c of await deps.db.conducoesExpiradas(MAX_CONDUCOES_EXPIRADAS_POR_TICK)) {
      if (await deps.db.encerrarConducaoExpirada(c.organization_id, c.id)) resumo.conducoesExpiradas++;
    }
  }
  const cadencias = await deps.db.cadenciasDeTempo();
  resumo.cadencias = cadencias.length;
  for (const c of cadencias) {
    for (const k of await deps.db.candidatas(c)) {
      resumo.candidatas++;
      const r = await deps.inscrever({
        organizationId: c.organization_id,
        pointerId: c.id,
        leadId: k.lead_id,
        eventoEm: k.evento_em,
        origem: "gatilho_tempo",
        conversationId: k.conversation_id,
      });
      if (r.ok) resumo.inscritos++;
      else resumo.recusas[r.motivo] = (resumo.recusas[r.motivo] ?? 0) + 1;
    }
  }
  return resumo;
}

export function createSupabaseVarreduraDeTempoDb(admin: SupabaseClient): VarreduraDeTempoDb {
  return {
    async cadenciasDeTempo() {
      const { data, error } = await admin
        .from("followup_flow_pointers")
        .select("id, organization_id")
        .eq("surface", "cadence")
        .eq("status", "active")
        .in("trigger_config->>kind", ["agent_sla", "lead_idle"]);
      if (error) throw new Error(`cadencia_tempo_pointers: ${error.message}`);
      return (data ?? []).map((p) => ({ id: p.id as string, organization_id: p.organization_id as string }));
    },
    async candidatas(c) {
      const { data, error } = await admin.rpc("fn_cadencia_candidatas_de_tempo", {
        p_org: c.organization_id,
        p_pointer: c.id,
        p_limite: MAX_CANDIDATAS_POR_CADENCIA,
      });
      if (error) throw new Error(`cadencia_tempo_candidatas: ${error.message}`);
      return (data ?? []) as CandidataDeTempo[];
    },
    async conducoesExpiradas(limite) {
      const { data, error } = await admin
        .from("cadencia_conducoes" as never)
        .select("id, organization_id")
        .is("encerrada_em", null)
        .lte("expira_em", new Date().toISOString())
        .limit(limite);
      if (error) throw new Error(`cadencia_conducoes_expiradas: ${error.message}`);
      return (data ?? []) as unknown as Array<{ id: string; organization_id: string }>;
    },
    async encerrarConducaoExpirada(organizationId, conducaoId) {
      const { data, error } = await admin.rpc("fn_cadencia_encerrar_conducao" as never, {
        p_org: organizationId,
        p_conducao: conducaoId,
        p_motivo: "expirou",
      } as never);
      if (error) throw new Error(`cadencia_conducao_expirar: ${error.message}`);
      return data === true;
    },
  };
}

/** Adapter de produção: a porta única da cadência, com a cadência carregada UMA vez por varredura. */
export function depsDaVarreduraDeTempo(admin: SupabaseClient): VarreduraDeTempoDeps {
  const cache = new Map<string, Awaited<ReturnType<typeof carregarCadenciaParaInscricao>>>();
  return {
    db: createSupabaseVarreduraDeTempoDb(admin),
    inscrever: (input) => inscreverPorGatilho(admin, input, cache),
  };
}
