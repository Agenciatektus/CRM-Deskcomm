// ─── O adapter que responde no Instagram ───────────────────────────────────
//
// Três coisas aqui produzem estrago silencioso se saírem erradas:
//
// 1. ENDEREÇAR PELO `@` EM VEZ DO IGSID. O handle a pessoa troca quando quer, e
//    quem pega o handle abandonado passa a receber a conversa de outra. O IGSID
//    é o id estável do par (conta, pessoa) — é o único endereço.
//
// 2. DEVOLVER `{externalId: null}` EM VEZ DE LANÇAR quando o envio falha. O
//    handler grava `sent` com id nulo, e a tela diz "enviado" para algo que
//    nunca saiu, com o cliente do outro lado esperando.
//
// 3. TRADUZIR MAL A JANELA DE 24 H. É a recusa que o atendente mais vai ver, e
//    a única em que não há o que reconfigurar. "Falha no envio" genérico manda
//    alguém procurar defeito onde não há.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveVerdashCreds } from "@/lib/channels/verdash/credentials";
import { instagramAdapter } from "@/lib/channels/adapters/instagram";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock("@/lib/channels/verdash/credentials", async (real) => ({
  ...(await real<typeof import("@/lib/channels/verdash/credentials")>()),
  resolveVerdashCreds: vi.fn(),
}));

const CREDS_PAREADAS = {
  instanceName: "conta-ig",
  token: "token-de-maquina-com-tamanho",
  vinculoId: "v1",
  baseUrl: "https://irrelevante.test",
};

function envelope(over: Record<string, unknown> = {}) {
  return {
    organizationId: "org-1",
    sessionRef: "conta-ig",
    to: "igsid-da-pessoa",
    kind: "text",
    body: "oi, tudo bem?",
    ...over,
  } as never;
}

function respostaHttp(corpo: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => corpo,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveVerdashCreds).mockResolvedValue(CREDS_PAREADAS as never);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("o endereço do Instagram", () => {
  it("é o IGSID, e nada mais serve", () => {
    expect(
      instagramAdapter.resolveRecipient({
        isGroup: false,
        groupChatId: null,
        phoneNumber: "+5511999999999",
        waIdentity: "phone:+5511999999999",
        instagramIgsid: "igsid-1",
      }),
    ).toBe("igsid-1");
  });

  it("sem IGSID NÃO inventa endereço a partir do telefone", () => {
    // O contato pode ter telefone de outro canal. Usá-lo aqui mandaria a
    // mensagem para o lugar errado — ou, com sorte, para lugar nenhum.
    expect(
      instagramAdapter.resolveRecipient({
        isGroup: false,
        groupChatId: null,
        phoneNumber: "+5511999999999",
        waIdentity: "phone:+5511999999999",
        instagramIgsid: null,
      }),
    ).toBeNull();
  });

  it("grupo não existe neste canal", () => {
    expect(
      instagramAdapter.resolveRecipient({
        isGroup: true,
        groupChatId: "123@g.us",
        phoneNumber: null,
        waIdentity: null,
        instagramIgsid: "igsid-1",
      }),
    ).toBeNull();
  });
});

describe("o envio", () => {
  it("manda Direct com o IGSID e devolve o id da mensagem", async () => {
    const fetchFalso = vi.fn(async () =>
      respostaHttp({ success: true, data: { message_id: "mid-da-meta" } }),
    );
    vi.stubGlobal("fetch", fetchFalso);

    const r = await instagramAdapter.send(envelope());
    expect(r.externalId).toBe("mid-da-meta");

    const chamada = fetchFalso.mock.calls[0] as unknown as [
      string,
      { body: string; headers: Record<string, string> },
    ];
    const init = chamada[1];
    const corpo = JSON.parse(init.body);
    // `direct` explícito: a operação perigosa (resposta pública) nem é
    // oferecida por este caminho.
    expect(corpo.operacao).toBe("direct");
    expect(corpo.destinatario_igsid).toBe("igsid-da-pessoa");
    // O token de máquina vai no header, nunca no corpo nem na query.
    expect(init.headers["x-crm-token"]).toBe(CREDS_PAREADAS.token);
  });

  it("LANÇA quando a plataforma recusa — nunca devolve id nulo em silêncio", async () => {
    vi.stubGlobal("fetch", async () => respostaHttp({ error: "falha_envio" }, 502));
    // Devolver `{externalId: null}` faria o handler gravar `sent` e a tela
    // dizer "enviado" para algo que não saiu.
    await expect(instagramAdapter.send(envelope())).rejects.toThrow("instagram_error");
  });

  it("traduz a janela de 24 h em vez de dizer 'falha no envio'", async () => {
    vi.stubGlobal("fetch", async () => respostaHttp({ error: "fora_da_janela" }, 422));
    await expect(instagramAdapter.send(envelope())).rejects.toThrow(/24 horas/);
  });

  it("acesso revogado manda reconectar, e não 'tente de novo'", async () => {
    vi.stubGlobal("fetch", async () => respostaHttp({ error: "nao_autorizado" }, 401));
    await expect(instagramAdapter.send(envelope())).rejects.toThrow(/Reconecte/);
  });

  it("`success: false` com HTTP 200 também é falha", async () => {
    // A plataforma responde assim em alguns caminhos. Olhar só o status HTTP
    // gravaria como enviado o que ela recusou.
    vi.stubGlobal("fetch", async () => respostaHttp({ success: false, error: "falha_envio" }, 200));
    await expect(instagramAdapter.send(envelope())).rejects.toThrow("instagram_error");
  });

  it("recusa mídia com motivo legível, sem tentar", async () => {
    const fetchFalso = vi.fn();
    vi.stubGlobal("fetch", fetchFalso);
    await expect(instagramAdapter.send(envelope({ kind: "image" }))).rejects.toThrow(/Mídia/);
    expect(fetchFalso, "nem chega a tentar").not.toHaveBeenCalled();
  });

  it("canal sem pareamento manda reconectar", async () => {
    vi.mocked(resolveVerdashCreds).mockResolvedValue({
      ...CREDS_PAREADAS,
      vinculoId: null,
    } as never);
    const fetchFalso = vi.fn();
    vi.stubGlobal("fetch", fetchFalso);
    await expect(instagramAdapter.send(envelope())).rejects.toThrow("instagram_not_configured");
    expect(fetchFalso).not.toHaveBeenCalled();
  });
});
