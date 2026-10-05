import { describe, expect, it } from "vitest";

import { abrirArquivoDoWebhook } from "@/lib/channels/arquivo-de-webhook";
import {
  arquivoEnxuto,
  cabecalhosParaArquivo,
  enxugarParaArquivo,
  TETO_DE_TEXTO,
  TOKEN_OMITIDO,
} from "@/lib/channels/enxugar-para-arquivo";

/**
 * O ARQUIVO DE WEBHOOK SEM MÍDIA INTEIRA E SEM CREDENCIAL — EM QUALQUER FORMATO.
 *
 * 28/09/2026: o arquivo guardava 621 MB de 689 MB do banco (mídia inline em
 * `base64`, gravada duas vezes) e o token da instância em claro. O conserto
 * (PR #42) olhava só o TOPO do payload. 05/10/2026, medido em produção: 7.291
 * de 7.306 eventos do canal Verdash com o token em claro, e itens de álbum com
 * a mídia inteira (até 10 MB cada). A regra agora não depende de onde a chave
 * mora, e estes casos vigiam exatamente os formatos que escaparam.
 *
 * `vazou` é o detector: as fixtures carregam valores-sentinela, e o teste
 * prova PRIMEIRO que o detector acusa a entrada crua (controle negativo) —
 * senão um detector quebrado daria verde para qualquer coisa.
 */

const TOKEN = "TOK-DA-INSTANCIA-7f3a9c";
const SEGREDO = "s3gredo-compartilhado";
const MIDIA = "QUJD".repeat(50_000); // 200 mil caracteres de "base64"

function vazou(texto: string): string[] {
  const achados: string[] = [];
  if (texto.includes(TOKEN)) achados.push("token");
  if (texto.includes(SEGREDO)) achados.push("segredo");
  if (texto.includes("QUJDQUJDQUJDQUJD")) achados.push("midia");
  if (texto.length > 64 * 1024) achados.push(`tamanho:${texto.length}`);
  return achados;
}

/** A regra de 28/09, reproduzida aqui para provar o buraco que ela deixava. */
function soTopo(raw: string): string {
  const p = JSON.parse(raw) as Record<string, unknown>;
  if (!p || typeof p !== "object" || Array.isArray(p)) return raw;
  const out = { ...p };
  if (typeof out.base64 === "string") out.base64 = { omitido: true };
  if (typeof out.token === "string") out.token = TOKEN_OMITIDO;
  return JSON.stringify(out);
}

/** Evento de mídia no formato de topo que o FZAP mandava em 28/09. */
const eventoDeTopo = {
  type: "Message",
  token: TOKEN,
  downloadURL: "https://midia.exemplo/arquivo.jpg",
  base64: MIDIA,
  event: { Info: { ID: "ABC", Chat: "5511999999999@s.whatsapp.net" }, Message: { imageMessage: {} } },
};

/** Item de álbum, como medido em produção em 05/10. */
const itemDeAlbum = { album: { albumId: "ALB-1", role: "item" }, base64: MIDIA, token: TOKEN };

/** Os formatos que precisam sair limpos. Cada um é um corpo cru. */
const FORMATOS: Record<string, string> = {
  "topo (o de 28/09)": JSON.stringify(eventoDeTopo),
  "item de álbum": JSON.stringify(itemDeAlbum),
  "álbum dentro do evento": JSON.stringify({
    type: "Message",
    event: { Info: { ID: "X" }, album: [itemDeAlbum, itemDeAlbum] },
    userInfo: { instanceToken: TOKEN },
  }),
  "lote (lista no topo)": JSON.stringify([eventoDeTopo, itemDeAlbum]),
  "credencial com outro nome": JSON.stringify({ type: "x", data: { apiKey: TOKEN, webhook_secret: SEGREDO } }),
  "mídia em campo de nome novo (teto genérico)": JSON.stringify({ type: "x", payload: { blob: MIDIA } }),
  "JSON dentro de string": JSON.stringify({ jsonData: JSON.stringify({ type: "Message", token: TOKEN }) }),
  "token na query da URL": JSON.stringify({ type: "x", downloadURL: `https://fzap.exemplo/m/1?token=${TOKEN}&x=1` }),
  "formulário (jsonData=…)": new URLSearchParams({
    jsonData: JSON.stringify(eventoDeTopo),
    token: TOKEN,
    instanceName: "inst",
  }).toString(),
  "texto que não é JSON": `{quebrado "token": "${TOKEN}", "base64": "${MIDIA}"`,
};

describe("controle negativo: o detector acusa a entrada crua", () => {
  for (const [nome, cru] of Object.entries(FORMATOS)) {
    it(`${nome}: a entrada crua vaza`, () => {
      expect(vazou(cru).length, "fixture sem vazamento: o teste não provaria nada").toBeGreaterThan(0);
    });
  }

  it("a regra só-do-topo de 28/09 deixava passar os formatos aninhados", () => {
    // É o defeito medido em produção, reproduzido: se esta asserção um dia
    // falhar, a fixture deixou de representar o buraco.
    expect(vazou(soTopo(FORMATOS["item de álbum"]!))).toEqual([]); // topo ela pegava
    expect(vazou(soTopo(FORMATOS["álbum dentro do evento"]!))).not.toEqual([]);
    expect(vazou(soTopo(FORMATOS["lote (lista no topo)"]!))).not.toEqual([]);
    expect(vazou(soTopo(FORMATOS["JSON dentro de string"]!))).not.toEqual([]);
  });
});

describe("arquivoEnxuto — nenhum formato vaza", () => {
  for (const [nome, cru] of Object.entries(FORMATOS)) {
    it(`${nome}: raw_body e payload_parsed saem limpos`, () => {
      const r = arquivoEnxuto(cru);
      expect(vazou(r.rawBody), "raw_body").toEqual([]);
      expect(vazou(JSON.stringify(r.parsed ?? null)), "payload_parsed").toEqual([]);
      expect(r.rawBody.length).toBeLessThan(TETO_DE_TEXTO * 3);
    });
  }

  it("o marcador de mídia guarda tamanho e sha256, não o conteúdo", () => {
    const r = arquivoEnxuto(JSON.stringify(itemDeAlbum));
    expect(r.parsed?.base64).toMatchObject({ omitido: true, motivo: "midia", caracteres: MIDIA.length });
    expect((r.parsed?.base64 as { sha256: string }).sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(r.parsed?.token).toBe(TOKEN_OMITIDO);
    expect(r.parsed?.album).toEqual({ albumId: "ALB-1", role: "item" });
  });

  it("string longa sem nome de mídia vira marcador de tamanho", () => {
    const r = arquivoEnxuto(JSON.stringify({ a: { b: "x".repeat(TETO_DE_TEXTO + 1) } }));
    expect((r.parsed?.a as { b: unknown }).b).toMatchObject({ omitido: true, motivo: "tamanho" });
  });

  it("o resto do payload fica como veio (downloadURL, tipo, evento)", () => {
    const r = arquivoEnxuto(JSON.stringify(eventoDeTopo));
    expect(r.parsed?.downloadURL).toBe("https://midia.exemplo/arquivo.jpg");
    expect(r.parsed?.type).toBe("Message");
    expect(r.parsed?.event).toEqual(eventoDeTopo.event);
    expect(JSON.parse(r.rawBody)).toEqual(r.parsed);
  });

  it("URL de anexo da Meta mantém o `signature` (o script retroativo relê)", () => {
    const url = "https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1&signature=abc";
    expect(arquivoEnxuto(JSON.stringify({ url })).rawBody).toContain("signature=abc");
  });

  it("sem nada a cortar: raw_body BYTE A BYTE (espaços inclusive)", () => {
    const cru = '{ "type" : "Message",\n  "event": {"x": 1, "lista": [1, "a"]} }';
    const r = arquivoEnxuto(cru);
    expect(r.rawBody).toBe(cru);
    expect(r.parsed).toEqual({ type: "Message", event: { x: 1, lista: [1, "a"] } });
  });

  it("sem nada a cortar: a MESMA referência", () => {
    const p = { type: "Message", event: { Info: { ID: "1" } } };
    expect(enxugarParaArquivo(p).payload).toBe(p);
  });

  it("não muta a entrada", () => {
    const p = JSON.parse(JSON.stringify(itemDeAlbum)) as typeof itemDeAlbum;
    enxugarParaArquivo(p);
    expect(p.token).toBe(TOKEN);
    expect(p.base64).toBe(MIDIA);
  });

  it("corpo enorme de strings pequenas também tem teto", () => {
    const muitas = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`k${i}`, "y".repeat(4000)]));
    const r = arquivoEnxuto(JSON.stringify(muitas));
    expect(r.rawBody.length).toBeLessThan(64 * 1024);
    expect(r.parsed).toMatchObject({ omitido: true, motivo: "tamanho" });
  });

  it("lista e escalar continuam com payload_parsed nulo", () => {
    expect(arquivoEnxuto("[1,2,3]")).toEqual({ rawBody: "[1,2,3]", parsed: null });
    expect(arquivoEnxuto("<html>erro do proxy</html>")).toEqual({
      rawBody: "<html>erro do proxy</html>",
      parsed: null,
    });
  });
});

describe("cabeçalhos", () => {
  it("credencial por nome exato OU por pedaço sai; assinatura HMAC e o resto ficam", () => {
    const h = cabecalhosParaArquivo(
      new Headers({
        "x-webhook-secret": SEGREDO,
        token: TOKEN,
        "x-instance-token": TOKEN,
        authorization: `Bearer ${TOKEN}`,
        "x-hub-signature-256": "sha256=abc",
        "content-type": "application/json",
        "x-grande": "z".repeat(TETO_DE_TEXTO + 10),
      }),
    );
    expect(vazou(JSON.stringify(h))).toEqual([]);
    expect(Object.keys(h).sort()).toEqual(["content-type", "x-grande", "x-hub-signature-256"]);
    expect(h["x-grande"]).toMatch(/^\[omitido: \d+ caracteres, sha256 [0-9a-f]{64}\]$/);
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

  for (const [nome, cru] of Object.entries(FORMATOS)) {
    it(`${nome}: a linha inteira do insert sai limpa`, async () => {
      const { admin, guardado } = adminQueGuarda();
      const id = await abrirArquivoDoWebhook(admin, {
        organizationId: "org-1",
        channelSessionId: "sessao-1",
        provider: "verdash",
        rawBody: cru,
        headers: new Headers({ "x-webhook-secret": SEGREDO, token: TOKEN, "content-type": "application/json" }),
      });
      expect(id).toBe("log-1");
      expect(vazou(JSON.stringify(guardado.insert))).toEqual([]);
    });
  }
});
