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

  it("lê o formato REAL de produção (bloco medido em webhook_events_log, 24/10/2026)", () => {
    // Campos idênticos ao arquivado: 695 de 720 payloads com anúncio trazem ctwaClid.
    const real = {
      title: "FioFio Modas",
      body: "OUTUBRO DE PROPHECY 15 NA FIO FIO!",
      ctwaClid: "AfgyHHpliDuP7ks43e8ID6GGvlS2",
      mediaURL: "https://www.facebook.com/fiofiomodass/videos/1467864935233150/",
      sourceID: "120253837017130653",
      mediaType: 2,
      sourceApp: "instagram",
      sourceURL: "https://www.instagram.com/p/Dec7g1jMYG1/",
      sourceType: "ad",
      thumbnail: "QUJD".repeat(3000),
      thumbnailURL: "https://instagram.fcgh11-1.fna.fbcdn.net/v/t15.jpg",
      greetingMessageBody: "Olá, temos opções nos tamanhos 8 a 11. Qual tamanho você precisa?",
    };
    const r = extrairAtribuicaoVerdash({
      type: "AutomationMessage",
      event: { Info: { ID: "m1" }, Message: { extendedTextMessage: { contextInfo: { externalAdReply: real } } } },
    });
    expect(r).toMatchObject({
      sourceId: "AfgyHHpliDuP7ks43e8ID6GGvlS2",
      adId: "120253837017130653",
      titulo: "FioFio Modas",
      sourceUrl: "https://www.instagram.com/p/Dec7g1jMYG1/",
    });
    expect(r?.bruto).toMatchObject({ sourceApp: "instagram", sourceType: "ad" });
    expect(r?.bruto).not.toHaveProperty("thumbnail");
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
