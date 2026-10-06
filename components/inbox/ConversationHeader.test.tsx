import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConversationHeader } from "./ConversationHeader";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";

/**
 * "Fechar" e "Arquivar" usavam `window.confirm()` — mesmo defeito documentado
 * em `app/app/tasks/_components/ListaDeTarefas.tsx`: bloqueado em iframe,
 * ignora o tema, não passa por `t()`. Agora usam o `AlertDialog` da casa
 * (docs/doctrine/destrutivo-pede-confirmacao.md): o botão só ABRE o diálogo,
 * a mutação só dispara no clique de DENTRO dele.
 */

const closeMutate = vi.hoisted(() => vi.fn());
const arquivarMutate = vi.hoisted(() => vi.fn());
const startCall = vi.hoisted(() => vi.fn());
// Papel da pessoa: `true` é agent+; `false` simula o `viewer` (modo leitura).
const podeAtender = vi.hoisted(() => ({ valor: true }));
const suporte = vi.hoisted(() => ({ valor: null as null | { access_mode: string } }));

vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", support: suporte.valor } }),
  usePermission: () => podeAtender.valor,
}));
// A faixa e o popover de Transferir falam com o react-query; aqui só o
// cabeçalho importa, e cada um tem o seu próprio arquivo de teste.
vi.mock("@/hooks/inbox/useSnoozeConversation", () => ({
  useSnoozeConversation: () => ({ snooze: { mutate: vi.fn(), isPending: false }, cancel: { mutate: vi.fn(), isPending: false } }),
}));
vi.mock("@/components/inbox/cabecalho/TransferirPopover", () => ({
  TransferirPopover: () => <button type="button" aria-label="Transferir conversa" />,
}));
vi.mock("@/hooks/inbox/useClaimConversation", () => ({
  useClaimConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useReleaseConversation", () => ({
  useReleaseConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useCloseConversation", () => ({
  useCloseConversation: () => ({ mutate: closeMutate, isPending: false }),
  useReopenConversation: () => ({ mutate: vi.fn(), isPending: false }),
  useArchiveConversation: () => ({ mutate: arquivarMutate, isPending: false }),
}));
vi.mock("@/hooks/inbox/useResumeAiAttendance", () => ({
  useResumeAiAttendance: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/usePauseAiAttendance", () => ({
  usePauseAiAttendance: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/ai/useAutomaticoAtivo", () => ({
  useAutomaticoAtivo: () => ({ data: false }),
}));
vi.mock("@/components/kanban/OwnerBadge", () => ({ OwnerBadge: () => null }));
vi.mock("@/components/inbox/ReassignDialog", () => ({ ReassignDialog: () => null }));
vi.mock("@/components/inbox/JanelaSelo", () => ({ JanelaSelo: () => null }));
vi.mock("@/components/inbox/ChannelLogo", () => ({ ChannelLogo: () => null }));
vi.mock("@/hooks/voice/useVoiceSessionStatus", () => ({
  useVoiceSessionStatus: () => ({ data: { configured: true, paired: true } }),
}));
vi.mock("@/components/voice/VoiceCallContext", () => ({
  useVoiceCall: () => ({ call: null, startCall }),
}));

function conversa(status: string): ConversationWithContact {
  return {
    id: "conv-1",
    organization_id: "org-1",
    contact_id: "contato-1",
    channel_session_id: "sess-1",
    channel: "whatsapp",
    status,
    status_changed_at: new Date().toISOString(),
    service_revision: 3,
    assigned_to_user_id: null,
    assigned_to_user_name: null,
    assignee_kind: null,
    assigned_at: null,
    last_inbound_at: null,
    last_outbound_at: null,
    last_message_at: null,
    last_message_preview: null,
    unread_count_for_assignee: 0,
    is_group: false,
    group_chat_id: null,
    tags: [],
    metadata: {},
    snooze_until: null,
    contacts: null,
    channel_sessions: null,
  } as unknown as ConversationWithContact;
}

beforeEach(() => {
  podeAtender.valor = true;
  suporte.valor = null;
  closeMutate.mockReset();
  arquivarMutate.mockReset();
  startCall.mockReset();
});

describe("ConversationHeader — chamada de voz na Inbox", () => {
  it("mostra Chamar e liga para o contato da conversa", async () => {
    const user = userEvent.setup();
    const atual = conversa("open");
    atual.contacts = {
      id: "contato-1",
      display_name: "Raphael",
      name: "Raphael",
      phone_number: "+5511999999999",
      tags: [],
      is_blocked: false,
      is_anonymized: false,
    };
    render(<ConversationHeader conversation={atual} />);

    await user.click(screen.getByRole("button", { name: "Chamar" }));
    expect(startCall).toHaveBeenCalledWith("contato-1");
  });

  it("não oferece chamada individual para um grupo", () => {
    const atual = conversa("open");
    atual.is_group = true;
    atual.contacts = {
      id: "contato-1",
      display_name: "Grupo",
      name: "Grupo",
      phone_number: "+5511999999999",
      tags: [],
      is_blocked: false,
      is_anonymized: false,
    };
    render(<ConversationHeader conversation={atual} />);
    expect(screen.queryByRole("button", { name: "Chamar" })).toBeNull();
  });
});

describe("ConversationHeader — Fechar e Arquivar por AlertDialog", () => {
  it("Fechar pede confirmação e só encerra no clique de dentro do diálogo", async () => {
    const user = userEvent.setup();
    render(<ConversationHeader conversation={conversa("open")} />);

    await user.click(screen.getByRole("button", { name: "Fechar conversa" }));

    const dialogo = await screen.findByRole("alertdialog");
    expect(within(dialogo).getByText("Fechar esta conversa?")).toBeTruthy();
    expect(closeMutate).not.toHaveBeenCalled();

    await user.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(closeMutate).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Fechar conversa" }));
    const dialogo2 = await screen.findByRole("alertdialog");
    await user.click(within(dialogo2).getByRole("button", { name: "Fechar" }));

    await waitFor(() => expect(closeMutate).toHaveBeenCalledTimes(1));
    expect(closeMutate).toHaveBeenCalledWith({
      conversation_id: "conv-1",
      expected_revision: 3,
    });
  });

  it("Arquivar, numa conversa aberta, avisa que o atendimento é encerrado junto", async () => {
    const user = userEvent.setup();
    render(<ConversationHeader conversation={conversa("open")} />);

    await user.click(screen.getByRole("button", { name: "Mais ações" }));
    await user.click(await screen.findByRole("menuitem", { name: "Arquivar" }));

    const dialogo = await screen.findByRole("alertdialog");
    expect(within(dialogo).getByText("Arquivar esta conversa?")).toBeTruthy();
    expect(
      within(dialogo).getByText(
        "Arquivar encerra este atendimento e guarda a conversa no histórico. Se o cliente escrever de novo, ela volta.",
      ),
    ).toBeTruthy();
    expect(arquivarMutate).not.toHaveBeenCalled();

    await user.click(within(dialogo).getByRole("button", { name: "Arquivar" }));
    await waitFor(() => expect(arquivarMutate).toHaveBeenCalledTimes(1));
    expect(arquivarMutate).toHaveBeenCalledWith({
      conversation_id: "conv-1",
      expected_revision: 3,
    });
  });

  it("Arquivar, numa conversa já encerrada, não repete o aviso de encerramento", async () => {
    const user = userEvent.setup();
    render(<ConversationHeader conversation={conversa("closed")} />);

    await user.click(screen.getByRole("button", { name: "Mais ações" }));
    await user.click(await screen.findByRole("menuitem", { name: "Arquivar" }));

    const dialogo = await screen.findByRole("alertdialog");
    expect(within(dialogo).getByText("Arquivar esta conversa?")).toBeTruthy();
    expect(
      screen.queryByText(
        "Arquivar encerra este atendimento e guarda a conversa no histórico. Se o cliente escrever de novo, ela volta.",
      ),
    ).toBeNull();
  });
});

describe("ConversationHeader — busca dentro da conversa (#1793)", () => {
  // A lupa foi para o menu "Mais" (visual v2). A intenção do caso continua: o
  // item só existe com quem o atenda, e só abre a busca.
  it("o item só existe com quem o atenda, e só abre a busca, nenhuma ação de atendimento", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ConversationHeader conversation={conversa("open")} />);
    await user.click(screen.getByRole("button", { name: "Mais ações" }));
    expect(screen.queryByRole("menuitem", { name: "Buscar nesta conversa" })).toBeNull();
    await user.keyboard("{Escape}");

    const buscar = vi.fn();
    rerender(
      <ConversationHeader conversation={conversa("open")} onBuscar={buscar} buscaAberta={false} />,
    );
    await user.click(screen.getByRole("button", { name: "Mais ações" }));
    await user.click(await screen.findByRole("menuitem", { name: "Buscar nesta conversa" }));
    expect(buscar).toHaveBeenCalledOnce();
    expect(closeMutate).not.toHaveBeenCalled();
    expect(arquivarMutate).not.toHaveBeenCalled();
  });

  it("com a busca aberta, o item vira Fechar busca", async () => {
    const user = userEvent.setup();
    render(<ConversationHeader conversation={conversa("open")} onBuscar={vi.fn()} buscaAberta />);
    await user.click(screen.getByRole("button", { name: "Mais ações" }));
    expect(await screen.findByRole("menuitem", { name: "Fechar busca" })).toBeTruthy();
  });
});

describe("ConversationHeader — Ver contato e o painel do lead", () => {
  function comContato() {
    const atual = conversa("open");
    atual.contacts = { id: "contato-1", display_name: "Raphael", name: "Raphael", phone_number: null, tags: [], is_blocked: false, is_anonymized: false };
    return atual;
  }
  it("com o painel aberto, Ver contato se cala no xl (o painel tem o seu)", async () => {
    const user = userEvent.setup();
    render(<ConversationHeader conversation={comContato()} painelAberto onAlternarPainel={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Mais ações" }));
    expect((await screen.findByRole("menuitem", { name: "Ver contato" })).className).toContain("xl:hidden");
  });
  it("com o painel FECHADO, Ver contato aparece em toda largura", async () => {
    const user = userEvent.setup();
    render(<ConversationHeader conversation={comContato()} painelAberto={false} onAlternarPainel={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Mais ações" }));
    expect((await screen.findByRole("menuitem", { name: "Ver contato" })).className).not.toContain("xl:hidden");
  });
});

describe("ConversationHeader — modo leitura", () => {
  // Controle: sem ele, as ausências abaixo passariam também com o cabeçalho
  // vazio. Quem atende vê as quatro ações do fluxo normal.
  it("controle: quem atende vê Assumir, Transferir, Lembrar e Fechar", () => {
    render(<ConversationHeader conversation={conversa("open")} />);
    for (const rotulo of ["Assumir", "Transferir conversa", "Lembrar depois", "Fechar conversa"]) {
      expect(screen.getByRole("button", { name: rotulo }), rotulo).toBeTruthy();
    }
    expect(screen.queryByText("Somente leitura")).toBeNull();
  });

  for (const [nome, preparar] of [
    ["viewer", () => { podeAtender.valor = false; }],
    ["suporte somente leitura", () => { suporte.valor = { access_mode: "support_readonly" }; }],
  ] as const) {
    it(`${nome}: nenhuma ação que muda a conversa, e o selo diz por quê`, async () => {
      preparar();
      const user = userEvent.setup();
      const atual = conversa("open");
      atual.snooze_until = new Date(Date.now() + 3_600_000).toISOString();
      render(<ConversationHeader conversation={atual} onBuscar={vi.fn()} />);

      expect(screen.getByText("Somente leitura")).toBeTruthy();
      for (const rotulo of ["Assumir", "Transferir conversa", "Lembrar depois", "Fechar conversa", "Liberar"]) {
        expect(screen.queryByRole("button", { name: rotulo }), rotulo).toBeNull();
      }
      // O chip do lembrete aparece (é informação), mas sem o X de cancelar.
      expect(screen.getByTestId("faixa-lembrete")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Cancelar lembrete" })).toBeNull();

      // Ler continua possível: a busca fica; arquivar e pausar, não.
      await user.click(screen.getByRole("button", { name: "Mais ações" }));
      expect(await screen.findByRole("menuitem", { name: "Buscar nesta conversa" })).toBeTruthy();
      expect(screen.queryByRole("menuitem", { name: "Arquivar" })).toBeNull();
    });
  }
});
