import type * as Credenciais from "@/lib/channels/verdash/credentials";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A foto do contato no canal Verdash (WhatsApp).
 *
 * PAREADO (`vinculoId`): o token do FZAP mora na Verdash. Pedir a foto direto ao
 * FZAP com o token de máquina falha calado (o FZAP não o conhece), e o cron
 * carimbava "sem foto" para todo mundo. A foto tem de vir da função
 * `crm-foto-perfil`, com o `x-crm-token` do vínculo DA ORG do contato.
 */

import { verdashAdapter } from "@/lib/channels/adapters/verdash";
import { resolveVerdashCreds } from "@/lib/channels/verdash/credentials";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock("@/lib/channels/verdash/credentials", async (real) => ({
  ...(await real<typeof Credenciais>()),
  resolveVerdashCreds: vi.fn(),
}));

const PAREADA = {
  instanceName: "inst-1",
  token: "token-de-maquina-com-tamanho-suficiente",
  vinculoId: "v1",
  baseUrl: "https://fzap.invalid",
};
const pedido = { organizationId: "org-1", sessionRef: "inst-1", recipient: "142704667287623@lid" };

function resposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveVerdashCreds).mockResolvedValue(PAREADA);
});
afterEach(() => vi.unstubAllGlobals());

describe("foto no canal Verdash", () => {
  it("pareado: pede à plataforma com x-crm-token, nunca ao FZAP com header token", async () => {
    const buscar = vi.fn(async () =>
      resposta({ success: true, data: { url: "https://fzap2.verdash.com.br/avatars/a.jpg" } }),
    );
    vi.stubGlobal("fetch", buscar);

    expect(await verdashAdapter.fetchProfilePictureUrl!(pedido)).toBe(
      "https://fzap2.verdash.com.br/avatars/a.jpg",
    );
    expect(resolveVerdashCreds).toHaveBeenCalledWith(expect.anything(), {
      organizationId: "org-1",
      instanceName: "inst-1",
    });
    expect(buscar).toHaveBeenCalledTimes(1);
    const [url, init] = buscar.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toMatch(/\/crm-foto-perfil$/);
    expect(url).not.toContain("fzap.invalid");
    const headers = new Headers(init.headers);
    expect(headers.get("x-crm-token")).toBe(PAREADA.token);
    expect(headers.get("token")).toBeNull();
    expect(JSON.parse(init.body as string)).toEqual({ destinatario: "142704667287623@lid" });
  });

  it("pareado: plataforma diz que não há foto → null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => resposta({ success: true, data: { url: null } })),
    );
    expect(await verdashAdapter.fetchProfilePictureUrl!(pedido)).toBeNull();
  });

  it("pareado: falha da plataforma lança, sem levar URL nem destinatário na mensagem", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => resposta({ error: "perfil_indisponivel" }, 502)),
    );
    const erro = await verdashAdapter.fetchProfilePictureUrl!(pedido).catch((e: Error) => e);
    expect(erro).toBeInstanceOf(Error);
    expect((erro as Error).message).toBe("verdash_request_failed: 502 perfil_indisponivel");
    expect((erro as Error).message).not.toContain("142704667287623");
  });

  it("direto (sem vínculo): continua no FZAP e usa o host público", async () => {
    vi.mocked(resolveVerdashCreds).mockResolvedValue({ ...PAREADA, vinculoId: null });
    const buscar = vi.fn(async () =>
      resposta({
        success: true,
        data: { url: "http://interno/a.jpg", publicDownloadUrl: "https://publico/a.jpg" },
      }),
    );
    vi.stubGlobal("fetch", buscar);

    expect(await verdashAdapter.fetchProfilePictureUrl!(pedido)).toBe("https://publico/a.jpg");
    const [url, init] = buscar.mock.calls[0]! as unknown as [string, RequestInit];
    // Pelo host PÚBLICO, não pelo `baseUrl` (interno em produção): o FZAP monta
    // o `publicDownloadUrl` com o host que recebeu o pedido.
    expect(url).toBe("https://fzap2.verdash.com.br/user/avatar");
    expect(new Headers(init.headers).get("token")).toBe(PAREADA.token);
  });

  it("direto: só o `url` interno, sem `publicDownloadUrl` → null (não baixa da rede interna)", async () => {
    vi.mocked(resolveVerdashCreds).mockResolvedValue({ ...PAREADA, vinculoId: null });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => resposta({ success: true, data: { url: "http://fzap:8080/a.jpg" } })),
    );
    expect(await verdashAdapter.fetchProfilePictureUrl!(pedido)).toBeNull();
  });
});
