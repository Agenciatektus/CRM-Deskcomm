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
let chamadasRpc: { fn: string; args: Record<string, unknown> }[];
let antesDaRpc: (() => void) | null;
let rpcFalha: boolean;
let falhaMensagemTelefone: string | null;

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
      // Invariante do P1: NENHUM caminho regrava o metadata inteiro (so a RPC atomica).
      if (nome === "channel_sessions" && "metadata" in patch) {
        throw new Error("update direto de metadata: lost update");
      }
      if (nome === "channel_sessions" && (falhaTelefone || falhaMensagemTelefone) && "phone_number" in patch) {
        return { error: { code: falhaTelefone ?? undefined, message: falhaMensagemTelefone ?? "dup" } };
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

/** Espelho em TS da fn_registrar_evento_conexao_nativa (merge sobre o metadata ATUAL, nao sobre uma leitura velha). */
function rpcEvento(a: { p_org: string; p_canal: string; p_evento: string; p_em: string | null }) {
  antesDaRpc?.();
  const c = canais.find((x) => x.id === a.p_canal && x.organization_id === a.p_org && x.archived_at == null);
  if (!c) return { resultado: "ignorado", motivo: "canal_arquivado" };
  if (c.verdash_origem !== "nativa") return { resultado: "ignorado", motivo: "evento_sem_interesse" };
  const agora = new Date().toISOString();
  const em = a.p_em ?? agora;
  const m = { ...((c.metadata as Row) ?? {}) };
  const ultimo = (m.evento_conexao_em as string | undefined) ?? (c.last_status_change_at as string | undefined);
  if (ultimo && new Date(em) < new Date(ultimo)) return { resultado: "obsoleto", status: c.status };
  let status: string;
  if (a.p_evento === "Connected") {
    status = "WORKING";
    delete m.desconectado_em;
    m.ja_conectou_em = m.ja_conectou_em ?? agora;
  } else if (a.p_evento === "LoggedOut") {
    status = "FAILED";
    m.ja_conectou_em = m.ja_conectou_em ?? agora;
    m.desconectado_em = m.desconectado_em ?? agora;
  } else {
    status = c.status === "FAILED" || c.status === "STOPPED" ? (c.status as string) : "STARTING";
    m.desconectado_em = m.desconectado_em ?? agora;
  }
  m.evento_conexao_em = em;
  const mudou = status !== c.status;
  c.status = status;
  if (mudou) c.last_status_change_at = agora;
  c.metadata = m;
  return {
    resultado: "aplicado",
    status,
    mudou,
    display_name: c.display_name,
    phone_number: c.phone_number,
    instancia: c.verdash_instance_name,
  };
}

const admin = {
  from: (nome: string) => builder(nome),
  rpc: async (fn: string, a: Record<string, string>) => {
    chamadasRpc.push({ fn, args: a });
    if (fn === "fn_registrar_evento_conexao_nativa") {
      return rpcFalha ? { data: null, error: { message: "boom" } } : { data: rpcEvento(a as never), error: null };
    }
    return {
      data: Buffer.from((a.ciphertext ?? "").replace("\\x", ""), "hex").toString(),
      error: null,
    };
  },
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
const ingerir = (type: string, ts?: string) =>
  ingestVerdashInbound(admin, {
    organizationId: ORG,
    channelSessionId: ID,
    payload: ts ? { ...evento(type), event: { ...evento(type).event, Timestamp: ts } } : evento(type),
  });
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
  falhaMensagemTelefone = null;
  chamadasRpc = [];
  antesDaRpc = null;
  rpcFalha = false;
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

describe("P1: escrita atomica pela RPC (a ligacao, nao o efeito)", () => {
  it("o evento vai pela RPC com os argumentos exatos, e nenhum update direto de metadata", async () => {
    await ingerir("LoggedOut", "2026-10-24T11:59:00Z");
    expect(chamadasRpc.filter((c) => c.fn === "fn_registrar_evento_conexao_nativa")).toEqual([
      {
        fn: "fn_registrar_evento_conexao_nativa",
        args: { p_org: ORG, p_canal: ID, p_evento: "LoggedOut", p_em: "2026-10-24T11:59:00.000Z" },
      },
    ]);
  });

  it("sem Timestamp no envelope, p_em vai null (a RPC usa now())", async () => {
    await ingerir("Connected");
    expect(chamadasRpc.find((c) => c.fn === "fn_registrar_evento_conexao_nativa")!.args.p_em).toBeNull();
  });

  it("Timestamp no futuro (relogio adiantado) nao trava os eventos seguintes", async () => {
    await ingerir("Connected", "2030-01-01T00:00:00Z");
    expect(chamadasRpc.find((c) => c.fn === "fn_registrar_evento_conexao_nativa")!.args.p_em).toBeNull();
  });

  it("ai_gate_mode / pausa gravados NO MEIO da escrita sobrevivem", async () => {
    antesDaRpc = () => {
      Object.assign(canal().metadata as Row, {
        ai_gate_mode: "pre_go_live",
        ai_test_phone_numbers: ["+5511999990000"],
        disabled: true,
        disabled_by: "manual",
      });
    };
    await ingerir("Connected");
    expect(canal().metadata).toMatchObject({
      ai_gate_mode: "pre_go_live",
      ai_test_phone_numbers: ["+5511999990000"],
      disabled: true,
      disabled_by: "manual",
      ja_conectou_em: expect.any(String),
    });
  });

  it("o vigia tambem escreve so pela RPC (Disconnected e Connected)", async () => {
    fzapConectado = false;
    canal().status = "WORKING";
    await verdashAdapter.checkHealth!({ organizationId: ORG, sessionRef: INST });
    fzapConectado = true;
    await verdashAdapter.checkHealth!({ organizationId: ORG, sessionRef: INST });
    expect(chamadasRpc.filter((c) => c.fn === "fn_registrar_evento_conexao_nativa").map((c) => c.args.p_evento)).toEqual(["Disconnected", "Connected"]);
  });
});

describe("P2-1: ordem dos eventos", () => {
  it("Disconnected velho depois de Connected nao rebaixa WORKING", async () => {
    await ingerir("Connected", "2026-10-24T11:58:00Z");
    expect((await ingerir("Disconnected", "2026-10-24T11:57:00Z")).reason).toBe("evento_obsoleto");
    expect(canal().status).toBe("WORKING");
  });

  it("Connected atrasado depois de LoggedOut nao fecha o aviso", async () => {
    await ingerir("LoggedOut", "2026-10-24T11:58:00Z");
    expect((await ingerir("Connected", "2026-10-24T11:57:00Z")).reason).toBe("evento_obsoleto");
    expect(canal().status).toBe("FAILED");
    expect(avisosAbertos().filter((a) => a.status === "open")).toHaveLength(1);
  });

  it("evento mais novo que o ultimo passa", async () => {
    await ingerir("LoggedOut", "2026-10-24T11:57:00Z");
    expect((await ingerir("Connected", "2026-10-24T11:58:00Z")).status).toBe("updated");
    expect(canal().status).toBe("WORKING");
  });
});

describe("P2-2/P2-3: telefone", () => {
  it("o vigia tenta de novo enquanto o telefone for nulo (jid ausente na 1a vez)", async () => {
    fzapJid = null;
    await verdashAdapter.checkHealth!({ organizationId: ORG, sessionRef: INST });
    expect(canal().phone_number).toBeNull();
    fzapJid = "556681276920:12@s.whatsapp.net";
    await verdashAdapter.checkHealth!({ organizationId: ORG, sessionRef: INST });
    expect(canal().phone_number).toBe("+556681276920");
  });

  it("23505 no vigia: WORKING com detalhe proprio que vira aviso warn, sem o numero no texto", async () => {
    falhaTelefone = "23505";
    const h = await verdashAdapter.checkHealth!({ organizationId: ORG, sessionRef: INST });
    expect(h).toEqual({ reachable: true, status: "WORKING", detail: "numero_em_conflito_com_outro_canal" });
    await sincronizarSaudeDaConexao(admin, { id: ID, organization_id: ORG, status: "WORKING" }, h, "Loja");
    expect(avisosAbertos()[0]).toMatchObject({ severity: "warn" });
    expect(JSON.stringify(avisosAbertos()[0])).not.toContain("6681276920");
    falhaTelefone = null;
    const h2 = await verdashAdapter.checkHealth!({ organizationId: ORG, sessionRef: INST });
    await sincronizarSaudeDaConexao(admin, { id: ID, organization_id: ORG, status: "WORKING" }, h2, "Loja");
    expect(avisosAbertos().every((a) => a.status === "resolved")).toBe(true);
  });

  it("numero de OUTRA organizacao (indice de instancia) tambem e conflito", async () => {
    falhaMensagemTelefone = 'duplicate key value violates unique constraint "channel_sessions_verdash_instance_unique"';
    const h = await verdashAdapter.checkHealth!({ organizationId: ORG, sessionRef: INST });
    expect(h.detail).toBe("numero_em_conflito_com_outro_canal");
  });
});

describe("P2-4: erro da escrita nao dispara aviso", () => {
  it("RPC com erro: lanca, nao chama a saude e nao abre aviso", async () => {
    rpcFalha = true;
    await expect(ingerir("LoggedOut")).rejects.toThrow("verdash_evento_conexao_nao_gravado");
    expect(avisos).toHaveLength(0);
    expect(saude).toHaveLength(0);
  });
});
