/**
 * Visual v2, fase 3.1: os filtros da lista atrás de UM botão, e o que está
 * ligado à vista como chip removível.
 *
 * O risco que estes casos vigiam é o de sempre desta tela: filtro escondido
 * atrás de um botão é filtro que a pessoa esquece que ligou. Por isso o chip
 * tem de existir para cada filtro ligado, o "x" tem de desligar SÓ o seu, e o
 * popover tem de fechar pelos dois caminhos que o operador usa (Esc e clique
 * fora) sem levar o filtro junto.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { InboxFilters, type InboxFiltersValue } from "@/components/inbox/InboxFilters";
import type * as CanaisModule from "@/hooks/channels/useChannelSessions";
import type { ChannelSession } from "@/hooks/channels/useChannelSessions";

vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({
    activeOrg: { orgId: "org-1", name: "Org", role: "manager", visibility_mode: "all" },
  }),
}));
vi.mock("@/hooks/channels/useChannelSessions", async (original) => {
  const real = await original<typeof CanaisModule>();
  return { ...real, useChannelSessions: () => ({ data: [] as ChannelSession[] }) };
});
// Referências ESTÁVEIS, como as do react-query: um array novo a cada render
// faria a memória do vocabulário (`useOpcoesDeEtiqueta`) se reajustar sem fim.
const TAGS_DA_CONVERSA = ["vip", "retorno"];
const TAGS_DO_CONTATO: string[] = [];
vi.mock("@/hooks/inbox/useConversationTags", () => ({
  useConversationTagVocabulary: () => ({ data: TAGS_DA_CONVERSA }),
}));
vi.mock("@/hooks/contacts/useContactTagVocabulary", () => ({
  useContactTagVocabulary: () => ({ data: TAGS_DO_CONTATO }),
}));
vi.mock("@/hooks/inbox/useConversationCounts", () => ({
  useConversationCounts: () => ({ data: { fila: 3, mine: 2, all: 5 } }),
}));

const VALUE: InboxFiltersValue = { tab: "all", search: "", onlyUnread: false };
const botaoFiltros = () => screen.getByRole("button", { name: /^Filtros/ });
const chips = () => screen.queryByRole("group", { name: "Filtros ativos" });

beforeEach(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

describe("chips dos filtros ligados", () => {
  it("CONTROLE: sem filtro ligado não há chip nem número no botão", () => {
    render(<InboxFilters value={VALUE} onChange={() => {}} />);
    expect(chips()).toBeNull();
    expect(botaoFiltros()).toHaveTextContent(/^Filtros$/);
    expect(botaoFiltros()).toHaveAccessibleName("Filtros");
  });

  it("cada filtro ligado vira um chip, e o botão conta quantos", () => {
    render(
      <InboxFilters
        value={{ ...VALUE, onlyUnread: true, onlyGroups: true, tag: ["vip", "retorno"], entrada: "direct" }}
        onChange={() => {}}
      />,
    );
    const grupo = chips()!;
    expect(within(grupo).getByText("Só não lidas")).toBeInTheDocument();
    expect(within(grupo).getByText("Só grupos")).toBeInTheDocument();
    expect(within(grupo).getByText("vip")).toBeInTheDocument();
    expect(within(grupo).getByText("retorno")).toBeInTheDocument();
    expect(within(grupo).getByText("Só Direct")).toBeInTheDocument();
    expect(botaoFiltros()).toHaveTextContent("5");
    expect(botaoFiltros()).toHaveAccessibleName("Filtros, 5 ativos");
  });

  it("o x do chip desliga SÓ o seu filtro", async () => {
    const user = userEvent.setup({ delay: null });
    const onChange = vi.fn();
    const value = { ...VALUE, onlyUnread: true, tag: ["vip", "retorno"], tagMode: "ou" as const };
    render(<InboxFilters value={value} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Remover filtro Só não lidas" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...value, onlyUnread: false });

    // Tirar uma de duas etiquetas: sobra uma, e o modo E/OU sai junto (sem
    // duas, ele não significa nada), pelo MESMO caminho do menu.
    await user.click(screen.getByRole("button", { name: "Remover filtro vip" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...value, tag: ["retorno"], tagMode: undefined });
  });

  it("Limpar desliga os do popover e preserva a busca e a aba", async () => {
    const user = userEvent.setup({ delay: null });
    const onChange = vi.fn();
    render(
      <InboxFilters
        value={{ ...VALUE, tab: "mine", search: "maria", onlyUnread: true, channel_session_id: "c1" }}
        onChange={onChange}
      />,
    );
    await user.click(within(chips()!).getByRole("button", { name: "Limpar" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tab: "mine",
        search: "maria",
        onlyUnread: false,
        channel_session_id: undefined,
        tag: undefined,
      }),
    );
  });
});

describe("o popover de filtros", () => {
  it("abre com os filtros que já existiam e liga Só não lidas", async () => {
    const user = userEvent.setup({ delay: null });
    const onChange = vi.fn();
    render(<InboxFilters value={VALUE} onChange={onChange} />);
    await user.click(botaoFiltros());
    expect(screen.getByRole("switch", { name: "Só grupos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filtrar por tag" })).toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "Só não lidas" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...VALUE, onlyUnread: true });
  });

  it("fecha com Esc", async () => {
    const user = userEvent.setup({ delay: null });
    render(<InboxFilters value={VALUE} onChange={() => {}} />);
    await user.click(botaoFiltros());
    expect(screen.getByRole("switch", { name: "Só não lidas" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("switch", { name: "Só não lidas" })).toBeNull();
  });

  it("fecha com clique fora", async () => {
    const user = userEvent.setup({ delay: null });
    render(<InboxFilters value={VALUE} onChange={() => {}} />);
    await user.click(botaoFiltros());
    expect(screen.getByRole("switch", { name: "Só não lidas" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /Fila/ }));
    expect(screen.queryByRole("switch", { name: "Só não lidas" })).toBeNull();
  });

  it("CONTROLE: clicar DENTRO não fecha", async () => {
    // Sem este par, um popover que fechasse a qualquer clique passaria nos dois
    // de cima, e o operador nunca conseguiria ligar dois filtros seguidos.
    const user = userEvent.setup({ delay: null });
    render(<InboxFilters value={VALUE} onChange={() => {}} />);
    await user.click(botaoFiltros());
    await user.click(screen.getByRole("switch", { name: "Só grupos" }));
    expect(screen.getByRole("switch", { name: "Só não lidas" })).toBeInTheDocument();
  });
});
