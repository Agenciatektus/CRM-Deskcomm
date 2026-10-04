/**
 * OS MÓDULOS LIBERADOS POR EMPRESA — a chave do meio, entre a instalação e a empresa.
 *
 * `lib/instalacao/modulos.ts` diz o que o SERVIDOR oferece; `capacidades.ts`, o
 * que a EMPRESA ligou para si. Esta camada é do dono do servidor olhando cada
 * empresa: o módulo está ligado na instalação, mas só quem ele liberou vê
 * (Peterson, 02/10/2026, migration 9026).
 *
 * Só vale para os módulos desta lista. Os outros passam direto, como sempre
 * passaram: incluir um módulo antigo aqui tiraria o recurso de quem já usa.
 *
 * Falha fechada e nunca lança, como `modulosLigados()`: roda no layout de `/app`,
 * e erro de banco esconde o módulo liberado, em vez de derrubar a tela ou mostrar
 * o que não foi liberado.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { modulosLigados, type ModuloOpcional } from "@/lib/instalacao/modulos";
import { fail } from "@/lib/api/wrappers";
import { logger } from "@/lib/logger";

export const MODULOS_LIBERADOS_POR_EMPRESA = ["prospeccao"] as const satisfies readonly ModuloOpcional[];
export type ModuloLiberadoPorEmpresa = (typeof MODULOS_LIBERADOS_POR_EMPRESA)[number];

export function exigeLiberacao(modulo: ModuloOpcional): modulo is ModuloLiberadoPorEmpresa {
  return (MODULOS_LIBERADOS_POR_EMPRESA as readonly ModuloOpcional[]).includes(modulo);
}

/** Módulos da instalação → os que ESTA empresa vê. Pura. */
export function filtrarPelaLiberacao(
  daInstalacao: readonly ModuloOpcional[],
  liberados: readonly string[],
): ModuloOpcional[] {
  return daInstalacao.filter((m) => !exigeLiberacao(m) || liberados.includes(m));
}

/** As linhas da empresa. Erro = nenhuma liberação (falha fechada). */
export async function liberacoesDaEmpresa(db: SupabaseClient, organizationId: string): Promise<string[]> {
  return (await lerLiberacoes(db, organizationId)) ?? [];
}

/**
 * Mesma leitura, mas `null` quando falha. Só para a tela de quem libera: ali
 * "não li" mostrado como "desligado" faria o dono achar que revogou o que não
 * revogou.
 */
export async function lerLiberacoes(db: SupabaseClient, organizationId: string): Promise<string[] | null> {
  try {
    const { data, error } = await db
      .from("modulos_liberados_por_empresa")
      .select("modulo")
      .eq("organization_id", organizationId);
    if (error) {
      logger.warn("módulos liberados: leitura recusada — tratando como nenhum", {
        organization_id: organizationId,
        codigo: error.code,
        detalhe: error.message,
      });
      return null;
    }
    return ((data ?? []) as Array<{ modulo: string }>).map((l) => l.modulo);
  } catch (erro) {
    logger.warn("módulos liberados: leitura falhou — tratando como nenhum", {
      organization_id: organizationId,
      detalhe: erro instanceof Error ? erro.message : String(erro),
    });
    return null;
  }
}

/**
 * O que esta empresa enxerga: ligado na instalação E, quando exige, liberado para ela.
 * Sem empresa ativa (`null`), nenhum módulo que exige liberação aparece.
 */
export async function modulosDaEmpresa(
  db: SupabaseClient,
  organizationId: string | null,
): Promise<ModuloOpcional[]> {
  const [daInstalacao, liberados] = await Promise.all([
    modulosLigados(db),
    organizationId ? liberacoesDaEmpresa(db, organizationId) : Promise.resolve([]),
  ]);
  return filtrarPelaLiberacao(daInstalacao, liberados);
}

export async function moduloDaEmpresa(
  db: SupabaseClient,
  organizationId: string,
  modulo: ModuloOpcional,
): Promise<boolean> {
  return (await modulosDaEmpresa(db, organizationId)).includes(modulo);
}

/**
 * Rota de módulo fechado para esta empresa = 404, a mesma resposta de rota que
 * não existe (padrão de `seModuloB2bDesligado`). Toda rota do módulo chama isto
 * logo depois de autenticar: esconder o menu não basta, a URL continua aberta.
 */
export async function seModuloFechadoParaEmpresa(
  db: SupabaseClient,
  organizationId: string,
  modulo: ModuloOpcional,
  requestId: string,
): Promise<Response | null> {
  if (await moduloDaEmpresa(db, organizationId, modulo)) return null;
  return fail("not_found", "Not found.", 404, { requestId });
}

/** Liberar é idempotente (PK); revogar apaga a linha. Só o service role chega aqui. */
export async function gravarLiberacao(
  db: SupabaseClient,
  organizationId: string,
  modulo: ModuloLiberadoPorEmpresa,
  liberado: boolean,
  ator: string,
): Promise<boolean> {
  const { error } = liberado
    ? await db
        .from("modulos_liberados_por_empresa")
        .upsert(
          { organization_id: organizationId, modulo, liberado_por: ator },
          { onConflict: "organization_id,modulo", ignoreDuplicates: true },
        )
    : await db
        .from("modulos_liberados_por_empresa")
        .delete()
        .eq("organization_id", organizationId)
        .eq("modulo", modulo);
  if (error) {
    logger.error("módulos liberados: não deu para gravar", {
      organization_id: organizationId,
      modulo,
      codigo: error.code,
      detalhe: error.message,
    });
    return false;
  }
  return true;
}
