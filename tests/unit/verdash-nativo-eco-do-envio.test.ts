import { describe, expect, it, vi } from "vitest";

const ja = vi.hoisted(() => ({ visto: [] as string[] }));
vi.mock("@/lib/messaging/mensagem-ja-recebida", () => ({
  mensagemJaRecebida: async (_a: unknown, _o: string, id: string) => (ja.visto.push(id), id === "AB12"),
}));

import { insertMessage } from "@/lib/channels/verdash/gravacao";

describe("eco do proprio envio da nativa", () => {
  it("eco com Info.ID = id do envio ja gravado nao vira 2a bolha", async () => {
    const insert = vi.fn();
    const admin = { from: () => ({ insert }) } as never;
    const r = await insertMessage(admin, {
      organizationId: "o", conversationId: "c", contactId: "k", channelSessionId: "s",
      msg: { kind: "message", externalId: "AB12", direction: "outbound", attachments: [] } as never,
    });
    expect(r).toBe("duplicate");
    expect(ja.visto).toEqual(["AB12"]);
    expect(insert).not.toHaveBeenCalled();
  });
});
