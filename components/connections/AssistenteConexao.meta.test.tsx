import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  config: null as null | { appId: string; configId: string; configIdCoexistencia: string },
  abrir: vi.fn(),
  concluir: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), message: vi.fn() },
}));
vi.mock("@/lib/api/client", () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (v: string) => v }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/hooks/channels/useOfficialChannel", () => ({
  useOfficialChannel: () => ({ data: { data: { embeddedSignup: h.config } } }),
  useConcluirEmbeddedSignup: () => ({ mutateAsync: h.concluir, isPending: false }),
}));
vi.mock("@/hooks/channels/useMetaEmbeddedSignup", () => ({ useMetaEmbeddedSignup: () => ({ abrindo: false, abrir: h.abrir }) }));
vi.mock("./CanalOficialClient", () => ({ CanalOficialClient: () => <div data-testid="form-oficial" /> }));

import { AssistenteConexao } from "./AssistenteConexao";

const CFG = { appId: "1", configId: "2", configIdCoexistencia: "2" };
beforeEach(() => {
  h.config = null;
  h.abrir.mockReset();
  h.concluir.mockReset();
});
afterEach(cleanup);

const ate2 = async () => {
  render(<AssistenteConexao onClose={vi.fn()} onAtualizar={vi.fn()} nativoHabilitado={false} />);
  fireEvent.change(screen.getByLabelText("Nome da conexão"), { target: { value: "Comercial" } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  });
};
const escolher = (r: RegExp) => fireEvent.click(screen.getByRole("radio", { name: r }));
const continuar = () => act(async () => fireEvent.click(screen.getByRole("button", { name: "Continuar" })));

it("sem app e config_id da Meta: nada de Coexistence e a API Oficial é só colar credenciais, sem aba nem botão da Meta", async () => {
  await ate2();
  expect(screen.queryByRole("radio", { name: /Coexistence/ })).toBeNull();
  escolher(/^API Oficials*Número oficial/);
  await continuar();
  expect(screen.getByTestId("form-oficial")).toBeTruthy();
  expect(screen.queryByRole("tab", { name: "Conectar com a Meta" })).toBeNull();
  expect(screen.queryByText("Conectar com a Meta")).toBeNull();
});

it("com a Meta configurada: as duas abas na API Oficial e o botão chama o popup no modo oficial", async () => {
  h.config = CFG;
  h.abrir.mockResolvedValue({ ok: false, motivo: "cancelado" });
  await ate2();
  escolher(/^API Oficials*Número oficial/);
  await continuar();
  expect(screen.getByRole("tab", { name: "Conectar com a Meta" })).toBeTruthy();
  expect(screen.getByRole("tab", { name: "Colar credenciais" })).toBeTruthy();
  expect(screen.getByText(/Portfólio empresarial da Meta verificado/)).toBeTruthy();
  expect(screen.getByText(/A Meta cobra por conversa e por template/)).toBeTruthy();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Conectar com a Meta" })));
  expect(h.abrir).toHaveBeenCalledWith(false);
  expect(h.toast.message).toHaveBeenCalledWith("Conexão cancelada.");
});

it("Coexistence: aviso âmbar, botão travado até o checkbox, e o popup abre no modo Coexistence", async () => {
  h.config = CFG;
  h.abrir.mockResolvedValue({ ok: true, code: "c", wabaId: "999888777666555", phoneNumberId: "111222333444555" });
  h.concluir.mockResolvedValue({ data: { displayName: "Loja", phoneNumber: "+5511900000001", coexistencia: true } });
  await ate2();
  escolher(/Coexistence/);
  expect(screen.getByText(/A Meta pode restringir o número por até 24 h/)).toBeTruthy();
  await continuar();
  const botao = screen.getByRole("button", { name: "Conectar via Meta (Coexistence)" }) as HTMLButtonElement;
  expect(botao.disabled).toBe(true);
  fireEvent.click(screen.getByRole("checkbox"));
  expect(botao.disabled).toBe(false);
  await act(async () => fireEvent.click(botao));
  expect(h.abrir).toHaveBeenCalledWith(true);
  expect(h.concluir).toHaveBeenCalledWith({ code: "c", waba_id: "999888777666555", phone_number_id: "111222333444555", coexistencia: true });
});

it("a Meta sem os dados do número: erro dito e nada enviado ao servidor", async () => {
  h.config = CFG;
  h.abrir.mockResolvedValue({ ok: false, motivo: "sem_dados" });
  await ate2();
  escolher(/^API Oficials*Número oficial/);
  await continuar();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Conectar com a Meta" })));
  expect(h.toast.error).toHaveBeenCalledWith("A Meta não retornou os dados do número. Refaça e conclua todos os passos.");
  expect(h.concluir).not.toHaveBeenCalled();
});
