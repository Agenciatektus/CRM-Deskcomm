import { describe, expect, it } from "vitest";

import { alteracaoDaConducao } from "./alteracao";
import type { ConducaoDaCadencia } from "./settings";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const E1 = "33333333-3333-4333-8333-333333333333";
const E2 = "44444444-4444-4444-8444-444444444444";
const atendente: ConducaoDaCadencia = { quem_atende: "atendente" };
const ia = (extra: Partial<Extract<ConducaoDaCadencia, { quem_atende: "ia" }>> = {}): ConducaoDaCadencia => ({
  quem_atende: "ia",
  agent_id: A,
  preset: "qualificar",
  etapa_alvo_id: E1,
  modo: "assistido",
  ...extra,
});

describe("quem pode mudar o quê na condução", () => {
  it("controle: nada mudou", () => {
    expect(alteracaoDaConducao(ia(), ia())).toMatchObject({ mudou: false, exigeAdmin: false, campos: [] });
    expect(alteracaoDaConducao(atendente, atendente).mudou).toBe(false);
  });

  it("preset e etapa-alvo bastam manager", () => {
    const r = alteracaoDaConducao(ia(), ia({ preset: "vender", etapa_alvo_id: E2 }));
    expect(r).toMatchObject({ mudou: true, exigeAdmin: false });
    expect(r.campos.sort()).toEqual(["etapa_alvo_id", "preset"]);
  });

  it("automático → assistido basta manager; assistido → automático exige admin", () => {
    expect(alteracaoDaConducao(ia({ modo: "automatico" }), ia({ modo: "assistido" }))).toMatchObject({
      exigeAdmin: false,
      modoDe: "automatico",
      modoPara: "assistido",
    });
    expect(alteracaoDaConducao(ia({ modo: "assistido" }), ia({ modo: "automatico" }))).toMatchObject({
      exigeAdmin: true,
      modoDe: "assistido",
      modoPara: "automatico",
    });
  });

  it("agente, instrução e quem atende exigem admin", () => {
    expect(alteracaoDaConducao(ia(), ia({ agent_id: B })).exigeAdmin).toBe(true);
    expect(alteracaoDaConducao(ia(), ia({ instrucao: "Seja breve" })).exigeAdmin).toBe(true);
    expect(alteracaoDaConducao(atendente, ia()).exigeAdmin).toBe(true);
    expect(alteracaoDaConducao(ia(), atendente)).toMatchObject({ exigeAdmin: true, campos: ["quem_atende"] });
  });

  it("instrução só com espaços em volta não conta como mudança", () => {
    expect(alteracaoDaConducao(ia({ instrucao: "Oi" }), ia({ instrucao: "  Oi " })).mudou).toBe(false);
    expect(alteracaoDaConducao(ia(), ia({ instrucao: "" })).mudou).toBe(false);
  });
});
