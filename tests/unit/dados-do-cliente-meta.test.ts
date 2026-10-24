/**
 * OS DADOS DO CLIENTE QUE SOBEM A NOTA DE CORRESPONDÊNCIA DA META.
 *
 * Normalização no formato que a Meta exige (ela recusa em silêncio o que vem
 * fora dele) e extração do cadastro. O nome do WhatsApp é a fonte pior: emoji,
 * número e apelido são a regra.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { INTERNOS, transporteMeta } from "@/lib/plataformas-de-anuncio/meta/conversions";
import type { ConversaoOffline } from "@/lib/plataformas-de-anuncio/types";

import { dadosDoClienteDe, separarNome } from "@/lib/plataformas-de-anuncio/meta/dados-do-cliente";

const base = {
  id: "c-1",
  name: "Maria da Silva",
  display_name: null,
  email_normalized: "maria@exemplo.com",
  birthdate: "1990-09-14",
  phone_number: "+5566984135718",
};

describe("separarNome", () => {
  it("primeiro nome e último sobrenome, minúsculos", () => {
    expect(separarNome("Maria da Silva")).toEqual({ primeiroNome: "maria", sobrenome: "silva" });
  });
  it("tira emoji, número e pontuação do nome do WhatsApp", () => {
    expect(separarNome("João 🔥 Farias 123!")).toEqual({ primeiroNome: "joão", sobrenome: "farias" });
  });
  it("uma palavra só não inventa sobrenome", () => {
    expect(separarNome("Mah")).toEqual({ primeiroNome: "mah", sobrenome: null });
  });
  it("iniciais soltas não são sobrenome", () => {
    expect(separarNome("Ana C.")).toEqual({ primeiroNome: "ana", sobrenome: null });
  });
  it("vazio e só-emoji viram nada", () => {
    expect(separarNome(null)).toEqual({ primeiroNome: null, sobrenome: null });
    expect(separarNome("🔥🔥")).toEqual({ primeiroNome: null, sobrenome: null });
  });
});

describe("dadosDoClienteDe", () => {
  it("monta tudo do cadastro completo", () => {
    expect(dadosDoClienteDe(base)).toEqual({
      externalId: "c-1",
      email: "maria@exemplo.com",
      primeiroNome: "maria",
      sobrenome: "silva",
      nascimento: "19900914",
      pais: "br",
    });
  });
  it("e-mail malformado não vai", () => {
    expect(dadosDoClienteDe({ ...base, email_normalized: "isso nao e email" }).email).toBeNull();
  });
  it("país só quando o telefone é brasileiro", () => {
    expect(dadosDoClienteDe({ ...base, phone_number: "+14155550100" }).pais).toBeNull();
    expect(dadosDoClienteDe({ ...base, phone_number: null }).pais).toBeNull();
  });
  it("usa o display_name quando falta o name", () => {
    expect(dadosDoClienteDe({ ...base, name: null, display_name: "Joana Prado" }).sobrenome).toBe("prado");
  });
  it("sem nascimento nem e-mail, o resto segue", () => {
    const d = dadosDoClienteDe({ ...base, birthdate: null, email_normalized: null });
    expect(d.nascimento).toBeNull();
    expect(d.email).toBeNull();
    expect(d.externalId).toBe("c-1");
  });
});

describe("o que vai ao fio", () => {
  afterEach(() => vi.restoreAllMocks());

  const conversao = (dadosDoCliente: ConversaoOffline["dadosDoCliente"]): ConversaoOffline => ({
    organizationId: "o",
    leadId: "l",
    evento: "Purchase",
    eventoId: "l:Purchase",
    ocorridoEm: new Date(),
    cliqueDeOrigem: "CLIQUE",
    telefone: "5566984135718",
    dadosDoCliente,
    valorCentavos: 10000,
    moeda: "BRL",
  });

  async function userDataEnviado(c: ConversaoOffline): Promise<Record<string, unknown>> {
    let corpo = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_u, init) => {
      corpo = String((init as RequestInit).body);
      return new Response('{"events_received":1}', { status: 200 });
    });
    const r = await transporteMeta.enviar({ datasetId: "1", accessToken: "t" } as never, c);
    expect(r.tipo).toBe("ok");
    return JSON.parse(corpo).data[0].user_data;
  }

  it("manda e-mail, nome, nascimento, país e id do contato, todos em hash", async () => {
    const u = await userDataEnviado(conversao(dadosDoClienteDe(base)));
    expect(u.em).toEqual([INTERNOS.hash("maria@exemplo.com")]);
    expect(u.fn).toEqual([INTERNOS.hash("maria")]);
    expect(u.ln).toEqual([INTERNOS.hash("silva")]);
    expect(u.db).toEqual([INTERNOS.hash("19900914")]);
    expect(u.country).toEqual([INTERNOS.hash("br")]);
    expect(u.external_id).toEqual([INTERNOS.hash("c-1")]);
    expect(u.ph).toEqual([INTERNOS.hash("5566984135718")]);
    // Nada em claro além do clique: a Meta exige hash para dado pessoal.
    expect(JSON.stringify(u)).not.toContain("maria");
    expect(JSON.stringify(u)).not.toContain("exemplo.com");
  });

  it("sem cadastro, o envio sai como antes (clique + telefone)", async () => {
    const u = await userDataEnviado(conversao(undefined));
    expect(Object.keys(u).sort()).toEqual(["ctwa_clid", "ph"]);
  });
});
