/**
 * O CANAL VERDASH LÊ DE QUAL ANÚNCIO A CONVERSA VEIO.
 *
 * Até aqui este canal descartava o `externalAdReply`, e os 6.180 contatos de
 * produção tinham zero marca de anúncio. Os casos cobrem os dois formatos do
 * FZAP (bloco dentro do tipo da mensagem, v1.27+, e `Source`, v1.22), a prévia
 * de link que NÃO é anúncio e a miniatura em bytes que não pode ir para o jsonb.
 */
import { describe, expect, it } from "vitest";

import { extrairAtribuicaoVerdash } from "@/lib/channels/verdash/atribuicao-de-anuncio";

const BLOCO = {
  title: "Clareamento a laser",
  body: "Agende sua avaliação",
  sourceType: "ad",
  sourceID: "120210000000001",
  sourceURL: "https://fb.me/abc",
  ctwaClid: "AfDcLiCk123",
  thumbnail: "QUJD".repeat(5000),
};

const v127 = (bloco: unknown) => ({
  type: "Message",
  event: { Info: { ID: "m1" }, Message: { extendedTextMessage: { text: "oi", contextInfo: { externalAdReply: bloco } } } },
});

describe("extrairAtribuicaoVerdash", () => {
  it("lê clique, anúncio, título e link do bloco dentro do tipo da mensagem", () => {
    const r = extrairAtribuicaoVerdash(v127(BLOCO));
    expect(r).toMatchObject({
      plataforma: "meta_ads",
      sourceId: "AfDcLiCk123",
      adId: "120210000000001",
      titulo: "Clareamento a laser",
      sourceUrl: "https://fb.me/abc",
    });
  });

  it("acha o bloco no formato antigo (Source.AdReplyInfo)", () => {
    const r = extrairAtribuicaoVerdash({
      type: "Message",
      event: { Info: { ID: "m1" }, Source: { AdReplyInfo: { Title: "X", CtwaClid: "C1", SourceType: "ad" } } },
    });
    expect(r?.sourceId).toBe("C1");
    expect(r?.titulo).toBe("X");
  });

  it("não guarda a miniatura no que fica como prova", () => {
    const r = extrairAtribuicaoVerdash(v127(BLOCO));
    expect(r?.bruto).not.toHaveProperty("thumbnail");
    expect(JSON.stringify(r?.bruto).length).toBeLessThan(2000);
  });

  it("aceita anúncio sem clique quando o WhatsApp carimba sourceType=ad", () => {
    const r = extrairAtribuicaoVerdash(v127({ title: "T", sourceType: "ad" }));
    expect(r).not.toBeNull();
    expect(r?.sourceId).toBeNull();
  });

  it("prévia de link comum (sem clique e sem sourceType=ad) NÃO é anúncio", () => {
    expect(extrairAtribuicaoVerdash(v127({ title: "Artigo", sourceType: "post", sourceURL: "https://x.com" }))).toBeNull();
  });

  it("mensagem sem bloco devolve null", () => {
    expect(extrairAtribuicaoVerdash({ type: "Message", event: { Info: { ID: "m1" }, Message: { conversation: "oi" } } })).toBeNull();
    expect(extrairAtribuicaoVerdash(null)).toBeNull();
  });
});
