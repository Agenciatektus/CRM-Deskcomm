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

interface Linha {
  verdash_origem: string | null;
  archived_at: string | null;
  status: string | null;
  display_name: string | null;
  phone_number: string | null;
  verdash_instance_name: string | null;
  metadata: Record<string, unknown> | null;
}

export async function aplicarEventoDeConexao(
  admin: SupabaseClient,
  input: { organizationId: string; channelSessionId: string; evento: EventoDeConexao },
): Promise<ResultadoEventoDeConexao> {
  const { data } = await admin
    .from("channel_sessions")
    .select("verdash_origem, archived_at, status, display_name, phone_number, verdash_instance_name, metadata")
    .eq("organization_id", input.organizationId)
    .eq("id", input.channelSessionId)
    .maybeSingle();
  const row = data as Linha | null;
  if (!row || row.archived_at) return { status: "ignored", reason: "canal_arquivado" };
  if (row.verdash_origem !== "nativa") return { status: "ignored", reason: "evento_sem_interesse" };

  const agora = new Date().toISOString();
  const { desconectado_em: caiuEm, ...semQueda } = row.metadata ?? {};
  const atual = row.status ?? null;
  let status: string;
  let metadata: Record<string, unknown>;
  if (input.evento === "Connected") {
    status = "WORKING";
    metadata = { ...semQueda, ja_conectou_em: semQueda.ja_conectou_em ?? agora };
  } else if (input.evento === "LoggedOut") {
    status = "FAILED";
    // Deslogar pressupoe ter logado: marca, para a carencia do QR nao engolir o aviso.
    metadata = { ...semQueda, ja_conectou_em: semQueda.ja_conectou_em ?? agora, desconectado_em: caiuEm ?? agora };
  } else {
    // Disconnected depois de LoggedOut/FAILED nao "melhora" o canal para STARTING.
    status = atual === "FAILED" || atual === "STOPPED" ? atual : "STARTING";
    metadata = { ...semQueda, desconectado_em: caiuEm ?? agora };
  }

  const mudou = status !== atual;
  const igual = JSON.stringify(metadata) === JSON.stringify(row.metadata ?? {});
  if (mudou || !igual) {
    await admin
      .from("channel_sessions")
      .update({ status, metadata, ...(mudou ? { last_status_change_at: agora } : {}) })
      .eq("organization_id", input.organizationId)
      .eq("id", input.channelSessionId);
  }

  // Disconnected que nao muda o estado (FAILED/STOPPED) nao reabre nem fecha aviso.
  if (input.evento !== "Disconnected" || status === "STARTING") {
    await sincronizarSaudeDaConexao(
      admin,
      { id: input.channelSessionId, organization_id: input.organizationId, status },
      { reachable: true, status, detail: input.evento === "LoggedOut" ? DETALHE_QR_RESCAN_NATIVO : null },
      row.display_name ?? row.phone_number ?? "sem nome",
    );
  }

  if (input.evento === "Connected" && !row.phone_number && row.verdash_instance_name) {
    await preencherTelefoneNativo(admin, input.organizationId, row.verdash_instance_name);
  }
  return { status: "updated", reason: `conexao_${input.evento.toLowerCase()}` };
}
