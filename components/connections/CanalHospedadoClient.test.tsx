import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const h = vi.hoisted(() => ({
  get: vi.fn(),
  del: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock("@/lib/api/client", () => ({ apiClient: { get: h.get, post: vi.fn(), delete: h.del } }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (v: string) => v }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("./ChannelAiAccess", () => ({ ChannelAiAccess: () => null }));
vi.mock("./AssistenteConexao", () => ({
  AssistenteConexao: ({ canalIdInicial }: { canalIdInicial?: string }) => <div>assistente:{canalIdInicial ?? "novo"}</div>,
}));

import { CanalHospedadoClient } from "./CanalHospedadoClient";

const sessao = (id: string, status: string, origem = "nativa") => ({
  channel_session_id: id,
  instance_name: null,
  phone_number: null,
  display_name: `Canal ${id}`,
  status,
  has_token: false,
  origem,
});
const montar = async (sessions: object[]) => {
  h.get.mockResolvedValue({ data: { label: "X", connected: true, sessions, nativo_habilitado: true } });
  render(<CanalHospedadoClient />);
  await act(async () => {});
};

beforeEach(() => {
  h.get.mockReset();
  h.del.mockReset();
  vi.clearAllMocks();
});
afterEach(cleanup);

it.each([
  ["STARTING", "Conectando…"],
  ["SCAN_QR_CODE", "Escaneie o QR"],
  ["FAILED", "Caiu"],
])("canal nativo %s: mostra o estado em portugues e os dois botoes", async (status, rotulo) => {
  await montar([sessao("c1", status)]);
  expect(screen.getByText(new RegExp(rotulo))).toBeTruthy();
  expect(screen.queryByText(status)).toBeNull();
  expect(screen.getByRole("button", { name: "Continuar conexão" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Cancelar" })).toBeTruthy();
});

it.each(["WORKING", "STOPPED"])("controle negativo: canal nativo %s NAO mostra os botoes", async (status) => {
  await montar([sessao("c1", status)]);
  expect(screen.queryByRole("button", { name: "Continuar conexão" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Cancelar" })).toBeNull();
});

it("controle negativo: canal vinculado travado em STARTING NAO mostra os botoes", async () => {
  await montar([sessao("c1", "STARTING", "vinculada")]);
  expect(screen.queryByRole("button", { name: "Continuar conexão" })).toBeNull();
});

it("Continuar conexao abre o assistente no canal existente", async () => {
  await montar([sessao("c7", "SCAN_QR_CODE")]);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Continuar conexão" })));
  expect(screen.getByText("assistente:c7")).toBeTruthy();
});

it("Cancelar pede confirmacao, so entao chama o DELETE e recarrega", async () => {
  h.del.mockResolvedValue({});
  await montar([sessao("c7", "FAILED")]);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Cancelar" })));
  expect(h.del).not.toHaveBeenCalled();
  expect(screen.getByText("Cancelar esta conexão?")).toBeTruthy();
  const leituras = h.get.mock.calls.length;
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Cancelar conexão" })));
  expect(h.del).toHaveBeenCalledWith("/api/v1/channel-sessions/c7");
  expect(h.toast.success).toHaveBeenCalled();
  expect(h.get.mock.calls.length).toBeGreaterThan(leituras);
});

it("Voltar na confirmacao nao exclui nada", async () => {
  await montar([sessao("c7", "FAILED")]);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Cancelar" })));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Voltar" })));
  expect(h.del).not.toHaveBeenCalled();
});
