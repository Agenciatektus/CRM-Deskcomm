import { describe, expect, it, vi } from "vitest";

import {
  conversaEhDeHumano,
  deteccoesDeterministicasDoAssistido,
} from "@/lib/agent-engine/agent/inbound-turn";

/**
 * A TRAVA QUE A PRIMEIRA VERSÃO NÃO TINHA (9060).
 *
 * A liberação do gate vale para a SESSÃO; quem atende vem do roteador e pode
 * ser outro agente. A primeira correção pôs a pergunta num ponto só, e a
 * revisão achou dois ramos assistidos que a contornavam — ambos terminando em
 * `avisarLeadDaEscalacao`, que fala com o cliente e grava `force_human`, que
 * não reverte.
 *
 * Por isso a pergunta passou a morar dentro de quem decide se o agente atua.
 * Este arquivo prende esse lugar.
 */
describe("auxiliar de CRM: a conversa é de uma pessoa?", () => {
  const ORG = "11111111-1111-4111-8111-111111111111";
  const CONVERSA = "22222222-2222-4222-8222-222222222222";

  const poolQueResponde = (bloqueia: boolean) => ({
    query: vi.fn(async () => ({ rows: [{ bloqueia }] })),
  });

  it("lê a linha da conversa pela organização e pelo id, nunca por outra coisa", async () => {
    const pool = poolQueResponde(true);
    expect(await conversaEhDeHumano(pool as never, ORG, CONVERSA)).toBe(true);
    // Multi-tenancy: os dois parâmetros vêm de fonte confiável, nesta ordem.
    expect(pool.query.mock.calls[0]?.[1]).toEqual([ORG, CONVERSA]);
  });

  it("CONTROLE — conversa sem dono e sem silêncio não bloqueia", async () => {
    expect(await conversaEhDeHumano(poolQueResponde(false) as never, ORG, CONVERSA)).toBe(false);
  });

  it("CONTROLE — conversa que não existe não vira liberação", async () => {
    const vazio = { query: vi.fn(async () => ({ rows: [] })) };
    expect(await conversaEhDeHumano(vazio as never, ORG, CONVERSA)).toBe(false);
  });

  describe("o ramo assistido", () => {
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const agente = (somenteInterno: boolean) =>
      ({ agentId: "33333333-3333-4333-8333-333333333333", somenteInterno }) as never;
    const args = (somenteInterno: boolean) => ({
      job: { id: "44444444-4444-4444-4444-444444444444" } as never,
      tenantId: ORG,
      conversationId: CONVERSA,
      channelSessionId: "55555555-5555-4555-8555-555555555555",
      leadId: "66666666-6666-4666-8666-666666666666",
      agent: agente(somenteInterno),
      log: log as never,
    });

    it("⭐ agente que FALA, conversa de uma pessoa: a detecção nem começa", async () => {
      // O pool responde a pergunta da trava e explode em qualquer outra: se a
      // função seguisse adiante, o teste falharia dizendo exatamente isso, em
      // vez de passar porque o resultado por acaso bateu.
      let chamadas = 0;
      const pool = {
        query: vi.fn(async () => {
          chamadas += 1;
          if (chamadas === 1) return { rows: [{ bloqueia: true }] };
          throw new Error("a detecção continuou depois da trava");
        }),
      };
      const r = await deteccoesDeterministicasDoAssistido(
        pool as never,
        { log: log as never } as never,
        args(false),
      );
      expect(r).toBe(false);
      expect(chamadas).toBe(1);
    });

    it("⭐ auxiliar de CRM na MESMA conversa: a trava não se aplica", async () => {
      // Sem este caso, um `return false` incondicional passaria no anterior e
      // desligaria o ramo assistido para todo mundo — o oposto do que a PR quer.
      //
      // A função engole erro de leitura de propósito (um pedido de parar não
      // pode virar "sem detecção" porque o CRM oscilou), então o sinal não é a
      // exceção: é a trava NÃO ter registrado o seu motivo.
      log.info.mockClear();
      const pool = { query: vi.fn(async () => ({ rows: [{ bloqueia: true }] })) };
      await deteccoesDeterministicasDoAssistido(
        pool as never,
        { log: log as never } as never,
        args(true),
      );
      const falouDaTrava = log.info.mock.calls.some((c) =>
        String(c[0]).includes("quem atenderia fala"),
      );
      expect(falouDaTrava).toBe(false);
    });

    it("CONTROLE — e para quem fala, a trava REGISTRA o motivo", async () => {
      // O par do caso acima: prova que a frase existe e é alcançável, senão o
      // `toBe(false)` de lá passaria por a frase nunca ser emitida por ninguém.
      log.info.mockClear();
      const pool = { query: vi.fn(async () => ({ rows: [{ bloqueia: true }] })) };
      await deteccoesDeterministicasDoAssistido(
        pool as never,
        { log: log as never } as never,
        args(false),
      );
      const falouDaTrava = log.info.mock.calls.some((c) =>
        String(c[0]).includes("quem atenderia fala"),
      );
      expect(falouDaTrava).toBe(true);
    });
  });
});
