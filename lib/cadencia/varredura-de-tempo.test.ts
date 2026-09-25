import { describe, expect, it } from "vitest";

import {
  JANELA_DE_CAPTURA_MS,
  quemEsperaQuem,
  varrerGatilhosDeTempo,
  type CadenciaDeTempo,
  type ConversaCandidata,
  type VarreduraDeTempoDb,
} from "./varredura-de-tempo";

const AGORA = new Date("2026-09-25T15:00:00.000Z");
const antes = (min: number) => new Date(AGORA.getTime() - min * 60_000).toISOString();

const conversa = (c: Partial<ConversaCandidata>): ConversaCandidata => ({
  id: "cv-1",
  contact_id: "c-1",
  last_inbound_at: null,
  last_outbound_at: null,
  awaiting_since: null,
  ...c,
});

describe("quemEsperaQuem — agent_sla (cliente esperando o time)", () => {
  it("cliente falou por último e espera há mais que o limiar: viola, no instante começo + limiar", () => {
    const c = conversa({ last_inbound_at: antes(20), last_outbound_at: antes(90), awaiting_since: antes(45) });
    expect(quemEsperaQuem("agent_sla", c, AGORA, 30)).toBe(antes(15));
  });

  it("mede do COMEÇO da espera (awaiting_since), não da última mensagem de quem insiste", () => {
    const c = conversa({ last_inbound_at: antes(5), last_outbound_at: antes(90), awaiting_since: antes(40) });
    expect(quemEsperaQuem("agent_sla", c, AGORA, 30)).not.toBeNull();
  });

  it("ainda dentro do limiar: não viola", () => {
    const c = conversa({ last_inbound_at: antes(10), last_outbound_at: antes(90), awaiting_since: antes(10) });
    expect(quemEsperaQuem("agent_sla", c, AGORA, 30)).toBeNull();
  });

  it("o time respondeu por último: a bola está com o cliente, não viola", () => {
    const c = conversa({ last_inbound_at: antes(60), last_outbound_at: antes(50), awaiting_since: antes(60) });
    expect(quemEsperaQuem("agent_sla", c, AGORA, 30)).toBeNull();
  });
});

describe("quemEsperaQuem — lead_idle (nós esperando o lead)", () => {
  it("falamos por último e o lead não responde há mais que o limiar: viola", () => {
    const c = conversa({ last_inbound_at: antes(5000), last_outbound_at: antes(3000) });
    expect(quemEsperaQuem("lead_idle", c, AGORA, 2880)).toBe(antes(120));
  });

  it("nunca respondeu e já passou o limiar: viola", () => {
    expect(quemEsperaQuem("lead_idle", conversa({ last_outbound_at: antes(3000) }), AGORA, 2880)).not.toBeNull();
  });

  it("o lead respondeu depois da nossa mensagem: não viola", () => {
    const c = conversa({ last_inbound_at: antes(100), last_outbound_at: antes(3000) });
    expect(quemEsperaQuem("lead_idle", c, AGORA, 2880)).toBeNull();
  });

  it("nunca mandamos nada: não é 'lead parado'", () => {
    expect(quemEsperaQuem("lead_idle", conversa({ last_inbound_at: antes(9000) }), AGORA, 2880)).toBeNull();
  });
});

describe("varrerGatilhosDeTempo", () => {
  const cadencia: CadenciaDeTempo = {
    id: "p-1",
    organization_id: "org-1",
    pipeline_id: "funil-1",
    channel_session_id: "num-1",
    tipo: "agent_sla",
    limiar_min: 30,
  };

  function banco(conversas: ConversaCandidata[], negocio: string | null = "lead-1") {
    const janelas: Array<[string, string]> = [];
    const db: VarreduraDeTempoDb = {
      cadenciasDeTempo: async () => [cadencia],
      candidatas: async (_c, desde, ate) => (janelas.push([desde, ate]), conversas),
      negocioAbertoDoContato: async () => negocio,
    };
    return { db, janelas };
  }

  it("pede ao banco só a janela [agora − limiar − 24 h, agora − limiar]", async () => {
    const { db, janelas } = banco([]);
    await varrerGatilhosDeTempo({ db, inscrever: async () => ({ ok: true }) as never, clock: () => AGORA });
    const [desde, ate] = janelas[0]!;
    expect(ate).toBe(antes(30));
    expect(Date.parse(ate) - Date.parse(desde)).toBe(JANELA_DE_CAPTURA_MS);
  });

  it("inscreve o negócio aberto do contato, com a origem de tempo e o instante da violação", async () => {
    const chamadas: unknown[] = [];
    const { db } = banco([conversa({ last_inbound_at: antes(40), last_outbound_at: antes(90), awaiting_since: antes(40) })]);
    const r = await varrerGatilhosDeTempo({
      db,
      inscrever: async (input) => (chamadas.push(input), { ok: true }) as never,
      clock: () => AGORA,
    });
    expect(r.inscritos).toBe(1);
    expect(chamadas[0]).toEqual({
      organizationId: "org-1",
      pointerId: "p-1",
      leadId: "lead-1",
      eventoEm: antes(10),
      origem: "gatilho_tempo",
      conversationId: "cv-1",
    });
  });

  it("candidata que o código recusa (o time respondeu) não chega à porta", async () => {
    let chamou = false;
    const { db } = banco([conversa({ last_inbound_at: antes(60), last_outbound_at: antes(50), awaiting_since: antes(60) })]);
    await varrerGatilhosDeTempo({ db, inscrever: async () => ((chamou = true), { ok: true }) as never, clock: () => AGORA });
    expect(chamou).toBe(false);
  });

  it("contato sem negócio aberto no funil da cadência: conta a recusa e não inscreve", async () => {
    const { db } = banco([conversa({ last_inbound_at: antes(40), awaiting_since: antes(40) })], null);
    const r = await varrerGatilhosDeTempo({ db, inscrever: async () => ({ ok: true }) as never, clock: () => AGORA });
    expect(r.inscritos).toBe(0);
    expect(r.recusas.sem_negocio_no_funil).toBe(1);
  });
});
