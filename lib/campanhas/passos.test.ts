import { describe, expect, it } from "vitest";

import { ESPERA_MAXIMA_MS, ESPERA_MINIMA_MS, type PassoDaRegua } from "@/lib/regua/timeline";

import {
  MAX_PASSOS_DA_CAMPANHA,
  passosDaCampanhaSchema,
  passosGuardados,
  problemaNosPassos,
} from "./passos";

const FUNIL = "11111111-1111-4111-8111-111111111111";
const ETAPA = "22222222-2222-4222-8222-222222222222";

const mensagem = (id = "passo-1", variantes = ["Oi {{nome}}"]): PassoDaRegua => ({
  id,
  tipo: "mensagem",
  variantes,
});

describe("passosDaCampanhaSchema", () => {
  it("aceita a régua típica: espera, mensagem, mover de etapa, etiqueta", () => {
    const r = passosDaCampanhaSchema.safeParse([
      { id: "passo-1", tipo: "espera", duracaoMs: 24 * 3_600_000 },
      { id: "passo-2", tipo: "mensagem", variantes: ["Passou por aqui?", "Conseguiu ver?"] },
      { id: "passo-3", tipo: "mover_etapa", stageId: ETAPA },
      { id: "passo-4", tipo: "etiqueta", op: "add", tag: "sem-resposta" },
    ]);
    expect(r.success).toBe(true);
  });

  it("recusa espera fora das bordas que o motor aceita", () => {
    expect(
      passosDaCampanhaSchema.safeParse([{ id: "p", tipo: "espera", duracaoMs: ESPERA_MINIMA_MS - 1 }]).success,
    ).toBe(false);
    expect(
      passosDaCampanhaSchema.safeParse([{ id: "p", tipo: "espera", duracaoMs: ESPERA_MAXIMA_MS + 1 }]).success,
    ).toBe(false);
    // As bordas EXATAS passam: o operador que digita 90 dias não vê erro.
    expect(
      passosDaCampanhaSchema.safeParse([{ id: "p", tipo: "espera", duracaoMs: ESPERA_MAXIMA_MS }]).success,
    ).toBe(true);
  });

  it("recusa id que viraria aresta ilegível no grafo", () => {
    // As arestas são montadas por concatenação (`a->b`): um id com seta produz
    // grafo que `timelineDoGrafo` não consegue ler de volta.
    expect(passosDaCampanhaSchema.safeParse([mensagem("a->b")]).success).toBe(false);
    expect(passosDaCampanhaSchema.safeParse([mensagem("passo 1")]).success).toBe(false);
  });

  it("recusa dois passos com o mesmo id", () => {
    const r = passosDaCampanhaSchema.safeParse([mensagem("passo-1"), mensagem("passo-1", ["Outro"])]);
    expect(r.success).toBe(false);
  });

  it("recusa spintax que não fecha", () => {
    expect(passosDaCampanhaSchema.safeParse([mensagem("p", ["Oi {a|b"])]).success).toBe(false);
  });

  it("recusa mais passos do que o teto", () => {
    const muitos = Array.from({ length: MAX_PASSOS_DA_CAMPANHA + 1 }, (_, i) => mensagem(`passo-${i}`));
    expect(passosDaCampanhaSchema.safeParse(muitos).success).toBe(false);
  });
});

describe("passosGuardados", () => {
  it("devolve lista vazia para jsonb inválido em vez de lançar", () => {
    // Campanha sem passos é estado legítimo: falhar aqui pararia o ENVIO da 1ª
    // mensagem por causa de um passo mal gravado.
    expect(passosGuardados(null)).toEqual([]);
    expect(passosGuardados(undefined)).toEqual([]);
    expect(passosGuardados("nada disso")).toEqual([]);
    expect(passosGuardados([{ id: "p", tipo: "inventado" }])).toEqual([]);
  });

  it("devolve a lista quando ela é válida", () => {
    expect(passosGuardados([mensagem()])).toEqual([mensagem()]);
  });
});

describe("problemaNosPassos", () => {
  it("campanha SEM passos não exige funil", () => {
    expect(problemaNosPassos([], { pipelineId: null })).toBeNull();
  });

  it("campanha COM passos exige funil", () => {
    const problema = problemaNosPassos([mensagem()], { pipelineId: null });
    expect(problema).toContain("funil");
  });

  it("aceita a régua completa com funil", () => {
    expect(
      problemaNosPassos([{ id: "p1", tipo: "espera", duracaoMs: 86_400_000 }, mensagem("p2")], {
        pipelineId: FUNIL,
      }),
    ).toBeNull();
  });

  it("recusa régua sem nenhuma mensagem", () => {
    const problema = problemaNosPassos(
      [
        { id: "p1", tipo: "espera", duracaoMs: 86_400_000 },
        { id: "p2", tipo: "etiqueta", op: "add", tag: "x" },
      ],
      { pipelineId: FUNIL },
    );
    expect(problema).toContain("pelo menos uma mensagem");
  });

  it("recusa mensagem em branco citando o número do passo", () => {
    const problema = problemaNosPassos([mensagem("p1", ["Oi"]), mensagem("p2", ["   "])], {
      pipelineId: FUNIL,
    });
    expect(problema).toBe("Passo 2: escreva a mensagem.");
  });

  it("recusa mover de etapa sem etapa escolhida", () => {
    const problema = problemaNosPassos([mensagem("p1"), { id: "p2", tipo: "mover_etapa", stageId: " " }], {
      pipelineId: FUNIL,
    });
    expect(problema).toBe("Passo 2: escolha a etapa de destino.");
  });

  it("recusa etiqueta sem texto", () => {
    const problema = problemaNosPassos([mensagem("p1"), { id: "p2", tipo: "etiqueta", op: "add", tag: " " }], {
      pipelineId: FUNIL,
    });
    expect(problema).toBe("Passo 2: escreva a etiqueta.");
  });

  it("recusa spintax quebrado apontando passo e variação", () => {
    const problema = problemaNosPassos([mensagem("p1", ["Oi", "Olá {a|b"])], { pipelineId: FUNIL });
    expect(problema).toBe("Passo 1, variação 2: o {a|b} não fecha.");
  });
});
