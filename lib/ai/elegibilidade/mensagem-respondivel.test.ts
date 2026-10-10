import { describe, expect, it } from "vitest";

import { mensagemPedeResposta, SQL_MENSAGEM_PEDE_RESPOSTA } from "./mensagem-respondivel";

describe("a mensagem recebida pede resposta da IA?", () => {
  it("texto normal pede (controle: a guarda não calou a IA)", () => {
    expect(mensagemPedeResposta({ type: "text", body: "qual o preço?" })).toEqual({ pede: true });
  });

  it("reação não pede, mesmo com o emoji no corpo", () => {
    expect(mensagemPedeResposta({ type: "reaction", body: "👍" })).toEqual({ pede: false, motivo: "reacao" });
  });

  it("sem texto e sem mídia (tipo não suportado, enquete cifrada, linha vazia) não pede", () => {
    expect(mensagemPedeResposta({ type: "text", body: null })).toEqual({ pede: false, motivo: "sem_conteudo" });
    expect(mensagemPedeResposta({ type: "text", body: "   " })).toEqual({ pede: false, motivo: "sem_conteudo" });
  });

  it("mídia sem legenda pede: a derivação vira texto", () => {
    expect(mensagemPedeResposta({ type: "audio", body: null, media_storage_path: "o/c/a.ogg" })).toEqual({ pede: true });
    expect(mensagemPedeResposta({ type: "image", body: null, media_url: "https://x/y" })).toEqual({ pede: true });
  });

  it("localização e contato chegam com corpo e pedem", () => {
    expect(mensagemPedeResposta({ type: "location", body: "📍 https://maps.google.com/?q=1,2" }).pede).toBe(true);
    expect(mensagemPedeResposta({ type: "contact", body: "BEGIN:VCARD\nFN:A\nEND:VCARD" }).pede).toBe(true);
  });

  it("a versão SQL cobre as mesmas condições", () => {
    expect(SQL_MENSAGEM_PEDE_RESPOSTA).toContain("type <> 'reaction'");
    expect(SQL_MENSAGEM_PEDE_RESPOSTA).toContain("btrim(body)");
    expect(SQL_MENSAGEM_PEDE_RESPOSTA).toContain("media_url is not null");
    expect(SQL_MENSAGEM_PEDE_RESPOSTA).toContain("media_storage_path is not null");
  });
});
