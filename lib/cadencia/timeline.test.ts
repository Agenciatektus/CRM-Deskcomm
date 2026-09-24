import { describe, expect, it } from "vitest";

import { flowGraphSchema, type FlowGraph } from "@/lib/followup/graph-schema";
import { grafoDaTimeline, novoIdDePasso, timelineDoGrafo, type PassoDaCadencia } from "./timeline";

const ETAPA = "33333333-3333-4333-8333-333333333333";

const regua: PassoDaCadencia[] = [
  { id: "passo-1", tipo: "mensagem", variantes: ["Oi {{primeiro_nome|tudo bem}}", "Olá {{primeiro_nome|tudo bem}}"] },
  { id: "passo-2", tipo: "espera", duracaoMs: 48 * 3_600_000 },
  { id: "passo-3", tipo: "mensagem", variantes: ["Conseguiu ver minha mensagem?"] },
  { id: "passo-4", tipo: "mover_etapa", stageId: ETAPA },
  { id: "passo-5", tipo: "etiqueta", op: "add", tag: "sem-resposta" },
];

describe("lista ↔ grafo", () => {
  it("o grafo gerado passa no schema do motor", () => {
    expect(flowGraphSchema.safeParse(grafoDaTimeline(regua)).success).toBe(true);
  });

  it("ida e volta preserva a régua", () => {
    expect(timelineDoGrafo(grafoDaTimeline(regua))).toEqual(regua);
  });

  it("variantes: a 1ª vira body, as demais variants", () => {
    const g = grafoDaTimeline(regua);
    const msg = g.nodes.find((n) => n.id === "passo-1");
    expect(msg?.type === "action" && msg.config).toEqual({
      mode: "text",
      body: "Oi {{primeiro_nome|tudo bem}}",
      variants: ["Olá {{primeiro_nome|tudo bem}}"],
    });
  });

  it("variante vazia some (não vira mensagem em branco)", () => {
    const g = grafoDaTimeline([{ id: "p", tipo: "mensagem", variantes: ["Oi", "   "] }]);
    const msg = g.nodes.find((n) => n.id === "p");
    expect(msg?.type === "action" && msg.config).toEqual({ mode: "text", body: "Oi" });
  });

  it("espera abaixo de 5 min sobe para o mínimo do motor", () => {
    const g = grafoDaTimeline([{ id: "e", tipo: "espera", duracaoMs: 1000 }]);
    const no = g.nodes.find((n) => n.id === "e");
    expect(no?.type === "wait" && no.config.mode === "fixed" && no.config.duration_ms).toBe(300_000);
  });

  it("régua vazia: gatilho direto para o fim", () => {
    const g = grafoDaTimeline([]);
    expect(g.nodes.map((n) => n.type)).toEqual(["trigger", "end"]);
    expect(timelineDoGrafo(g)).toEqual([]);
  });
});

describe("grafo que a lista não representa → null (vai para o editor avançado)", () => {
  it("ramificação", () => {
    const g = grafoDaTimeline(regua) as FlowGraph;
    g.edges.push({ id: "extra", source: "passo-1", target: "fim", priority: 1, condition: { type: "always" } });
    expect(timelineDoGrafo(g)).toBeNull();
  });

  it("nó que a lista não conhece (classificação por IA)", () => {
    const g = grafoDaTimeline([]) as FlowGraph;
    g.nodes.splice(1, 0, {
      id: "cls",
      type: "ai_classify",
      label: "Classificar",
      position: { x: 0, y: 1 },
      config: { classes: ["quente"], grace_timeout_ms: 900_000, target: "last_reply" },
    });
    g.edges = [
      { id: "a", source: "inicio", target: "cls", priority: 0, condition: { type: "always" } },
      { id: "b", source: "cls", target: "fim", priority: 0, condition: { type: "always" } },
    ];
    expect(timelineDoGrafo(g)).toBeNull();
  });

  it("nó solto fora do caminho", () => {
    const g = grafoDaTimeline(regua) as FlowGraph;
    g.nodes.push({ id: "solto", type: "end", label: "x", position: { x: 1, y: 1 }, config: { outcome: "converted" } });
    expect(timelineDoGrafo(g)).toBeNull();
  });
});

describe("ids de passo", () => {
  it("não repete id existente", () => {
    expect(novoIdDePasso(["passo-1", "passo-2"])).toBe("passo-3");
    expect(novoIdDePasso(["passo-3"])).toBe("passo-2");
    expect(novoIdDePasso(["passo-2", "passo-1"])).toBe("passo-3");
  });
});
