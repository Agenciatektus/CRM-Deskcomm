/**
 * Funil, etapas, responsável e período (migration 9051): a LISTA e a CONTAGEM leem a
 * mesma forma e aplicam o mesmo predicado. O banco prova o resto em
 * `tests/invariants/filtros-da-caixa-9051.test.ts`.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  aplicarFiltrosDoAtendimento,
  escolhaDaUrl,
  escreverFiltrosDoAtendimento,
  inicioDoPeriodo,
  lerFiltrosDoAtendimento,
  parametrosDaContagem,
} from "@/lib/inbox/filtros-do-atendimento";
import { listConversationsQuerySchema } from "@/lib/schemas";

const F = "11111111-1111-4111-8111-111111111111";
const E1 = "22222222-2222-4222-8222-222222222222";
const E2 = "33333333-3333-4333-8333-333333333333";
const U = "44444444-4444-4444-8444-444444444444";
const AGORA = Date.UTC(2026, 9, 13, 12, 0, 0);

/** Um builder falso que registra cada filtro, como o do supabase-js encadeia. */
function consulta() {
  const feitos: string[] = [];
  const q = {
    eq: (c: string, v: string) => (feitos.push(`eq ${c} ${v}`), q),
    is: (c: string, v: null) => (feitos.push(`is ${c} ${v}`), q),
    gte: (c: string, v: string) => (feitos.push(`gte ${c} ${v}`), q),
    filter: (c: string, o: string, v: string) => (feitos.push(`${o} ${c} ${v}`), q),
  };
  return { q, feitos };
}

describe("a URL: o que a tela escreve, a rota lê", () => {
  it("ida e volta pelos dois hooks e pela rota da lista", () => {
    const qs = new URLSearchParams();
    escreverFiltrosDoAtendimento(qs, { funil: F, etapas: [E1, E2], responsavel: U, periodo: "7d" });
    expect(qs.getAll("etapa")).toEqual([E1, E2]);
    expect(lerFiltrosDoAtendimento(qs)).toEqual({ funil: F, etapa: [E1, E2], responsavel: U, periodo: "7d" });
    const lista = listConversationsQuerySchema.parse({
      funil: qs.get("funil"),
      etapa: qs.getAll("etapa"),
      responsavel: qs.get("responsavel"),
      periodo: qs.get("periodo"),
    });
    expect(lista).toMatchObject({ funil: F, etapa: [E1, E2], responsavel: U, periodo: "7d" });
  });

  it("etapa sem funil não viaja (a tela só oferece etapa com funil)", () => {
    const qs = new URLSearchParams();
    escreverFiltrosDoAtendimento(qs, { etapas: [E1] });
    expect(qs.toString()).toBe("");
  });

  it("sem parâmetro, sem filtro: `getAll` vazio NÃO vira `ov.{}` (que não casa nada)", () => {
    expect(lerFiltrosDoAtendimento(new URLSearchParams())).toEqual({ etapa: undefined });
    expect(escolhaDaUrl(new URLSearchParams())).toBeUndefined();
  });

  it("valor inválido é recusado (a rota responde 422), e o link da tela o ignora", () => {
    expect(lerFiltrosDoAtendimento(new URLSearchParams("funil=x"))).toBeNull();
    expect(lerFiltrosDoAtendimento(new URLSearchParams("periodo=1ano"))).toBeNull();
    expect(escolhaDaUrl(new URLSearchParams("funil=x"))).toBeUndefined();
  });
});

describe("a lista e a contagem aplicam o MESMO filtro", () => {
  it("etapas decidem sozinhas; sem etapa, o funil", () => {
    const a = consulta();
    aplicarFiltrosDoAtendimento(a.q, { funil: F, etapa: [E1, E2] }, AGORA);
    expect(a.feitos).toEqual([`ov etapas_da_conversa {${E1},${E2}}`]);
    const b = consulta();
    aplicarFiltrosDoAtendimento(b.q, { funil: F }, AGORA);
    expect(b.feitos).toEqual([`cs funis_da_conversa {${F}}`]);
    expect(parametrosDaContagem({ funil: F, etapa: [E1, E2] }, AGORA)).toMatchObject({ p_funil: F, p_etapas: [E1, E2] });
  });

  it("responsável: id ou ninguém; período: o MESMO corte nas duas", () => {
    const a = consulta();
    aplicarFiltrosDoAtendimento(a.q, { responsavel: "ninguem", periodo: "24h" }, AGORA);
    const corte = inicioDoPeriodo("24h", AGORA);
    expect(corte).toBe("2026-10-12T12:00:00.000Z");
    expect(a.feitos).toEqual(["is assigned_to_user_id null", `gte last_message_at ${corte}`]);
    expect(parametrosDaContagem({ responsavel: "ninguem", periodo: "24h" }, AGORA)).toEqual({
      p_funil: null,
      p_etapas: null,
      p_responsavel: "ninguem",
      p_desde: corte,
    });
    const b = consulta();
    aplicarFiltrosDoAtendimento(b.q, { responsavel: U }, AGORA);
    expect(b.feitos).toEqual([`eq assigned_to_user_id ${U}`]);
  });

  it("CONTROLE: nada escolhido, nada aplicado", () => {
    const a = consulta();
    aplicarFiltrosDoAtendimento(a.q, {}, AGORA);
    expect(a.feitos).toEqual([]);
  });

  it("as duas rotas passam pela régua (e não por uma cópia)", () => {
    const semComentarios = (p: string) =>
      readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(semComentarios("app/api/v1/conversations/_handler.ts")).toMatch(/aplicarFiltrosDoAtendimento\(query, q\)/);
    expect(semComentarios("app/api/v1/conversations/counts/route.ts")).toMatch(/\.\.\.parametrosDaContagem\(atendimento\)/);
  });
});
