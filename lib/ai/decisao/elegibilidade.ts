/**
 * O JEV DA PLATAFORMA — quem recebe, e com que chave.
 *
 * A instalação hospedada pode ter UMA chave TypeSafe própria
 * (`JEV_PLATFORM_API_KEY`). Ela serve toda empresa ELEGÍVEL que não cadastrou a
 * dela. Elegível é: assinatura em `trial`, `ativa` ou `em_atraso` (o atraso
 * MANTÉM o Jev) num plano com `inclui_ia` e sem `ia_propria`. Empresa isenta
 * (sem assinatura) e assinatura cancelada não recebem.
 *
 * Este módulo importa `env`: SÓ SERVIDOR. Nada que vá ao navegador o importa;
 * a tela recebe apenas o booleano `plataformaTemJev`. A chave da plataforma
 * nunca vai a log, resposta ou auditoria.
 *
 * Pontos de extensão da fatia 3 (não implementados): o teto de gasto por
 * empresa e o disjuntor global entram em `chaveDaPlataforma` / no ramo
 * `daPlataforma` de `destinoDasTarefas` (`./ponto.ts`); o aviso ao admin sai de
 * lá também.
 */
import type pg from "pg";

import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import type { createAdminClient } from "@/lib/supabase/admin";

import { configLigadaPorPadrao, jevFoiGravado, lerConfigDoJev, type ConfigDoJev } from "./config";

/** Estados da assinatura que mantêm o Jev (cancelada e isenta não). */
export const ESTADOS_COM_JEV = ["trial", "ativa", "em_atraso"] as const;

type Admin = ReturnType<typeof createAdminClient>;

/** A chave da plataforma, ou `null` quando a instalação não tem uma (recurso desligado). */
export function chaveDaPlataforma(): string | null {
  const chave = (env.JEV_PLATFORM_API_KEY ?? "").trim();
  return chave === "" ? null : chave;
}

/** O único dado que a tela recebe sobre a plataforma. */
export function plataformaTemJev(): boolean {
  return chaveDaPlataforma() !== null;
}

/** `JEV_LIGADO_POR_PADRAO` virada E a instalação tem chave: sem chave não há padrão a ligar. */
export function jevLigadoPorPadrao(): boolean {
  return plataformaTemJev() && ["true", "1"].includes((env.JEV_LIGADO_POR_PADRAO ?? "").trim().toLowerCase());
}

interface LinhaDaAssinatura {
  estado: string;
  plano: { inclui_ia: boolean; ia_propria: boolean } | { inclui_ia: boolean; ia_propria: boolean }[] | null;
}

/** Elegível ao Jev da plataforma? Nunca lança: leitura que falha vale "não" (nada sai para a rede). */
export async function organizacaoElegivelAoJev(admin: Admin, organizationId: string): Promise<boolean> {
  try {
    // Filtro por organização programático (cliente admin passa por cima da RLS).
    const { data, error } = await admin
      .from("cobranca_assinaturas")
      .select("estado, plano:cobranca_planos!cobranca_assinaturas_plano_id_fkey(inclui_ia, ia_propria)")
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (error) throw error;
    const linha = data as unknown as LinhaDaAssinatura | null;
    const plano = Array.isArray(linha?.plano) ? linha.plano[0] : linha?.plano;
    return (
      linha !== null &&
      (ESTADOS_COM_JEV as readonly string[]).includes(linha.estado) &&
      plano?.inclui_ia === true &&
      plano.ia_propria === false
    );
  } catch (erro) {
    logger.warn("elegibilidade ao Jev da plataforma não pôde ser lida; tratada como não elegível", {
      organizationId,
      erro: erro instanceof Error ? erro.name : typeof erro,
    });
    return false;
  }
}

/** A mesma regra, pela pilha do agente (`pg.Pool`). */
export async function organizacaoElegivelAoJevNoPool(pool: pg.Pool, organizationId: string): Promise<boolean> {
  try {
    const { rows } = await pool.query(
      `select 1
         from public.cobranca_assinaturas a
         join public.cobranca_planos p on p.id = a.plano_id
        where a.organization_id = $1
          and a.estado = any($2::text[])
          and p.inclui_ia and not p.ia_propria`,
      [organizationId, [...ESTADOS_COM_JEV]],
    );
    return rows.length > 0;
  } catch (erro) {
    logger.warn("elegibilidade ao Jev da plataforma não pôde ser lida; tratada como não elegível", {
      organizationId,
      erro: erro instanceof Error ? erro.name : typeof erro,
    });
    return false;
  }
}

/**
 * A config que VALE para a empresa: a gravada em `settings.jev`, ou — só com
 * `JEV_LIGADO_POR_PADRAO`, sem nada gravado e empresa elegível — o padrão ligado
 * e decidindo (`configLigadaPorPadrao`). Gravado sempre manda: desligar é gravar.
 * `elegivel` só é chamado quando o padrão pode valer (env virada, nada gravado):
 * sem a env, zero consultas a mais.
 */
export async function configEfetivaDoJev(
  settings: unknown,
  elegivel: () => Promise<boolean>,
): Promise<ConfigDoJev> {
  if (jevFoiGravado(settings) || !jevLigadoPorPadrao()) return lerConfigDoJev(settings);
  return (await elegivel().catch(() => false)) ? configLigadaPorPadrao() : lerConfigDoJev(settings);
}

/** A plataforma serve o Jev a esta empresa? (chave da instalação definida E empresa elegível). */
export async function plataformaServeOJev(admin: Admin, organizationId: string): Promise<boolean> {
  return plataformaTemJev() && (await organizacaoElegivelAoJev(admin, organizationId));
}
