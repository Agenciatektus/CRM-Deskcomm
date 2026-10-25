import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/webhooks/secrets", () => ({
  encryptWebhookSecret: vi.fn(async (_a: unknown, v: string) => `ENC(${v})`),
}));

import { FormularioDeMetaAds } from "@/app/app/settings/meta-ads/_form";
import { gravarConexaoDeLeitura } from "@/lib/plataformas-de-anuncio/gravar-conexao-de-leitura";

function admin() {
  const upserts: Record<string, unknown>[] = [];
  return {
    upserts,
    client: {
      from: () => ({ upsert: async (v: Record<string, unknown>) => (upserts.push(v), { error: null }) }),
    } as never,
  };
}

describe("reconectar ou colar token zera a recusa da Meta", () => {
  it.each([
    ["OAuth", { expiraEm: null, scopes: null, metaUserId: null }],
    ["token colado", undefined],
  ])("%s", async (_nome, oauth) => {
    const { upserts, client } = admin();
    await gravarConexaoDeLeitura(client, {
      organizationId: "org-1",
      userId: "u",
      platform: "meta_ads",
      accessToken: "novo-token-novo-token",
      oauth,
    });
    expect(upserts[0]).toMatchObject({ needs_reconnect: false, needs_reconnect_desde: null, last_token_error: null });
  });

  it("trocar só a conta padrão (sem token) não mexe na recusa", async () => {
    const { upserts, client } = admin();
    await gravarConexaoDeLeitura(client, {
      organizationId: "o",
      userId: "u",
      platform: "meta_ads",
      defaultAccountId: "act_1",
    });
    expect(upserts[0]).not.toHaveProperty("needs_reconnect");
  });
});

describe("banner de recusa em Ajustes > Meta Ads", () => {
  const props = {
    conectada: true,
    contaPadrao: null,
    via: "oauth" as const,
    expiraEm: "25/11/2026",
    diasParaVencer: 30,
    oauthDisponivel: true,
    oauthFalta: [],
    idioma: "pt-BR" as const,
  };

  it("aparece com needs_reconnect e some sem ele", () => {
    const com = renderToStaticMarkup(<FormularioDeMetaAds {...props} precisaReconectar />);
    expect(com).toContain("meta-precisa-reconectar");
    expect(com).toContain("A Meta recusou renovar o acesso. Reconecte agora.");
    const sem = renderToStaticMarkup(<FormularioDeMetaAds {...props} />);
    expect(sem).not.toContain("meta-precisa-reconectar");
  });
});
