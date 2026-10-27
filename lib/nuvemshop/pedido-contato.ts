/**
 * Casa o comprador do pedido com um contato da organização; sem casamento, cria o contato.
 * Telefone (com/sem DDI, com/sem nono) primeiro, e-mail depois. Telefone e e-mail nunca
 * vão para `orders` nem para log (LGPD): só para casar e para o contato novo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhoneBR, phoneLookupVariants } from "@/lib/channels/phone-variants";

export type CasamentoDeContato = { contactId: string; criado?: true } | { motivo: string } | null;

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

const UNICO_VIOLADO = "23505";
// Mesma regex do CHECK `contacts_email_format`: e-mail fora dela derrubaria o insert.
const EMAIL_VALIDO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/i;

/**
 * Casa; se ninguém bate e há telefone ou e-mail, cria o contato do comprador.
 * Ambíguo nunca cria (duplicaria). Contato novo nasce com `consent: {}` (sem
 * opt-in registrado; os gates do produto só barram quem recusou). Sem `emit_event`: não dispara
 * automação de "contato criado" para quem só comprou no site.
 */
export async function contatoDoPedido(
  admin: SupabaseClient,
  organizationId: string,
  pedido: Record<string, unknown>,
): Promise<CasamentoDeContato> {
  const casou = await casarContato(admin, organizationId, pedido);
  if (casou) return casou;

  const telefone = normalizePhoneBR(pedido["contact_phone"]);
  const email = texto(pedido["contact_email"]).toLowerCase();
  const emailOk = EMAIL_VALIDO.test(email) ? email : "";
  if (!telefone && !emailOk) return null;
  // Sem caractere de controle/bidi e cortado por code point (nunca no meio de um emoji).
  const nome = [...texto(pedido["contact_name"]).replace(/[\p{Cc}\p{Cf}]/gu, " ")].slice(0, 200).join("").trim();

  const { data, error } = await admin
    .from("contacts")
    .insert({
      organization_id: organizationId,
      name: nome || null,
      phone_number: telefone,
      email: emailOk || null,
      source: "nuvemshop",
      source_metadata: { via: "pedido_loja" },
      consent: {},
    })
    .select("id")
    .single();
  if (error) {
    // Corrida com outro evento do mesmo comprador: o índice único barrou, então ele já existe.
    if (error.code === UNICO_VIOLADO) return casarContato(admin, organizationId, pedido);
    // Falha ao criar o contato não pode perder o pedido: grava sem contato e avisa (sem PII).
    return { motivo: `contato_nao_criado:${error.code ?? "erro"}` };
  }
  return { contactId: (data as { id: string }).id, criado: true };
}
