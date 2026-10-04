"use client";
import type { InfiniteData, Query, QueryClient } from "@tanstack/react-query";

import type { ConversationsFilters } from "./useConversationsRealtime";

/**
 * Atualização DIRIGIDA das listas de conversas no cache do react-query.
 *
 * Antes, toda mudança em conversa, viesse do realtime ou de um botão, fazia
 * `invalidateQueries({ queryKey: ["conversations"] })`: a lista visível
 * refazia TODAS as páginas carregadas, e um mesmo evento chegava duas ou três
 * vezes (o canal de conversas, o de mensagens a cada tique de entregue/lido, e
 * o `onSuccess` do botão). Aqui:
 *
 * - a linha que já está numa lista é corrigida no lugar (`setQueryData`);
 * - só a lista em que a ordem ou a pertença PODE ter mudado é refeita: a que
 *   tem a conversa e teve campo de filtro/ordem alterado, ou a que não a tem
 *   mas cujo filtro não a exclui com certeza;
 * - os pedidos de refazer de uma janela curta viram UM por lista.
 *
 * Na dúvida, refaz: um filtro que este arquivo não sabe avaliar (comando,
 * busca, etiqueta, não lidas) conta como "pode entrar".
 */

/** Uma página da lista, como `/api/v1/conversations` devolve. */
type Pagina = { data: Array<Record<string, unknown> & { id: string }>; meta?: unknown };
type Lista = InfiniteData<Pagina>;
type Linha = Record<string, unknown> & { id: string };

/** Campos da linha que decidem em que lista a conversa está, ou em que posição. */
export const CAMPOS_DE_FILTRO_E_ORDEM = [
  "status",
  "assigned_to_user_id",
  "last_message_at",
  "awaiting_since",
  "created_at",
  "snooze_until",
  "bot_silenced_until",
  "is_group",
  "tags",
  "channel_session_id",
  "instagram_entrada",
  "unread_count_for_assignee",
  "contact_id",
] as const;

/** Os status que `exclude_finished` esconde (o mesmo vocabulário da rota). */
const ENCERRADOS = new Set(["closed", "archived", "resolved"]);

const RAIZ = "conversations";
const JANELA_MS = 250;

function ehLista(q: Query): boolean {
  const k = q.queryKey;
  return Array.isArray(k) && k[0] === RAIZ && k.length === 2 && typeof k[1] === "object";
}

function linhasDa(lista: Lista | undefined): Linha[] {
  return lista?.pages?.flatMap((p) => p.data ?? []) ?? [];
}

function igual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "object" || typeof b === "object") return JSON.stringify(a) === JSON.stringify(b);
  return false;
}

/**
 * `true` só quando o filtro da lista EXCLUI a linha com certeza. Os filtros
 * que dependem de dado de fora da linha (comando, busca, etiqueta, não lidas)
 * nunca excluem aqui.
 */
export function filtroExclui(f: ConversationsFilters | undefined, linha: Linha): boolean {
  if (!f) return false;
  const status = typeof linha.status === "string" ? linha.status : undefined;
  if (f.status && status !== undefined) {
    const aceitos = typeof f.status === "string" ? [f.status] : f.status;
    if (aceitos.length > 0 && !aceitos.includes(status as never)) return true;
  }
  if (f.exclude_finished && status !== undefined && ENCERRADOS.has(status)) return true;
  if ("assigned_to_user_id" in linha && f.assigned_to) {
    const dono = linha.assigned_to_user_id ?? null;
    if (f.assigned_to === "unassigned" && dono !== null) return true;
    if (f.assigned_to === "me" && dono === null) return true;
    if (f.assigned_to !== "unassigned" && f.assigned_to !== "me" && dono !== f.assigned_to) return true;
  }
  if (f.channel_session_id && "channel_session_id" in linha && linha.channel_session_id !== f.channel_session_id)
    return true;
  if (f.is_group !== undefined && "is_group" in linha && Boolean(linha.is_group) !== f.is_group) return true;
  if (f.entrada && "instagram_entrada" in linha && linha.instagram_entrada !== f.entrada) return true;
  return false;
}

/**
 * Aplica no cache a mudança de UMA conversa e devolve as listas que precisam
 * ser refeitas. Não refaz nada sozinha (quem chama passa a `agendarRefazer`).
 */
export function aplicarMudancaDaConversa(
  qc: QueryClient,
  linha: Linha,
  evento: "INSERT" | "UPDATE" | "DELETE",
): Query[] {
  const alvos: Query[] = [];
  for (const q of qc.getQueryCache().findAll({ queryKey: [RAIZ] })) {
    if (!ehLista(q)) continue;
    const lista = q.state.data as Lista | undefined;
    if (!lista?.pages) continue;
    const atual = linhasDa(lista).find((c) => c.id === linha.id);
    if (!atual) {
      if (evento !== "DELETE" && !filtroExclui(q.queryKey[1] as ConversationsFilters, linha)) alvos.push(q);
      continue;
    }
    if (evento === "DELETE") {
      qc.setQueryData<Lista>(q.queryKey, (velha) =>
        velha && { ...velha, pages: velha.pages.map((p) => ({ ...p, data: p.data.filter((c) => c.id !== linha.id) })) },
      );
      continue;
    }
    const mexeNaLista = CAMPOS_DE_FILTRO_E_ORDEM.some((k) => k in linha && !igual(linha[k], atual[k]));
    // Corrige no lugar só o que a linha da lista já tem: os objetos que a rota
    // junta (contacts, channel_sessions) e os campos calculados não vêm no evento.
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(linha)) {
      if (k in atual && (v === null || typeof v !== "object" || Array.isArray(v))) patch[k] = v;
    }
    qc.setQueryData<Lista>(q.queryKey, (velha) =>
      velha && {
        ...velha,
        pages: velha.pages.map((p) => ({
          ...p,
          data: p.data.map((c) => (c.id === linha.id ? { ...c, ...patch } : c)),
        })),
      },
    );
    if (mexeNaLista) alvos.push(q);
  }
  return alvos;
}

/** As listas em cache que mostram esta conversa. */
export function listasComAConversa(qc: QueryClient, conversationId: string): Query[] {
  return qc
    .getQueryCache()
    .findAll({ queryKey: [RAIZ] })
    .filter((q) => ehLista(q) && linhasDa(q.state.data as Lista | undefined).some((c) => c.id === conversationId));
}

const pendentes = new WeakMap<QueryClient, { hashes: Set<string>; timer: ReturnType<typeof setTimeout> }>();

/**
 * Junta os pedidos de refazer de uma janela curta e refaz cada lista UMA vez.
 * `invalidateQueries` exato: lista ativa refaz, lista em cache de outra aba só
 * fica velha e refaz quando a pessoa voltar a ela (o mesmo de antes).
 */
export function agendarRefazer(qc: QueryClient, listas: Query[]): void {
  if (listas.length === 0) return;
  let p = pendentes.get(qc);
  if (!p) {
    const novo = {
      hashes: new Set<string>(),
      timer: setTimeout(() => {
        pendentes.delete(qc);
        for (const h of novo.hashes) {
          const q = qc.getQueryCache().get(h);
          if (q) void qc.invalidateQueries({ queryKey: q.queryKey, exact: true });
        }
      }, JANELA_MS),
    };
    p = novo;
    pendentes.set(qc, p);
  }
  for (const q of listas) p.hashes.add(q.queryHash);
}

/**
 * Depois de um botão que mexeu numa conversa (assumir, encerrar, transferir…):
 * marca TODAS as listas como velhas sem refazer nenhuma, e refaz só as que
 * mostram a conversa. Se ela tiver de ENTRAR numa lista que não a mostra, o
 * evento do realtime que a própria mudança gera chega em seguida e cai em
 * `aplicarMudancaDaConversa`, que sabe avaliar isso com a linha nova.
 */
export function invalidarListasDaConversa(qc: QueryClient, conversationId: string): void {
  void qc.invalidateQueries({ queryKey: [RAIZ], refetchType: "none" });
  agendarRefazer(qc, listasComAConversa(qc, conversationId));
}

/**
 * A conversa deixou de ser desta pessoa (404/403 ao abrir): sai das listas em
 * cache, como um DELETE. Sem isto, quem perdeu a conversa para outra pessoa a
 * via na lista até o próximo refetch, e cada clique dava "não encontrada".
 */
export function esquecerConversaSemAcesso(qc: QueryClient, conversationId: string, erro: unknown): void {
  const status = (erro as { status?: unknown } | null)?.status;
  if (status !== 404 && status !== 403) return;
  aplicarMudancaDaConversa(qc, { id: conversationId }, "DELETE");
}
