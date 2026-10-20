import { readFileSync } from "node:fs";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BulkActionBar } from "@/components/kanban/BulkActionBar";
import { comparadorDoFunil } from "@/lib/kanban/ordem-do-funil";
import type { Lead } from "@/lib/types/leads";

const mutate = vi.hoisted(() =>
  vi.fn((input: { lead_ids: string[] }, o: { onSuccess: (r: unknown) => void }) =>
    o.onSuccess({ data: { updated_count: input.lead_ids.length } }),
  ),
);
vi.mock("@/hooks/kanban/useBulkAction", () => ({ useBulkAction: () => ({ mutate, isPending: false }) }));
vi.mock("@/lib/ui/aviso-com-desfazer", () => ({
  adiarAcao: (_m: unknown, _r: unknown, executar: () => Promise<unknown>) => void executar(),
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useUser: () => ({ id: "u1", is_platform_admin: false }),
  useActiveOrg: () => ({ role: "agent" }),
}));
vi.mock("@/hooks/inbox/useAssignableMembers", () => ({ useAssignableMembers: () => ({ data: [] }) }));
vi.mock("@/components/cadencia/InscreverNaCadencia", () => ({ InscreverNaCadencia: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

describe("revisão do Cassio na #201 (P2)", () => {
  it("lote acima de 50 vai em blocos de 50, em sequência, e só então limpa a seleção", async () => {
    const ids = Array.from({ length: 120 }, (_, i) => `l${i}`);
    const onClear = vi.fn();
    render(<BulkActionBar selectedIds={ids} stages={[{ id: "s1", name: "Novo" }] as never} pipelineId="p" tagsExistentes={[]} leads={[]} funis={[]} ownerNames={new Map()} onClear={onClear} />);
    await userEvent.click(screen.getByRole("button", { name: "Mover para…" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Novo" }));
    await waitFor(() => expect(onClear).toHaveBeenCalled());
    expect(mutate.mock.calls.map((c) => c[0].lead_ids.length)).toEqual([50, 50, 20]);
  });

  it("ordem Manual existe e usa a posição; prazo inválido não quebra o urgente", () => {
    const l = (id: string, pos: number, prazo: string | null) =>
      ({ id, position_in_stage: pos, created_at: "2026-10-01", stage_changed_at: null, proximo_passo: prazo === null ? null : { titulo: "x", prazo } }) as unknown as Lead;
    const leads = [l("b", 2, "lixo"), l("a", 1, null), l("c", 3, "2026-10-01T10:00:00Z")];
    expect([...leads].sort(comparadorDoFunil("manual")).map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect([...leads].sort(comparadorDoFunil("urgente")).map((x) => x.id)).toEqual(["c", "a", "b"]);
  });

  it("com ordem ativa, soltar DENTRO da coluna não grava posição (mover entre colunas segue)", () => {
    const fonte = readFileSync("components/kanban/KanbanBoard.tsx", "utf8");
    expect(fonte).toMatch(/ordenar !== "manual" && source\.droppableId === destination\.droppableId\) \{\s*toast\.info\(t\("Para reordenar, use a ordem Manual"\)\);\s*return;/);
  });
});
