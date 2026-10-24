/**
 * Eventos de CONEXAO do FZAP (`Connected`, `Disconnected`, `LoggedOut`) no canal
 * NATIVO. O vigia por polling segue como rede de seguranca (o push pode se perder).
 *
 *   Connected    -> WORKING (marca `ja_conectou_em`, limpa `desconectado_em`)
 *   Disconnected -> STARTING, SEM aviso (o FZAP reconecta sozinho); grava
 *                   `desconectado_em` para o debounce do vigia (10 min)
 *   LoggedOut    -> FAILED com aviso `qr_rescan` imediato
 *
 * Canal vinculado e arquivado nao mudam de comportamento: o evento segue ignorado.
 * Idempotente: reentrega do mesmo evento nao muda o relogio nem duplica o aviso.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { DETALHE_QR_RESCAN_NATIVO, sincronizarSaudeDaConexao } from "../health";
import { registrarEventoDeConexao } from "./estado-nativo";
import { preencherTelefoneNativo } from "./telefone-nativo";
import { tipoDoEvento } from "./webhook";

export type EventoDeConexao = "Connected" | "Disconnected" | "LoggedOut";

export interface ResultadoEventoDeConexao {
  status: "updated" | "ignored";
  reason?: string;
}

export function eventoDeConexao(payload: unknown): EventoDeConexao | null {
  const t = tipoDoEvento(payload);
  return t === "Connected" || t === "Disconnected" || t === "LoggedOut" ? t : null;
}

/** Hora do evento no envelope do FZAP, se vier e for crivel; senao `null` (a RPC usa `now()`). */
export function horaDoEvento(payload: unknown): string | null {
  const ev = (payload as { event?: { Timestamp?: unknown } } | null)?.event;
  const t = typeof ev?.Timestamp === "string" ? Date.parse(ev.Timestamp) : NaN;
  // Relogio adiantado do FZAP travaria os eventos seguintes como "obsoletos".
  return Number.isFinite(t) && t <= Date.now() + 10_000 ? new Date(t).toISOString() : null;
}

export async function aplicarEventoDeConexao(
  admin: SupabaseClient,
  input: { organizationId: string; channelSessionId: string; evento: EventoDeConexao; emIso?: string | null },
): Promise<ResultadoEventoDeConexao> {
  const r = await registrarEventoDeConexao(admin, input);
  // Falha do UPDATE/RPC: nada de aviso por um estado que nao foi gravado. Lanca para a
  // rota responder erro e o FZAP reentregar.
  if (!r) throw new Error("verdash_evento_conexao_nao_gravado");
  if (r.resultado === "ignorado") return { status: "ignored", reason: r.motivo ?? "evento_sem_interesse" };
  if (r.resultado === "obsoleto") return { status: "ignored", reason: "evento_obsoleto" };

  const status = r.status as string;
  // Disconnected que nao muda o estado (FAILED/STOPPED) nao reabre nem fecha aviso.
  if (input.evento !== "Disconnected" || status === "STARTING") {
    await sincronizarSaudeDaConexao(
      admin,
      { id: input.channelSessionId, organization_id: input.organizationId, status },
      { reachable: true, status, detail: input.evento === "LoggedOut" ? DETALHE_QR_RESCAN_NATIVO : null },
      r.display_name ?? r.phone_number ?? "sem nome",
    );
  }

  if (input.evento === "Connected" && !r.phone_number && r.instancia) {
    await preencherTelefoneNativo(admin, input.organizationId, r.instancia);
  }
  return { status: "updated", reason: `conexao_${input.evento.toLowerCase()}` };
}
