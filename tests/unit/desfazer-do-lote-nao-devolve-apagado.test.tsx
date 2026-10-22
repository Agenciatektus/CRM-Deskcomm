import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { selecaoRestaurada } from "@/lib/kanban/selecao-restaurada";

/**
 * O DESFAZER do lote (barra do Funil) devolve a seleção que a ação limpou ao
 * agendar. Nos 5 s do aviso o mundo anda: o negócio pode sumir do quadro e a
 * pessoa pode marcar outra coisa. Devolver o id apagado marcaria um card que a
 * tela não mostra; sobrescrever a seleção nova jogaria fora o que ela marcou.
 */
describe("selecaoRestaurada (pura)", () => {
  it("devolve só os ids que ainda estão no quadro", () => {
    expect(selecaoRestaurada([], ["a", "b", "c"], new Set(["a", "c"]))).toEqual(["a", "c"]);
  });

  it("não sobrescreve uma seleção nova feita nos 5 s", () => {
    expect(selecaoRestaurada(["x"], ["a", "b"], new Set(["a", "b", "x"]))).toEqual(["x"]);
  });

  it("controle: com tudo no quadro e nada marcado, devolve tudo, na ordem", () => {
    expect(selecaoRestaurada([], ["b", "a"], new Set(["a", "b"]))).toEqual(["b", "a"]);
  });
});

// ── O PONTO DE USO: a página entrega à barra o restaurar com as duas regras ──
const quadro = vi.hoisted(() => ({ leads: [] as Array<{ id: string; tags: string[] }> }));
const barra = vi.hoisted(() => ({
  onRestaurar: null as null | ((ids: string[]) => void),
  selecionados: [] as string[],
}));
const selecionar = vi.hoisted(() => ({ fn: null as null | ((ids: string[]) => void) }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/app/pipelines/p-1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useUser: () => ({ id: "u-1" }),
  useAuth: () => ({ user: { id: "u-1" } }),
  useActiveOrg: () => ({ orgId: "org-1", role: "agent" }),
  usePermission: () => false,
}));
vi.mock("@/hooks/inbox/useAssignableMembers", () => ({ useAssignableMembers: () => ({ data: [] }) }));
vi.mock("@/hooks/kanban/useBoard", () => ({
  useBoard: () => ({
    data: { pipeline: { id: "p-1", vocabulary: null }, stages: [], leads: quadro.leads },
    isLoading: false,
    error: null,
    pulses: [],
    realtimeStatus: "SUBSCRIBED",
    seguranca: { divergencias: 0, ultimaVerificacao: null },
  }),
}));
vi.mock("@/components/kanban/barra/BarraDeBusca", () => ({ BarraDeBusca: () => null }));
vi.mock("@/components/kanban/barra/CabecalhoDoFunil", () => ({ CabecalhoDoFunil: () => null }));
vi.mock("@/components/kanban/barra/PainelDeFiltros", () => ({ PainelDeFiltros: () => null }));
vi.mock("@/components/kanban/NewLeadDialog", () => ({ NewLeadDialog: () => null }));
vi.mock("@/components/kanban/LeadDossier", () => ({ LeadDossier: () => null }));
vi.mock("@/components/kanban/KanbanBoard", () => ({
  KanbanBoard: ({ onSelectionChange }: { onSelectionChange: (ids: string[]) => void }) => {
    selecionar.fn = onSelectionChange;
    return null;
  },
}));
vi.mock("@/components/kanban/BulkActionBar", () => ({
  BulkActionBar: (p: { selectedIds: string[]; onRestaurar: (ids: string[]) => void }) => {
    barra.onRestaurar = p.onRestaurar;
    barra.selecionados = p.selectedIds;
    return null;
  },
}));

async function montarPagina() {
  const { PipelinePageClient } = await import("@/app/app/pipelines/[id]/_client");
  return render(<PipelinePageClient pipelineId="p-1" initialName="Funil" role="admin" funis={[]} />);
}

beforeEach(() => {
  quadro.leads = [
    { id: "a", tags: [] },
    { id: "b", tags: [] },
  ];
  barra.onRestaurar = null;
  barra.selecionados = [];
});

describe("a página do funil liga o Desfazer do lote com as duas regras", { timeout: 40_000 }, () => {
  it("⭐ negócio que saiu do quadro nos 5 s não volta à seleção", async () => {
    const r = await montarPagina();
    // Sai "b" do quadro (excluído por outra pessoa) enquanto o aviso corre.
    quadro.leads = [{ id: "a", tags: [] }];
    const { PipelinePageClient } = await import("@/app/app/pipelines/[id]/_client");
    r.rerender(<PipelinePageClient pipelineId="p-1" initialName="Funil" role="admin" funis={[]} />);
    act(() => barra.onRestaurar!(["a", "b"]));
    expect(barra.selecionados).toEqual(["a"]);
  });

  it("⭐ seleção nova feita nos 5 s não é sobrescrita", async () => {
    await montarPagina();
    act(() => selecionar.fn!(["b"]));
    act(() => barra.onRestaurar!(["a"]));
    expect(barra.selecionados).toEqual(["b"]);
  });

  it("controle: seleção vazia e tudo no quadro, o Desfazer devolve o que estava", async () => {
    await montarPagina();
    act(() => barra.onRestaurar!(["a", "b"]));
    expect(barra.selecionados).toEqual(["a", "b"]);
  });
});
