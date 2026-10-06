/**
 * Adapter fino que pluga `alistarPorEtapa` no dispatcher genérico do
 * `event_log` — mesmo padrão de `lib/followup/gatilho-etapa.handler.ts`: a
 * decisão fica testável sem banco, aqui só há a ligação com o registry e o
 * client de produção.
 *
 * ⚠️ CONSUMIDOR PRÓPRIO, e não um ramo dentro do produtor de follow-up.
 * `event_log.consumed_by[]` é por CHAVE: com duas chaves, uma falha nossa
 * reprocessa só o nosso lado e não marca o evento como consumido pelo gatilho de
 * follow-up (nem o contrário). O par
 * `followupGatilhoEtapaHandler`/`avisoDeEtapaHandler` já consome este mesmo
 * evento por chaves separadas, pelo mesmo motivo.
 */
import {
  EVENTO_DE_ETAPA,
  alistarPorEtapa,
  type ResumoDaEntradaPorEtapa,
} from "@/lib/campanhas/entrada-por-etapa";
import { createSupabaseEntradaPorEtapaDb } from "@/lib/campanhas/entrada-por-etapa.db";
import type { EventHandler, HandlerResult } from "@/lib/event-log/dispatcher";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * A chave que vai para `event_log.consumed_by[]`. Versionada (`.v1`) como as
 * irmãs: trocar a chave faz o dreno reprocessar os eventos já vistos, e isso é
 * decisão, não acidente.
 */
export const CAMPANHA_ENTRADA_ETAPA_HANDLER_KEY = "campanha-entrada-etapa.v1";

export const campanhaEntradaPorEtapaHandler: EventHandler = {
  key: CAMPANHA_ENTRADA_ETAPA_HANDLER_KEY,
  events: [EVENTO_DE_ETAPA],
  async handle(row): Promise<HandlerResult> {
    try {
      const admin = createAdminClient();
      const resumo = await alistarPorEtapa(
        { db: createSupabaseEntradaPorEtapaDb(admin), clock: () => new Date() },
        row,
      );
      return {
        consumer_key: CAMPANHA_ENTRADA_ETAPA_HANDLER_KEY,
        // `ok` DESCARTA o `detail` (lib/event-log/drain.ts): só o de `skipped`
        // sobrevive na linha do event_log. Casar `matched` com `alistados > 0`
        // faz o motivo de NÃO alistar chegar ao registro — e num modo de público
        // sem lista para conferir, "por que esta pessoa não foi abordada?" é a
        // pergunta que mais se faz.
        status: resumo.matched && resumo.alistados > 0 ? "ok" : "skipped",
        detail: detalhe(resumo),
      };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return { consumer_key: CAMPANHA_ENTRADA_ETAPA_HANDLER_KEY, status: "error", detail };
    }
  },
};

/** Uma linha legível do desfecho. Sem telefone e sem nome: a doutrina proíbe PII em log. */
function detalhe(r: ResumoDaEntradaPorEtapa): string {
  const excluidos = Object.entries(r.excluidos)
    .map(([motivo, quantos]) => `${motivo}=${quantos}`)
    .join(",");
  return (
    `armadas=${r.campanhas_armadas} alistados=${r.alistados} ja_na_campanha=${r.ja_na_campanha} ` +
    `teto_do_dia=${r.teto_do_dia} anterior_ao_inicio=${r.anterior_ao_inicio} sem_alvo=${r.sem_alvo}` +
    (excluidos ? ` excluidos:${excluidos}` : "")
  );
}
