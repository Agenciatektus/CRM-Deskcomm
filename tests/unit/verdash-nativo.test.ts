import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  apagarNativo,
  criarInstanciaNativa,
  desligarNativo,
  lerPastaDaOrg,
  nomeDaInstanciaNativa,
  obterQrNativo,
  statusNativo,
} from "@/lib/channels/verdash/nativo";

/**
 * VERDASH NATIVO: O CRM CRIA A INSTANCIA NO FZAP.
 *
 * O dublê abaixo recusa e aceita o que o FZAP v1.32.0 real recusa e aceita
 * (medido no spike de 23/10): nome duplicado e ACEITO com 201 (por isso o CRM
 * tem de gerar sufixo e conferir a lista), token de pasta em /admin/* da 401,
 * instancia de outra pasta da 404 e pasta com instancias da 400 ao apagar.
 * Cada chamada fica gravada com header e corpo, porque o que se testa e a
 * LIGACAO (qual token em qual rota), nao so o efeito.
 */

const ORG = "00000000-0000-4000-8000-0000000000a1";
const OUTRA_ORG = "00000000-0000-4000-8000-0000000000b2";
const PASTA_TOKEN = "token-da-pasta-da-org-a1";
const PROXY = "http://proxy-br.segredo:3128";

interface Linha {
  id: string;
  name: string;
  token: string;
  folderId: string;
  metadata: Record<string, unknown>;
}
interface Chamada {
  method: string;
  path: string;
  token: string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- corpo do dublê, forma livre
  body: Record<string, any> | undefined;
}

let linhas: Linha[];
let chamadas: Chamada[];
let proxyTestOk: boolean;
let seq: number;

function envelope(status: number, data?: unknown, error?: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: error ?? "",
    json: async () => ({ code: status, success: status < 300, data, error }),
  };
}

const fzapDuble = (async (url: unknown, init?: RequestInit) => {
  const path = new URL(String(url)).pathname;
  const method = init?.method ?? "GET";
  const token = (init?.headers as Record<string, string> | undefined)?.token;
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  chamadas.push({ method, path, token, body });

  if (path.startsWith("/admin/")) return envelope(401, undefined, "unauthorized");

  if (token === PASTA_TOKEN) {
    if (path === "/folder/instances" && method === "POST") {
      // Aceita nome repetido, como o FZAP real.
      const l: Linha = {
        id: `fzap-${++seq}`,
        name: body!.name,
        token: body!.token,
        folderId: "pasta-1",
        metadata: body!.metadata,
      };
      linhas.push(l);
      return envelope(201, { id: l.id, folderId: l.folderId });
    }
    if (path === "/folder/instances" && method === "GET") {
      return envelope(
        200,
        linhas.filter((l) => l.folderId === "pasta-1").map(({ token: _t, ...r }) => r),
      );
    }
    const m = path.match(/^\/folder\/instances\/([^/]+)\/full$/);
    if (m && method === "DELETE") {
      const i = linhas.findIndex((l) => l.id === m[1] && l.folderId === "pasta-1");
      if (i < 0) return envelope(404, undefined, "instance not found");
      linhas.splice(i, 1);
      return envelope(200, {});
    }
    return envelope(404, undefined, "not found");
  }

  const inst = linhas.find((l) => l.token === token);
  if (!inst) return envelope(401, undefined, "unauthorized");
  if (path === "/session/proxy/test") {
    return proxyTestOk ? envelope(200, { ok: true }) : envelope(502, undefined, `falhou ${PROXY}`);
  }
  if (path === "/session/connect") return envelope(200, {});
  if (path === "/session/qr") return envelope(200, { qrCode: "data:image/png;base64,AAAA" });
  if (path === "/session/status") return envelope(200, { connected: true, loggedIn: false });
  if (path === "/session/disconnect" || path === "/session/logout") return envelope(200, {});
  return envelope(404, undefined, "not found");
}) as unknown as typeof fetch;

/** Admin do Supabase de mentira: cifra reversivel e a tabela de pastas. */
function adminFalso(pasta: boolean = true) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: pasta
              ? { fzap_folder_id: "pasta-1", folder_token_encrypted: `\\x${hex(PASTA_TOKEN)}` }
              : null,
            error: null,
          }),
        }),
      }),
    }),
    rpc: async (fn: string, a: Record<string, string>) =>
      fn === "fn_encrypt_oauth"
        ? { data: `\\x${hex(a.plaintext!)}`, error: null }
        : { data: Buffer.from(a.ciphertext!.replace("\\x", ""), "hex").toString(), error: null },
  } as never;
}
const hex = (s: string) => Buffer.from(s).toString("hex");

const fetchOriginal = globalThis.fetch;
const envOriginal = process.env.FZAP_PROXY_URL_BR;

beforeEach(() => {
  linhas = [];
  chamadas = [];
  proxyTestOk = true;
  seq = 0;
  process.env.FZAP_PROXY_URL_BR = PROXY;
  process.env.VERDASH_API_BASE_URL = "http://fzap.interno:8081";
  globalThis.fetch = fzapDuble;
});
afterEach(() => {
  globalThis.fetch = fetchOriginal;
  if (envOriginal === undefined) delete process.env.FZAP_PROXY_URL_BR;
  else process.env.FZAP_PROXY_URL_BR = envOriginal;
});

const entrada = { organizationId: ORG, orgSlug: "Acme Ltda", rotulo: "Comercial", channelSessionId: "cs-1" };

describe("criar", () => {
  it("caminho feliz: header e corpo exatos, token escolhido por nos, sem S3", async () => {
    const r = await criarInstanciaNativa(adminFalso(), entrada);

    const post = chamadas.find((c) => c.method === "POST" && c.path === "/folder/instances")!;
    expect(post.token).toBe(PASTA_TOKEN);
    expect(post.body).toEqual({
      name: r.instanceName,
      token: r.instanceToken,
      expiration: 0,
      proxyConfig: { enabled: true, proxyUrl: PROXY },
      s3Config: { enabled: false },
      metadata: { sistema: "crm", organization_id: ORG, channel_session_id: "cs-1" },
    });
    expect(r.instanceName).toMatch(/^crm-acme-ltda-comercial-[0-9a-f]{6}$/);
    expect(r.instanceToken).toMatch(/^[0-9a-f]{48}$/);
    expect(r.fzapId).toBe("fzap-1");
    // O proxy foi testado com o token da INSTANCIA, antes de entregar.
    const teste = chamadas.find((c) => c.path === "/session/proxy/test")!;
    expect(teste.token).toBe(r.instanceToken);
    expect(teste.body).toEqual({ proxyUrl: PROXY });
    // Nunca o admin: nenhuma chamada a /admin.
    expect(chamadas.some((c) => c.path.startsWith("/admin/"))).toBe(false);
  });

  it("o nome NUNCA e chave: dois canais com o mesmo rotulo viram duas linhas e ids distintos", async () => {
    const a = await criarInstanciaNativa(adminFalso(), entrada);
    const b = await criarInstanciaNativa(adminFalso(), entrada);
    expect(a.instanceName).not.toBe(b.instanceName);
    expect(a.fzapId).not.toBe(b.fzapId);
    expect(linhas).toHaveLength(2);
  });

  it("confere a lista da pasta ANTES de criar, e o sufixo e aleatorio", async () => {
    await criarInstanciaNativa(adminFalso(), entrada);
    const ordem = chamadas.map((c) => `${c.method} ${c.path}`);
    expect(ordem.indexOf("GET /folder/instances")).toBeGreaterThanOrEqual(0);
    expect(ordem.indexOf("GET /folder/instances")).toBeLessThan(ordem.indexOf("POST /folder/instances"));
    const nomes = new Set(Array.from({ length: 20 }, () => nomeDaInstanciaNativa("acme-ltda", "comercial")));
    expect(nomes.size).toBeGreaterThan(1);
  });

  it("proxy ausente: falha explicita e NAO cria nada no FZAP", async () => {
    delete process.env.FZAP_PROXY_URL_BR;
    await expect(criarInstanciaNativa(adminFalso(), entrada)).rejects.toThrow("verdash_nativo_proxy_ausente");
    expect(chamadas).toHaveLength(0);
    expect(linhas).toHaveLength(0);
  });

  it("proxy que nao passa no teste: apaga a orfa, erro sem vazar a URL do proxy", async () => {
    proxyTestOk = false;
    const erro = await criarInstanciaNativa(adminFalso(), entrada).catch((e: Error) => e);
    expect((erro as Error).message).toBe("verdash_nativo_proxy_falhou");
    expect((erro as Error).message).not.toContain(PROXY);
    expect(linhas).toHaveLength(0);
    const del = chamadas.find((c) => c.method === "DELETE")!;
    expect(del.path).toBe("/folder/instances/fzap-1/full");
    expect(del.token).toBe(PASTA_TOKEN);
  });

  it("pasta nao provisionada: recusa antes de qualquer chamada", async () => {
    await expect(criarInstanciaNativa(adminFalso(false), entrada)).rejects.toThrow("verdash_nativo_sem_pasta");
    expect(chamadas).toHaveLength(0);
  });
});

describe("dublê recusa o que o FZAP real recusa", () => {
  it("token de pasta em /admin/* da 401", async () => {
    const pasta = (await lerPastaDaOrg(adminFalso(), ORG))!;
    const { fzapRequest } = await import("@/lib/channels/verdash/client");
    await expect(fzapRequest(pasta.creds, "/admin/users")).rejects.toThrow("401");
  });
});

describe("guard de organizacao", () => {
  async function umaInstancia(orgDaMetadata: string) {
    linhas.push({ id: "fz-9", name: "x", token: "tok-9", folderId: "pasta-1", metadata: { organization_id: orgDaMetadata } });
    return { creds: { instanceName: "", token: "tok-9", vinculoId: null, baseUrl: "http://fzap.interno:8081" } };
  }

  it("apagar: instancia com metadata de OUTRA org nao e apagada", async () => {
    await umaInstancia(OUTRA_ORG);
    await expect(apagarNativo(adminFalso(), { organizationId: ORG, fzapId: "fz-9" })).rejects.toThrow(
      "verdash_nativo_guard_org_divergente",
    );
    expect(chamadas.some((c) => c.method === "DELETE")).toBe(false);
    expect(linhas).toHaveLength(1);
  });

  it("desligar: org divergente nao dispara disconnect nem logout", async () => {
    const { creds } = await umaInstancia(OUTRA_ORG);
    await expect(
      desligarNativo(adminFalso(), { organizationId: ORG, fzapId: "fz-9", creds }),
    ).rejects.toThrow("verdash_nativo_guard_org_divergente");
    expect(chamadas.some((c) => c.path.startsWith("/session/"))).toBe(false);
  });

  it("id que nao esta na pasta (instancia de outra pasta) e recusado, sem DELETE", async () => {
    await expect(apagarNativo(adminFalso(), { organizationId: ORG, fzapId: "alheia" })).rejects.toThrow(
      "verdash_nativo_instancia_nao_encontrada",
    );
    expect(chamadas.some((c) => c.method === "DELETE")).toBe(false);
  });

  it("apagar: instancia da propria org vai por id, com o token da pasta", async () => {
    await umaInstancia(ORG);
    await apagarNativo(adminFalso(), { organizationId: ORG, fzapId: "fz-9" });
    const del = chamadas.find((c) => c.method === "DELETE")!;
    expect(del).toMatchObject({ path: "/folder/instances/fz-9/full", token: PASTA_TOKEN });
    expect(linhas).toHaveLength(0);
  });

  it("desligar: disconnect e logout com o token da INSTANCIA", async () => {
    const { creds } = await umaInstancia(ORG);
    await desligarNativo(adminFalso(), { organizationId: ORG, fzapId: "fz-9", creds });
    const s = chamadas.filter((c) => c.path.startsWith("/session/"));
    expect(s.map((c) => c.path)).toEqual(["/session/disconnect", "/session/logout"]);
    expect(s.every((c) => c.token === "tok-9")).toBe(true);
  });
});

describe("QR e status", () => {
  const creds = { instanceName: "", token: "tok-q", vinculoId: null, baseUrl: "http://fzap.interno:8081" };
  beforeEach(() => {
    linhas.push({ id: "q", name: "q", token: "tok-q", folderId: "pasta-1", metadata: {} });
  });

  it("QR: connect (POST {}) e depois GET /session/qr, com o token da instancia", async () => {
    const qr = await obterQrNativo(creds);
    expect(qr).toBe("data:image/png;base64,AAAA");
    expect(chamadas.map((c) => `${c.method} ${c.path} ${c.token}`)).toEqual([
      "POST /session/connect tok-q",
      "GET /session/qr tok-q",
    ]);
    expect(chamadas[0]!.body).toEqual({});
  });

  it("connected=true com loggedIn=false e AGUARDANDO QR, nao conectado", async () => {
    expect(await statusNativo(creds)).toBe("aguardando_qr");
  });
});
