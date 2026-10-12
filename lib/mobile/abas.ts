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

/** O que a folha "Criar" oferece (as opções do protótipo, por tela). */
export type OpcaoDeCriar = "conversa" | "contato" | "lead" | "tarefa" | "compromisso";

/**
 * As opções da folha "Criar" do FAB "+", na ordem do protótipo. Sem opções, sem FAB.
 * Conversas: tudo; Funil: lead, contato, tarefa; Tarefas: tarefa, compromisso, lead.
 */
export function opcoesDeCriar(rota: string): OpcaoDeCriar[] {
  if (rota === "/app/inbox") return ["conversa", "contato", "lead", "tarefa", "compromisso"];
  if (rota === "/app/kanban" || /^\/app\/pipelines\/[^/]+$/.test(rota)) return ["lead", "contato", "tarefa"];
  if (rota === "/app/tasks") return ["tarefa", "compromisso", "lead"];
  return [];
}

/**
 * Para onde cada opção leva: a tela que já cria aquilo, com `?criar=1` (ver
 * `usePedidoDeCriar`). O lead vai para o funil aberto, ou para o funil padrão.
 */
export function destinoDeCriar(opcao: OpcaoDeCriar, rota: string, funilPadrao: string | null): string {
  if (opcao === "conversa") return "/app/contacts";
  if (opcao === "contato") return "/app/contacts?criar=1";
  if (opcao === "tarefa") return "/app/tasks?criar=1";
  if (opcao === "compromisso") return "/app/agenda?criar=1";
  if (/^\/app\/pipelines\/[^/]+$/.test(rota)) return `${rota}?criar=1`;
  return funilPadrao ? `/app/pipelines/${funilPadrao}?criar=1` : "/app/kanban";
}
