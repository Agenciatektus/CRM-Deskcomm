import { beforeEach, describe, expect, it, vi } from "vitest";

const credsMock = vi.hoisted(() => ({ valor: null as Record<string, unknown> | null }));
const logs = vi.hoisted(() => [] as Array<{ msg: string; ctx: unknown }>);

vi.mock("@/lib/logger", () => ({
  logger: {
    error: (msg: string, ctx: unknown) => logs.push({ msg, ctx }),
    warn: () => undefined,
    info: () => undefined,
    debug: () => undefined,
  },
}));
vi.mock("@/lib/webhooks/secrets", () => ({
  decryptWebhookSecret: async (_a: unknown, v: string) => `claro:${v}`,
  encryptWebhookSecret: async (_a: unknown, v: string) => `cif:${v}`,
}));
vi.mock("@/lib/channels/verdash/credentials", async (orig) => ({
  ...(await orig<typeof import("@/lib/channels/verdash/credentials")>()),
  resolveVerdashCreds: async () => credsMock.valor,
}));

import {
  desligarCanaisInventariados,
  inventarioDaLapide,
  inventariarCanaisDaOrganizacao,
} from "@/lib/channels/desligar-da-organizacao";
import { lerPastaDaOrg } from "@/lib/channels/verdash/nativo";
import { limparNativoDoCanal } from "@/lib/channels/verdash/limpar-nativo";
import { listarOrfasDaPasta } from "@/lib/channels/verdash/orfas-nativas";

/**
 * CICLO DE VIDA DA NATIVA (excluir canal) e VARREDOR de orfas. O duble do FZAP
 * registra header e rota: o que se testa e a LIGACAO e o "zero chamadas" da vinculada.
 */

const ORG = "00000000-0000-4000-8000-0000000000a1";
const OUTRA = "00000000-0000-4000-8000-0000000000b2";
const CANAL = "00000000-0000-4000-8000-00000000c001";
const PASTA_TOKEN = "claro:cif-pasta";
const INST_TOKEN = "token-da-instancia";
const FZAP_ID = "fzap-1";

interface Chamada {
  method: string;
  path: string;
  token: string | undefined;
}
let chamadas: Chamada[];
let instancias: Array<{ id: string; name: string; metadata: Record<string, unknown> }>;
let fora: boolean;
let rpcs: Array<{ fn: string; args: Record<string, unknown> }>;
let canalRow: Record<string, unknown> | null;
let linhasAtivas: Array<Record<string, unknown>>;

const env = (status: number, data?: unknown, error?: string) => ({
  ok: status < 300,
  status,
  statusText: error ?? "",
  json: async () => ({ code: status, success: status < 300, data, error }),
});

const fzap = (async (url: unknown, init?: RequestInit) => {
  const path = new URL(String(url)).pathname;
  const method = init?.method ?? "GET";
  chamadas.push({ method, path, token: (init?.headers as Record<string, string>)?.token });
  if (fora) throw new Error("ECONNREFUSED");
  if (path === "/folder/instances") return env(200, instancias);
  if (path === "/session/disconnect" || path === "/session/logout") return env(200, {});
  const m = path.match(/^\/folder\/instances\/([^/]+)\/full$/);
  if (m && method === "DELETE") return env(200, {});
  return env(404);
}) as unknown as typeof fetch;

function admin() {
  const builder = (table: string) => {
    const f: Record<string, unknown> = {};
    const b: Record<string, unknown> = {};
    for (const k of ["select", "is"]) b[k] = () => b;
    b.eq = (c: string, v: unknown) => ((f[c] = v), b);
    b.in = (c: string, v: unknown) => ((f[c] = v), b);
    const rows = () => {
      if (table === "verdash_fzap_pastas") {
        return [{ fzap_folder_id: "pasta-1", folder_token_encrypted: "cif-pasta" }];
      }
      return null;
    };
    b.maybeSingle = async () => ({
      data: table === "verdash_fzap_pastas" ? rows()![0] : canalRow,
      error: null,
    });
    b.then = (res: (v: unknown) => unknown) => res({ data: linhasAtivas, error: null });
    return b;
  };
  return { from: builder, rpc: async (fn: string, args: Record<string, unknown>) => (rpcs.push({ fn, args }), { data: 1, error: null }) } as never;
}

beforeEach(() => {
  chamadas = [];
  logs.length = 0;
  rpcs = [];
  fora = false;
  process.env.FZAP_PROXY_URL_BR = "http://proxy";
  instancias = [{ id: FZAP_ID, name: "crm-x-1", metadata: { organization_id: ORG, channel_session_id: CANAL } }];
  canalRow = {
    verdash_origem: "nativa",
    verdash_instance_name: "crm-x-1",
    metadata: { fzap_user_id: FZAP_ID },
  };
  credsMock.valor = { instanceName: "crm-x-1", token: INST_TOKEN, vinculoId: null, baseUrl: "http://fzap.interno" };
  linhasAtivas = [];
  vi.stubGlobal("fetch", fzap);
});

describe("limparNativoDoCanal", () => {
  it("excluir: disconnect + logout com o token da instancia, DELETE /full com o da pasta", async () => {
    const r = await limparNativoDoCanal(admin(), { organizationId: ORG, channelSessionId: CANAL, apagar: true });
    expect(r).toBe("ok");
    const tokenDe = (p: string) => chamadas.find((c) => c.path === p)?.token;
    expect(tokenDe("/session/disconnect")).toBe(INST_TOKEN);
    expect(tokenDe("/session/logout")).toBe(INST_TOKEN);
    const del = chamadas.find((c) => c.method === "DELETE")!;
    expect(del.path).toBe(`/folder/instances/${FZAP_ID}/full`);
    expect(del.token).toBe(PASTA_TOKEN);
    expect(rpcs).toHaveLength(0);
  });

  it("so desconectar (apagar:false) nao apaga a instancia", async () => {
    await limparNativoDoCanal(admin(), { organizationId: ORG, channelSessionId: CANAL, apagar: false });
    expect(chamadas.some((c) => c.method === "DELETE")).toBe(false);
    expect(chamadas.some((c) => c.path === "/session/logout")).toBe(true);
  });

  it("vinculada: zero chamadas ao FZAP", async () => {
    canalRow = { verdash_origem: "vinculada", verdash_instance_name: "inst", metadata: { fzap_user_id: FZAP_ID } };
    const r = await limparNativoDoCanal(admin(), { organizationId: ORG, channelSessionId: CANAL, apagar: true });
    expect(r).toBe("nao_nativa");
    expect(chamadas).toHaveLength(0);
  });

  it("instancia de OUTRA org na pasta: guard recusa, nada e apagado, fica pendente", async () => {
    instancias = [{ id: FZAP_ID, name: "crm-x-1", metadata: { organization_id: OUTRA } }];
    const r = await limparNativoDoCanal(admin(), { organizationId: ORG, channelSessionId: CANAL, apagar: true });
    expect(r).toBe("pendente");
    expect(chamadas.some((c) => c.method === "DELETE")).toBe(false);
  });

  it("FZAP fora do ar: nao lanca, loga a pendencia sem token e marca por RPC", async () => {
    fora = true;
    const r = await limparNativoDoCanal(admin(), { organizationId: ORG, channelSessionId: CANAL, apagar: true });
    expect(r).toBe("pendente");
    const log = logs.find((l) => l.msg === "verdash_nativo_limpeza_pendente")!;
    expect(log.ctx).toMatchObject({ fzapId: FZAP_ID, organization_id: ORG });
    expect(JSON.stringify(log.ctx)).not.toContain(INST_TOKEN);
    expect(JSON.stringify(log.ctx)).not.toContain(PASTA_TOKEN);
    expect(rpcs).toEqual([
      { fn: "fn_marcar_limpeza_nativa", args: { p_org: ORG, p_canal: CANAL, p_pendente: true } },
    ]);
  });
});

describe("listarOrfasDaPasta", () => {
  const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const inst = (id: string, canal: string | null, org = ORG) => ({
    id,
    name: `n-${id}`,
    metadata: { organization_id: org, ...(canal ? { channel_session_id: canal } : {}) },
  });
  const velha = new Date(Date.now() - 10 * 60_000).toISOString();
  const nova = new Date(Date.now() - 30_000).toISOString();

  it("so a instancia do CRM sem linha viva; ignora viva, reserva recente, sem id e id invalido", async () => {
    instancias = [
      inst("a", U(1)),
      inst("b", U(2)),
      inst("c", U(3)),
      inst("d", null),
      inst("e", U(5)),
      inst("f", U(6)),
      inst("g", "nao-e-uuid"),
      inst("h", U(8)),
    ];
    linhasAtivas = [
      { id: U(1), archived_at: null, created_at: velha, verdash_instance_name: "crm-x" },
      { id: U(3), archived_at: nova, created_at: nova, verdash_instance_name: "crm-reserva-x" },
      { id: U(5), archived_at: "2026-10-01", created_at: velha, verdash_instance_name: "crm-y" },
      { id: U(6), archived_at: velha, created_at: velha, verdash_instance_name: "crm-reserva-velha" },
      { id: U(8), archived_at: velha, created_at: velha, verdash_instance_name: null },
    ];
    const orfas = await listarOrfasDaPasta(admin(), ORG);
    expect(orfas.map((o) => o.fzapId).sort()).toEqual(["b", "e", "f", "h"]);
    expect(chamadas.every((c) => c.method === "GET" && c.token === PASTA_TOKEN)).toBe(true);
  });

  it("pasta vazia: devolve vazio", async () => {
    instancias = [];
    expect(await listarOrfasDaPasta(admin(), ORG)).toEqual([]);
  });
});

describe("exclusao de tenant (desligarCanaisInventariados)", () => {
  it("nativa: desliga e apaga; vinculada: zero chamadas", async () => {
    const pasta = (await lerPastaDaOrg(admin(), ORG))!;
    const creds = credsMock.valor as never;
    const r = await desligarCanaisInventariados({
      canais: [
        { id: "n", provider: "verdash", wahaSessionName: null, meta: null, nativo: { organizationId: ORG, fzapId: FZAP_ID, pasta, creds } },
        { id: "v", provider: "verdash", wahaSessionName: null, meta: null, verdash: "vinculada" },
      ],
      sessaoDeVoz: null,
    });
    expect(r.map((x) => [x.id, x.desfecho])).toEqual([["n", "ok"], ["v", "nao_se_aplica"]]);
    expect(chamadas.filter((c) => c.method === "DELETE")).toHaveLength(1);
  });

  it("instancia que ja nao existe no FZAP conta como ok", async () => {
    const pasta = (await lerPastaDaOrg(admin(), ORG))!;
    instancias = [];
    const r = await desligarCanaisInventariados({
      canais: [{ id: "n", provider: "verdash", wahaSessionName: null, meta: null, nativo: { organizationId: ORG, fzapId: FZAP_ID, pasta, creds: null } }],
      sessaoDeVoz: null,
    });
    expect(r[0]!.desfecho).toBe("ok");
  });

  it("verdash sem como provar vinculada: falhou visivel (nao sai calada)", async () => {
    const r = await desligarCanaisInventariados({
      canais: [
        { id: "x", provider: "verdash", wahaSessionName: null, meta: null, verdash: "irreconstruivel" },
        { id: "v", provider: "verdash", wahaSessionName: null, meta: null, verdash: "vinculada" },
      ],
      sessaoDeVoz: null,
    });
    expect(r[0]).toMatchObject({ desfecho: "falhou", motivo: "nativa_nao_reconstruida_na_retomada" });
    expect(r[1]!.desfecho).toBe("nao_se_aplica");
    expect(chamadas).toHaveLength(0);
  });

  it("lapide: todo canal verdash vira irreconstruivel", () => {
    const inv = inventarioDaLapide([
      { id: "v", provider: "verdash", waha_session_name: null, meta_phone_number_id: null, wacalls_session_id: null, archived_at: null },
    ]);
    expect(inv.canais[0]!.verdash).toBe("irreconstruivel");
  });
});

describe("inventariarCanaisDaOrganizacao decide nativa x vinculada", () => {
  const linha = (id: string, origem: string, meta: Record<string, unknown> = {}) => ({
    id, provider: "verdash", waha_session_name: null, meta_phone_number_id: null, meta_token_encrypted: null,
    wacalls_session_id: null, archived_at: null, verdash_origem: origem, verdash_instance_name: `i-${id}`, metadata: meta,
  });
  const adminCom = (rows: unknown[]) => {
    const base = admin() as unknown as { from: (t: string) => Record<string, unknown>; rpc: unknown };
    return {
      ...base,
      from: (t: string) => (t === "channel_sessions" ? { select: () => ({ eq: async () => ({ data: rows, error: null }) }) } : base.from(t)),
    } as never;
  };

  it("nativa com fzap_user_id monta `nativo`; vinculada e nativa sem id nao", async () => {
    const inv = await inventariarCanaisDaOrganizacao(
      adminCom([linha("n", "nativa", { fzap_user_id: FZAP_ID }), linha("v", "vinculada", { fzap_user_id: "x" }), linha("s", "nativa")]),
      ORG,
    );
    const por = Object.fromEntries(inv.canais.map((c) => [c.id, c]));
    expect(por.n!.nativo).toMatchObject({ organizationId: ORG, fzapId: FZAP_ID });
    expect(por.v!.nativo).toBeUndefined();
    expect(por.v!.verdash).toBe("vinculada");
    expect(por.s!.verdash).toBe("irreconstruivel");
  });
});
