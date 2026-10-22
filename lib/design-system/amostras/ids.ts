/**
 * Os ids das amostras da vitrine do design system (`/app/design-system`).
 *
 * Todos têm o mesmo prefixo de UUID, que nenhum registro de verdade tem (o
 * banco gera v4 aleatório). É por ele que a API da vitrine
 * (`app/app/design-system/_componentes/ApiDaVitrine.ts`) reconhece uma chamada
 * feita a partir de uma amostra: URL com este prefixo nunca sai do navegador.
 */
export const PREFIXO_DA_VITRINE = "00000000-0000-4000-8000-0000000d5";

const id = (n: number) => `${PREFIXO_DA_VITRINE}${String(n).padStart(3, "0")}`;

export const IDS = {
  org: id(1),
  canal: id(2),
  contato: id(10),
  contatoSemTarefa: id(11),
  conversa: id(20),
  conversaSemTarefa: id(21),
  funil: id(30),
  outroFunil: id(31),
  lead: id(40),
  leadSemTarefa: id(41),
  tarefa: id(50),
  atendente: id(60),
  colega: id(61),
  nota: id(70),
  passagem: id(80),
  aviso: (n: number) => id(100 + n),
  mensagem: (n: number) => id(200 + n),
  etapa: (n: number) => id(300 + n),
  /** As tarefas da seção "Tarefas" da vitrine. */
  tarefaDaLista: (n: number) => id(400 + n),
} as const;

/** `true` quando a URL fala de uma amostra da vitrine. */
export function ehDaVitrine(url: string): boolean {
  return url.includes(PREFIXO_DA_VITRINE);
}
