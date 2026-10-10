import { describe, expect, it, vi } from "vitest";

import { destinoDoLead } from "@/components/shell/paleta/lead";

import { type LeadAchado, termoDaBuscaDeLeads } from "./busca-de-leads";

vi.mock("@/components/inbox/painel/useAbaDoPainel", () => ({ escolherAbaDoPainel: vi.fn() }));

describe("o termo da busca de leads", () => {
  it("escapa os curingas do ilike e neutraliza a gramática do or=", () => {
    expect(termoDaBuscaDeLeads("100% certo")).toContain("\\%");
    expect(termoDaBuscaDeLeads("ana_maria")).toContain("\\_");
    expect(termoDaBuscaDeLeads("Silva, João")).not.toMatch(/[,()]/);
  });

  it("recusa o curto demais e o acima de 100 caracteres", () => {
    expect(termoDaBuscaDeLeads("a")).toBeNull();
    expect(termoDaBuscaDeLeads("((")).toBeNull();
    expect(termoDaBuscaDeLeads("a".repeat(101))).toBeNull();
  });

  it("CONTROLE: o termo comum passa", () => {
    expect(termoDaBuscaDeLeads("orçamento")).toBe("orçamento");
    expect(termoDaBuscaDeLeads("a".repeat(100))).toBe("a".repeat(100));
  });
});

describe("para onde o lead achado leva", () => {
  const lead: LeadAchado = {
    id: "lead-1",
    title: "Clareamento",
    status: "open",
    pipeline_id: "funil-1",
    contact_id: "contato-1",
    pipeline: { name: "Vendas" },
    stage: { name: "Proposta" },
    contato: null,
    conversa: null,
  };

  it("com conversa: a Inbox, na aba da lista em que a conversa aparece", () => {
    expect(destinoDoLead({ ...lead, conversa: { id: "conv-1", status: "open" } })).toBe(
      "/app/inbox?filter=all&id=conv-1",
    );
    expect(destinoDoLead({ ...lead, conversa: { id: "conv-2", status: "closed" } })).toBe(
      "/app/inbox?filter=closed&id=conv-2",
    );
  });

  it("sem conversa: o quadro do funil com o dossiê do lead", () => {
    expect(destinoDoLead(lead)).toBe("/app/pipelines/funil-1?lead=lead-1");
  });
});
