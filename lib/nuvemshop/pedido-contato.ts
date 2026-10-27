/**
 * Casa o comprador do pedido com um contato EXISTENTE da organização (nunca cria).
 * Telefone (com/sem DDI, com/sem nono) primeiro, e-mail depois. Telefone e e-mail
 * só servem ao casamento: não são gravados nem logados (LGPD).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhoneBR, phoneLookupVariants } from "@/lib/channels/phone-variants";

export type CasamentoDeContato = { contactId: string } | { motivo: "contato_ambiguo" } | null;

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export async function casarContato(
  admin: SupabaseClient,
  organizationId: string,
  pedido: Record<string, unknown>,
): Promise<CasamentoDeContato> {
  const base = () =>
    admin
      .from("contacts")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("is_anonymized", false)
      .is("is_merged_into", null)
      .limit(2);

  // Respeita o `+` (número estrangeiro não ganha 55) e só põe 55 em número sem DDI.
  const telefone = normalizePhoneBR(pedido["contact_phone"]);
  const variantes = telefone ? phoneLookupVariants(telefone) : [];
  const email = texto(pedido["contact_email"]).toLowerCase();

  const buscas = [
    variantes.length ? () => base().in("phone_number", variantes) : null,
    email ? () => base().eq("email_normalized", email) : null,
  ];
  for (const busca of buscas) {
    if (!busca) continue;
    const { data, error } = await busca();
    if (error) throw new Error(`contato:${error.code ?? "erro"}`);
    if (data && data.length > 1) return { motivo: "contato_ambiguo" };
    if (data && data.length === 1) return { contactId: (data[0] as { id: string }).id };
  }
  return null;
}
