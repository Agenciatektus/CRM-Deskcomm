import { describe, expect, it } from "vitest";

import { abrirArquivoDoWebhook } from "@/lib/channels/arquivo-de-webhook";
import { arquivoEnxuto, enxugarParaArquivo, TOKEN_OMITIDO } from "@/lib/channels/enxugar-para-arquivo";

/**
 * O ARQUIVO DE WEBHOOK SEM A MÍDIA INLINE E SEM O TOKEN.
 *
 * Medido em produção (28/09/2026): o arquivo guardava 621 MB de 689 MB do banco,
 * porque o evento de mídia traz o arquivo inteiro no campo de topo `base64` e ele
 * era gravado duas vezes (`raw_body` + `payload_parsed`). O banco estourou os
 * 500 MB do plano e caiu. O mesmo payload traz a credencial da instância em
 * `token`.
 *
 * O que estes casos vigiam: que o peso e o segredo saem, que um marcador fica
 * no lugar, e que payload SEM essas chaves sai idêntico — byte a byte no texto,
 * porque quem assina o corpo precisa poder reconferir a assinatura depois.
 */

/** Um evento de mídia no formato que o servidor de WhatsApp manda. */
function eventoDeMidia(base64: string) {
  return {
    type: "Message",
    token: "tok-da-instancia-secreto",
    downloadURL: "https://midia.exemplo/arquivo.jpg",
    base64,
    event: { Info: { ID: "ABC", Chat: "5511999999999@s.whatsapp.net" }, Message: { imageMessage: {} } },
  };
}

describe("enxugarParaArquivo — função pura", () => {
  it("base64 grande some e vira marcador com o tamanho", () => {
    const grande = "A".repeat(2_000_000);
    const { payload, cortou } = enxugarParaArquivo(eventoDeMidia(grande));
    expect(cortou).toBe(true);
    expect(payload.base64).toEqual({ omitido: true, caracteres: 2_000_000 });
    expect(JSON.stringify(payload).length, "a mídia continua no arquivo").toBeLessThan(1_000);
  });

  it("token vira \"[omitido]\"", () => {
    const { payload } = enxugarParaArquivo(eventoDeMidia("QUJD"));
    expect(payload.token).toBe(TOKEN_OMITIDO);
    expect(JSON.stringify(payload)).not.toContain("tok-da-instancia-secreto");
  });

  it("o resto do payload fica como veio (inclusive a downloadURL)", () => {
    const { payload } = enxugarParaArquivo(eventoDeMidia("QUJD"));
    expect(payload.downloadURL).toBe("https://midia.exemplo/arquivo.jpg");
    expect(payload.event).toEqual(eventoDeMidia("x").event);
    expect(payload.type).toBe("Message");
  });

  it("payload sem essas chaves sai idêntico (a mesma referência)", () => {
    const p = { type: "Message", event: { Info: { ID: "1" } } };
    const { payload, cortou } = enxugarParaArquivo(p);
    expect(cortou).toBe(false);
    expect(payload).toBe(p);
  });

  it("não muta a entrada", () => {
    const p = eventoDeMidia("QUJD");
    enxugarParaArquivo(p);
    expect(p.base64).toBe("QUJD");
    expect(p.token).toBe("tok-da-instancia-secreto");
  });

  it("só olha o TOPO: campo aninhado com o mesmo nome não é tocado", () => {
    const p = { type: "x", event: { token: "aninhado", base64: "QUJD" } };
    expect(enxugarParaArquivo(p).payload).toBe(p);
  });
});

describe("arquivoEnxuto — o par que vai para as colunas", () => {
  it("raw_body não-JSON fica igual, e parsed é nulo", () => {
    expect(arquivoEnxuto("<html>erro do proxy</html>")).toEqual({
      rawBody: "<html>erro do proxy</html>",
      parsed: null,
    });
  });

  it("JSON que é lista fica igual, e parsed é nulo", () => {
    expect(arquivoEnxuto("[1,2,3]")).toEqual({ rawBody: "[1,2,3]", parsed: null });
  });

  it("JSON sem as chaves mantém o raw_body BYTE A BYTE (espaços inclusive)", () => {
    const cru = '{ "type" : "Message",\n  "event": {"x": 1} }';
    const r = arquivoEnxuto(cru);
    expect(r.rawBody).toBe(cru);
    expect(r.parsed).toEqual({ type: "Message", event: { x: 1 } });
  });

  it("JSON com mídia e token: os DOIS lados saem enxutos", () => {
    const r = arquivoEnxuto(JSON.stringify(eventoDeMidia("B".repeat(500_000))));
    expect(r.rawBody).not.toContain("BBBB");
    expect(r.rawBody).not.toContain("tok-da-instancia-secreto");
    expect(r.rawBody.length).toBeLessThan(1_000);
    expect(JSON.parse(r.rawBody)).toEqual(r.parsed);
    expect(r.parsed?.base64).toEqual({ omitido: true, caracteres: 500_000 });
  });
});

describe("o ponto de escrita grava a versão enxuta", () => {
  function adminQueGuarda() {
    const guardado: { insert: Record<string, unknown> | null } = { insert: null };
    const admin = {
      from() {
        return {
          insert(payload: Record<string, unknown>) {
            guardado.insert = payload;
            return {
              select: () => ({ maybeSingle: async () => ({ data: { id: "log-1" }, error: null }) }),
            };
          },
        };
      },
    } as never;
    return { admin, guardado };
  }

  it("o insert recebe raw_body e payload_parsed sem a mídia e sem o token", async () => {
    const { admin, guardado } = adminQueGuarda();
    const cru = JSON.stringify(eventoDeMidia("C".repeat(300_000)));

    const id = await abrirArquivoDoWebhook(admin, {
      organizationId: "org-1",
      channelSessionId: "sessao-1",
      provider: "canal-de-teste",
      rawBody: cru,
      headers: new Headers(),
    });

    expect(id).toBe("log-1");
    const linha = guardado.insert as { raw_body: string; payload_parsed: Record<string, unknown> };
    expect(linha.raw_body.length, "a mídia inline foi para o raw_body").toBeLessThan(1_000);
    expect(linha.raw_body).not.toContain("tok-da-instancia-secreto");
    expect(linha.payload_parsed.base64).toEqual({ omitido: true, caracteres: 300_000 });
    expect(linha.payload_parsed.token).toBe(TOKEN_OMITIDO);
    expect(linha.payload_parsed.downloadURL).toBe("https://midia.exemplo/arquivo.jpg");
  });

  it("o segredo compartilhado do header NÃO vai para o arquivo; o resto fica", async () => {
    // `x-webhook-secret` é comparado direto (não é HMAC): arquivado, quem lê o
    // arquivo pela org poderia forjar mensagem de entrada.
    const { admin, guardado } = adminQueGuarda();
    await abrirArquivoDoWebhook(admin, {
      organizationId: "org-1",
      channelSessionId: "sessao-1",
      provider: "canal-de-teste",
      rawBody: "{}",
      headers: new Headers({ "x-webhook-secret": "s3gredo", "content-type": "application/json" }),
    });
    const cabecalhos = (guardado.insert as { headers: Record<string, string> }).headers;
    expect(Object.keys(cabecalhos), "o segredo do header foi arquivado").not.toContain("x-webhook-secret");
    expect(JSON.stringify(guardado.insert)).not.toContain("s3gredo");
    expect(cabecalhos["content-type"]).toBe("application/json");
  });
});
