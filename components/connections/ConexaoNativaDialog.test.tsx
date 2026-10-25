import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: { get: h.get, post: h.post } }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (v: string) => v }));
vi.mock("@/lib/clipboard", () => ({ copyToClipboard: vi.fn(async () => true) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ConexaoNativaDialog } from "./ConexaoNativaDialog";
import { mascaraBr } from "./ConexaoNativaNumero";

const corpo = (estado: string, extra: object = {}) => ({ data: { estado, atualizado_em: "x", ...extra } });
const QR1 = "data:image/png;base64,AAAA";
const QR2 = "data:image/png;base64,BBBB";

beforeEach(() => {
  vi.useFakeTimers();
  h.get.mockReset();
  h.post.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const montar = (onConectado = vi.fn(), onClose = vi.fn()) =>
  render(<ConexaoNativaDialog canalId="c1" onClose={onClose} onConectado={onConectado} />);
const passa = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

it("gerando: skeleton e texto, nunca imagem quebrada; depois mostra o QR e troca por outro", async () => {
  h.get.mockResolvedValueOnce(corpo("gerando")).mockResolvedValueOnce(corpo("aguardando_leitura", { qr: QR1 })).mockResolvedValue(corpo("aguardando_leitura", { qr: QR2 }));
  montar();
  await passa(0);
  expect(screen.getByText("Gerando o QR code…")).toBeTruthy();
  expect(document.querySelector("img")).toBeNull();
  await passa(2500);
  expect(document.querySelector("img")!.getAttribute("src")).toBe(QR1);
  expect(screen.getByText(/Novo QR em/)).toBeTruthy();
  await passa(2500);
  expect(document.querySelector("img")!.getAttribute("src")).toBe(QR2);
});

it("reconectando e erro (com Tentar agora)", async () => {
  h.get.mockResolvedValueOnce(corpo("reconectando")).mockResolvedValue(corpo("erro"));
  montar();
  await passa(0);
  expect(screen.getByText("O QR expirou, gerando um novo…")).toBeTruthy();
  await passa(2500);
  expect(screen.getByText("Não foi possível gerar o QR agora.")).toBeTruthy();
  h.get.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "Tentar agora" }));
  await passa(0);
  expect(h.get).toHaveBeenCalledTimes(1);
});

it("recua (backoff) quando o servidor erra: 5 s, depois 10 s", async () => {
  h.get.mockRejectedValue(new Error("429"));
  montar();
  await passa(0);
  expect(h.get).toHaveBeenCalledTimes(1);
  await passa(2500);
  expect(h.get).toHaveBeenCalledTimes(1);
  await passa(2500);
  expect(h.get).toHaveBeenCalledTimes(2);
  await passa(5000);
  expect(h.get).toHaveBeenCalledTimes(2);
  await passa(5000);
  expect(h.get).toHaveBeenCalledTimes(3);
});

it("conectado: tela de sucesso com o numero, avisa uma vez, para o poll e Concluir fecha", async () => {
  h.get.mockResolvedValue(corpo("conectado", { telefone: "5511912345678" }));
  const onConectado = vi.fn();
  const onClose = vi.fn();
  montar(onConectado, onClose);
  await passa(0);
  expect(screen.getAllByText("WhatsApp conectado!").length).toBeGreaterThan(0);
  expect(screen.getByText("+5511912345678")).toBeTruthy();
  await passa(10_000);
  expect(h.get).toHaveBeenCalledTimes(1);
  expect(onConectado).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
  expect(onClose).toHaveBeenCalled();
});

it("desmontar para o poll", async () => {
  h.get.mockResolvedValue(corpo("gerando"));
  const r = montar();
  await passa(0);
  r.unmount();
  h.get.mockClear();
  await passa(10_000);
  expect(h.get).not.toHaveBeenCalled();
});

it("aba Por numero: mascara, gera o codigo e mostra XXXX-XXXX", async () => {
  h.get.mockResolvedValue(corpo("aguardando_leitura", { qr: QR1 }));
  h.post.mockResolvedValue({ data: { codigo: "9H3J-H3J8" } });
  montar();
  await passa(0);
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Por número" }), { button: 0 });
  fireEvent.click(screen.getByRole("tab", { name: "Por número" }));
  const campo = screen.getByLabelText("Número do WhatsApp") as HTMLInputElement;
  fireEvent.change(campo, { target: { value: "11912345678" } });
  expect(campo.value).toBe("(11) 91234-5678");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Gerar código de conexão" })); });
  expect(h.post).toHaveBeenCalledWith("/api/v1/channel-sessions/c1/codigo-nativo", { telefone: "11912345678" }, expect.anything());
  expect(screen.getByTestId("codigo-de-conexao").textContent).toBe("9H3J-H3J8");
});

it("mascara BR", () => {
  expect(mascaraBr("1191234")).toBe("(11) 9123-4");
  expect(mascaraBr("+5511912345678")).toBe("(11) 91234-5678");
});
