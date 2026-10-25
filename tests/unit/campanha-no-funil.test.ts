/**
 * A CAMPANHA DE ANÚNCIO APARECE E FILTRA NO FUNIL.
 *
 * O quadro lê só dois campos do jsonb do contato (por alias, sem trazer o bloco
 * inteiro do anúncio), os anexa ao lead, e o filtro por campanha segue o padrão do
 * filtro de canal: URL, predicado puro.
 */
import { describe, expect, it } from "vitest";

import { anexarDadosDoContato } from "@/lib/kanban/dados-do-contato";
import { applyFilters, filtersToParams, filtersFromParams } from "@/lib/kanban/filters";
import type { Lead } from "@/lib/types/leads";

const lead = (id: string, contact_id: string, extra: Partial<Lead> = {}): Lead =>
  ({ id, contact_id, status: "open", source: "whatsapp", ...extra }) as Lead;

describe("anexarDadosDoContato: campanha e anúncio", () => {
  const contato = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    phone_number: null,
    email: null,
    custom_fields: null,
    is_anonymized: false,
    ...extra,
  });

  it("anexa o nome da campanha e do anúncio ao lead do contato", () => {
    const r = anexarDadosDoContato(
      [lead("l1", "c1")],
      [contato("c1", { campanha_nome: "03 - [TEKTUS] CTWA", anuncio_nome: "OMBRO | VID" })],
    );
    expect(r[0]).toMatchObject({ contact_campanha: "03 - [TEKTUS] CTWA", contact_anuncio: "OMBRO | VID" });
  });

  it("sem nome (ou só espaço) não escreve a chave", () => {
    const r = anexarDadosDoContato([lead("l1", "c1")], [contato("c1", { campanha_nome: "   ", anuncio_nome: null, phone_number: "+5566999910216" })]);
    expect(r[0]).not.toHaveProperty("contact_campanha");
    expect(r[0]).not.toHaveProperty("contact_anuncio");
  });

  it("contato anonimizado não reaparece com a campanha no card", () => {
    const r = anexarDadosDoContato([lead("l1", "c1")], [contato("c1", { is_anonymized: true, campanha_nome: "Camp" })]);
    expect(r[0]).not.toHaveProperty("contact_campanha");
  });

  it("corta nome enorme", () => {
    const r = anexarDadosDoContato([lead("l1", "c1")], [contato("c1", { campanha_nome: "x".repeat(900) })]);
    expect(r[0]?.contact_campanha).toHaveLength(160);
  });
});

describe("filtro por campanha", () => {
  const leads = [
    lead("a", "c1", { contact_campanha: "Camp A" }),
    lead("b", "c2", { contact_campanha: "Camp B" }),
    lead("c", "c3"),
  ];

  it("filtra por uma ou mais campanhas (OU) e ignora quem não tem campanha", () => {
    expect(applyFilters(leads, { campanhas: ["Camp A"], status: "all" }).map((l) => l.id)).toEqual(["a"]);
    expect(applyFilters(leads, { campanhas: ["Camp A", "Camp B"], status: "all" }).map((l) => l.id)).toEqual(["a", "b"]);
  });

  it("sem filtro, ninguém sai", () => {
    expect(applyFilters(leads, { status: "all" })).toHaveLength(3);
  });

  it("vai e volta pela URL, com nome que tem espaço, colchete e barra", () => {
    const nome = "03 - [TEKTUS] [FUNDO -> CTWA] | 15/07/2026";
    const qs = filtersToParams({ campanhas: [nome, "Outra"] });
    const volta = filtersFromParams(new URLSearchParams(qs));
    expect(volta.campanhas).toEqual([nome, "Outra"]);
  });
});
