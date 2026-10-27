/**
 * A FLAG DA VENDA DIRETA (compra por link de pagamento cria a conta).
 *
 * Chave `VENDA_DIRETA` em `platform_config`: só o valor exato `ligado` liga.
 * Ausente, `desligado`, lixo ou erro de leitura = desligada (falha fechada).
 * Lida a cada uso, sem memo, e só dentro do ramo que a precisa: o webhook de
 * cobrança nunca a consulta para outro evento.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

export const CHAVE_VENDA_DIRETA = "VENDA_DIRETA";

export async function vendaDiretaLigada(admin: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await admin.from("platform_config").select("valor").eq("chave", CHAVE_VENDA_DIRETA).maybeSingle();
    if (error) {
      logger.warn("venda direta: leitura da flag recusada, tratando como desligada", { codigo: error.code });
      return false;
    }
    return (data as { valor: string | null } | null)?.valor === "ligado";
  } catch (erro) {
    logger.warn("venda direta: leitura da flag falhou, tratando como desligada", {
      detalhe: erro instanceof Error ? erro.message : String(erro),
    });
    return false;
  }
}
