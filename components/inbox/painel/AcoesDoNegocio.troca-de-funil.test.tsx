import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const permissao = vi.hoisted(() => ({ pode: true }));
vi.mock("@/hooks/auth/AuthProvider", () => ({ usePermission: () => permissao.pode }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));
vi.mock("@/hooks/kanban/useUpdateLead", () => ({ useWinLead: () => ({ mutateAsync: vi.fn() }) }));
vi.mock("@/components/kanban/LoseLeadDialog", () => ({ FormularioDePerda: () => null }));
vi.mock("@/components/kanban/MoveToOtherPipelineDialog", () => ({
  FormularioDeOutroFunil: () => <div data-testid="formulario-de-outro-funil" />,
}));
vi.mock("./ResponsavelDoNegocio", () => ({ ResponsavelDoNegocio: () => null }));

import { AcoesDoNegocio } from "./AcoesDoNegocio";
import type { LeadRow } from "./tipos";

function lead(status: "open" | "won" | "lost"): LeadRow {
  return { id: "l1", pipeline_id: "p1", status } as unknown as LeadRow;
}

function abre(status: "open" | "won" | "lost") {
  return render(<AcoesDoNegocio lead={lead(status)} contactId="c1" leitura={false} onMudou={() => {}} />);
}

describe("Outro funil no painel do negócio", () => {
  it("negócio GANHO continua podendo ir para outro funil (pós-venda, recompra)", () => {
    abre("won");
    fireEvent.click(screen.getByRole("button", { name: /Outro funil/ }));
    expect(screen.getByTestId("formulario-de-outro-funil")).toBeInTheDocument();
    // Ganho e Perdido não fazem sentido num negócio já ganho.
    expect(screen.queryByRole("button", { name: /^Ganho$/ })).toBeNull();
  });

  it("negócio ABERTO segue com Ganho, Perdido e Outro funil", () => {
    abre("open");
    expect(screen.getByRole("button", { name: /Outro funil/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ganho/ })).toBeInTheDocument();
  });

  it("CONTROLE: negócio PERDIDO não ganha a opção, e sem permissão ninguém vê", () => {
    const { unmount } = abre("lost");
    expect(screen.queryByRole("button", { name: /Outro funil/ })).toBeNull();
    unmount();
    permissao.pode = false;
    abre("won");
    expect(screen.queryByRole("button", { name: /Outro funil/ })).toBeNull();
    permissao.pode = true;
  });
});
