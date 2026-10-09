import type { SupabaseClient } from "@supabase/supabase-js";

import {
  TETO_DE_FIXADAS,
  estadoDaLinha,
  type EstadoPessoal,
  type LinhaDoEstado,
} from "./estado-por-atendente";

/**
 * O lado de BANCO do estado por atendente (migration 9042).
 *
 * Toda leitura e escrita aqui usa o client da SESSÃO: a RLS de
 * `conversation_user_state` só deixa a pessoa ver e gravar as próprias linhas,
 * e o `.eq("user_id")` / `.eq("organization_id")` é defesa extra, não a cerca.
 * A exceção é `usuariosQueSilenciaram`, chamada pelo worker de push com o
 * service role, e por isso com o filtro de organização obrigatório.
 */

type SB = SupabaseClient;

/**
 * Quantos ids de "marcadas como não lidas" viajam na URL do filtro "Não lidas".
 * Mesma razão do teto de bytes de `_handler.ts`: a lista vai dentro do `or=`.
 */
export const TETO_DE_MARCADAS_NA_URL = 30;

/** O recorte da pessoa numa organização: o que muda a LISTA dela. */
export interface RecorteDoAtendente {
  /** Ids fixados, o fixado mais recente primeiro. */
  fixadas: string[];
  /** Ids marcados como não lidos (cortado no teto da URL). */
  marcadas: string[];
  /** Estado de cada conversa com alguma preferência ATIVA. */
  estados: Map<string, LinhaDoEstado>;
}

/**
 * UMA consulta por requisição da lista, nunca uma por conversa: as linhas
 * ATIVAS da pessoa na organização (fixada, marcada ou silenciada agora). O
 * universo é pequeno por construção: fixadas têm teto, e marcar e silenciar
 * são gestos de uma pessoa. O `limit` é só cinto de segurança.
 */
export async function lerRecorteDoAtendente(
  supabase: SB,
  orgId: string,
  userId: string,
  agoraIso: string = new Date().toISOString(),
): Promise<RecorteDoAtendente> {
  // Preferência pessoal não derruba a caixa de entrada: sem o recorte (erro do
  // PostgREST, banco sem a 9042 ainda), a lista sai como antes, sem fixadas.
  const vazio: RecorteDoAtendente = { fixadas: [], marcadas: [], estados: new Map() };
  let linhas: LinhaDoEstado[];
  try {
    const { data, error } = await supabase
      .from("conversation_user_state")
      .select("conversation_id, pinned_at, muted_until, marked_unread_at")
      .eq("organization_id", orgId)
      .eq("user_id", userId)
      .or(`pinned_at.not.is.null,marked_unread_at.not.is.null,muted_until.gt.${agoraIso}`)
      .limit(500);
    if (error || !data) return vazio;
    linhas = data as LinhaDoEstado[];
  } catch {
    return vazio;
  }
  const fixadas = linhas
    .filter((l) => l.pinned_at)
    .sort((a, b) => (b.pinned_at ?? "").localeCompare(a.pinned_at ?? ""))
    .slice(0, TETO_DE_FIXADAS)
    .map((l) => l.conversation_id);
  const marcadas = linhas
    .filter((l) => l.marked_unread_at)
    .slice(0, TETO_DE_MARCADAS_NA_URL)
    .map((l) => l.conversation_id);
  return { fixadas, marcadas, estados: new Map(linhas.map((l) => [l.conversation_id, l])) };
}

/** Acrescenta `pinned`, `muted_until` e `marked_unread` a cada conversa. */
export function comEstadoPessoal<T extends { id: string }>(
  conversas: T[],
  estados: Map<string, LinhaDoEstado>,
): Array<T & EstadoPessoal> {
  return conversas.map((c) => ({ ...c, ...estadoDaLinha(estados.get(c.id)) }));
}

/** Os campos que uma rota grava; o resto da linha fica como está. */
export type MudancaDoEstado = Partial<Pick<LinhaDoEstado, "pinned_at" | "muted_until" | "marked_unread_at">>;

/**
 * Upsert da linha (conversa, pessoa) com SÓ os campos pedidos: o PostgREST
 * resolve o conflito da PK atualizando apenas as colunas enviadas, então fixar
 * não apaga um silêncio que já existia.
 */
export async function gravarEstado(
  supabase: SB,
  alvo: { orgId: string; userId: string; conversationId: string },
  mudanca: MudancaDoEstado,
): Promise<{ ok: true } | { ok: false; mensagem: string }> {
  const { error } = await supabase.from("conversation_user_state").upsert(
    {
      organization_id: alvo.orgId,
      conversation_id: alvo.conversationId,
      user_id: alvo.userId,
      ...mudanca,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "conversation_id,user_id" },
  );
  return error ? { ok: false, mensagem: error.message } : { ok: true };
}

/**
 * Desfazer (desafixar, reativar o som, marcar como lida) é UPDATE, nunca upsert:
 * sem linha não há o que desfazer, e criar uma linha vazia só para zerá-la
 * seria lixo. Zero linhas afetadas é sucesso (o estado pedido já vale).
 */
export async function limparEstado(
  supabase: SB,
  alvo: { orgId: string; userId: string; conversationId: string },
  campo: keyof MudancaDoEstado,
  opcoes: { apagarLinha?: boolean } = {},
): Promise<{ ok: true } | { ok: false; mensagem: string }> {
  // Conversa fora da visão: a policy de UPDATE exige enxergá-la (WITH CHECK) e
  // recusaria. Apaga-se a linha inteira, o que a policy de DELETE permite à
  // dona: preferência sobre conversa que ela não vê não serve para nada.
  const tabela = supabase.from("conversation_user_state");
  const { error } = await (opcoes.apagarLinha
    ? tabela.delete()
    : tabela.update({ [campo]: null, updated_at: new Date().toISOString() }))
    .eq("organization_id", alvo.orgId)
    .eq("user_id", alvo.userId)
    .eq("conversation_id", alvo.conversationId);
  return error ? { ok: false, mensagem: error.message } : { ok: true };
}

/** A conversa existe nesta organização e a pessoa a ENXERGA (RLS de conversations)? */
export async function conversaVisivel(supabase: SB, orgId: string, conversationId: string): Promise<boolean> {
  const { data } = await supabase
    .from("conversations")
    .select("id")
    .eq("organization_id", orgId)
    .eq("id", conversationId)
    .maybeSingle();
  return !!data;
}

/** Quantas conversas a pessoa já fixou nesta organização, fora `exceto`. */
export async function contarFixadas(supabase: SB, orgId: string, userId: string, exceto: string): Promise<number> {
  // Só fixadas que a pessoa AINDA enxerga: o `!inner` com `conversations` roda
  // sob a RLS dela, então a conversa transferida para fora da visão não ocupa
  // vaga do teto (revisão do Cassio, P2).
  const { count } = await supabase
    .from("conversation_user_state")
    .select("conversation_id, conversations!inner(id)", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .not("pinned_at", "is", null)
    .neq("conversation_id", exceto);
  return count ?? 0;
}

/**
 * Quem silenciou esta conversa AGORA. Chamada pelo worker de push (service
 * role, sem RLS): o filtro de organização é a cerca.
 */
export async function usuariosQueSilenciaram(
  admin: SB,
  orgId: string,
  conversationId: string,
  agoraIso: string = new Date().toISOString(),
): Promise<Set<string>> {
  const { data, error } = await admin
    .from("conversation_user_state")
    .select("user_id")
    .eq("organization_id", orgId)
    .eq("conversation_id", conversationId)
    .gt("muted_until", agoraIso);
  if (error || !data) return new Set();
  return new Set((data as Array<{ user_id: string }>).map((r) => r.user_id));
}
