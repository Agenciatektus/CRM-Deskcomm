import { describe, expect, it } from "vitest";

import { montarAvisoDeConversoes } from "@/lib/conversoes/aviso-ao-canal";

const conexao = { habilitada: true, datasetId: "123456789012345", temToken: true, testEventCode: null };
const saudavel = {
  enviados: 5,
  erros: 1,
  ultimoEnvio: "sent" as const,
  credencialQuebradaDepoisDoUltimoSent: false,
};
const semHistorico = { enviados: 0, erros: 0, ultimoEnvio: null, credencialQuebradaDepoisDoUltimoSent: false };
const inativo = { ativo: false };

describe("montarAvisoDeConversoes", () => {
  it("saudável: ativo, declarando só Purchase", () => {
    expect(montarAvisoDeConversoes({ conexao, historico: saudavel })).toEqual({
      ativo: true,
      pixel_id: "123456789012345",
      eventos: ["Purchase"],
    });
  });

  it("sem conexão, desligada, sem dataset ou sem credencial: inativo", () => {
    const historico = saudavel;
    expect(montarAvisoDeConversoes({ historico, conexao: null })).toEqual(inativo);
    expect(montarAvisoDeConversoes({ historico, conexao: { ...conexao, habilitada: false } })).toEqual(inativo);
    expect(montarAvisoDeConversoes({ historico, conexao: { ...conexao, datasetId: null } })).toEqual(inativo);
    expect(montarAvisoDeConversoes({ historico, conexao: { ...conexao, temToken: false } })).toEqual(inativo);
  });

  it("dataset fora do padrão de dígitos: inativo", () => {
    expect(montarAvisoDeConversoes({ conexao: { ...conexao, datasetId: "12ab" }, historico: saudavel })).toEqual(inativo);
  });

  it("modo de teste (testEventCode): inativo", () => {
    expect(
      montarAvisoDeConversoes({ conexao: { ...conexao, testEventCode: "TEST123" }, historico: saudavel }),
    ).toEqual(inativo);
  });

  it("histórico 0/0: sem prova de envio, inativo", () => {
    expect(montarAvisoDeConversoes({ conexao, historico: semHistorico })).toEqual(inativo);
  });

  it("último envio `error` depois de um `sent`: inativo", () => {
    expect(
      montarAvisoDeConversoes({ conexao, historico: { ...saudavel, enviados: 3, erros: 1, ultimoEnvio: "error" } }),
    ).toEqual(inativo);
  });

  it("só erro, nenhum envio: inativo", () => {
    expect(
      montarAvisoDeConversoes({ conexao, historico: { ...semHistorico, erros: 2, ultimoEnvio: "error" } }),
    ).toEqual(inativo);
  });

  it("falha de credencial depois do último `sent`: inativo", () => {
    expect(
      montarAvisoDeConversoes({ conexao, historico: { ...saudavel, credencialQuebradaDepoisDoUltimoSent: true } }),
    ).toEqual(inativo);
  });
});
