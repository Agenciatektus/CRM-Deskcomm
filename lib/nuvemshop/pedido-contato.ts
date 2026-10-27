/**
 * Casa o comprador do pedido com um contato EXISTENTE da organização (nunca cria).
 * Telefone (com/sem DDI, com/sem nono) primeiro, e-mail depois. Telefone e e-mail
 * só servem ao casamento: não são gravados nem logados (LGPD).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { phoneLookupVariants } from "@/lib/channels/phone-variants";

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

  let digitos = texto(pedido["contact_phone"]).replace(/\D/g, "");
  // Número nacional sem DDI (10/11 dígitos): `phoneLookupVariants` só entende o 55.
  if (digitos.length === 10 || digitos.length === 11) digitos = `55${digitos}`;
  const variantes = digitos ? phoneLookupVariants(digitos) : [];
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
