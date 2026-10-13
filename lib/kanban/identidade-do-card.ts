import { phoneForDisplay } from "@/lib/channels/phone-variants";
import type { Lead } from "@/lib/types/leads";

/**
 * QUEM é o lead e POR ONDE chegou — o topo do card do funil (proposta aprovada
 * pelo Peterson, board "Card do lead", 13/10/2026).
 *
 * Pura e sem React: o card do desktop e o do celular leem daqui, e o teste
 * mede a regra sem montar componente.
 */

/** O selo no canto do avatar. `null` = canal desconhecido, sem selo. */
export type CanalDoCard = "whatsapp" | "direct" | "comentario";

/**
 * O título que o nascimento do lead grava quando não sabe o nome
 * (`lib/leads/nascimento-do-lead.ts`): "Novo contato pelo X". No card ele não
 * serve — diz de onde veio, mas não QUEM é, e por meses disse a rede errada
 * (um Direct virava "Novo contato pelo WhatsApp"). O selo já conta a rede.
 */
const TITULO_GENERICO = /^novo contato pelo\b/i;

export function ehTituloGenerico(titulo: string | null | undefined): boolean {
  return TITULO_GENERICO.test((titulo ?? "").trim());
}

/**
 * Telefone legível: `+55 21 99702-1180`. Número de fora do Brasil (ou fora do
 * formato) volta no canônico com `+`, que ainda é copiável.
 */
export function telefoneFormatado(bruto: string | null | undefined): string {
  const canonico = phoneForDisplay(bruto);
  const d = canonico.replace(/\D/g, "");
  const br = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(d);
  if (br) return `+55 ${br[1]} ${br[2]}-${br[3]}`;
  return canonico;
}

type LeadDoCard = Pick<
  Lead,
  "title" | "source" | "contact_name" | "contact_instagram" | "contact_phone" | "conversa"
>;

export type OrigemDoNome = "contato" | "instagram" | "telefone" | "titulo" | "nenhum";

/**
 * O nome do card. Ordem aprovada: nome do contato (que já inclui o nome do
 * perfil do Instagram, gravado pelo ingest do Direct) → @usuário → telefone
 * formatado → título do negócio, se não for o genérico. Nunca "Novo contato
 * pelo WhatsApp".
 *
 * Negócio sem contato (criado à mão, por webhook) cai no título, que é o nome
 * que alguém deu a ele.
 */
export function nomeDoCard(lead: LeadDoCard): { nome: string; origem: OrigemDoNome } {
  const contato = lead.contact_name?.trim();
  if (contato) return { nome: contato, origem: "contato" };
  const arroba = lead.contact_instagram?.trim().replace(/^@/, "");
  if (arroba) return { nome: `@${arroba}`, origem: "instagram" };
  const tel = telefoneFormatado(lead.contact_phone);
  if (tel) return { nome: tel, origem: "telefone" };
  const titulo = lead.title?.trim();
  if (titulo && !ehTituloGenerico(titulo)) return { nome: titulo, origem: "titulo" };
  return { nome: "", origem: "nenhum" };
}

/** Por onde a pessoa chegou: a conversa sabe; sem ela, a origem do negócio. */
export function canalDoCard(lead: Pick<Lead, "source" | "conversa" | "contact_phone">): CanalDoCard | null {
  const entrada = lead.conversa?.instagram_entrada;
  if (entrada === "direct") return "direct";
  if (entrada === "comentario") return "comentario";
  if (lead.source === "instagram") return "direct";
  if (lead.source === "whatsapp") return "whatsapp";
  if (lead.conversa && lead.contact_phone) return "whatsapp";
  return null;
}

/** O rótulo do canal (chave de i18n). */
export const ROTULO_DO_CANAL: Record<CanalDoCard, string> = {
  whatsapp: "WhatsApp",
  direct: "Direct do Instagram",
  comentario: "Comentário no Instagram",
};

/**
 * A linha de baixo do nome: o que ajuda a reconhecer a pessoa sem repetir o
 * nome. Devolve `{ texto, mono }`; `null` quando não há nada a dizer.
 * `semNome` é a chave de i18n do aviso "sem nome salvo", traduzida por quem
 * chama.
 */
export function linhaDeBaixo(
  lead: LeadDoCard,
  origem: OrigemDoNome,
  canal: CanalDoCard | null,
): { texto: string; mono: boolean; chave?: boolean } | null {
  const tel = telefoneFormatado(lead.contact_phone);
  const arroba = lead.contact_instagram?.trim().replace(/^@/, "");
  if (origem === "contato" || origem === "titulo") {
    if (tel) return { texto: tel, mono: true };
    if (arroba) return { texto: `@${arroba}`, mono: false };
  }
  if (origem === "telefone") return { texto: "Sem nome salvo", mono: false, chave: true };
  return canal ? { texto: ROTULO_DO_CANAL[canal], mono: false, chave: true } : null;
}

/** Iniciais para o avatar sem foto: duas letras, ou os dois dígitos do DDD. */
export function iniciaisDoCard(nome: string): string {
  const limpo = nome.replace(/^@/, "").trim();
  if (!limpo) return "?";
  if (/^\+?[\d\s-]+$/.test(limpo)) return limpo.replace(/\D/g, "").slice(2, 4) || "#";
  const partes = limpo.split(/[\s._-]+/).filter(Boolean);
  const a = partes[0]?.[0] ?? "";
  const b = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? "") : (partes[0]?.[1] ?? "");
  return (a + b).toUpperCase();
}

export function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? "").trim().split(/\s+/)[0] ?? "";
}
