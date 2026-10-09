import { z } from "zod";

/**
 * FIXAR, SILENCIAR E MARCAR COMO NÃO LIDA — POR ATENDENTE (migration 9042).
 *
 * As regras PURAS, compartilhadas pela rota, pela lista, pelos avisos e pela
 * tela. O estado mora em `conversation_user_state`, uma linha por (conversa,
 * pessoa): cada um fixa, silencia e marca só para si, como no WhatsApp.
 */

/** Quantas conversas uma pessoa pode fixar numa organização. */
export const TETO_DE_FIXADAS = 10;

/** As durações do silêncio que a tela oferece. "sempre" vira `'infinity'` no banco. */
export const DURACOES_DE_SILENCIO = ["8h", "1w", "sempre"] as const;
export type DuracaoDeSilencio = (typeof DURACOES_DE_SILENCIO)[number];

const MS: Record<Exclude<DuracaoDeSilencio, "sempre">, number> = {
  "8h": 8 * 3_600_000,
  "1w": 7 * 86_400_000,
};

/** O corpo de `POST /mute`. Nada além da duração: o instante é do relógio do servidor. */
export const silenciarSchema = z.object({ duracao: z.enum(DURACOES_DE_SILENCIO) }).strict();

/** O valor de `muted_until` para uma duração, a partir de `agora` (ms). */
export function silencioAte(duracao: DuracaoDeSilencio, agora: number): string {
  if (duracao === "sempre") return "infinity";
  return new Date(agora + MS[duracao]).toISOString();
}

/**
 * A conversa está silenciada para esta pessoa AGORA?
 *
 * O PostgREST devolve `'infinity'` como a string `"infinity"`, que `Date`
 * não entende (NaN): tratada à parte, senão "sempre" valeria "nunca".
 */
export function estaSilenciada(mutedUntil: string | null | undefined, agora: number = Date.now()): boolean {
  if (!mutedUntil) return false;
  if (mutedUntil === "infinity") return true;
  const ate = Date.parse(mutedUntil);
  return Number.isFinite(ate) && ate > agora;
}

/** O que a lista acrescenta a cada conversa, para a pessoa da sessão. */
export interface EstadoPessoal {
  pinned: boolean;
  muted_until: string | null;
  marked_unread: boolean;
}

/** Uma linha de `conversation_user_state`, como a lista lê. */
export interface LinhaDoEstado {
  conversation_id: string;
  pinned_at: string | null;
  muted_until: string | null;
  marked_unread_at: string | null;
}

export const SEM_ESTADO: EstadoPessoal = { pinned: false, muted_until: null, marked_unread: false };

export function estadoDaLinha(l: LinhaDoEstado | undefined): EstadoPessoal {
  if (!l) return SEM_ESTADO;
  return { pinned: l.pinned_at !== null, muted_until: l.muted_until, marked_unread: l.marked_unread_at !== null };
}

/**
 * Quantas não lidas a TELA mostra: o contador do banco ou, se ele é zero e a
 * pessoa marcou a conversa, 1 (o "ponto" do WhatsApp).
 */
export function naoLidasDaConversa(c: {
  unread_count_for_assignee?: number | null;
  marked_unread?: boolean;
}): number {
  const n = c.unread_count_for_assignee ?? 0;
  return n > 0 ? n : c.marked_unread ? 1 : 0;
}

/**
 * Fixadas primeiro, a fixada mais recente no topo; o resto na ordem que veio.
 * A ordem entre fixadas é a dos `pinned_at` (desc), que é a ordem de `fixadas`.
 */
export function fixadasNoTopo<T extends { id: string }>(linhas: T[], fixadas: string[]): T[] {
  const posicao = new Map(fixadas.map((id, i) => [id, i]));
  const topo = linhas.filter((l) => posicao.has(l.id)).sort((a, b) => posicao.get(a.id)! - posicao.get(b.id)!);
  return [...topo, ...linhas.filter((l) => !posicao.has(l.id))];
}
