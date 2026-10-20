/**
 * #3112 — o rodízio na RODADA respeita o número pelo qual o envio SAI e o
 * intervalo do pacing desse número.
 *
 * Dois furos, os dois do mesmo desenho: a rodada guardava "um envio por número"
 * pelo número PRINCIPAL da campanha, mas o envio sai pelo número que o rodízio
 * escolheu; e o motor de pacing devolve `{ allow: true, waitMs }` quando só
 * falta o intervalo, e a rodada lia só o `allow`. Hoje o espaçamento real virava
 * "um por principal por rodada" × cadência do cron — não o throttle do número.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PACING_DEFAULTS, type PacingKnobs } from "@/lib/agent-engine/pacing/defaults";

const mundo = vi.hoisted(() => ({
  knobs: null as unknown as PacingKnobs,
  /** O `pacing_ledger` em memória: o que `recordSend` grava, `loadPacingState` lê. */
  ledger: new Map<string, Date[]>(),
  envios: [] as string[],
}));

vi.mock("@/lib/logger", () => ({ logger: { info: () => undefined, warn: () => undefined, error: () => undefined } }));
vi.mock("@/lib/agent-engine/db/request-pool", () => ({ getRequestPool: () => ({}) }));
vi.mock("@/lib/agent-engine/pacing/store", () => ({
  loadChannelKnobs: async () => ({ knobs: mundo.knobs, numberActivatedAt: null }),
  loadPacingState: async (_pool: unknown, _org: string, sessionId: string) => {
    const envios = mundo.ledger.get(sessionId) ?? [];
    return { lastSentAt: envios.at(-1) ?? null, sentToday: envios.length, numberActivatedAt: null };
  },
  recordSend: async (_pool: unknown, _org: string, sessionId: string, quando: Date) => {
    mundo.ledger.set(sessionId, [...(mundo.ledger.get(sessionId) ?? []), quando]);
  },
}));
vi.mock("@/lib/atendimento/origem", () => ({
  beginServiceAtOrigin: async (_admin: unknown, _org: string, contato: string, sessionId: string) => ({
    conversation_id: `conv:${contato}:${sessionId}`,
  }),
}));
vi.mock("@/app/api/v1/messages/_handler", () => ({
  sendMessageHandler: async (_admin: unknown, ctx: { serviceBoundary: { conversation_id: string } }) => {
    mundo.envios.push(ctx.serviceBoundary.conversation_id);
    return { id: `msg-${mundo.envios.length}`, status: "queued" };
  },
}));

import { rodarUmaRodadaDeCampanha } from "@/lib/campanhas/rodada";

type Linha = Record<string, unknown>;

const AGORA = new Date("2026-10-20T14:00:00.000Z"); // terça, 11h em São Paulo

/** PostgREST em memória: só `eq`, `in`, `gte`, `not is null`, `limit`, `update` e `maybeSingle`. */
function fakeAdmin(tabelas: Record<string, Linha[]>) {
  const de = (tabela: string) => {
    const filtros: Array<(l: Linha) => boolean> = [];
    let limite = Infinity;
    let patch: Linha | null = null;
    const resolver = () => {
      const linhas = (tabelas[tabela] ?? []).filter((l) => filtros.every((f) => f(l))).slice(0, limite);
      if (patch) for (const l of linhas) Object.assign(l, patch);
      return { data: linhas, error: null, count: linhas.length };
    };
    const b: Record<string, unknown> = new Proxy(
      {},
      {
        get(_alvo, metodo) {
          switch (metodo) {
            case "then":
              return (ok: (v: unknown) => unknown) => Promise.resolve(resolver()).then(ok);
            case "maybeSingle":
              return async () => ({ data: resolver().data[0] ?? null, error: null });
            case "update":
              return (p: Linha) => ((patch = p), b);
            case "eq":
              return (coluna: string, valor: unknown) => {
                if (coluna === "organizations.status") filtros.push((l) => (l.organizations as Linha).status === valor);
                else filtros.push((l) => l[coluna] === valor);
                return b;
              };
            case "in":
              return (coluna: string, valores: unknown[]) => (filtros.push((l) => valores.includes(l[coluna])), b);
            case "gte":
              return (coluna: string, valor: string) => (filtros.push((l) => String(l[coluna] ?? "") >= valor), b);
            case "not":
              return (coluna: string) => (filtros.push((l) => l[coluna] != null), b);
            case "limit":
              return (n: number) => ((limite = n), b);
            default:
              return () => b;
          }
        },
      },
    );
    return b;
  };
  return { from: de } as never;
}

const campanha = (id: string, principal: string, startedAt: string): Linha => ({
  id,
  organization_id: "org-1",
  channel_session_id: principal,
  name: id,
  message_body: "oi",
  content_version: 1,
  intervalo_segundos: null,
  janela_inicio_hora: null,
  janela_fim_hora: null,
  teto_diario: null,
  teto_horario: null,
  status: "running",
  started_at: startedAt,
  organizations: { status: "active" },
});

const pendente = (id: string, campanhaId: string, contato: string): Linha => ({
  id,
  campaign_id: campanhaId,
  status: "pending",
  sent_at: null,
  contact_id: contato,
  recipient_address: null,
  rendered_body: null,
  contacts: {
    id: contato,
    name: contato,
    display_name: null,
    phone_number: `+55819999${contato.length}0000`,
    is_blocked: false,
    is_personal: false,
    is_anonymized: false,
    consent: null,
  },
});

const canal = (id: string, status: string): Linha => ({
  id,
  organization_id: "org-1",
  status,
  daily_message_limit: null,
});

beforeEach(() => {
  mundo.ledger.clear();
  mundo.envios.length = 0;
});

describe("rodada: duas campanhas de principais diferentes dividindo um número vinculado", () => {
  /**
   * Throttle zerado de propósito: este caso mede a regra da RODADA ("um envio
   * por número por rodada"), não o intervalo do pacing — que tem o caso dele
   * abaixo. Com throttle, o pacing esconderia o furo da rodada.
   */
  beforeEach(() => {
    mundo.knobs = { ...PACING_DEFAULTS, throttleMs: 0, jitterMaxMs: 0 };
  });

  function cenario() {
    return fakeAdmin({
      campaigns: [
        campanha("camp-a", "principal-a", "2026-10-20T11:00:00.000Z"),
        campanha("camp-b", "principal-b", "2026-10-20T11:00:05.000Z"),
      ],
      campaign_recipients: [pendente("r-a", "camp-a", "ana"), pendente("r-b", "camp-b", "bia")],
      // Os dois principais fora do ar: o único número que fala é o vinculado comum.
      campaign_channel_sessions: [
        { organization_id: "org-1", campaign_id: "camp-a", channel_session_id: "vinculado" },
        { organization_id: "org-1", campaign_id: "camp-b", channel_session_id: "vinculado" },
      ],
      channel_sessions: [canal("principal-a", "STOPPED"), canal("principal-b", "STOPPED"), canal("vinculado", "WORKING")],
    });
  }

  it("⭐ o vinculado manda UMA na rodada, e a segunda campanha espera", async () => {
    const r = await rodarUmaRodadaDeCampanha(cenario(), AGORA);
    expect(mundo.ledger.get("vinculado")).toHaveLength(1);
    expect(mundo.envios).toEqual(["conv:ana:vinculado"]);
    expect(r.enviadas).toBe(1);
    expect(r.detalhe).toContain("camp-a:enviado:");
    expect(r.detalhe).toContain("camp-b:canal:sem_numero_livre");
  });
});

describe("rodada: número cujo pacing só falta o intervalo (allow com waitMs > 0)", () => {
  beforeEach(() => {
    mundo.knobs = { ...PACING_DEFAULTS, throttleMs: 5_000, jitterMaxMs: 0 };
  });

  function cenario() {
    return fakeAdmin({
      campaigns: [campanha("camp-a", "principal", "2026-10-20T11:00:00.000Z")],
      campaign_recipients: [pendente("r-a", "camp-a", "ana")],
      campaign_channel_sessions: [],
      channel_sessions: [canal("principal", "WORKING")],
    });
  }

  it("⭐ o agente mandou há 2s e o intervalo é 5s: a campanha não sai por esse número agora", async () => {
    mundo.ledger.set("principal", [new Date(AGORA.getTime() - 2_000)]);
    const r = await rodarUmaRodadaDeCampanha(cenario(), AGORA);
    expect(mundo.envios).toEqual([]);
    expect(r.enviadas).toBe(0);
    expect(r.detalhe).toContain("camp-a:canal:sem_numero_livre");
  });

  it("controle: com o intervalo cumprido (10s atrás), ela sai", async () => {
    mundo.ledger.set("principal", [new Date(AGORA.getTime() - 10_000)]);
    const r = await rodarUmaRodadaDeCampanha(cenario(), AGORA);
    expect(mundo.envios).toEqual(["conv:ana:principal"]);
    expect(r.enviadas).toBe(1);
  });
});
