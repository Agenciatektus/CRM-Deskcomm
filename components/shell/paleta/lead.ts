import { escolherAbaDoPainel } from "@/components/inbox/painel/useAbaDoPainel";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import type { LeadAchado } from "@/lib/leads/busca-de-leads";
import { hrefDoFunil } from "@/lib/navigation/funis-no-menu";

import { abaDaConversa } from "./busca-remota";

/**
 * Para onde um LEAD achado na busca (Ctrl K) leva.
 *
 * Com conversa do contato: a Inbox, na conversa, com o painel na aba Negócios,
 * que é onde o negócio se trabalha ao lado do chat. A conversa abre na aba da
 * lista em que ela aparece (fechada e arquivada têm a sua).
 *
 * Sem conversa (lead importado, contato que nunca escreveu, ou conversa que o
 * papel não enxerga): o quadro do funil com o dossiê do lead aberto
 * (`?lead=`, o deep link do `KanbanBoard`).
 */
export function destinoDoLead(lead: LeadAchado): string {
  if (lead.conversa) {
    return `/app/inbox?filter=${abaDaConversa(lead.conversa.status)}&id=${encodeURIComponent(lead.conversa.id)}`;
  }
  return `${hrefDoFunil(lead.pipeline_id)}?lead=${encodeURIComponent(lead.id)}`;
}

/** Abre o lead: escolhe a aba Negócios do painel antes de navegar até a conversa. */
export function abrirLead(lead: LeadAchado, ir: (href: string) => void): void {
  if (lead.conversa) escolherAbaDoPainel("negocios");
  ir(destinoDoLead(lead));
}

/**
 * A linha de baixo do lead: contato, etapa e funil. Os nomes de etapa e funil
 * vêm do banco e são escritos pelo cliente, então não passam por `t()`.
 */
export function subDoLead(lead: LeadAchado, t: (texto: string) => string): string {
  const contato = lead.contato ? rotuloDoContato(lead.contato, t) : null;
  const situacao = lead.status === "won" ? t("Ganho") : lead.status === "lost" ? t("Perdido") : lead.stage?.name;
  return [contato, situacao, lead.pipeline?.name].filter(Boolean).join(", ");
}
