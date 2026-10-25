/**
 * Porta agnóstica: avisa os canais pareados da organização sobre o envio de
 * conversões do CRM (o CRM é o dono único do envio).
 *
 * Lê o estado da organização (admin client, SEMPRE com `organization_id`), monta
 * o aviso (`lib/conversoes/aviso-ao-canal.ts`) e o entrega a cada sessão
 * pareada e não arquivada DA PRÓPRIA organização. Sessão direta não tem a quem
 * avisar. Best-effort: NUNCA lança, e o log leva organização e motivo, nunca token.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { JANELA_DE_SAUDE_DIAS, montarAvisoDeConversoes } from "@/lib/conversoes/aviso-ao-canal";
import { lerEstadoDaConexao } from "@/lib/conversoes/estado-da-conexao";
import { listarRegrasMeta } from "@/lib/conversoes/regras-meta";
import { logger } from "@/lib/logger";

import { ARCHIVED_AT, queryTolerantToMissingArchived } from "./archived";
import { verdashConversoesStatus } from "./verdash/client";
import { resolveVerdashCreds } from "./verdash/credentials";

const PRAZO_DO_AVISO_MS = 8_000;

export interface ResultadoDoAviso {
  avisadas: number;
  falhas: number;
}

async function contarNoLivroRazao(
  admin: SupabaseClient,
  organizationId: string,
  status: "sent" | "error",
  desde: string,
): Promise<number> {
  const { count, error } = await admin
    .from("ad_conversion_dispatches")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("platform", "meta_ads")
    .eq("status", status)
    .gte("attempted_at", desde);
  if (error) throw new Error("livro_razao_ilegivel");
  return count ?? 0;
}

export async function avisarCanaisSobreConversoes(
  admin: SupabaseClient,
  organizationId: string,
): Promise<ResultadoDoAviso> {
  const resultado: ResultadoDoAviso = { avisadas: 0, falhas: 0 };
  try {
    const base = () =>
      admin
        .from("channel_sessions")
        .select("verdash_instance_name")
        .eq("organization_id", organizationId)
        .eq("provider", "verdash")
        .not("verdash_vinculo_id", "is", null);
    const { data: sessoes, error: erroSessoes } = await queryTolerantToMissingArchived(
      () => base().is(ARCHIVED_AT, null),
      () => base(),
    );
    if (erroSessoes) throw new Error("sessoes_ilegiveis");
    const nomes = [
      ...new Set(
        ((sessoes ?? []) as Array<{ verdash_instance_name: string | null }>)
          .map((s) => s.verdash_instance_name)
          .filter((n): n is string => Boolean(n)),
      ),
    ];
    if (nomes.length === 0) return resultado;

    const desde = new Date(Date.now() - JANELA_DE_SAUDE_DIAS * 24 * 60 * 60 * 1000).toISOString();
    const [conexao, regras, enviados, erros] = await Promise.all([
      lerEstadoDaConexao(admin, organizationId, "meta_ads"),
      listarRegrasMeta(admin, organizationId),
      contarNoLivroRazao(admin, organizationId, "sent", desde),
      contarNoLivroRazao(admin, organizationId, "error", desde),
    ]);
    const aviso = montarAvisoDeConversoes({
      conexao: conexao.conectada ? conexao : null,
      regras,
      historico: { enviados, erros },
    });

    for (const instanceName of nomes) {
      try {
        const creds = await resolveVerdashCreds(admin, { organizationId, instanceName });
        if (!creds || !creds.vinculoId) {
          resultado.falhas += 1;
          logger.warn("[conversoes-do-canal] sessão sem credencial; não avisada", {
            organization_id: organizationId,
            motivo: "sem_credencial",
          });
          continue;
        }
        await verdashConversoesStatus(creds, aviso, PRAZO_DO_AVISO_MS);
        resultado.avisadas += 1;
      } catch (err) {
        resultado.falhas += 1;
        logger.warn("[conversoes-do-canal] aviso não entregue", {
          organization_id: organizationId,
          motivo: err instanceof Error ? err.message.slice(0, 120) : "desconhecido",
        });
      }
    }
  } catch (err) {
    resultado.falhas += 1;
    logger.warn("[conversoes-do-canal] aviso abortado", {
      organization_id: organizationId,
      motivo: err instanceof Error ? err.message.slice(0, 120) : "desconhecido",
    });
  }
  return resultado;
}
