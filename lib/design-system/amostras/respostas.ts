/**
 * O que a API da vitrine responde para cada chamada feita por uma amostra.
 *
 * É o equivalente, em tempo de execução, ao `vi.mock("@/lib/api/client")` dos
 * testes dos componentes: o componente roda inteiro e de verdade, e só a
 * resposta do servidor é trocada por um dado de exemplo. Quem decide QUAIS
 * chamadas chegam aqui é `ApiDaVitrine` (app/app/design-system/_componentes).
 *
 * Leitura sem rota conhecida devolve `{ data: null }`; escrita devolve
 * `{ data: {} }`. Nos dois casos nada sai do navegador.
 */
import { avisosDaVitrine, buscaDaVitrine } from "./avisos";
import { IDS } from "./ids";
import { EQUIPE_DA_VITRINE, FUNIS_DA_VITRINE, contatoDaVitrine, resumoDaVitrine, tarefasDaVitrine } from "./painel";

type Rota = { metodo: string; caminho: RegExp; responder: (agora: number, url: URL) => unknown };

const ROTAS: Rota[] = [
  {
    metodo: "GET",
    caminho: /^\/api\/v1\/contacts\/([^/]+)\/crm-summary$/,
    responder: (agora, url) => resumoDaVitrine(agora, url.pathname.includes(IDS.contatoSemTarefa)),
  },
  {
    metodo: "GET",
    caminho: /^\/api\/v1\/contacts\/[^/]+$/,
    responder: (agora, url) => contatoDaVitrine(agora, url.pathname.includes(IDS.contatoSemTarefa)),
  },
  {
    metodo: "GET",
    caminho: /^\/api\/v1\/tasks$/,
    responder: (agora, url) => ({
      data: { tasks: url.searchParams.get("contact_id") === IDS.contato ? tarefasDaVitrine(agora) : [] },
    }),
  },
  { metodo: "GET", caminho: /^\/api\/v1\/team\/assignable$/, responder: () => ({ data: EQUIPE_DA_VITRINE }) },
  {
    metodo: "GET",
    caminho: /^\/api\/v1\/ai\/inbox$/,
    responder: (agora, url) => avisosDaVitrine(agora, url.searchParams.get("status") === "resolved" ? "resolved" : "open"),
  },
  {
    metodo: "GET",
    caminho: /^\/api\/v1\/leads\/abertos-por-funil$/,
    responder: () => ({ data: { por_funil: { [IDS.funil]: 12, [IDS.outroFunil]: 3 } } }),
  },
  { metodo: "GET", caminho: /^\/api\/v1\/pipelines$/, responder: () => ({ data: FUNIS_DA_VITRINE }) },
  // Os contadores do menu: fila na Inbox, atrasadas em Tarefas, casos da IA.
  {
    metodo: "GET",
    caminho: /^\/api\/v1\/conversations\/counts$/,
    responder: () => ({ data: { fila: 3, unassigned: 3, mine: 2, all: 8, ai: 4, closed: 12, archived: 1 } }),
  },
  { metodo: "GET", caminho: /^\/api\/v1\/tasks\/atrasadas$/, responder: () => ({ data: { atrasadas: 2 } }) },
  { metodo: "GET", caminho: /^\/api\/v1\/ai\/cases$/, responder: () => ({ data: { cases: [], open_count: 0 } }) },
  {
    metodo: "GET",
    caminho: /^\/api\/v1\/(conversations|contacts|leads)$/,
    responder: (agora, url) => buscaDaVitrine(agora, url.pathname.split("/").pop() as "conversations"),
  },
];

/** A resposta de exemplo para uma chamada; nunca lança. */
export function respostaDaVitrine(metodo: string, endereco: string, agora: number): unknown {
  const url = new URL(endereco, "http://vitrine.invalid");
  const m = metodo.toUpperCase();
  const rota = ROTAS.find((r) => r.metodo === m && r.caminho.test(url.pathname));
  if (rota) return rota.responder(agora, url);
  return m === "GET" ? { data: null } : { data: {} };
}
