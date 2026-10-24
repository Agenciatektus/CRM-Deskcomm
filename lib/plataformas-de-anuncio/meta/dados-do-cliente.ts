/**
 * Os dados do cliente que a Meta usa para reconhecê-lo — a nota de correspondência.
 *
 * A Meta liga a venda ao anúncio por QUANTOS campos do cliente coincidem com os
 * dela. Até aqui o CRM mandava o clique e o telefone; o e-mail, o nome, o
 * nascimento e um id próprio estavam no cadastro e ficavam de fora. Cada campo
 * a mais sobe a correspondência (e o que o otimizador aprende), sem custo.
 *
 * Aqui só mora a regra PURA: normalizar como a Meta exige e extrair do cadastro.
 * O hash e o fio são do transporte (`./conversions.ts`).
 *
 * ─── Normalização (a Meta recusa em silêncio o que vem fora do formato) ──────
 * - e-mail: minúsculo, sem espaços;
 * - nome e sobrenome: minúsculos, só letras (acento fica: é UTF-8), sem emoji,
 *   número ou pontuação — o nome do WhatsApp costuma ter os três;
 * - nascimento: `AAAAMMDD`;
 * - país: ISO 3166-1 alfa-2 minúsculo, e só quando o telefone é brasileiro.
 */

export interface DadosDoCliente {
  /** Id do contato no CRM: identidade estável entre eventos, em claro até o hash. */
  externalId: string;
  email: string | null;
  primeiroNome: string | null;
  sobrenome: string | null;
  /** `AAAAMMDD`. */
  nascimento: string | null;
  /** `br` quando o telefone é do Brasil; senão `null` (não se chuta país). */
  pais: string | null;
}

interface CadastroDoContato {
  id: string;
  name: string | null;
  display_name: string | null;
  email_normalized: string | null;
  birthdate: string | null;
  phone_number: string | null;
}

/**
 * Este contato PODE ter dado pessoal extra entregue à Meta?
 *
 * Mesma régua dos outros envios do produto (`lib/campanhas/elegibilidade.ts`,
 * `lib/automation/guarda-do-contato.ts`): opt-out (`is_blocked`), contato
 * pessoal, anonimizado (LGPD) e recusa de marketing REGISTRADA
 * (`consent.marketing.declined_at`) vetam. Não é régua nova: é a oposição do
 * titular sendo honrada também quando o destino é a plataforma de anúncios.
 *
 * O veto tira os campos NOVOS (e-mail, nome, nascimento, id); o que já saía
 * (clique e telefone) segue como antes, para esta mudança não calar a
 * mensuração de quem já a tinha.
 */
export function podeCompartilharDadosPessoais(c: {
  is_blocked?: boolean | null;
  is_personal?: boolean | null;
  is_anonymized?: boolean | null;
  consent?: unknown;
}): boolean {
  if (c.is_blocked || c.is_personal || c.is_anonymized) return false;
  const consent = c.consent && typeof c.consent === "object" ? (c.consent as Record<string, unknown>) : {};
  const marketing =
    consent.marketing && typeof consent.marketing === "object"
      ? (consent.marketing as Record<string, unknown>)
      : {};
  return !marketing.declined_at;
}

const FORMATO_DE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Só letras e espaço simples. `\p{L}` mantém acento e descarta emoji/dígito. */
function soLetras(texto: string): string {
  return texto
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Primeiro nome e último sobrenome. Nome de uma palavra só vira só `primeiroNome`;
 * palavras de uma letra (iniciais, "e", "d") não contam como sobrenome.
 */
export function separarNome(bruto: string | null): { primeiroNome: string | null; sobrenome: string | null } {
  if (!bruto) return { primeiroNome: null, sobrenome: null };
  const partes = soLetras(bruto)
    .split(" ")
    .filter((p) => p.length >= 2);
  if (partes.length === 0) return { primeiroNome: null, sobrenome: null };
  return {
    primeiroNome: partes[0] ?? null,
    sobrenome: partes.length > 1 ? (partes[partes.length - 1] ?? null) : null,
  };
}

function nascimentoAAAAMMDD(data: string | null): string | null {
  if (!data) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(data);
  return m ? `${m[1]}${m[2]}${m[3]}` : null;
}

export function dadosDoClienteDe(contato: CadastroDoContato): DadosDoCliente {
  const email = contato.email_normalized?.trim().toLowerCase() ?? "";
  const { primeiroNome, sobrenome } = separarNome(contato.name ?? contato.display_name);
  const digitos = (contato.phone_number ?? "").replace(/\D/g, "");
  return {
    externalId: contato.id,
    email: FORMATO_DE_EMAIL.test(email) ? email : null,
    primeiroNome,
    sobrenome,
    nascimento: nascimentoAAAAMMDD(contato.birthdate),
    pais: digitos.startsWith("55") && digitos.length >= 12 ? "br" : null,
  };
}
