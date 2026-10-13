import type * as Credenciais from "@/lib/channels/verdash/credentials";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { verdashAdapter } from "@/lib/channels/adapters/verdash";
import { resolveVerdashCreds } from "@/lib/channels/verdash/credentials";
import { providersDaFoto } from "@/lib/channels/contact-avatar";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock("@/lib/channels/verdash/credentials", async (real) => ({
  ...(await real<typeof Credenciais>()),
  resolveVerdashCreds: vi.fn(),
}));
const creds = {
  instanceName: "inst-1",
  token: "token-de-maquina",
  vinculoId: "v1",
  baseUrl: "https://fzap.invalid",
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveVerdashCreds).mockResolvedValue(creds);
});
afterEach(() => vi.unstubAllGlobals());
it("WhatsApp pareado consulta a plataforma com x-crm-token", async () => {
  const buscar = vi.fn(
    async () =>
      new Response(
        JSON.stringify({ success: true, data: { url: "https://fzap.test/avatars/a.jpg" } }),
      ),
  );
  vi.stubGlobal("fetch", buscar);
  expect(
    await verdashAdapter.fetchProfilePictureUrl!({
      organizationId: "org",
      sessionRef: "inst-1",
      recipient: "123456789@lid",
    }),
  ).toBe("https://fzap.test/avatars/a.jpg");
  const [url, init] = buscar.mock.calls[0]! as unknown as [string, RequestInit];
  expect(url).toContain("/crm-foto-perfil");
  expect(new Headers(init.headers).get("x-crm-token")).toBe(creds.token);
  expect(new Headers(init.headers).get("token")).toBeNull();
});
it("falha transitória não se apresenta como contato sem foto", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 502 })),
  );
  await expect(
    verdashAdapter.fetchProfilePictureUrl!({
      organizationId: "org",
      sessionRef: "inst-1",
      recipient: "123456789@lid",
    }),
  ).rejects.toThrow("contact_profile_unavailable");
});
it("contato só de Instagram não procura foto por outro canal", () => {
  expect(providersDaFoto({ wa_identity: null, instagram_igsid: "17841400000001" })).toEqual([
    "instagram",
  ]);
});
