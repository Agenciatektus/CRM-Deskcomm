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

import {
  JANELA_DE_SAUDE_DIAS,
  MOTIVOS_DE_CREDENCIAL,
  montarAvisoDeConversoes,
  type AvisoDeConversoes,
  type HistoricoParaOAviso,
} from "@/lib/conversoes/aviso-ao-canal";
import { lerEstadoDaConexao } from "@/lib/conversoes/estado-da-conexao";
import { logger } from "@/lib/logger";

import { ARCHIVED_AT, queryTolerantToMissingArchived } from "./archived";
import { verdashConversoesStatus } from "./verdash/client";
import { resolveVerdashCreds } from "./verdash/credentials";

const PRAZO_DO_AVISO_MS = 8_000;

export interface ResultadoDoAviso {
  avisadas: number;
  falhas: number;
}

/** Quantas linhas recentes do livro-razão entram no julgamento (as mais novas primeiro). */
const LINHAS_DO_HISTORICO = 500;

async function lerHistorico(
  admin: SupabaseClient,
  organizationId: string,
  desde: string,
): Promise<HistoricoParaOAviso> {
  const { data, error } = await admin
    .from("ad_conversion_dispatches")
    .select("status, reason")
    .eq("organization_id", organizationId)
    .eq("platform", "meta_ads")
    .in("status", ["sent", "error", "skipped"])
    .gte("attempted_at", desde)
    .order("attempted_at", { ascending: false })
    .limit(LINHAS_DO_HISTORICO);
  if (error) throw new Error("livro_razao_ilegivel");

  // Mais novas primeiro: o que vem antes do primeiro `sent` é posterior a ele.
  const historico: HistoricoParaOAviso = {
    enviados: 0,
    erros: 0,
    ultimoEnvio: null,
    credencialQuebradaDepoisDoUltimoSent: false,
  };
  let viuSent = false;
  for (const l of (data ?? []) as Array<{ status: string; reason: string | null }>) {
    if (l.status === "sent") {
      historico.enviados += 1;
      viuSent = true;
      historico.ultimoEnvio ??= "sent";
    } else if (l.status === "error") {
      historico.erros += 1;
      historico.ultimoEnvio ??= "error";
    } else if (
      !viuSent &&
      MOTIVOS_DE_CREDENCIAL.includes(l.reason as (typeof MOTIVOS_DE_CREDENCIAL)[number])
    ) {
      historico.credencialQuebradaDepoisDoUltimoSent = true;
    }
  }
  return historico;
}

export interface OpcoesDoAviso {
  /** Organização parada: o CRM não envia, então o aviso é sempre "inativo". */
  forcarInativo?: boolean;
  /** `Date.now()` limite: sessões restantes ficam para a próxima rodada. */
  prazoFinal?: number;
}

export async function avisarCanaisSobreConversoes(
  admin: SupabaseClient,
  organizationId: string,
  opcoes: OpcoesDoAviso = {},
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

    let aviso: AvisoDeConversoes = { ativo: false };
    if (!opcoes.forcarInativo) {
      const desde = new Date(Date.now() - JANELA_DE_SAUDE_DIAS * 24 * 60 * 60 * 1000).toISOString();
      const [conexao, historico] = await Promise.all([
        lerEstadoDaConexao(admin, organizationId, "meta_ads"),
        lerHistorico(admin, organizationId, desde),
      ]);
      aviso = montarAvisoDeConversoes({ conexao: conexao.conectada ? conexao : null, historico });
    }

    for (const instanceName of nomes) {
      if (opcoes.prazoFinal !== undefined && Date.now() > opcoes.prazoFinal) {
        logger.warn("[conversoes-do-canal] orçamento esgotado; sessões restantes adiadas", {
          organization_id: organizationId,
        });
        break;
      }
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
