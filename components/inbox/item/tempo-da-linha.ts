import type { Locale } from "date-fns";
import { format, formatDistanceToNowStrict } from "date-fns";

import { formatarDecorrido } from "@/lib/channels/janela";
import { esperaDaConversa } from "@/lib/inbox/comando-da-conversa";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";

/*
 * Funções puras da linha da lista de conversas. Saíram de
 * `ConversationListItem.tsx` quando o item ganhou a linha de meta do visual v2
 * e passou de 300 linhas: o componente fica com o desenho, e o cálculo de
 * texto (que não depende de React) mora aqui, testável sem render.
 */

/** Letra ou número de qualquer escrita: emoji, pontuação e símbolo ficam de fora. */
const LETRA_OU_NUMERO = /[\p{L}\p{N}]/u;

/** As letras de uma palavra, por CODE POINT (`Array.from`), nunca por unidade UTF-16. */
function letrasDe(palavra: string): string[] {
  return Array.from(palavra).filter((c) => LETRA_OU_NUMERO.test(c));
}

/**
 * A sigla do avatar: primeira letra da primeira e da última palavra, ou as duas
 * primeiras letras quando há uma palavra só.
 *
 * Por code point e só com letras/números. Indexar a string (`nome[0]`,
 * `slice(0, 2)`) corta pela unidade UTF-16: "Grazy Lima 🎤" virava "G�",
 * metade do par substituto do microfone (visto na Inbox da Delicatto). Palavra
 * que é só emoji ou pontuação não conta; nome sem nenhuma letra (". ✨") cai no
 * `fallback`, como o nome vazio.
 */
export function initials(name: string | null | undefined, fallback: string): string {
  const palavras = (name ?? "")
    .trim()
    .split(/\s+/)
    .map(letrasDe)
    .filter((letras) => letras.length > 0);
  const primeira = palavras[0];
  const ultima = palavras[palavras.length - 1];
  if (!primeira || !ultima) return Array.from(fallback).slice(0, 2).join("").toUpperCase();
  if (palavras.length === 1) return primeira.slice(0, 2).join("").toUpperCase();
  return `${primeira[0]}${ultima[0]}`.toUpperCase();
}

export function relativeTime(iso: string | null, locale: Locale): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return format(d, "HH:mm");
  const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
  if (diff < 7) return formatDistanceToNowStrict(d, { addSuffix: false, locale: locale });
  return format(d, "dd/MM");
}

/**
 * "Aguardando há 5 min": desde quando o cliente ESPERA.
 *
 * A régua é `esperaDaConversa`, a mesma `awaiting_since` que ordena a Fila
 * (#990): `last_inbound_at` é a ÚLTIMA mensagem do cliente, então a pílula de
 * quem insistia voltava para "há 1 min" a cada mensagem dele, e o tempo na linha
 * contradizia a posição do lado e a ordem da lista. O fallback segue sendo a
 * criação, para a conversa que nunca recebeu mensagem.
 */
export function waitingLabel(
  conversation: ConversationWithContact,
  t: (texto: string) => string,
  locale: Locale,
): string {
  const since = esperaDaConversa(conversation);
  if (!since) return t("Aguardando");
  return `${t("Aguardando")} ${formatDistanceToNowStrict(new Date(since), { addSuffix: true, locale: locale })}`;
}

/**
 * "38m", "5h", "3d": há quanto tempo o cliente espera, na unidade única da faixa
 * do cabeçalho (`formatarDecorrido`). `null` sem data, com data inválida ou no
 * futuro (relógio da máquina atrasado): sem dado confiável a linha não afirma
 * espera nenhuma.
 */
export function esperaCurta(desde: string | null, agora: Date = new Date()): string | null {
  if (!desde) return null;
  const ms = agora.getTime() - new Date(desde).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return formatarDecorrido(ms);
}
