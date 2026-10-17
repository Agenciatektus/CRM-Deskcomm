import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  consumirComResultado,
  consumirRespostaDoSuporteNoWhatsApp,
} from "@/lib/escalacao/resposta-whatsapp-ao-caso";
import { limparCacheDoNumeroInterno } from "@/lib/escalacao/numero-interno-de-aviso";

const ORG = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";
const PHONE = "+5531998966398";
const CASE = "02920000-5555-4000-8000-000000000001";

const mocks = vi.hoisted(() => ({
  send: vi.fn(async () => ({ externalId: "sent-ack" })),
  decide: vi.fn(async () => ({ liberado: true as const })),
  register: vi.fn(async () => undefined),
  config: vi.fn(async () => true),
  resolve: vi.fn(async () => ({ to: PHONE })),
}));

vi.mock("@/lib/escalacao/aviso-ao-suporte.handler", () => ({
  criarTransporteDoAviso: async () => ({
    configurado: mocks.config,
    resolveDestino: mocks.resolve,
    envia: mocks.send,
  }),
}));
vi.mock("@/lib/agent-engine/pacing/ledger-supabase", () => ({
  criarPacingDoCanal: async () => ({ decide: mocks.decide, registraEnvio: mocks.register }),
}));

function db(options: { enabled?: boolean; result?: string; error?: boolean } = {}) {
  const cfg = {
    telefone_destino: PHONE,
    destino_jid: null,
    resposta_whatsapp_habilitada: options.enabled ?? true,
  };
  const rpc = vi.fn(async (..._args: unknown[]) => ({
    data: options.result ?? "accepted",
    error: options.error ? { message: "db failed" } : null,
  }));
  const from = vi.fn((table: string) => {
    const resolvedCfg = table === "config_aviso_de_caso"
      ? { ...cfg, resposta_whatsapp_habilitada: options.enabled ?? true }
      : null;
    const builder: Record<string, unknown> = {};
    builder.select = () => builder;
    builder.eq = () => builder;
    builder.maybeSingle = async () => ({
      data: resolvedCfg,
      error: null,
    });
    builder.update = () => builder;
    builder.then = (resolve: (x: unknown) => unknown) => resolve({ error: null });
    return builder;
  });
  return { rpc, from, db: { rpc, from } as never };
}

function entry(text: string | null, externalId = "msg-1") {
  return {
    organizationId: ORG,
    channelSessionId: SESSION,
    identidade: { kind: "phone", phone: PHONE, lid: null },
    direction: "inbound" as const,
    texto: text,
    externalId,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  limparCacheDoNumeroInterno();
  mocks.decide.mockResolvedValue({ liberado: true });
});

describe("confirmações de comando pelo WhatsApp", () => {
  it("responde ao comando aceito e registra o envio no mesmo pacing", async () => {
    const { db: client } = db();
    const result = await consumirComResultado(client, entry(`RESPONDER ${CASE} Resolvido`));
    expect(result).toEqual({ consumed: true, result: "accepted" });
    expect(mocks.send).toHaveBeenCalledWith(ORG, expect.objectContaining({ id: SESSION }), { to: PHONE }, "Recebido. A IA vai seguir com o cliente.");
    expect(mocks.register).toHaveBeenCalledTimes(1);
  });

  it("informa que o caso não existe ou já foi respondido", async () => {
    const { db: client } = db({ result: "case_unavailable" });
    await consumirComResultado(client, entry(`RESPONDER ${CASE} Resolvido`));
    expect(mocks.send).toHaveBeenCalledWith(ORG, expect.objectContaining({ id: SESSION }), { to: PHONE }, "Não consegui: esse caso já foi respondido ou não existe.");
  });

  it("avisa sobre formato inválido de comando, sem responder mensagens comuns", async () => {
    const { db: client } = db();
    await consumirComResultado(client, entry("RESPONDER"));
    expect(mocks.send).toHaveBeenCalledWith(ORG, expect.objectContaining({ id: SESSION }), { to: PHONE }, expect.stringContaining("Formato:"));
    vi.clearAllMocks();
    await consumirComResultado(client, entry("bom dia"));
    expect(mocks.send).not.toHaveBeenCalled();
    expect((client as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc.mock.calls.map((call: unknown[]) => call[0]))
      .not.toContain("fn_responder_caso_por_whatsapp");
  });

  it("não envia recibo duplicado nem quando o opt-in está desligado", async () => {
    const duplicate = db({ result: "duplicate" });
    await consumirComResultado(duplicate.db, entry(`RESPONDER ${CASE} Resolvido`));
    expect(mocks.send).not.toHaveBeenCalled();
    const disabled = db({ enabled: false });
    limparCacheDoNumeroInterno();
    disabled.from.mockImplementation(((table: string) => {
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = () => builder;
      builder.maybeSingle = async () => ({
        data: table === "config_aviso_de_caso"
          ? { telefone_destino: PHONE, destino_jid: null, resposta_whatsapp_habilitada: false }
          : null,
        error: null,
      });
      builder.update = () => builder;
      builder.then = (resolve: (x: unknown) => unknown) => resolve({ error: null });
      return builder;
    }) as never);
    await consumirComResultado(disabled.db, entry(`RESPONDER ${CASE} Resolvido`));
    expect((disabled.rpc as ReturnType<typeof vi.fn>).mock.calls.map((call: unknown[]) => call[0]))
      .not.toContain("fn_responder_caso_por_whatsapp");
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("falha de envio da confirmação não derruba a ingestão", async () => {
    mocks.send.mockRejectedValueOnce(new Error("transport unavailable"));
    const { db: client } = db();
    await expect(consumirComResultado(client, entry(`RESPONDER ${CASE} Resolvido`)))
      .resolves.toEqual({ consumed: true, result: "accepted" });
  });

  it("a função pública consome mensagens do número interno sem abrir conversa", async () => {
    const { db: client } = db({ result: "unauthorized" });
    await expect(consumirRespostaDoSuporteNoWhatsApp(client, entry("mensagem comum")))
      .resolves.toBe(true);
    expect((client as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc.mock.calls.map((call: unknown[]) => call[0]))
      .not.toContain("fn_responder_caso_por_whatsapp");
  });

  it("falha da RPC é registrada, não derruba o webhook nem cria conversa do suporte", async () => {
    const { db: client } = db({ error: true });
    await expect(consumirRespostaDoSuporteNoWhatsApp(
      client,
      entry(`RESPONDER ${CASE} Resolvido`),
    )).resolves.toBe(true);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
