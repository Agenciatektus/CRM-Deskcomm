/**
 * O Chrome preenchia o e-mail no "ID do número de telefone" e a senha salva no
 * "Token de acesso". Os campos de credencial dizem ao navegador e aos gerenciadores
 * de senha para não oferecer nada.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/channels/useOfficialChannel", () => ({
  useOfficialChannel: () => ({ data: { data: { connected: false, hasToken: false } }, isPending: false }),
  useConnectOfficialChannel: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRegistrarWebhookOficial: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: vi.fn(async () => ({
      data: { label: "Parceiro", connected: true, has_token: true, has_signing_secret: false, webhook_url: "https://x/w" },
    })),
  },
}));

import { CanalGraphParceiroClient } from "@/components/connections/CanalGraphParceiroClient";
import { CanalOficialClient } from "@/components/connections/CanalOficialClient";

afterEach(cleanup);

function confere(campo: HTMLElement, autoComplete: string) {
  expect(campo.getAttribute("autocomplete")).toBe(autoComplete);
  expect(campo.hasAttribute("data-1p-ignore")).toBe(true);
  expect(campo.getAttribute("data-lpignore")).toBe("true");
}

describe("campos de credencial sem autopreenchimento", () => {
  it("canal oficial: IDs em off, token em new-password", () => {
    render(<CanalOficialClient />);
    confere(screen.getByLabelText("ID do número de telefone"), "off");
    confere(screen.getByLabelText("ID da conta do WhatsApp Business"), "off");
    confere(screen.getByLabelText("Token de acesso"), "new-password");
  });

  it("canal parceiro: token e segredo em new-password", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CanalGraphParceiroClient />
      </QueryClientProvider>,
    );
    confere(await screen.findByLabelText("Segredo de assinatura"), "new-password");
    confere(screen.getByLabelText("Token de acesso"), "new-password");
  });
});
