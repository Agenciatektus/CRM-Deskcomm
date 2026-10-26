import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("@/lib/api/client", () => ({ apiClient: { get: h.get, post: h.post } }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (v: string) => v }));
vi.mock("@/hooks/channels/useOfficialChannel", () => ({ useOfficialChannel: () => ({ data: undefined }) }));
vi.mock("@/lib/clipboard", () => ({ copyToClipboard: vi.fn(async () => true) }));
vi.mock("sonner", () => ({ toast: h.toast }));

import { AssistenteConexao } from "./AssistenteConexao";

const corpo = (estado: string, extra: object = {}) => ({ data: { estado, atualizado_em: "x", ...extra } });
const QR1 = "data:image/png;base64,AAAA";
const DESAFIO = { challenge: "q1xAbCdEfGhIjKlMnOp==", rpId: "whatsapp.com", allowCredentials: [], userVerification: "required" };
const ASSERT = { rawId: "AQID", response: { clientDataJSON: "eyJ", signature: "MEU" } };

/** Extensao de mentira: responde PING/SIGN pelo mesmo protocolo de postMessage. */
let ext: { instalada: boolean; sign: () => object };
function ouvirComoExtensao() {
  const fn = (ev: MessageEvent) => {
    const d = ev.data as { source?: string; id?: string; type?: string };
    if (ev.source !== window || d?.source !== "session-bridge-page" || !ext.instalada) return;
    const resp = d.type === "PING" ? { type: "PONG", version: "1" } : { type: "SIGN_RESULT", ...ext.sign() };
    window.postMessage({ source: "session-bridge-ext", id: d.id, ...resp }, window.location.origin);
  };
  window.addEventListener("message", fn);
  return () => window.removeEventListener("message", fn);
}
let desligar = () => {};
/** jsdom nao preenche `source` no postMessage (o navegador preenche com a propria janela). */
const postOriginal = window.postMessage.bind(window);
const postComSource = (data: unknown) => {
  setTimeout(() => window.dispatchEvent(new MessageEvent("message", { data, source: window })), 0);
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  h.get.mockReset();
  h.post.mockReset();
  ext = { instalada: false, sign: () => ({ ok: true, assertion: ASSERT }) };
  window.postMessage = postComSource as typeof window.postMessage;
  desligar = ouvirComoExtensao();
});
afterEach(() => {
  window.postMessage = postOriginal;
  desligar();
  cleanup();
  vi.useRealTimers();
});

const passa = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const montar = (extra: Partial<Parameters<typeof AssistenteConexao>[0]> = {}) => {
  const p = { onClose: vi.fn(), onAtualizar: vi.fn(), ...extra };
  render(<AssistenteConexao {...p} />);
  return p;
};
const clicar = (nome: string | RegExp) => act(async () => { fireEvent.click(screen.getByRole("button", { name: nome })); });
const aba = (nome: string) => {
  fireEvent.mouseDown(screen.getByRole("tab", { name: nome }), { button: 0 });
  fireEvent.click(screen.getByRole("tab", { name: nome }));
};
async function ateOPasso3() {
  h.post.mockResolvedValueOnce({ data: { channel_session_id: "c1", recebimento_ligado: true } });
  fireEvent.change(screen.getByLabelText("Nome da conexão"), { target: { value: "  Comercial " } });
  await clicar("Continuar");
  await clicar("Continuar");
  await passa(0);
}

it("passo 1: nome obrigatorio, stepper Passo 1 de 4, placeholder", () => {
  montar();
  expect(screen.getByText("Conectar WhatsApp")).toBeTruthy();
  expect(screen.getByText("Passo 1 de 4")).toBeTruthy();
  expect(screen.getByPlaceholderText("Ex.: Atendimento Comercial")).toBeTruthy();
  expect((screen.getByRole("button", { name: "Continuar" }) as HTMLButtonElement).disabled).toBe(true);
});

it("passo 2: Sim avisa do numero ja conectado; Voltar volta ao passo 1", async () => {
  montar();
  fireEvent.change(screen.getByLabelText("Nome da conexão"), { target: { value: "Comercial" } });
  await clicar("Continuar");
  expect(screen.getByText("Passo 2 de 4")).toBeTruthy();
  fireEvent.click(screen.getByRole("radio", { name: "Sim" }));
  expect(screen.getByText(/só pode estar ligado a um sistema por vez/)).toBeTruthy();
  expect(screen.getByText("QR Code, igual ao WhatsApp Web. Imediata e sem custo.")).toBeTruthy();
  await clicar("Voltar");
  expect(screen.getByText("Passo 1 de 4")).toBeTruthy();
});

it("cria com idempotencia (nome limpo), mostra spinner e avanca ao passo 3", async () => {
  h.get.mockResolvedValue(corpo("aguardando_leitura", { qr: QR1 }));
  let solta: (v: unknown) => void = () => {};
  h.post.mockReturnValueOnce(new Promise((r) => (solta = r)));
  montar();
  fireEvent.change(screen.getByLabelText("Nome da conexão"), { target: { value: "  Comercial " } });
  await clicar("Continuar");
  await clicar("Continuar");
  expect(screen.getByText("Preparando sua conexão…")).toBeTruthy();
  const [url, body, opts] = h.post.mock.calls[0]!;
  expect(url).toBe("/api/v1/channels/hosted");
  expect(body).toEqual({ modo: "qr", rotulo: "Comercial" });
  expect(opts.idempotencyKey).toBeTruthy();
  await act(async () => solta({ data: { channel_session_id: "c1", recebimento_ligado: true } }));
  await passa(0);
  expect(screen.getByText("Passo 3 de 4")).toBeTruthy();
  expect(document.querySelector("img")!.getAttribute("src")).toBe(QR1);
});

it("erro na criacao: avisa, fica no passo 2 e a nova tentativa REUSA a mesma chave", async () => {
  h.post.mockRejectedValueOnce(new Error("falhou")).mockResolvedValueOnce({ data: { channel_session_id: "c1", recebimento_ligado: true } });
  h.get.mockResolvedValue(corpo("gerando"));
  montar();
  fireEvent.change(screen.getByLabelText("Nome da conexão"), { target: { value: "Comercial" } });
  await clicar("Continuar");
  await clicar("Continuar");
  expect(h.toast.error).toHaveBeenCalled();
  expect(screen.getByText("Passo 2 de 4")).toBeTruthy();
  await clicar("Continuar");
  expect(h.post.mock.calls[1]![2].idempotencyKey).toBe(h.post.mock.calls[0]![2].idempotencyKey);
  await passa(0);
  expect(screen.getByText("Passo 3 de 4")).toBeTruthy();
});

it("passo 3: tres abas, QR expirado e erro com Tentar agora, Voltar e Conectar depois", async () => {
  h.get.mockResolvedValueOnce(corpo("reconectando")).mockResolvedValue(corpo("erro"));
  const p = montar();
  await ateOPasso3();
  expect(screen.getByText("O QR expirou, gerando um novo…")).toBeTruthy();
  expect(screen.getAllByRole("tab").map((x) => x.textContent)).toEqual(["QR code", "Por número", "Passkey"]);
  await passa(2500);
  h.get.mockClear();
  await clicar("Tentar agora");
  await passa(0);
  expect(h.get).toHaveBeenCalledTimes(1);
  await clicar("Continuar depois");
  expect(p.onClose).toHaveBeenCalled();
});

it("passo 3: Voltar nao cria outro canal (Continuar volta ao 3)", async () => {
  h.get.mockResolvedValue(corpo("gerando"));
  montar();
  await ateOPasso3();
  await clicar("Voltar");
  await clicar("Continuar");
  expect(h.post).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Passo 3 de 4")).toBeTruthy();
});

it("recua (backoff) quando o servidor erra: 5 s, depois 10 s", async () => {
  h.get.mockRejectedValue(new Error("429"));
  montar();
  await ateOPasso3();
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

it("aba Por numero reaproveita o fluxo existente", async () => {
  h.get.mockResolvedValue(corpo("aguardando_leitura", { qr: QR1 }));
  montar();
  await ateOPasso3();
  h.post.mockResolvedValueOnce({ data: { codigo: "9H3J-H3J8" } });
  aba("Por número");
  fireEvent.change(screen.getByLabelText("Número do WhatsApp"), { target: { value: "11912345678" } });
  await clicar("Gerar código de conexão");
  expect(h.post).toHaveBeenLastCalledWith("/api/v1/channel-sessions/c1/codigo-nativo", { telefone: "11912345678" }, expect.anything());
  expect(screen.getByTestId("codigo-de-conexao").textContent).toBe("9H3J-H3J8");
});

it("passkey sem extensao: orienta instalar (link da loja) e bloqueia Conectar", async () => {
  h.get.mockResolvedValue(corpo("exige_passkey", { passkey: DESAFIO }));
  montar();
  await ateOPasso3();
  expect(screen.getByText(/pede uma chave de acesso \(passkey\)/)).toBeTruthy();
  aba("Passkey");
  await passa(2000);
  const link = screen.getByRole("link", { name: "Instalar extensão" }) as HTMLAnchorElement;
  expect(link.href).toContain("chromewebstore.google.com");
  expect((screen.getByRole("button", { name: "Conectar com passkey" }) as HTMLButtonElement).disabled).toBe(true);
  ext.instalada = true;
  await clicar("Já instalei, verificar");
  await passa(10);
  expect((screen.getByRole("button", { name: "Conectar com passkey" }) as HTMLButtonElement).disabled).toBe(false);
});

it("passkey com extensao: assina UMA vez por desafio, envia a assertion e conecta", async () => {
  ext.instalada = true;
  h.get.mockResolvedValue(corpo("exige_passkey", { passkey: DESAFIO }));
  montar();
  await ateOPasso3();
  aba("Passkey");
  await passa(100);
  h.post.mockResolvedValueOnce({ data: { ok: true } });
  await clicar("Conectar com passkey");
  await passa(10);
  const chamadas = h.post.mock.calls.filter((c) => String(c[0]).endsWith("/passkey-nativo"));
  expect(chamadas).toHaveLength(1);
  expect(chamadas[0]![1]).toEqual(ASSERT);
  expect(screen.getByText(/Aguardando o WhatsApp concluir o pareamento/)).toBeTruthy();
  await passa(10_000); // mesmo desafio no poll: nao assina de novo
  expect(h.post.mock.calls.filter((c) => String(c[0]).endsWith("/passkey-nativo"))).toHaveLength(1);
  h.get.mockResolvedValue(corpo("conectado", { telefone: "5511912345678" }));
  await passa(2500);
  expect(screen.getByText("Passo 4 de 4")).toBeTruthy();
});

it("passkey: cancelada e recusada pelo servidor mostram erro e permitem tentar de novo", async () => {
  ext.instalada = true;
  ext.sign = () => ({ ok: false, cancelled: true });
  h.get.mockResolvedValue(corpo("exige_passkey", { passkey: DESAFIO }));
  montar();
  await ateOPasso3();
  aba("Passkey");
  await passa(100);
  await clicar("Conectar com passkey");
  await passa(10);
  expect(screen.getByRole("alert").textContent).toContain("Assinatura cancelada");
  ext.sign = () => ({ ok: true, assertion: ASSERT });
  h.post.mockRejectedValueOnce(new Error("502"));
  await clicar("Conectar com passkey");
  await passa(10);
  expect(screen.getByRole("alert").textContent).toContain("não aceitou a chave de acesso");
});

it("sucesso: numero em mono, Proximo passo, atalho do agente e Agora nao", async () => {
  h.get.mockResolvedValue(corpo("conectado", { telefone: "5511912345678" }));
  const onConfigurarAgente = vi.fn();
  const p = montar({ onConfigurarAgente });
  await ateOPasso3();
  expect(screen.getByText("Passo 4 de 4")).toBeTruthy();
  expect(screen.getByText("WhatsApp conectado!")).toBeTruthy();
  expect(screen.getByText("+5511912345678").className).toContain("font-mono");
  expect(screen.getByText("O CRM já recebe e envia mensagens por este número.")).toBeTruthy();
  h.get.mockClear();
  await passa(10_000);
  expect(h.get).not.toHaveBeenCalled();
  await clicar(/Configurar o agente de IA/);
  expect(onConfigurarAgente).toHaveBeenCalledWith("c1", "hospedado");
  expect(p.onClose).toHaveBeenCalled();
});

it("Esc fecha o assistente", async () => {
  const p = montar();
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  await passa(0);
  expect(p.onClose).toHaveBeenCalled();
});

it("canalIdInicial: abre direto no passo 3 do canal existente, sem criar outro", async () => {
  h.get.mockResolvedValue(corpo("aguardando_leitura", { qr: QR1 }));
  montar({ canalIdInicial: "c9" });
  await passa(0);
  expect(screen.getByText("Passo 3 de 4")).toBeTruthy();
  expect(h.get.mock.calls[0]![0]).toBe("/api/v1/channel-sessions/c9/conexao-nativa");
  expect(h.post).not.toHaveBeenCalled();
  expect(document.querySelector("img")!.getAttribute("src")).toBe(QR1);
});

it("canalIdInicial + nomeInicial: Voltar ao passo 1 mostra o nome atual, travado", async () => {
  h.get.mockResolvedValue(corpo("aguardando_leitura", { qr: QR1 }));
  montar({ canalIdInicial: "c9", nomeInicial: "Comercial" });
  await passa(0);
  await clicar("Voltar");
  await clicar("Voltar");
  expect((screen.getByLabelText("Nome da conexão") as HTMLInputElement).value).toBe("Comercial");
});
