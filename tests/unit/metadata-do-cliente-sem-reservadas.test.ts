import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/types";
import { validateRequest } from "@/lib/schemas/_validate";
import { METADATA_DO_CLIENTE_MAX_BYTES, sendMessageSchema } from "@/lib/schemas/messaging";

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
});
