/**
 * O CARD DO FUNIL MOSTRA AS ETIQUETAS DO NEGÓCIO (#2979).
 *
 * Antes, o quadro escondia as etiquetas no `title` do card — e no toque nem isso
 * existia. Quem opera por etiqueta (a agência de viagens da issue usa
 * `não-enviar-promoções`, `fornecedor`, `lead-sem-retorno`) não via no card
 * nenhum dos marcadores que decidem o que o sistema faz.
 *
 * O que este arquivo prende:
 *
 *   1. o chip é o `ChipDeEtiqueta` — o MESMO do Inbox, com a cor do vocabulário
 *      ao fundo —, não um `<span>` reinventado aqui;
 *   2. são NO MÁXIMO três, com "+N" para o resto: a faixa é do tamanho do card,
 *      e vinte chips fariam o quadro perder a leitura que ele existe para dar;
 *   3. o `title` continua com a lista COMPLETA, inclusive as resumidas no "+N";
 *   4. negócio sem etiqueta não ganha faixa nenhuma — quem não usa etiqueta fica
 *      com a altura exata de antes desta mudança.
 *
 * Os filhos do card (ações, slots de score/conversa/dono) têm suíte própria e
 * não têm relação com a faixa de etiquetas: aqui eles entram como dublês para o
 * caso medir o CARD, e não as consultas de cada slot. O `Draggable` do dnd é
 * dublado pela mesma razão — o card é renderizado sem quadro em volta.
 */
import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { KanbanCard } from "@/components/kanban/KanbanCard";
import { ProvedorDeCoresDasEtiquetas } from "@/components/tags/CoresDasEtiquetas";
import type { CardInput } from "@/lib/kanban/card-state";
import type { Lead } from "@/lib/types/leads";

const get = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: (...args: unknown[]) => get(...args),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({ activeOrg: { orgId: "org-1", role: "manager" } }),
  usePermission: () => true,
}));
vi.mock("@hello-pangea/dnd", () => ({
  Draggable: ({ children }: { children: (p: unknown, s: unknown) => ReactNode }) =>
    children(
      { innerRef: () => {}, draggableProps: {}, dragHandleProps: {} },
      { isDragging: false },
    ),
}));
vi.mock("@/components/kanban/KanbanCardActions", () => ({ KanbanCardActions: () => null }));
vi.mock("@/components/kanban/NextActionSlot", () => ({ NextActionSlot: () => null }));
vi.mock("@/components/kanban/ReactivationSlot", () => ({ ReactivationSlot: () => null }));
vi.mock("@/components/kanban/ConversaSlot", () => ({ ConversaSlot: () => null }));
vi.mock("@/components/kanban/ScoreSlot", () => ({ ScoreSlot: () => null }));
vi.mock("@/components/kanban/OwnerBadge", () => ({ OwnerBadge: () => null }));
vi.mock("@/components/kanban/ContatoNoCard", () => ({ ContatoNoCard: () => null }));
vi.mock("@/components/kanban/TarefasNoCard", () => ({ TarefasNoCard: () => null }));

const LEAD = { id: "l-1", title: "Proposta da ACME" } as unknown as Lead;

function card(tags: string[]): CardInput {
  return {
    id: "l-1",
    title: "Proposta da ACME",
    valueCents: 150_000,
    currency: "BRL",
    owner: { kind: null, name: null, agentVersion: null },
    stageName: "Proposta",
    hoursInStage: 3,
    isCooling: false,
    tags,
  };
}

function montar(c: CardInput) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ProvedorDeCoresDasEtiquetas>
        <KanbanCard card={c} lead={LEAD} index={0} pipelineId="p-1" />
      </ProvedorDeCoresDasEtiquetas>
    </QueryClientProvider>,
  );
}

/** A faixa das etiquetas — o `data-testid` existe para o caso 4 poder medir a
 * AUSÊNCIA dela (um `queryByText` de tag não distingue "não pintou" de "pintou
 * com outro texto"). */
const faixa = () => screen.queryByTestId("card-etiquetas");

afterEach(cleanup);

describe("KanbanCard — etiquetas do negócio", () => {
  it("pinta até três etiquetas como chips, com o texto de cada uma", () => {
    get.mockResolvedValue({ data: [] });
    montar(card(["vip", "recompra", "fornecedor"]));

    const chips = within(faixa()!).getAllByText(/vip|recompra|fornecedor/);
    expect(chips).toHaveLength(3);
    // Sem "+N": não sobrou nada de fora.
    expect(screen.queryByText(/^\+\d+$/)).toBeNull();
  });

  it("acima de três, o resto sai como “+N” — e a lista completa fica no title", () => {
    get.mockResolvedValue({ data: [] });
    montar(card(["vip", "recompra", "fornecedor", "lead-sem-retorno", "urgente"]));

    // Três chips, e o "de fora" contado (não listado).
    expect(within(faixa()!).getAllByText(/vip|recompra|fornecedor/)).toHaveLength(3);
    expect(within(faixa()!).getByText("+2")).toBeTruthy();
    // As que o "+N" resumiu NÃO viram chip.
    expect(within(faixa()!).queryByText("urgente")).toBeNull();

    // O tooltip continua sendo a lista COMPLETA — inclusive as resumidas.
    const cartao = screen.getByRole("group", { name: "Lead: Proposta da ACME" });
    expect(cartao.getAttribute("title")).toBe(
      "Tags: vip, recompra, fornecedor, lead-sem-retorno, urgente",
    );
  });

  it("negócio sem etiqueta não ganha faixa nenhuma (a altura de antes)", () => {
    get.mockResolvedValue({ data: [] });
    montar(card([]));

    expect(faixa()).toBeNull();
  });

  it("o chip é o ChipDeEtiqueta: a cor do vocabulário vai ao fundo", async () => {
    get.mockImplementation(async (url: string) =>
      url === "/api/v1/tags/cores" ? { data: [{ tag: "vip", cor: "#e35537" }] } : { data: [] },
    );
    montar(card(["vip"]));

    const chip = within(faixa()!).getByText("vip");
    await waitFor(() =>
      expect((chip.getAttribute("style") ?? "").replace(/\s/g, "")).toMatch(
        /rgb\(227,85,55\)|#e35537/i,
      ),
    );
  });
});
