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
 * quatro que ele ligou por cima da aba e pode esquecer que ligou.
 *
 * As strings saem em português porque `t()` usa o português como chave. Elas
 * precisam existir em `lib/i18n/dicionario.ts`: o guardião do espanhol é cego a
 * `t(<variável>)` e não cobra sozinho (erro nº 11 dos recorrentes).
 */
export function filtrosAuxiliaresAtivos(filters: ConversationsFilters): string[] {
  const ativos: string[] = [];
  // Os MESMOS rótulos do popover e dos chips (visual v2): o vazio por filtro
  // nomear "Não lidos" enquanto o chip diz "Só não lidas" faria o operador
  // procurar dois filtros onde existe um.
  if (filters.unread) ativos.push("Só não lidas");
  if (filters.search) ativos.push("Busca");
  if (filters.tag) ativos.push("Etiqueta");
  if (filters.channel_session_id) ativos.push("Canal");
  if (filters.is_group) ativos.push("Só grupos");
  if (filters.sem_passo) ativos.push("Sem próximo passo");
  // A ENTRADA do Instagram também é auxiliar: sem ela, "Só comentários" ligado
  // com lista vazia caía no vazio da ABA ("Fila vazia"), afirmando ausência
  // onde há um filtro escondendo tudo, e sem oferecer o "Limpar filtros".
  if (filters.entrada === "comentario") ativos.push("Só comentários");
  else if (filters.entrada) ativos.push("Só Direct");
  return ativos;
}
