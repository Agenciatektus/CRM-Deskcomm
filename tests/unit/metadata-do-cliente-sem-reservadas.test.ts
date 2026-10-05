import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/types";
import { validateRequest } from "@/lib/schemas/_validate";
import { METADATA_DO_CLIENTE_MAX_BYTES, NOME_DO_CARTAO_MAX, sendMessageSchema } from "@/lib/schemas/messaging";

/**
 * O METADATA DO ENVIO É LISTA PERMITIDA (P2 do @Cassio_SecRev na #103).
 *
 * O handler grava o `metadata` validado inteiro na mensagem. Este é o boundary
 * da rota `POST /api/v1/messages` (sessão e token): o que passa daqui vira
 * coluna. Mutante conferido: voltar a `z.record(z.string(), z.unknown())` faz
 * todos os casos de chave reservada e o de 8 KB falharem.
 */

const CONV = "11111111-1111-4111-8111-111111111111";
const CONTATO = "22222222-2222-4222-8222-222222222222";

function pedido(corpo: unknown): Request {
  return new Request("http://localhost/api/v1/messages", {
    method: "POST",
    body: JSON.stringify(corpo),
    headers: { "content-type": "application/json" },
  });
}

const RESERVADAS: Record<string, unknown> = {
  _optimistic: true,
  crm_hidden_at: "2026-10-05T12:00:00Z",
  crm_hidden_by: "u-1",
  sent_on_behalf: { user_id: "u-x", user_name: "Chefe", token_name: "ERP" },
  ai_actor_id: "agente-falso",
  idempotency_key: "k-1",
  queued_reason: "channel_session_not_working",
  sender_name: "Outro",
  instagram_tem_anexo: true,
  aviso_de_escalacao: true,
  group_sender: { name: "x" },
};

describe("metadata do envio: só a lista permitida", () => {
  for (const [chave, valor] of Object.entries(RESERVADAS)) {
    it(`descarta a chave reservada ${chave}`, async () => {
      const input = await validateRequest(
        sendMessageSchema,
        pedido({ conversation_id: CONV, body: "oi", metadata: { [chave]: valor, client_id: "temp-abc" } }),
      );
      expect(input.metadata).toEqual({ client_id: "temp-abc" });
    });
  }

  it("client_id fora do formato do temp id é descartado", () => {
    for (const ruim of ["abc", "temp-", "temp-<script>", `temp-${"a".repeat(65)}`, 42]) {
      const r = sendMessageSchema.parse({ conversation_id: CONV, body: "oi", metadata: { client_id: ruim } });
      expect(r.metadata).toEqual({});
    }
  });

  it("os envios legítimos do composer continuam: texto com client_id e os dois cartões de contato", () => {
    expect(
      sendMessageSchema.parse({ conversation_id: CONV, body: "oi", metadata: { client_id: "temp-a1_B-2" } }).metadata,
    ).toEqual({ client_id: "temp-a1_B-2" });
    expect(
      sendMessageSchema.parse({ conversation_id: CONV, type: "contact", metadata: { shared_contact_id: CONTATO } })
        .metadata,
    ).toEqual({ shared_contact_id: CONTATO });
    expect(
      sendMessageSchema.parse({
        conversation_id: CONV,
        type: "contact",
        metadata: { shared_contact: { name: "Maria", phone_number: "+5511999998888", extra: "x" } },
      }).metadata,
    ).toEqual({ shared_contact: { name: "Maria", phone_number: "+5511999998888" } });
    // Sem metadata nenhum continua sem metadata.
    expect(sendMessageSchema.parse({ conversation_id: CONV, body: "oi" }).metadata).toBeUndefined();
  });

  it("cartão de contato com id forjado (não-uuid) cai e o envio é recusado, não vira consulta ao banco", () => {
    const r = sendMessageSchema.safeParse({
      conversation_id: CONV,
      type: "contact",
      metadata: { shared_contact_id: "1 or 1=1" },
    });
    expect(r.success).toBe(false);
  });

  it(`metadata bruto acima de ${METADATA_DO_CLIENTE_MAX_BYTES} bytes é recusado com 413, sem corte`, async () => {
    const grande = { client_id: "temp-a", lixo: "x".repeat(METADATA_DO_CLIENTE_MAX_BYTES) };
    const erro = await validateRequest(sendMessageSchema, pedido({ conversation_id: CONV, body: "oi", metadata: grande })).catch(
      (e: unknown) => e,
    );
    expect(erro).toBeInstanceOf(ApiError);
    expect((erro as ApiError).status).toBe(413);
    expect((erro as ApiError).code).toBe("payload_too_large");

    // Logo abaixo do teto passa (e o lixo é descartado).
    const cabe = { client_id: "temp-a", lixo: "x".repeat(METADATA_DO_CLIENTE_MAX_BYTES - 100) };
    const ok = await validateRequest(sendMessageSchema, pedido({ conversation_id: CONV, body: "oi", metadata: cabe }));
    expect(ok.metadata).toEqual({ client_id: "temp-a" });
  });

  it("aninhamento extremo no metadata vira 413, não 500 (a medição não estoura a pilha)", () => {
    let fundo: Record<string, unknown> = {};
    const raiz = fundo;
    for (let i = 0; i < 200_000; i++) {
      const filho: Record<string, unknown> = {};
      fundo.a = filho;
      fundo = filho;
    }
    let erro: unknown;
    try {
      sendMessageSchema.safeParse({ conversation_id: CONV, body: "oi", metadata: raiz });
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(ApiError);
    expect((erro as ApiError).status).toBe(413);
  });

  it(`nome do cartão acima de ${NOME_DO_CARTAO_MAX} caracteres é recusado (422), não cortado`, async () => {
    const erro = await validateRequest(
      sendMessageSchema,
      pedido({
        conversation_id: CONV,
        type: "contact",
        metadata: { shared_contact: { name: "n".repeat(NOME_DO_CARTAO_MAX + 1), phone_number: "+5511999998888" } },
      }),
    ).catch((e: unknown) => e);
    expect((erro as ApiError).status).toBe(422);
    expect((erro as ApiError).code).toBe("validation_error");
    const ok = sendMessageSchema.parse({
      conversation_id: CONV,
      type: "contact",
      metadata: { shared_contact: { name: "n".repeat(NOME_DO_CARTAO_MAX), phone_number: "+5511999998888" } },
    });
    expect((ok.metadata?.shared_contact as { name: string }).name).toHaveLength(NOME_DO_CARTAO_MAX);
  });

  it("o 413 do metadata sai com o request id da requisição", async () => {
    const grande = { lixo: "x".repeat(METADATA_DO_CLIENTE_MAX_BYTES + 1) };
    const erro = await validateRequest(
      sendMessageSchema,
      pedido({ conversation_id: CONV, body: "oi", metadata: grande }),
      { requestId: "req-da-rota", maxBytes: 64 * 1024 },
    ).catch((e: unknown) => e);
    expect((erro as ApiError).status).toBe(413);
    expect((erro as ApiError).requestId).toBe("req-da-rota");
  });
});

describe("teto do corpo BRUTO antes do parse", () => {
  const TETO = 64 * 1024;

  it("escapes unicode não passam ~6x: o corpo bruto acima do teto é 413 antes do JSON.parse", async () => {
    // 72 KB de escapes num campo que o schema DESCARTA: sem o teto bruto, o
    // servidor parseava tudo e o envio passava.
    const escapado = (String.fromCharCode(92) + "u0041").repeat(12_000);
    const bruto = `{"conversation_id":"${CONV}","body":"oi","campo_ignorado":"${escapado}"}`;
    expect(bruto.length).toBeGreaterThan(TETO);
    const erro = await validateRequest(
      sendMessageSchema,
      new Request("http://localhost/api/v1/messages", { method: "POST", body: bruto }),
      { maxBytes: TETO, requestId: "req-1" },
    ).catch((e: unknown) => e);
    expect((erro as ApiError).status).toBe(413);
    expect((erro as ApiError).requestId).toBe("req-1");
  });

  it("Content-Length declarado acima do teto recusa sem ler; corpo em stream sem cabeçalho também é medido", async () => {
    const declarado = new Request("http://localhost/x", {
      method: "POST",
      body: "{}",
      headers: { "content-length": String(TETO + 1) },
    });
    const e1 = await validateRequest(sendMessageSchema, declarado, { maxBytes: TETO }).catch((e: unknown) => e);
    expect((e1 as ApiError).status).toBe(413);

    const pedaco = new TextEncoder().encode("x".repeat(16 * 1024));
    let enviados = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        if (enviados++ < 10) c.enqueue(pedaco);
        else c.close();
      },
    });
    const semCabecalho = new Request("http://localhost/x", { method: "POST", body: stream, duplex: "half" } as RequestInit);
    const e2 = await validateRequest(sendMessageSchema, semCabecalho, { maxBytes: TETO }).catch((e: unknown) => e);
    expect((e2 as ApiError).status).toBe(413);
    // Parou de ler logo depois de passar do teto, não no fim do stream.
    expect(enviados).toBeLessThan(10);
  });

  it("corpo legítimo dentro do teto segue normal", async () => {
    const ok = await validateRequest(
      sendMessageSchema,
      pedido({ conversation_id: CONV, body: "é".repeat(4096), metadata: { client_id: "temp-1" } }),
      { maxBytes: TETO, requestId: "req-2" },
    );
    expect(ok.metadata).toEqual({ client_id: "temp-1" });
  });
});
