import type { ConversationsFilters } from "@/hooks/inbox/useConversationsRealtime";

/**
 * Quais filtros AUXILIARES estão ligados, em palavras que o operador reconhece.
 *
 * ─── Por que derivar, e não receber por prop ─────────────────────────────────
 * A lista lê do MESMO objeto que foi ao servidor. Recebendo por prop, a tela
 * poderia nomear um filtro que a consulta não aplicou (ou calar um que aplicou) —
 * e o defeito que esta tarefa conserta é precisamente a tela afirmando um estado
 * que não é o do servidor. Duas fontes divergem; uma, não.
 *
 * ─── O que é "auxiliar" ──────────────────────────────────────────────────────
 * A ABA não entra. Ela é a visão escolhida, já está destacada na barra de cima, e
 * nomeá-la aqui diria ao operador para "limpar" o lugar onde ele está. Entram os
 * cinco que ele ligou por cima da aba e pode esquecer que ligou.
 *
 * As strings saem em português porque `t()` usa o português como chave. Elas
 * precisam existir em `lib/i18n/dicionario.ts`: o guardião do espanhol é cego a
 * `t(<variável>)` e não cobra sozinho (erro nº 11 dos recorrentes).
 */
export function filtrosAuxiliaresAtivos(filters: ConversationsFilters): string[] {
  const ativos: string[] = [];
  if (filters.unread) ativos.push("Não lidos");
  if (filters.search) ativos.push("Busca");
  if (filters.tag) ativos.push("Etiqueta");
  if (filters.channel_session_id) ativos.push("Canal");
  // A ORIGEM do Instagram (Direct ou comentário). Sem esta linha o estado vazio
  // dizia "Ativos: Canal" com DOIS filtros ligados — exatamente o defeito que o
  // cabeçalho deste arquivo existe para impedir: a tela afirmando um estado que
  // não é o do servidor. Filtro que some da lista é filtro que o operador não
  // sabe que precisa desligar, e ele fica olhando uma caixa vazia sem entender
  // o que a esvaziou.
  if (filters.entrada) ativos.push("Origem");
  return ativos;
}
