// ─── O canal recém-pareado não nasce dizendo "STARTING" ────────────────────
//
// `WORKING` é o vocabulário DESTE CRM (`channel_sessions.status`). A plataforma
// responde no dela: `connected`, minúsculo. A comparação era só contra
// `"WORKING"`, então nunca casava — e todo canal recém-pareado nascia
// `STARTING`.
//
// Não quebrava nada: a varredura de saúde corrige em até 5 minutos. Mas nesses
// 5 minutos a tela mostra "STARTING" para quem ACABOU de colar o código, e isso
// se lê como "não deu certo". Medido em 24/09/2026 ao parear o Instagram do
// Portal da China — o canal estava `connected` na plataforma, vínculo vivo,
// webhook registrado, e a tela dizia STARTING.

import { afterEach, describe, expect, it, vi } from "vitest";

import { trocarCodigoPorCredencial } from "@/lib/channels/verdash/conectar";

function resposta(status: string | null) {
  return {
    ok: true,
    json: async () => ({
      success: true,
      data: {
        vinculo_id: "v1",
        instancia_id: "i1",
        token: "token-de-maquina",
        phone_number: null,
        display_name: "@conta",
        status,
        recebimento_ligado: true,
        recebimento_aviso: null,
      },
    }),
  } as never;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const pedido = { codigo: "XK4P9T2MQW", webhookUrl: "https://x.test/w", segredo: "s", rotulo: "R" };

describe("o status que a plataforma devolve", () => {
  it("`connected` — o dialeto de LÁ — conta como conectado", async () => {
    vi.stubGlobal("fetch", async () => resposta("connected"));
    const r = await trocarCodigoPorCredencial(pedido);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.connected, "o canal acabou de conectar; a tela não pode dizer STARTING").toBe(true);
  });

  it("`WORKING` — o dialeto daqui — continua contando", async () => {
    // Aceitar os dois é o que faz esta linha parar de depender de qual das duas
    // pontas foi atualizada por último.
    vi.stubGlobal("fetch", async () => resposta("WORKING"));
    const r = await trocarCodigoPorCredencial(pedido);
    if (r.ok) expect(r.connected).toBe(true);
  });

  it("estado de verdade NÃO conectado continua sendo `false`", async () => {
    // O ponto não é dizer sim para tudo: uma instância parada tem de aparecer
    // como parada, senão a Central deixa de avisar o que importa.
    for (const status of ["disconnected", "STOPPED", "starting", null]) {
      vi.stubGlobal("fetch", async () => resposta(status));
      const r = await trocarCodigoPorCredencial(pedido);
      if (r.ok) expect(r.connected, `status ${String(status)}`).toBe(false);
    }
  });
});
