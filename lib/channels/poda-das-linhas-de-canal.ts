/**
 * A LINHA DE CANAL SAI EM D+30 — e só ela (21/10/2026).
 *
 * ─── Por que um horizonte próprio ───────────────────────────────────────────
 *
 * Em produção: 7–9 mil eventos/dia, quase todos de CANAL (linha com
 * `channel_session_id`: WhatsApp, Instagram, WAHA). O corpo some em D+7, mas a
 * linha vazia ficava até D+90 (`WEBHOOK_LOG_ROW_RETENTION_DAYS`): ~660 mil
 * linhas de ~250 B (com os índices) que ninguém consulta.
 *
 * Quem lê linha de canal, e até quando (varrido em 21/10/2026):
 *
 *   - reprocessamento do WAHA: só `status = 'error'` com minutos de idade
 *     (`ESPERA_MS`, 20 tentativas) — e precisa do CORPO, que some em D+7;
 *   - assinatura das entregas (tela do canal): janela de 7 dias, só linha com
 *     corpo (`archived_at is null`);
 *   - script de mídia do Instagram: precisa de `payload_parsed` (D+7);
 *   - investigação à mão ("quantos eventos de que tipo chegaram, e a
 *     assinatura conferia?"): o incidente se investiga na semana, e 30 dias
 *     cobrem o ciclo de fatura e uma volta inteira de mês.
 *
 * O que NÃO entra neste horizonte, e fica nos 90 dias de sempre: linha SEM
 * canal. A visão da cobrança lê o ÚLTIMO aviso do Stripe/Asaas sem janela (o
 * aviso pode ser mensal), a tela de fontes e o MCP mostram os últimos 20
 * recebimentos de uma entrada que pode passar semanas parada, e a Nuvemshop
 * guarda pedido de LGPD. Encurtar essas linhas apagaria informação que uma
 * tela mostra.
 *
 * ─── Lote pequeno, e o tempo do lado do servidor ───────────────────────────
 *
 * Lição de 28/09: limpeza em massa derruba o banco, e o timeout do cliente
 * (`curl -m60` do scheduler) NÃO cancela a consulta no servidor. Por isso:
 *
 *   - o lote é o MESMO da poda irmã (500, teto de 5 mil pela URL) e a linha
 *     apagada aqui já não tem corpo — não há TOAST a reescrever;
 *   - a ordem é por `received_at`, que é o índice parcial da 9064
 *     (`received_at` where `channel_session_id is not null`): o DELETE visita
 *     só as linhas do lote, em vez de varrer a chave primária inteira;
 *   - o pedido vai pelo PostgREST, que roda sob o `statement_timeout` de 8 s
 *     do `authenticator` — menor que os 60 s do cliente, então a consulta
 *     morre no servidor ANTES de o cliente desistir, e não fica órfã segurando
 *     linha.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { RETENCAO_TETO_DIAS } from "@/lib/retencao/politica";

/** Apaga um lote de linhas de canal vencidas. Lança quando o banco recusa. */
export async function apagarLinhasDeCanalVencidas(
  admin: SupabaseClient,
  opcoes: { dias: number; lote: number; agora?: Date },
): Promise<number> {
  const agora = opcoes.agora ?? new Date();
  const limite = new Date(
    agora.getTime() - Math.min(opcoes.dias, RETENCAO_TETO_DIAS) * 86_400_000,
  ).toISOString();

  const { data, error } = await admin
    .from("webhook_events_log")
    .delete()
    .not("channel_session_id", "is", null)
    .lt("received_at", limite)
    .select("id")
    // `order` antes do `limit`: o PostgREST 12.2 recusa DELETE com `limit` sem
    // ordem (PGRST109, issue #1769). `received_at` e não `id`: é a coluna do
    // índice parcial, e é o que mantém o lote barato.
    .order("received_at")
    .limit(opcoes.lote);

  if (error) throw new Error(`webhook_events_log (canal): ${error.message}`);
  return (data ?? []).length;
}
