/**
 * O webhook de saída LIBERA o socket depois de cada tentativa (P2-1 do
 * @Cassio_SecRev na #83).
 *
 * O corpo da resposta não interessa ao motor, e por isso nunca era lido. Sem
 * ler nem cancelar, a conexão fica aberta — um socket preso por tentativa. O
 * receptor deste teste responde 200 e NUNCA termina o corpo (o pior caso): o
 * socket só fecha se quem chamou cancelar.
 */
import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

// O receptor escuta em 127.0.0.1, que os guardas anti-SSRF recusam — e devem.
// Aqui o assunto é o socket: o juiz do IP libera, a conexão fixada é a real.
vi.mock("@/lib/automation/outbound-url", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  assertSafeOutboundUrl: () => undefined,
}));
vi.mock("@/lib/automation/outbound-ip", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/automation/outbound-ip")>();
  return {
    ...original,
    assertDestinoResolvidoSeguro: async () => undefined,
    fetchComDestinoFixado: (url: string, pedido: unknown) =>
      original.fetchComDestinoFixado(url, pedido as never, {
        ipProibido: () => false,
        resolver: async () => [{ address: "127.0.0.1", family: 4 }],
      }),
  };
});

import { executeCallWebhook } from "@/lib/automation/actions/call-webhook";
import type { ActionCtx } from "@/lib/automation/types";

function ctx(): ActionCtx {
  return {
    admin: {} as ActionCtx["admin"],
    organizationId: "org-1",
    ruleId: "rule-1",
    ruleName: "Automação de teste",
    requestId: "req-1",
    event: {
      id: "evt-1",
      organization_id: "org-1",
      event_type: "lead.created",
      entity_kind: "crm_lead",
      entity_id: "lead-1",
      payload: {},
      metadata: {},
      consumed_by: [],
      attempts: 0,
    },
    context: {},
  };
}

let servidor: Server | undefined;
const respostas: ServerResponse[] = [];

afterEach(async () => {
  for (const r of respostas.splice(0)) r.destroy();
  if (servidor) await new Promise<void>((r) => servidor!.close(() => r()));
  servidor = undefined;
});

async function receptorQueNaoTerminaOCorpo(status: number) {
  let abertas = 0;
  let recebidas = 0;
  servidor = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      recebidas += 1;
      res.writeHead(status, { "content-type": "text/plain", connection: "keep-alive" });
      res.write("corpo que nunca acaba…");
      respostas.push(res);
    });
  });
  servidor.on("connection", (s) => {
    abertas += 1;
    s.on("close", () => (abertas -= 1));
  });
  await new Promise<void>((r) => servidor!.listen(0, "127.0.0.1", r));
  const porta = (servidor.address() as AddressInfo).port;
  return { porta, abertas: () => abertas, recebidas: () => recebidas };
}

async function esperar(cond: () => boolean, ms = 2_000): Promise<boolean> {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    if (cond()) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return cond();
}

describe("o webhook de saída libera o socket", () => {
  it("200 com corpo sem fim: sucesso, e a conexão FECHA", async () => {
    const r = await receptorQueNaoTerminaOCorpo(200);
    const resultado = await executeCallWebhook(ctx(), { url: `http://receptor.teste:${r.porta}/gancho` });
    expect(resultado.status).toBe("success");
    expect(r.recebidas()).toBe(1);
    expect(await esperar(() => r.abertas() === 0)).toBe(true);
  });

  it("500 nas 3 tentativas: nenhuma das 3 conexões fica aberta", async () => {
    const r = await receptorQueNaoTerminaOCorpo(500);
    const resultado = await executeCallWebhook(
      ctx(),
      { url: `http://receptor.teste:${r.porta}/gancho` },
      { retryDelaysMs: [1, 1] },
    );
    expect(resultado.status).toBe("failed");
    expect(r.recebidas()).toBe(3);
    expect(await esperar(() => r.abertas() === 0)).toBe(true);
  });
});
