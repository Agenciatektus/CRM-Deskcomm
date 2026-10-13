import { describe, expect, it } from "vitest";

import { colunaDaOrdem, ordenarPorColuna } from "@/lib/kanban/colunas-da-lista";
import { applyFilters, filtersFromParams, filtersToParams } from "@/lib/kanban/filters";
import { comparadorDoFunil, esperandoDesdeDaConversa, tomDaEsperaDoFunil } from "@/lib/kanban/ordem-do-funil";
import { origemDoLead, passaNaBusca, resumoDoRecorte } from "@/lib/kanban/recorte-do-funil";
import type { Lead } from "@/lib/types/leads";

/** Barra do Funil aprovada pelo Peterson (board "Barra do Funil", 13/10/2026). */
const AGORA = new Date("2026-10-13T15:00:00Z");
const h = (horas: number) => new Date(AGORA.getTime() - horas * 3_600_000).toISOString();

function lead(p: Partial<Lead> & { id: string }): Lead {
  return {
    title: "Negócio",
    description: null,
    status: "open",
    stage_id: "s1",
    position_in_stage: 1,
    value_cents: null,
    currency: "BRL",
    owner_user_id: null,
    owner_agent_id: null,
    owner_kind: null,
    tags: [],
    source: "manual",
    created_at: h(1),
    stage_changed_at: h(1),
    ...p,
  } as Lead;
}

describe("busca por gente", () => {
  const ana = lead({ id: "a", title: "Cozinha", contact_name: "Ana Paula", contact_phone: "+5511984312207", contact_instagram: "pati.gomes" });
  it("acha por nome, título, @ com ou sem arroba", () => {
    for (const termo of ["ana", "COZINHA", "@pati", "pati.gomes"]) expect(passaNaBusca(ana, termo), termo).toBe(true);
    expect(passaNaBusca(ana, "marcos")).toBe(false);
  });
  it("acha telefone com máscara, com e sem 55; 3 dígitos não bastam", () => {
    for (const termo of ["(11) 98431-2207", "11984312207", "55 11 98431", "2207"]) expect(passaNaBusca(ana, termo), termo).toBe(true);
    expect(passaNaBusca(ana, "984")).toBe(false);
  });
});

describe("filtros na URL", () => {
  it("o PADRÃO é Abertos; Todos vai explícito", () => {
    expect(filtersFromParams(new URLSearchParams("")).status).toBe("open");
    expect(filtersFromParams(new URLSearchParams("status=all")).status).toBe("all");
    expect(filtersToParams({ status: "open" })).toBe("");
    expect(filtersToParams({ status: "all" })).toBe("status=all");
  });
  it("atalhos, canais, período e valor sobrevivem à ida e volta", () => {
    const f = { status: "open" as const, meus: true, semPasso: true, parados: true, overdueOnly: true, canais: ["whatsapp", "direct"], periodo: "30d" as const, valueCentsMin: 500_000, valueCentsMax: 1_500_000 };
    expect(filtersFromParams(new URLSearchParams(filtersToParams(f)))).toMatchObject(f);
  });
});

describe("atalhos e filtros do recorte", () => {
  const limite = (id: string) => (id === "s1" ? 24 : null);
  const ctx = { userId: "eu", limiteDaEtapa: limite, agora: AGORA };
  const leads = [
    lead({ id: "atrasado", owner_user_id: "eu", proximo_passo: { titulo: "Ligar", prazo: h(2) } }),
    lead({ id: "sem-passo", proximo_passo: null, stage_changed_at: h(48) }),
    lead({ id: "nao-carregou", stage_changed_at: h(2) }),
    lead({ id: "ganho", status: "won", proximo_passo: null }),
  ];
  const ids = (f: Parameters<typeof applyFilters>[1]) => applyFilters(leads, f, ctx).map((l) => l.id);
  it("Atrasados é próximo passo vencido; Sem próximo passo exige saber (null, não undefined)", () => {
    expect(ids({ status: "open", overdueOnly: true })).toEqual(["atrasado"]);
    expect(ids({ status: "open", semPasso: true })).toEqual(["sem-passo"]);
  });
  it("Meus usa quem olha; Parados usa expected_duration_hours", () => {
    expect(ids({ status: "open", meus: true })).toEqual(["atrasado"]);
    expect(ids({ status: "open", parados: true })).toEqual(["sem-passo"]);
    expect(applyFilters(leads, { status: "open", meus: true }, { agora: AGORA })).toEqual([]);
  });
  it("status padrão esconde ganho; canal e período filtram", () => {
    expect(ids({ status: "open" })).not.toContain("ganho");
    const wpp = lead({ id: "w", source: "whatsapp", created_at: h(24 * 40) });
    expect(applyFilters([wpp, leads[0]!], { canais: ["whatsapp"] }, ctx).map((l) => l.id)).toEqual(["w"]);
    expect(applyFilters([wpp, leads[0]!], { periodo: "30d" }, ctx).map((l) => l.id)).toEqual(["atrasado"]);
    expect(origemDoLead(wpp)).toBe("whatsapp");
  });
  it("o resumo conta abertos, soma e atrasados do recorte", () => {
    const r = resumoDoRecorte([lead({ id: "x", value_cents: 1000, proximo_passo: { titulo: "a", prazo: h(1) } }), lead({ id: "y", value_cents: 500 })], AGORA);
    expect(r).toMatchObject({ abertos: 2, centavos: 1500, atrasados: 1 });
  });
});

describe("Ordenar", () => {
  const conversa = (esperando_desde: string | null) => ({ id: "c", preview: null, last_message_at: null, unread: 0, esperando_desde });
  it("Esperando resposta: quem espera há mais tempo primeiro; quem não espera vai para o fim pela posição", () => {
    const leads = [
      lead({ id: "respondido", position_in_stage: 1, conversa: conversa(null) }),
      lead({ id: "1h", position_in_stage: 2, conversa: conversa(h(1)) }),
      lead({ id: "5h", position_in_stage: 3, conversa: conversa(h(5)) }),
    ];
    expect([...leads].sort(comparadorDoFunil("esperando")).map((l) => l.id)).toEqual(["5h", "1h", "respondido"]);
  });
  it("Maior valor manda sem valor para o fim; urgente põe o atrasado primeiro", () => {
    const leads = [
      lead({ id: "zero", value_cents: 0, position_in_stage: 1 }),
      lead({ id: "alto", value_cents: 900, proximo_passo: { titulo: "a", prazo: h(-5) } }),
      lead({ id: "baixo", value_cents: 100, proximo_passo: { titulo: "a", prazo: h(3) } }),
    ];
    expect([...leads].sort(comparadorDoFunil("valor")).map((l) => l.id)).toEqual(["alto", "baixo", "zero"]);
    expect([...leads].sort(comparadorDoFunil("urgente")).map((l) => l.id)).toEqual(["baixo", "alto", "zero"]);
  });
  it("a espera é a régua da Fila: só quando a última palavra é do cliente", () => {
    expect(esperandoDesdeDaConversa({ awaiting_since: h(3), last_inbound_at: h(1), last_outbound_at: h(4) })).toBe(h(3));
    expect(esperandoDesdeDaConversa({ awaiting_since: h(3), last_inbound_at: h(3), last_outbound_at: h(1) })).toBeNull();
  });
  it("faixas do Esperando há: até 1 h azul, até 4 h âmbar, acima vermelho", () => {
    expect(tomDaEsperaDoFunil(h(0.9), AGORA)).toBe("info");
    expect(tomDaEsperaDoFunil(h(3), AGORA)).toBe("warn");
    expect(tomDaEsperaDoFunil(h(4.5), AGORA)).toBe("crit");
  });
  it("a Lista ordena por coluna e o aria-sort padrão segue o menu", () => {
    const leads = [lead({ id: "b", contact_name: "Bia" }), lead({ id: "a", contact_name: "Ana" })];
    const ctx = { posicaoDaEtapa: () => 0, nomeDoDono: () => "" };
    expect(ordenarPorColuna(leads, "nome", "asc", ctx).map((l) => l.id)).toEqual(["a", "b"]);
    expect(colunaDaOrdem("esperando")).toEqual({ coluna: "esperando", sentido: "desc" });
    expect(colunaDaOrdem("recentes")).toBeNull();
  });
});
