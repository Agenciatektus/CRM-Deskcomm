import type { FlowEdge, FlowGraph, FlowNode } from "@/lib/followup/graph-schema";

/**
 * A RÉGUA COMO LISTA — o que o builder da cadência edita.
 *
 * O motor lê um GRAFO (nós + arestas); quem monta uma cadência pensa numa LISTA:
 * "manda isto, espera 2 dias, manda aquilo, move para Tentativa 2". Este módulo
 * é a ponte, nos dois sentidos, e é PURO — a tela nunca monta aresta à mão.
 *
 * Só grafos LINEARES viram lista (gatilho → passos → fim, uma aresta `always`
 * por nó). Grafo com ramificação (feito no editor avançado) devolve `null`: a
 * tela avisa e manda para o editor avançado, em vez de achatar e perder ramos.
 */

export const MS_POR_HORA = 3_600_000;
/** Menor espera que o motor aceita (5 min) e a maior (90 dias). */
export const ESPERA_MINIMA_MS = 300_000;
export const ESPERA_MAXIMA_MS = 7_776_000_000;

export type PassoDaCadencia =
  | { id: string; tipo: "mensagem"; variantes: string[] }
  | { id: string; tipo: "espera"; duracaoMs: number }
  | { id: string; tipo: "mover_etapa"; stageId: string }
  | { id: string; tipo: "etiqueta"; op: "add" | "remove"; tag: string };

const ID_GATILHO = "inicio";
const ID_FIM = "fim";

function rotulo(passo: PassoDaCadencia, indice: number): string {
  switch (passo.tipo) {
    case "mensagem":
      return `Mensagem ${indice + 1}`;
    case "espera":
      return "Espera";
    case "mover_etapa":
      return "Mover de etapa";
    case "etiqueta":
      return passo.op === "add" ? "Adicionar etiqueta" : "Remover etiqueta";
  }
}

function noDoPasso(passo: PassoDaCadencia, indice: number, y: number): FlowNode {
  const base = { id: passo.id, label: rotulo(passo, indice).slice(0, 60), position: { x: 0, y } };
  switch (passo.tipo) {
    case "mensagem": {
      const [corpo = "", ...demais] = passo.variantes.map((v) => v.trim()).filter(Boolean);
      return {
        ...base,
        type: "action",
        config: { mode: "text", body: corpo, ...(demais.length > 0 ? { variants: demais } : {}) },
      };
    }
    case "espera":
      return {
        ...base,
        type: "wait",
        config: {
          mode: "fixed",
          duration_ms: Math.min(ESPERA_MAXIMA_MS, Math.max(ESPERA_MINIMA_MS, Math.round(passo.duracaoMs))),
        },
      };
    case "mover_etapa":
      return { ...base, type: "action", config: { mode: "move_stage", stage_id: passo.stageId } };
    case "etiqueta":
      return { ...base, type: "action", config: { mode: "tag", op: passo.op, tag: passo.tag.trim() } };
  }
}

/** Lista → grafo linear que o motor executa. */
export function grafoDaTimeline(passos: PassoDaCadencia[]): FlowGraph {
  const PASSO_Y = 140;
  const nodes: FlowNode[] = [
    { id: ID_GATILHO, type: "trigger", label: "Início", position: { x: 0, y: 0 }, config: {} },
    ...passos.map((p, i) => noDoPasso(p, i, (i + 1) * PASSO_Y)),
    {
      id: ID_FIM,
      type: "end",
      label: "Fim da cadência",
      position: { x: 0, y: (passos.length + 1) * PASSO_Y },
      config: { outcome: "exhausted" },
    },
  ];
  const edges: FlowEdge[] = [];
  for (let i = 0; i < nodes.length - 1; i += 1) {
    edges.push({
      id: `${nodes[i]!.id}->${nodes[i + 1]!.id}`,
      source: nodes[i]!.id,
      target: nodes[i + 1]!.id,
      priority: 0,
      condition: { type: "always" },
    });
  }
  return { nodes, edges };
}

/** Grafo → lista, ou `null` quando o grafo não é uma régua linear. */
export function timelineDoGrafo(grafo: FlowGraph | null | undefined): PassoDaCadencia[] | null {
  if (!grafo) return [];
  const porId = new Map(grafo.nodes.map((n) => [n.id, n]));
  const saidas = new Map<string, FlowEdge[]>();
  for (const e of grafo.edges) saidas.set(e.source, [...(saidas.get(e.source) ?? []), e]);

  const gatilho = grafo.nodes.find((n) => n.type === "trigger");
  if (!gatilho) return null;

  const passos: PassoDaCadencia[] = [];
  const visitados = new Set<string>();
  let atual: FlowNode | undefined = gatilho;
  while (atual) {
    if (visitados.has(atual.id)) return null; // laço
    visitados.add(atual.id);
    const deste = saidas.get(atual.id) ?? [];
    if (atual.type === "end") {
      if (deste.length > 0) return null;
      break;
    }
    if (atual.type !== "trigger") {
      const passo = passoDoNo(atual);
      if (!passo) return null;
      passos.push(passo);
    }
    if (deste.length !== 1 || deste[0]!.condition.type !== "always") return null;
    atual = porId.get(deste[0]!.target);
    if (!atual) return null;
  }
  // Nó solto (fora do caminho) também é ramo que a lista não mostraria.
  return visitados.size === grafo.nodes.length ? passos : null;
}

function passoDoNo(no: FlowNode): PassoDaCadencia | null {
  if (no.type === "wait") {
    return no.config.mode === "fixed" ? { id: no.id, tipo: "espera", duracaoMs: no.config.duration_ms } : null;
  }
  if (no.type !== "action") return null;
  switch (no.config.mode) {
    case "text":
      return { id: no.id, tipo: "mensagem", variantes: [no.config.body, ...(no.config.variants ?? [])] };
    case "move_stage":
      return { id: no.id, tipo: "mover_etapa", stageId: no.config.stage_id };
    case "tag":
      return { id: no.id, tipo: "etiqueta", op: no.config.op, tag: no.config.tag };
    default:
      return null;
  }
}

/** Id novo e estável para um passo (a variante escolhida depende do id do nó). */
export function novoIdDePasso(existentes: readonly string[]): string {
  let n = existentes.length + 1;
  while (existentes.includes(`passo-${n}`)) n += 1;
  return `passo-${n}`;
}
