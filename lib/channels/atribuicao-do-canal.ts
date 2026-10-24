/**
 * Completa a atribuição de anúncio de um contato com o que o CANAL sabe.
 *
 * Porta agnóstica para quem não pode nomear provider (doutrina de restrição de
 * canal, invariante 1): a ficha do contato pergunta "o canal conhece o nome da
 * campanha?" e este arquivo escolhe quem responde. Hoje só o canal hospedado
 * pareado enriquece; os demais devolvem `null` e a ficha segue sem o nome.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  completarAtribuicaoPelaVerdash,
  type NomesDoAnuncio,
} from "./verdash/atribuicao-enriquecida";

export type { NomesDoAnuncio };

export async function completarAtribuicaoPeloCanal(
  admin: SupabaseClient,
  organizationId: string,
  contactId: string,
): Promise<NomesDoAnuncio | null> {
  return completarAtribuicaoPelaVerdash(admin, organizationId, contactId);
}
