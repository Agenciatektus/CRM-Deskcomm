import type { InboxTab } from "@/components/inbox/InboxFilters";
import type { ConversationsFilters } from "@/hooks/inbox/useConversationsRealtime";
import { ehAFila } from "@/lib/inbox/comando-da-conversa";

/**
 * Qual aba produziu ESTES filtros: o inverso de `tabToFilter` (InboxLayout).
 *
 * Existe para a lista escolher o texto do vazio sem receber a aba por prop. A
 * lista já lê os auxiliares do objeto que foi ao servidor (`filtrosAuxiliaresAtivos`)
 * e a aba segue a mesma regra: duas fontes poderiam divergir, e o vazio diria
 * "Fila vazia" sobre uma consulta que pediu outra coisa.
 *
 * A Fila é reconhecida por `ehAFila`, o MESMO predicado da rota que ordena: ela
 * pode pedir `["aguardando", "automatico"]` numa org sem agente no ar, e só o
 * `["automatico"]` puro é a aba do automático.
 */
export function abaDosFiltros(f: Partial<ConversationsFilters>): InboxTab {
  if (f.status === "archived") return "archived";
  if (f.status === "closed") return "closed";
  if (ehAFila(f)) return "unassigned";
  if (f.comando?.length === 1 && f.comando[0] === "automatico") return "ai";
  if (f.assigned_to === "me") return "mine";
  return "all";
}
