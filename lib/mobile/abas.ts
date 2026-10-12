/**
 * As abas do app de celular (abaixo de 760px) e o que cada rota significa nele.
 * Puro: sem React, para o teste conferir a regra sem montar tela.
 *
 * Enquanto Funil, Tarefas, Avisos e Mais não têm tela própria (M3/M4), cada aba
 * leva para a tela que o CRM já tem.
 */

export type AbaDoCelular = "conversas" | "funil" | "tarefas" | "avisos" | "mais";

/** Onde cada aba começa. "Mais" abre o menu, não uma rota. */
export const RAIZ_DA_ABA: Record<Exclude<AbaDoCelular, "mais">, string> = {
  conversas: "/app/inbox",
  funil: "/app/kanban",
  tarefas: "/app/tasks",
  avisos: "/app/ai/inbox",
};

const dentro = (rota: string, base: string) => rota === base || rota.startsWith(`${base}/`);

/** A aba acesa numa rota. O que não é das quatro primeiras é do "Mais". */
export function abaDaRota(rota: string): AbaDoCelular {
  if (dentro(rota, "/app/inbox")) return "conversas";
  if (dentro(rota, "/app/kanban") || dentro(rota, "/app/pipelines") || dentro(rota, "/app/leads")) return "funil";
  if (dentro(rota, "/app/tasks") || dentro(rota, "/app/agenda")) return "tarefas";
  if (dentro(rota, "/app/ai/inbox")) return "avisos";
  return "mais";
}

/** A rota é o começo de uma aba? Lá vai o cabeçalho grande; nas outras, a barra com voltar. */
export function ehRaizDeAba(rota: string): boolean {
  return Object.values(RAIZ_DA_ABA).includes(rota);
}

/** A conversa aberta: a Inbox com `?id=` ou `/app/inbox/<id>`. Ela desenha a própria barra. */
export function conversaAberta(rota: string, idNaUrl: string | null): boolean {
  return /^\/app\/inbox\/[^/]+$/.test(rota) || (rota === "/app/inbox" && !!idNaUrl);
}

/** Tela cheia: sem barra inferior (a conversa e a ficha do lead). */
export function ehTelaCheia(rota: string, idNaUrl: string | null): boolean {
  return conversaAberta(rota, idNaUrl) || /^\/app\/leads\/[^/]+$/.test(rota);
}

/**
 * A ação do FAB "+" por tela. Até a folha "Criar" (M1.4), ele abre a ação principal
 * da tela pelo `?criar=1` (ver `usePedidoDeCriar`). Sem ação, sem FAB.
 */
export function acaoDeCriar(rota: string): { href: string; rotulo: string } | null {
  if (rota === "/app/inbox") return { href: "/app/contacts?criar=1", rotulo: "Novo contato" };
  if (rota === "/app/tasks") return { href: "/app/tasks?criar=1", rotulo: "Nova tarefa" };
  if (/^\/app\/pipelines\/[^/]+$/.test(rota)) return { href: `${rota}?criar=1`, rotulo: "Novo Lead" };
  return null;
}
