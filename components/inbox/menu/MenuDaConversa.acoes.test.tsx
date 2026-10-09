/** Cada item do menu chama a ROTA que o cabeçalho já chama (fase 3.6). Hooks reais, rede falsa. */
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { item, LEAD, montar, rede } from "@/components/inbox/__fixtures__/bancada-do-menu";
import { ouvirMudancaNoCrmDoContato } from "@/lib/inbox/releitura-do-contato";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
const push = vi.hoisted(() => vi.fn());
const sessao = vi.hoisted(() => ({ pode: true, support: null as null | { access_mode: string } }));

vi.mock("@/lib/api/client", () => ({ apiClient: api }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", support: sessao.support } }),
  usePermission: () => sessao.pode,
}));

beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset();
  push.mockReset();
  sessao.pode = true;
  sessao.support = null;
  rede(api);
});

describe("cada item chama a rota que o cabeçalho chama", () => {
  // Espera o foco pousar no primeiro item: o menu o põe lá logo depois de
  // abrir, e um submenu aberto antes disso fecharia com a troca de foco.
  async function abrir(extra: Partial<ConversationWithContact> = {}) {
    const { linha } = montar(extra);
    fireEvent.contextMenu(linha, { clientX: 10, clientY: 10 });
    await waitFor(() => expect(document.activeElement?.getAttribute("role") ?? "").toMatch(/^menuitem/));
  }

  it("Assumir → POST /claim com o dono esperado", async () => {
    await abrir();
    fireEvent.click(item("Assumir"));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/api/v1/conversations/conv-1/claim", { expected_assignee: null }),
    );
  });

  it("Fechar pede a MESMA confirmação do cabeçalho e só então POST /close", async () => {
    await abrir();
    fireEvent.click(item("Fechar"));
    const janela = await screen.findByRole("alertdialog");
    expect(within(janela).getByText("Fechar esta conversa?")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.click(within(janela).getByRole("button", { name: "Fechar" }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/api/v1/conversations/conv-1/close", { expected_revision: 1 }),
    );
  });

  it("Arquivar confirma e vai pelo PATCH versionado", async () => {
    await abrir();
    fireEvent.click(item("Arquivar"));
    const janela = await screen.findByRole("alertdialog");
    fireEvent.click(within(janela).getByRole("button", { name: "Arquivar" }));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/api/v1/conversations/conv-1", { status: "archived", expected_revision: 1 }),
    );
  });

  async function escolherBruno() {
    await abrir();
    fireEvent.keyDown(item(/Transferir para/), { key: "ArrowRight" });
    const sub = await screen.findByRole("menu", { name: "Transferir para" });
    const bruno = await within(sub).findByRole("menuitem", { name: /Bruno Sales/ });
    expect(within(sub).queryByRole("menuitem", { name: /^Eu/ })).toBeNull();
    fireEvent.click(bruno);
    return screen.findByRole("alertdialog", { name: "Transferir para Bruno Sales?" });
  }

  it("Transferir: escolher o atendente SÓ abre a confirmação", async () => {
    await escolherBruno();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("Transferir: confirmar chama POST /transfer, com o motivo aparado", async () => {
    const janela = await escolherBruno();
    fireEvent.change(within(janela).getByLabelText("Motivo (opcional)"), { target: { value: "  férias  " } });
    fireEvent.click(within(janela).getByRole("button", { name: "Transferir" }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/api/v1/conversations/conv-1/transfer", { to_user_id: "u2", reason: "férias" }),
    );
  });

  it("Transferir: cancelar e Esc não chamam nada", async () => {
    const janela = await escolherBruno();
    fireEvent.click(within(janela).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    const outra = await escolherBruno();
    fireEvent.keyDown(outra, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(api.post).not.toHaveBeenCalled();
  });

  it("Etiquetas → PATCH só com o delta (9045), nunca a lista inteira", async () => {
    await abrir({ tags: ["retorno"] });
    fireEvent.keyDown(item(/Etiquetas/), { key: "ArrowRight" });
    const sub = await screen.findByRole("menu", { name: "Etiquetas" });
    const vip = await within(sub).findByRole("menuitemcheckbox", { name: "vip" });
    expect(within(sub).getByRole("menuitemcheckbox", { name: "retorno" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(vip);
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/api/v1/conversations/conv-1", { tags_adicionar: ["vip"] }),
    );
  });

  it("Etiquetas: desmarcar manda só a remoção", async () => {
    await abrir({ tags: ["retorno", "vip"] });
    fireEvent.keyDown(item(/Etiquetas/), { key: "ArrowRight" });
    const sub = await screen.findByRole("menu", { name: "Etiquetas" });
    fireEvent.click(await within(sub).findByRole("menuitemcheckbox", { name: "retorno" }));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/api/v1/conversations/conv-1", { tags_remover: ["retorno"] }),
    );
  });

  it("Funil: lê o crm-summary SÓ ao abrir o submenu e troca a etapa por /move", async () => {
    await abrir();
    expect(api.get).not.toHaveBeenCalledWith("/api/v1/contacts/contact-1/crm-summary");
    fireEvent.keyDown(item(/Funil e etapa/), { key: "ArrowRight" });
    const sub = await screen.findByRole("menu", { name: "Funil e etapa" });
    const proposta = await within(sub).findByRole("menuitemradio", { name: "Proposta" });
    expect(within(sub).getByRole("menuitemradio", { name: "Novo" })).toHaveAttribute("aria-checked", "true");
    const avisos: string[] = [];
    const parar = ouvirMudancaNoCrmDoContato((id) => avisos.push(id));
    fireEvent.click(proposta);
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/api/v1/leads/lead-1/move",
        expect.objectContaining({ stage_id: "st-2", expected_updated_at: LEAD.updated_at }),
      ),
    );
    // O painel aberto neste contato é avisado para reler o crm-summary.
    await waitFor(() => expect(avisos).toEqual(["contact-1"]));
    parar();
  });

  it("Abrir ficha navega para o contato", async () => {
    await abrir();
    fireEvent.click(item("Abrir ficha do contato"));
    expect(push).toHaveBeenCalledWith("/app/contacts/contact-1");
  });

  it("Copiar telefone usa a área de transferência", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await abrir();
    fireEvent.click(item("Copiar telefone"));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining("99999")));
  });
});
