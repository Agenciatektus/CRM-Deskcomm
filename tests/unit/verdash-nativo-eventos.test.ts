import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * FATIA 4a do FZAP nativo: eventos de conexao no ingest, debounce do vigia,
 * telefone, carencia do QR e cerca de troca de origem. Banco de mentira em memoria
 * (linhas de verdade, filtros eq/is) e duble do FZAP que grava header de cada chamada.
 * Payloads no formato do FZAP v1.35: `{type, token, event:{...}}`.
 */
const ORG = "00000000-0000-4000-8000-0000000000a1";
const ID = "00000000-0000-4000-8000-0000000000c1";
const INST = "org-abc123";
const TOKEN_INSTANCIA = "token-da-instancia";
const hex = (s: string) => Buffer.from(s).toString("hex");

type Row = Record<string, unknown>;
let canais: Row[];
let saude: Row[];
let avisos: Row[];
let fzapJid: string | null;
let fzapConectado: boolean;
let fzapLogado: boolean;
let chamadasFzap: { path: string; token: string | null }[];
let falhaTelefone: string | null;

function tabelaDe(nome: string): Row[] {
  return nome === "channel_sessions" ? canais : nome === "channel_session_health" ? saude : avisos;
}

function builder(nome: string) {
  const eqs: [string, unknown][] = [];
  const nulls: string[] = [];
  let acao: "select" | "update" = "select";
  let patch: Row = {};
  const achar = () =>
    tabelaDe(nome).filter((r) => eqs.every(([c, v]) => r[c] === v) && nulls.every((c) => r[c] == null));
  const run = () => {
    if (acao === "update") {
      if (nome === "channel_sessions" && falhaTelefone && "phone_number" in patch) {
        return { error: { code: falhaTelefone, message: "dup" } };
      }
      for (const r of achar()) Object.assign(r, patch);
    }
    return { error: null };
  };
  const b = {
    select: () => b,
    eq: (c: string, v: unknown) => (eqs.push([c, v]), b),
    is: (c: string) => (nulls.push(c), b),
    update: (p: Row) => ((acao = "update"), (patch = p), b),
    maybeSingle: async () => ({ data: achar()[0] ?? null, error: null }),
    insert: async (row: Row) => (tabelaDe(nome).push({ status: "open", ...row }), { error: null }),
    upsert: async (row: Row) => {
      const r = saude.find(
        (x) => x.organization_id === row.organization_id && x.channel_session_id === row.channel_session_id,
      );
      if (r) Object.assign(r, row);
      else saude.push({ ...row });
      return { error: null };
    },
    then: (res: (v: unknown) => void) => res(run()),
  };
  return b;
}

const admin = {
  from: (nome: string) => builder(nome),
  rpc: async (_fn: string, a: Record<string, string>) => ({
    data: Buffer.from((a.ciphertext ?? "").replace("\\x", ""), "hex").toString(),
    error: null,
  }),
} as never;

import { sincronizarSaudeDaConexao } from "@/lib/channels/health";
import { verdashAdapter } from "@/lib/channels/adapters/verdash";
import { ingestVerdashInbound } from "@/lib/channels/verdash/ingest";
import { eventoDeConexao } from "@/lib/channels/verdash/eventos-conexao";
import { CARENCIA_QR_NATIVO_MS, LIMITE_DESCONECTADA_MS } from "@/lib/channels/verdash/estado-nativo";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => admin) }));

const evento = (type: string) => ({
  type,
  token: "[redacted]",
  event: type === "LoggedOut" ? { Reason: 401, OnConnect: false } : {},
});
const ingerir = (type: string) =>
  ingestVerdashInbound(admin, { organizationId: ORG, channelSessionId: ID, payload: evento(type) });
const canal = () => canais.find((c) => c.id === ID)!;
const avisosAbertos = () => avisos.filter((a) => a.ref_id === ID);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
  canais = [
    {
      id: ID,
      organization_id: ORG,
      provider: "verdash",
      verdash_origem: "nativa",
      verdash_instance_name: INST,
      verdash_token_encrypted: `\\x${hex(TOKEN_INSTANCIA)}`,
      verdash_vinculo_id: null,
      status: "STARTING",
      display_name: "Loja",
      phone_number: null,
      archived_at: null,
      created_at: "2026-10-24T11:00:00Z",
      last_status_change_at: "2026-10-24T11:00:00Z",
      metadata: {},
    },
  ];
  saude = [];
  avisos = [];
  fzapJid = "556681276920:12@s.whatsapp.net";
  fzapConectado = true;
  fzapLogado = true;
  chamadasFzap = [];
  falhaTelefone = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { headers: Record<string, string> }) => {
      const path = new URL(url).pathname;
      chamadasFzap.push({ path, token: init.headers.token ?? null });
      return new Response(
        JSON.stringify({ success: true, data: { connected: fzapConectado, loggedIn: fzapLogado, jid: fzapJid } }),
        { status: 200 },
      );
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("A) eventos de conexao no ingest (nativa)", () => {
  it("reconhece os tres tipos pelo envelope do FZAP e nada mais", () => {
    expect(eventoDeConexao(evento("Connected"))).toBe("Connected");
    expect(eventoDeConexao(evento("Disconnected"))).toBe("Disconnected");
    expect(eventoDeConexao(evento("LoggedOut"))).toBe("LoggedOut");
    expect(eventoDeConexao(evento("Message"))).toBeNull();
  });

  it("Connected: WORKING, marca ja_conectou_em, limpa desconectado_em", async () => {
    (canal().metadata as Row).desconectado_em = "2026-10-24T11:50:00Z";
    expect((await ingerir("Connected")).status).toBe("updated");
    expect(canal().status).toBe("WORKING");
    const m = canal().metadata as Row;
    expect(m.ja_conectou_em).toBe("2026-10-24T12:00:00.000Z");
    expect("desconectado_em" in m).toBe(false);
  });

  it("Disconnected: STARTING SEM aviso e grava desconectado_em", async () => {
    canal().status = "WORKING";
    await ingerir("Disconnected");
    expect(canal().status).toBe("STARTING");
    expect((canal().metadata as Row).desconectado_em).toBe("2026-10-24T12:00:00.000Z");
    expect(avisosAbertos()).toHaveLength(0);
  });

  it("Disconnected reentregue nao anda o relogio do debounce", async () => {
    await ingerir("Disconnected");
    vi.setSystemTime(new Date("2026-10-24T12:05:00Z"));
    await ingerir("Disconnected");
    expect((canal().metadata as Row).desconectado_em).toBe("2026-10-24T12:00:00.000Z");
  });

  it("LoggedOut: FAILED com aviso qr_rescan imediato, e a reentrega nao duplica", async () => {
    canal().status = "WORKING";
    await ingerir("LoggedOut");
    expect(canal().status).toBe("FAILED");
    expect(avisosAbertos()).toHaveLength(1);
    expect(avisosAbertos()[0]).toMatchObject({ kind: "qr_rescan", severity: "critical", ref_kind: "channel_session" });
    await ingerir("LoggedOut");
    expect(avisosAbertos()).toHaveLength(1);
  });

  it("Disconnected depois de LoggedOut nao rebaixa FAILED nem fecha o aviso", async () => {
    await ingerir("LoggedOut");
    await ingerir("Disconnected");
    expect(canal().status).toBe("FAILED");
    expect(avisosAbertos().filter((a) => a.status !== "resolved")).toHaveLength(1);
  });

  it("Connected depois de LoggedOut volta WORKING e resolve o aviso", async () => {
    await ingerir("LoggedOut");
    await ingerir("Connected");
    expect(canal().status).toBe("WORKING");
    expect(avisosAbertos().every((a) => a.status === "resolved")).toBe(true);
  });

  it("canal VINCULADO ignora os eventos como antes (regressao)", async () => {
    canal().verdash_origem = "vinculada";
    for (const t of ["Connected", "Disconnected", "LoggedOut"]) {
      expect(await ingerir(t)).toEqual({ status: "ignored", reason: "evento_sem_interesse" });
    }
    expect(canal().status).toBe("STARTING");
    expect(avisosAbertos()).toHaveLength(0);
  });

  it("canal ARQUIVADO ignora", async () => {
    canal().archived_at = "2026-10-20T00:00:00Z";
    expect((await ingerir("LoggedOut")).status).toBe("ignored");
    expect(canal().status).toBe("STARTING");
  });
});

describe("B) debounce do vigia (relogio controlado)", () => {
  const vigiar = () => verdashAdapter.checkHealth!({ organizationId: ORG, sessionRef: INST });

  beforeEach(() => {
    fzapConectado = false;
    canal().status = "WORKING";
    (canal().metadata as Row).ja_conectou_em = "2026-10-20T00:00:00Z";
  });

  it("primeira observacao: STARTING, e carimba desconectado_em", async () => {
    expect((await vigiar()).status).toBe("STARTING");
    expect((canal().metadata as Row).desconectado_em).toBe("2026-10-24T12:00:00.000Z");
  });

  it("ate 10 min continua STARTING; passando de 10 min vira FAILED com aviso", async () => {
    (canal().metadata as Row).desconectado_em = new Date(Date.now() - LIMITE_DESCONECTADA_MS + 1000).toISOString();
    expect((await vigiar()).status).toBe("STARTING");
    vi.setSystemTime(Date.now() + 2000);
    const h = await vigiar();
    expect(h.status).toBe("FAILED");
    await sincronizarSaudeDaConexao(admin, { id: ID, organization_id: ORG, status: "FAILED" }, h, "Loja");
    expect(avisosAbertos()).toHaveLength(1);
  });

  it("sem desconectado_em, usa last_status_change_at se a linha ja nao era WORKING", async () => {
    canal().status = "STARTING";
    canal().last_status_change_at = "2026-10-24T11:30:00Z";
    expect((await vigiar()).status).toBe("FAILED");
  });

  it("sem desconectado_em e linha WORKING: NAO usa o WORKING antigo (nao vira FAILED na hora)", async () => {
    canal().last_status_change_at = "2026-10-01T00:00:00Z";
    expect((await vigiar()).status).toBe("STARTING");
  });

  it("vinculada: connected:false segue STARTING para sempre (inalterado)", async () => {
    canal().verdash_origem = "vinculada";
    (canal().metadata as Row).desconectado_em = "2026-10-01T00:00:00Z";
    expect((await vigiar()).status).toBe("STARTING");
  });

  it("loggedIn:false de nativa que ja conectou: FAILED que pede QR (qr_rescan)", async () => {
    fzapLogado = false;
    const h = await vigiar();
    expect(h.status).toBe("FAILED");
    await sincronizarSaudeDaConexao(admin, { id: ID, organization_id: ORG, status: "FAILED" }, h, "Loja");
    expect(avisosAbertos()[0]).toMatchObject({ kind: "qr_rescan" });
  });
});

describe("C) telefone ao conectar pela primeira vez", () => {
  it("Connected le o jid de /session/status COM o token da instancia e grava phone_number", async () => {
    await ingerir("Connected");
    expect(canal().phone_number).toBe("+556681276920");
    expect(chamadasFzap).toEqual([{ path: "/session/status", token: TOKEN_INSTANCIA }]);
  });

  it("o vigia tambem preenche ao ver WORKING pela primeira vez", async () => {
    await verdashAdapter.checkHealth!({ organizationId: ORG, sessionRef: INST });
    expect(canal().phone_number).toBe("+556681276920");
  });

  it("nao sobrescreve telefone ja gravado nem chama o FZAP", async () => {
    canal().phone_number = "+5511999990000";
    await ingerir("Connected");
    expect(canal().phone_number).toBe("+5511999990000");
    expect(chamadasFzap).toHaveLength(0);
  });

  it("23505 (trava de numero unico): o canal segue WORKING, sem telefone e sem estourar", async () => {
    falhaTelefone = "23505";
    await expect(ingerir("Connected")).resolves.toMatchObject({ status: "updated" });
    expect(canal().status).toBe("WORKING");
    expect(canal().phone_number).toBeNull();
  });

  it("sem jid (ainda sem login) nao grava nada", async () => {
    fzapJid = null;
    await ingerir("Connected");
    expect(canal().phone_number).toBeNull();
  });
});

describe("D) carencia do alerta de QR", () => {
  const qr = { reachable: true, status: "SCAN_QR_CODE", detail: null };
  const sessao = { id: ID, organization_id: ORG, status: "SCAN_QR_CODE" };

  it("nativa criada ha menos de 30 min, nunca conectou: sem aviso", async () => {
    canal().created_at = new Date(Date.now() - CARENCIA_QR_NATIVO_MS + 60_000).toISOString();
    expect(await sincronizarSaudeDaConexao(admin, sessao, qr, "Loja")).toBe("sem_mudanca");
    expect(avisosAbertos()).toHaveLength(0);
  });

  it("passada a carencia, avisa normalmente", async () => {
    canal().created_at = new Date(Date.now() - CARENCIA_QR_NATIVO_MS - 60_000).toISOString();
    expect(await sincronizarSaudeDaConexao(admin, sessao, qr, "Loja")).toBe("avisado");
  });

  it("nativa que JA conectou avisa mesmo recem-criada", async () => {
    canal().created_at = new Date(Date.now() - 60_000).toISOString();
    (canal().metadata as Row).ja_conectou_em = "2026-10-24T11:59:00Z";
    expect(await sincronizarSaudeDaConexao(admin, sessao, qr, "Loja")).toBe("avisado");
  });

  it("vinculada recem-criada avisa como sempre", async () => {
    canal().verdash_origem = "vinculada";
    canal().created_at = new Date(Date.now() - 60_000).toISOString();
    expect(await sincronizarSaudeDaConexao(admin, sessao, qr, "Loja")).toBe("avisado");
  });
});
