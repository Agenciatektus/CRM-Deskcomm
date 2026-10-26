import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ mutateAsync: vi.fn() }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (v: string) => v }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("./ChannelAiAccess", () => ({ ChannelAiAccess: () => null }));
vi.mock("@/hooks/channels/useOfficialChannel", () => ({
  useOfficialChannel: () => ({ data: { data: { connected: false, hasToken: false, webhook: null } }, isPending: false }),
  useConnectOfficialChannel: () => ({ mutateAsync: h.mutateAsync, isPending: false }),
  useRegistrarWebhookOficial: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { CanalOficialClient } from "./CanalOficialClient";

afterEach(() => {
  cleanup();
  h.mutateAsync.mockReset();
});

const preencher = (pnid: string, waba: string) => {
  fireEvent.change(screen.getByLabelText("ID do número de telefone"), { target: { value: pnid } });
  fireEvent.change(screen.getByLabelText("ID da conta do WhatsApp Business"), { target: { value: waba } });
  fireEvent.change(screen.getByLabelText("Token de acesso"), { target: { value: "EAAGtoken" } });
};

it("ID com letra: erro especifico e nenhuma chamada a Meta", () => {
  render(<CanalOficialClient />);
  preencher("11033abc", "2434045433735175");
  fireEvent.click(screen.getByTestId("btn-conectar"));
  expect(screen.getByRole("alert").textContent).toBe("O ID do número de telefone tem só dígitos.");
  expect(h.mutateAsync).not.toHaveBeenCalled();
  preencher("1103328999528818", "24340 454");
  fireEvent.click(screen.getByTestId("btn-conectar"));
  expect(screen.getByRole("alert").textContent).toBe("O ID da conta do WhatsApp Business tem só dígitos.");
});

it("IDs numericos: conecta e avisa o assistente com o telefone", async () => {
  h.mutateAsync.mockResolvedValue({ data: { displayName: "Loja", phoneNumber: "5511900000000" } });
  const onConectado = vi.fn();
  render(<CanalOficialClient onConectado={onConectado} />);
  preencher("1103328999528818", "2434045433735175");
  fireEvent.click(screen.getByTestId("btn-conectar"));
  await waitFor(() => expect(onConectado).toHaveBeenCalledWith("5511900000000"));
  expect(screen.queryByRole("alert")).toBeNull();
});
