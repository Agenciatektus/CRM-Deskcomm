import type { Role, VisibilityMode } from "@/lib/auth/types";

/**
 * As visões da Inbox e quem vê cada uma. Saiu de `InboxFilters` sem mudar nada (o
 * arquivo passaria de 300 linhas com a folha de filtros do celular, M2.2);
 * `InboxFilters` reexporta `InboxTab` e `visibleInboxTabs`.
 */
export type InboxTab = "unassigned" | "mine" | "all" | "closed" | "archived" | "ai";

export const INBOX_TABS: { value: InboxTab; label: string }[] = [
  { value: "unassigned", label: "Fila" },
  { value: "mine", label: "Minhas" },
  { value: "all", label: "Todas" },
  // L9: "Com a IA" é a primeira do "Mais", como no protótipo (é a visão viva;
  // as duas seguintes são passado). O rótulo segue o "Devolver à IA".
  { value: "ai", label: "Com a IA" },
  { value: "closed", label: "Fechadas" },
  // "Arquivadas" fica ao lado de "Fechadas" porque as duas são passado, e
  // separada dela porque são passados diferentes (#923): fechada é atendimento
  // encerrado, arquivada é o que saiu da fila de trabalho sem ser destruído.
  { value: "archived", label: "Arquivadas" },
];

/**
 * As três visões do dia inteiro, à vista no controle segmentado (visual v2). As
 * demais vão para o "Mais": ver `AbasDaInbox`.
 */
export const ABAS_PRINCIPAIS: readonly InboxTab[] = ["unassigned", "mine", "all"];

/**
 * Visões visíveis por papel + escopo (G4-02, acceptance 1). 'Todas' fica oculta
 * para `agent` quando visibility_mode ≠ 'all'; viewer/manager/admin sempre veem.
 * É apenas cosmético: a RLS (G4-01) é quem garante o escopo mesmo via ?filter=all.
 */
export function visibleInboxTabs(role: Role, mode: VisibilityMode | undefined): InboxTab[] {
  const hideAll = role === "agent" && mode !== "all";
  return INBOX_TABS.filter((t) => !(t.value === "all" && hideAll)).map((t) => t.value);
}
