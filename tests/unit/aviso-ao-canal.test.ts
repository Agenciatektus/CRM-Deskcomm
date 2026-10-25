import { describe, expect, it } from "vitest";

import { montarAvisoDeConversoes } from "@/lib/conversoes/aviso-ao-canal";

const conexao = { habilitada: true, datasetId: "123456789012345", temToken: true };
const semHistorico = { enviados: 0, erros: 0 };

describe("montarAvisoDeConversoes", () => {
  it("saudável: ativo, com Purchase e os eventos das regras ativas (sem repetir)", () => {
    const a = montarAvisoDeConversoes({
      conexao,
      regras: [
        { enabled: true, metaEvent: "LeadSubmitted" },
        { enabled: true, metaEvent: "LeadSubmitted" },
        { enabled: false, metaEvent: "QualifiedLead" },
      ],
      historico: { enviados: 5, erros: 1 },
    });
    expect(a).toEqual({
      ativo: true,
      pixel_id: "123456789012345",
      eventos: ["Purchase", "LeadSubmitted"],
    });
  });

  it("sem nenhuma regra, a venda sempre vai como Purchase", () => {
    expect(montarAvisoDeConversoes({ conexao, regras: [], historico: semHistorico })).toEqual({
      ativo: true,
      pixel_id: "123456789012345",
      eventos: ["Purchase"],
    });
  });

  it("sem conexão, desligada, sem dataset ou sem credencial: inativo", () => {
    const base = { regras: [], historico: semHistorico };
    expect(montarAvisoDeConversoes({ ...base, conexao: null })).toEqual({ ativo: false });
    expect(montarAvisoDeConversoes({ ...base, conexao: { ...conexao, habilitada: false } })).toEqual({ ativo: false });
    expect(montarAvisoDeConversoes({ ...base, conexao: { ...conexao, datasetId: null } })).toEqual({ ativo: false });
    expect(montarAvisoDeConversoes({ ...base, conexao: { ...conexao, temToken: false } })).toEqual({ ativo: false });
  });

  it("dataset fora do padrão de dígitos: inativo", () => {
    expect(
      montarAvisoDeConversoes({ conexao: { ...conexao, datasetId: "12ab" }, regras: [], historico: semHistorico }),
    ).toEqual({ ativo: false });
  });

  it("erros recentes e nenhum envio: inativo", () => {
    expect(montarAvisoDeConversoes({ conexao, regras: [], historico: { enviados: 0, erros: 2 } })).toEqual({ ativo: false });
  });

  it("erro, mas com envio recente: ativo", () => {
    expect(montarAvisoDeConversoes({ conexao, regras: [], historico: { enviados: 1, erros: 9 } }).ativo).toBe(true);
  });

  it("evento fora do vocabulário (não só letras) não entra; lista vazia não existe porque Purchase fica", () => {
    const a = montarAvisoDeConversoes({
      conexao,
      regras: [{ enabled: true, metaEvent: "Evento_Estranho1" }],
      historico: semHistorico,
    });
    expect(a).toEqual({ ativo: true, pixel_id: "123456789012345", eventos: ["Purchase"] });
  });
});
