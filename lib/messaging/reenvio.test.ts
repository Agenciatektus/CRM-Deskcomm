import { describe, expect, it } from "vitest";

import { validarReenvio } from "./reenvio";

/**
 * As recusas do reenvio (B15) no servidor, com um cliente falso que devolve a
 * linha original e a lista de reenvios já feitos. O banco de verdade (o índice
 * único) está em `tests/invariants/reenvio-e-resolvida-9048.test.ts`.
 */
type Linha = { conversation_id: string; channel_session_id: string; direction: string; status: string } | null;

function consulta(resposta: unknown) {
  const q: Record<string, unknown> = {};
  q.select = () => q;
  q.eq = () => q;
  q.limit = () => Promise.resolve(resposta);
  q.maybeSingle = () => Promise.resolve(resposta);
  return q;
}

function cliente(original: Linha, jaReenviadas: unknown[] = []) {
  let chamada = 0;
  return {
    from: () =>
      chamada++ === 0 ? consulta({ data: original, error: null }) : consulta({ data: jaReenviadas, error: null }),
  } as never;
}

const pedido = { organizationId: "org", conversationId: "conv", channelSessionId: "canal", reenvioDe: "msg", requestId: "r" };
const falhou = { conversation_id: "conv", channel_session_id: "canal", direction: "outbound", status: "failed" };

describe("o reenvio só vale para a mensagem de saída que falhou, nesta conversa e neste canal", () => {
  it("CONTROLE: a que falhou e ainda não foi reenviada passa", async () => {
    await expect(validarReenvio(cliente(falhou), pedido)).resolves.toBeUndefined();
  });

  it("de outra conversa (ou inexistente): 404", async () => {
    await expect(validarReenvio(cliente({ ...falhou, conversation_id: "outra" }), pedido)).rejects.toMatchObject({
      status: 404,
    });
    await expect(validarReenvio(cliente(null), pedido)).rejects.toMatchObject({ status: 404 });
  });

  it("entregue, ou recebida: 409", async () => {
    await expect(validarReenvio(cliente({ ...falhou, status: "delivered" }), pedido)).rejects.toMatchObject({
      status: 409,
    });
    await expect(validarReenvio(cliente({ ...falhou, direction: "inbound" }), pedido)).rejects.toMatchObject({
      status: 409,
    });
  });

  it("a conversa mudou de canal: 409", async () => {
    await expect(
      validarReenvio(cliente({ ...falhou, channel_session_id: "outro" }), pedido),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("já reenviada: 409 already_retried", async () => {
    await expect(validarReenvio(cliente(falhou, [{ id: "x" }]), pedido)).rejects.toMatchObject({
      status: 409,
      code: "already_retried",
    });
  });
});
