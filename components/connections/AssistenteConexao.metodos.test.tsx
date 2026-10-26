import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
const stub = vi.hoisted(
  () => (id: string, tel: string | null) =>
    function Stub({ onConectado }: { onConectado?: (t: string | null) => void }) {
      return <button data-testid={id} onClick={() => onConectado?.(tel)}>gravar {id}</button>;
    },
);
vi.mock("@/lib/api/client", () => ({ apiClient: { get: h.get, post: h.post } }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (v: string) => v }));
vi.mock("@/hooks/channels/useOfficialChannel", () => ({ useOfficialChannel: () => ({ data: undefined }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

vi.mock("./CanalOficialClient", () => ({ CanalOficialClient: stub("form-oficial", "5511900000001") }));
vi.mock("./CanalParceiroClient", () => ({ CanalParceiroClient: stub("form-parceiro", "5511900000002") }));
vi.mock("./CanalGraphParceiroClient", () => ({ CanalGraphParceiroClient: stub("form-graph", null) }));
vi.mock("./CanalHospedadoClient", () => ({ CanalHospedadoClient: stub("form-codigo", "5511900000003") }));

import { AssistenteConexao } from "./AssistenteConexao";
import { recomendar } from "./AssistenteMetodo";

beforeEach(() => {
  h.get.mockReset();
  h.post.mockReset();
  h.get.mockResolvedValue({ data: { estado: "gerando", atualizado_em: "x" } });
});
afterEach(cleanup);

const montar = (extra: Partial<Parameters<typeof AssistenteConexao>[0]> = {}) => {
  const p = { onClose: vi.fn(), onAtualizar: vi.fn(), ...extra };
  render(<AssistenteConexao {...p} />);
  return p;
};
const clicar = (nome: string | RegExp) =>
  act(async () => {
    fireEvent.click(screen.getByRole("button", { name: nome }));
  });
const passo2 = async (extra = {}) => {
  const p = montar(extra);
  fireEvent.change(screen.getByLabelText("Nome da conexão"), { target: { value: "Comercial" } });
  await clicar("Continuar");
  return p;
};
const escolher = (rotulo: RegExp | string) => fireEvent.click(screen.getByRole("radio", { name: rotulo }));
const recomendado = (rotulo: string) =>
  !!screen.getByRole("radio", { name: new RegExp(rotulo) }).textContent?.includes("Recomendado");

it("recomendar: Não aponta QR, Sim aponta Verdash, Não sei não recomenda; sem QR no CRM, Não não recomenda QR", () => {
  expect(recomendar("nao", true)).toBe("qr");
  expect(recomendar("sim", true)).toBe("codigo");
  expect(recomendar("nao_sei", true)).toBeNull();
  expect(recomendar(null, true)).toBeNull();
  expect(recomendar("nao", false)).toBeNull();
});

it("passo 1: Continuar desabilitado sem nome, sem Voltar, stepper marca o passo atual, e é um dialog", () => {
  montar();
  expect((screen.getByRole("button", { name: "Continuar" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByRole("button", { name: "Voltar" })).toBeNull();
  expect(document.querySelector('[aria-current="step"]')!.textContent).toContain("1");
  expect(screen.getByRole("dialog")).toBeTruthy();
});

it("resposta Não: recomenda QR e NAO recomenda a Verdash (controle negativo)", async () => {
  await passo2();
  escolher("Não");
  expect(recomendado("QR Code")).toBe(true);
  expect(recomendado("Número já conectado na Verdash")).toBe(false);
  expect(screen.queryByText(/pode duplicar mensagens/)).toBeNull();
});

it("resposta Sim: destaca a Verdash, avisa da duplicidade e NAO recomenda QR", async () => {
  await passo2();
  escolher("Sim");
  expect(recomendado("Número já conectado na Verdash")).toBe(true);
  expect(recomendado("QR Code")).toBe(false);
  expect(screen.getByText(/pode duplicar mensagens/)).toBeTruthy();
  expect(screen.getByRole("radio", { name: /Número já conectado na Verdash/ }).getAttribute("aria-checked")).toBe("true");
});

it("resposta Não sei: ensina a conferir no app e nao recomenda nenhum metodo", async () => {
  await passo2();
  escolher("Não sei");
  expect(screen.getByText(/Ferramentas comerciais > Conta > Empresas conectadas/)).toBeTruthy();
  expect(screen.queryByText("Recomendado")).toBeNull();
  expect(screen.getByText("Entenda cada método")).toBeTruthy();
  expect(screen.getByText("Por que perguntamos")).toBeTruthy();
});

it("sem QR no CRM: cartao QR nao aparece, nenhum metodo vem marcado e Continuar espera a escolha", async () => {
  await passo2({ nativoHabilitado: false });
  expect(screen.queryByRole("radio", { name: /QR Code/ })).toBeNull();
  expect(screen.queryByText(/Coexistence/i)).toBeNull();
  expect((screen.getByRole("button", { name: "Continuar" }) as HTMLButtonElement).disabled).toBe(true);
  escolher(/API Oficial/);
  expect((screen.getByRole("button", { name: "Continuar" }) as HTMLButtonElement).disabled).toBe(false);
});

it.each([
  [/Número já conectado na Verdash/, "form-codigo"],
  [/API Oficial/, "form-oficial"],
  [/Provedor parceiro/, "form-parceiro"],
])("metodo %s leva ao formulario certo, sem criar canal", async (cartao, id) => {
  await passo2();
  escolher(cartao);
  await clicar("Continuar");
  expect(screen.getByTestId(id)).toBeTruthy();
  expect(screen.getByText("Passo 3 de 4")).toBeTruthy();
  expect(h.post).not.toHaveBeenCalled();
});

it("parceiro com provedor Graph: pergunta qual, e a resposta abre o formulario dele", async () => {
  await passo2({ graphParceiro: "Provedor G" });
  escolher(/Provedor parceiro/);
  await clicar("Continuar");
  expect(screen.queryByTestId("form-parceiro")).toBeNull();
  await clicar("Provedor G");
  expect(screen.getByTestId("form-graph")).toBeTruthy();
});

it("metodo sem QR: Concluir so habilita depois de gravar; o agente leva a aba do metodo", async () => {
  const onConfigurarAgente = vi.fn();
  const p = await passo2({ onConfigurarAgente });
  escolher(/API Oficial/);
  await clicar("Continuar");
  expect((screen.getByRole("button", { name: "Concluir" }) as HTMLButtonElement).disabled).toBe(true);
  await clicar(/gravar form-oficial/);
  await clicar("Concluir");
  expect(screen.getByText("Passo 4 de 4")).toBeTruthy();
  expect(screen.getByText("+5511900000001").className).toContain("font-mono");
  expect(screen.getByText(/Próximo passo: configurar o agente de IA do canal/)).toBeTruthy();
  await clicar(/Configurar o agente de IA/);
  expect(onConfigurarAgente).toHaveBeenCalledWith(null, "oficial");
  expect(p.onClose).toHaveBeenCalled();
});

it("Voltar no passo 3 volta ao 2; Configurar depois no sucesso so fecha", async () => {
  const p = await passo2();
  escolher(/Número já conectado na Verdash/);
  await clicar("Continuar");
  await clicar("Voltar");
  expect(screen.getByText("Passo 2 de 4")).toBeTruthy();
  await clicar("Continuar");
  await clicar(/gravar form-codigo/);
  await clicar("Concluir");
  await clicar("Configurar depois");
  expect(p.onClose).toHaveBeenCalled();
});

it("QR: o canal nasce ao Continuar; Continuar depois fecha e MANTEM o canal (nada alem do POST)", async () => {
  h.post.mockResolvedValueOnce({ data: { channel_session_id: "c1", recebimento_ligado: true } });
  const p = await passo2();
  await clicar("Continuar");
  await act(async () => {});
  expect(h.post).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Passo 3 de 4")).toBeTruthy();
  await clicar("Continuar depois");
  expect(p.onClose).toHaveBeenCalled();
  expect(h.post).toHaveBeenCalledTimes(1);
});

it("retomar (canalIdInicial): abre no passo 3 sem POST de criacao", async () => {
  montar({ canalIdInicial: "c9", nomeInicial: "Comercial" });
  await act(async () => {});
  expect(screen.getByText("Passo 3 de 4")).toBeTruthy();
  expect(h.post).not.toHaveBeenCalled();
  expect(h.get.mock.calls[0]![0]).toBe("/api/v1/channel-sessions/c9/conexao-nativa");
});

it("Esc fecha e o foco volta ao botao que abriu a gaveta", async () => {
  const foco = vi.fn();
  function Pai() {
    const [aberto, setAberto] = useState(true);
    return aberto ? <AssistenteConexao onClose={() => setAberto(false)} onAtualizar={() => {}} devolverFoco={foco} /> : null;
  }
  render(<Pai />);
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  await act(async () => {});
  expect(screen.queryByRole("dialog")).toBeNull();
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20)); // o Radix devolve o foco num setTimeout(0)
  });
  expect(foco).toHaveBeenCalled();
});

it("trocar de metodo zera o Concluir; metodo sem QR avisa que o nome do passo 1 so vale para o QR", async () => {
  await passo2();
  escolher(/API Oficial/);
  await clicar("Continuar");
  expect(screen.getByText(/vale só para o QR Code/)).toBeTruthy();
  await clicar(/gravar form-oficial/);
  expect((screen.getByRole("button", { name: "Concluir" }) as HTMLButtonElement).disabled).toBe(false);
  await clicar("Voltar");
  escolher(/Provedor parceiro/);
  await clicar("Continuar");
  expect((screen.getByRole("button", { name: "Concluir" }) as HTMLButtonElement).disabled).toBe(true);
});
