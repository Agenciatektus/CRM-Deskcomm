import { describe, expect, it } from "vitest";

import { abrirArquivoDoWebhook } from "@/lib/channels/arquivo-de-webhook";
import { cabecalhosParaArquivo } from "@/lib/channels/cabecalhos-para-arquivo";
import { corpoUnicoParaArquivo } from "@/lib/channels/corpo-do-arquivo";
import { arquivoEnxuto } from "@/lib/channels/enxugar-para-arquivo";
import { conferirContratoWaha } from "@/lib/waha/envelope";
import { anexosDoArquivo } from "../../scripts/midia-do-instagram-retroativa";

import {
  CORPO_INSTAGRAM,
  CORPO_VERDASH,
  CORPO_WAHA,
  cabecalhosDeProducao,
} from "../fixtures/webhooks/arquivo-leve";

/**
 * O CORPO VAI PARA O ARQUIVO UMA VEZ SÓ — e nenhum leitor perde dado.
 *
 * Antes: `raw_body` (texto) + `payload_parsed` (jsonb) com o MESMO conteúdo,
 * mais todos os cabeçalhos do proxy. Depois: só `payload_parsed` quando o corpo
 * é objeto JSON, e só os cabeçalhos úteis. Cada `describe` abaixo é um LEITOR
 * real da tabela, lendo a linha que o escritor real grava.
 */

/** Grava pelo arquivador dos canais e devolve a linha que chegou ao insert. */
async function linhaDoArquivador(corpo: string, headers: Headers, provider: string) {
  const inserts: Record<string, unknown>[] = [];
  const admin = {
    from: () => ({
      insert: (linha: Record<string, unknown>) => {
        inserts.push(linha);
        return { select: () => ({ maybeSingle: async () => ({ data: { id: "log-1" }, error: null }) }) };
      },
    }),
  };
  await abrirArquivoDoWebhook(admin as never, {
    organizationId: "org-1",
    channelSessionId: "sess-1",
    provider,
    rawBody: corpo,
    headers,
  });
  expect(inserts).toHaveLength(1);
  return inserts[0] as { raw_body: string | null; payload_parsed: Record<string, unknown> | null; headers: Record<string, string> };
}

describe("corpoUnicoParaArquivo — quando o raw_body some e quando fica", () => {
  it("objeto JSON: só payload_parsed", () => {
    const r = corpoUnicoParaArquivo('{"a":1,"b":{"c":[1,2]}}', { b: { c: [1, 2] }, a: 1 });
    expect(r).toEqual({ raw_body: null, payload_parsed: { a: 1, b: { c: [1, 2] } } });
  });

  it("corpo que não é JSON (formulário, texto quebrado): raw_body fica", () => {
    expect(corpoUnicoParaArquivo("a=1&b=2", null).raw_body).toBe("a=1&b=2");
    expect(corpoUnicoParaArquivo("{quebrado", { x: 1 }).raw_body).toBe("{quebrado");
  });

  it("lista no topo: raw_body fica (payload_parsed só recebe objeto)", () => {
    expect(corpoUnicoParaArquivo("[1,2]", null)).toEqual({ raw_body: "[1,2]", payload_parsed: null });
  });

  it("inteiro acima de 2^53 fora de string: o texto é o único lugar onde ele está inteiro", () => {
    const raw = '{"id":12345678901234567890}';
    expect(corpoUnicoParaArquivo(raw, JSON.parse(raw)).raw_body).toBe(raw);
  });

  it("objeto que diverge do corpo: na dúvida, os dois", () => {
    expect(corpoUnicoParaArquivo('{"a":1,"b":2}', { a: 1 }).raw_body).toBe('{"a":1,"b":2}');
  });
});

describe("arquivador dos canais (Verdash/Instagram): payload_parsed IGUAL ao de antes", () => {
  for (const [nome, corpo] of [
    ["verdash", CORPO_VERDASH],
    ["instagram", CORPO_INSTAGRAM],
  ] as const) {
    it(`${nome}: raw_body nulo e payload_parsed idêntico ao que o arquivo gravava`, async () => {
      const linha = await linhaDoArquivador(corpo, cabecalhosDeProducao({}), nome);
      expect(linha.raw_body).toBeNull();
      // O que TODO leitor de payload_parsed recebia antes desta mudança.
      expect(linha.payload_parsed).toEqual(arquivoEnxuto(corpo).parsed);
      // E o texto que ia para raw_body é reconstruível a partir dele.
      expect(JSON.parse(arquivoEnxuto(corpo).rawBody)).toEqual(linha.payload_parsed);
    });
  }

  it("o enxugamento continua valendo: o token da instância não chega ao payload_parsed", async () => {
    const linha = await linhaDoArquivador(CORPO_VERDASH, cabecalhosDeProducao({}), "verdash");
    expect(JSON.stringify(linha)).not.toContain("TOK-INSTANCIA-ficticio-0000");
  });

  it("corpo de formulário: raw_body continua gravado (é o único registro)", async () => {
    const form = new URLSearchParams({ jsonData: '{"type":"Message"}', instanceName: "x" }).toString();
    const linha = await linhaDoArquivador(form, new Headers(), "verdash");
    expect(linha.raw_body).toBe(form);
    expect(linha.payload_parsed).toBeNull();
  });
});

describe("leitor: script de mídia do Instagram (payload_parsed->>provider_message_id)", () => {
  it("acha a mensagem pelo id e lê os mesmos anexos", async () => {
    const linha = await linhaDoArquivador(CORPO_INSTAGRAM, new Headers(), "instagram");
    expect(linha.payload_parsed?.provider_message_id).toBe(JSON.parse(CORPO_INSTAGRAM).provider_message_id);
    const antes = anexosDoArquivo(JSON.parse(CORPO_INSTAGRAM));
    const depois = anexosDoArquivo(linha.payload_parsed);
    expect(depois).toEqual(antes);
    expect(depois.midias).toHaveLength(1);
  });
});

describe("leitor: reprocessamento do WAHA (relê payload_parsed)", () => {
  it("o objeto que vai para payload_parsed passa no contrato, e raw_body sai nulo", () => {
    const roteado = JSON.parse(CORPO_WAHA) as Record<string, unknown>;
    const corpo = corpoUnicoParaArquivo(CORPO_WAHA, roteado);
    expect(corpo.raw_body).toBeNull();
    expect(conferirContratoWaha(corpo.payload_parsed as never).ok).toBe(true);
  });
});

describe("cabeçalhos: lista permitida", () => {
  it("fica o que responde a uma pergunta; o do proxy sai; credencial sai mesmo com nome permitido", () => {
    const h = cabecalhosParaArquivo(
      cabecalhosDeProducao({
        "x-hub-signature-256": "sha256=abc",
        "x-webhook-hmac": "sha512=def",
        "x-webhook-request-id": "req-1",
        "x-webhook-secret": "s3gredo",
        token: "TOK",
        "x-github-delivery": "d-1",
      }),
    );
    expect(Object.keys(h).sort()).toEqual(
      [
        "content-length",
        "content-type",
        "user-agent",
        "x-github-delivery",
        "x-hub-signature-256",
        "x-webhook-hmac",
        "x-webhook-request-id",
      ].sort(),
    );
  });
});

describe("estimativa: bytes por linha antes/depois (sem compressão do TOAST)", () => {
  /** A linha sem corpo: colunas fixas + cabeçalho de tupla, medida da 0163. */
  const LINHA_SEM_CORPO = 200;
  const bytes = (v: unknown) => (v == null ? 0 : Buffer.byteLength(typeof v === "string" ? v : JSON.stringify(v)));

  /** Os cabeçalhos como o arquivo gravava até aqui: todos, menos a lista negra. */
  function cabecalhosDeAntes(h: Headers): Record<string, string> {
    const out: Record<string, string> = {};
    const fora = ["authorization", "cookie", "x-api-key", "x-webhook-secret", "token", "apikey"];
    h.forEach((v, k) => {
      if (!fora.includes(k)) out[k] = v;
    });
    return out;
  }

  const casos: Array<{ nome: string; corpo: string; prov: Record<string, string> }> = [
    { nome: "verdash", corpo: CORPO_VERDASH, prov: { "x-webhook-secret": "s", token: "t" } },
    { nome: "instagram", corpo: CORPO_INSTAGRAM, prov: { "x-webhook-secret": "s" } },
    { nome: "waha", corpo: CORPO_WAHA, prov: { "x-webhook-hmac": "sha512=" + "a".repeat(128), "x-webhook-request-id": "r" } },
  ];

  it("cada formato encolhe mais de 50%", () => {
    const tabela: Record<string, { antes: number; depois: number; reducao: string }> = {};
    for (const c of casos) {
      const h = cabecalhosDeProducao(c.prov);
      const enx = c.nome === "waha" ? { rawBody: c.corpo, parsed: JSON.parse(c.corpo) } : arquivoEnxuto(c.corpo);
      const antes = LINHA_SEM_CORPO + bytes(enx.rawBody) + bytes(enx.parsed) + bytes(cabecalhosDeAntes(h));
      const corpo = corpoUnicoParaArquivo(enx.rawBody, enx.parsed);
      const depois =
        LINHA_SEM_CORPO + bytes(corpo.raw_body) + bytes(corpo.payload_parsed) + bytes(cabecalhosParaArquivo(h));
      tabela[c.nome] = { antes, depois, reducao: `${Math.round((1 - depois / antes) * 100)}%` };
      expect(depois).toBeLessThan(antes * 0.5);
    }
    // Saída para o relatório do PR.
    process.stdout.write(`[estimativa por linha] ${JSON.stringify(tabela)}\n`);
  });
});
