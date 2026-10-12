/**
 * M2.1: o topo da lista de conversas no celular. Chips com contagem (Fila, Minhas,
 * Todas, Com a IA, Sem próximo passo), linhas "Fechadas N" e "Arquivadas N" que
 * abrem a subtela com voltar, e a linha da conversa com as medidas do protótipo.
 */
import { readFileSync } from "node:fs";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/components/shell/CommandPalette", () => ({ CommandPalette: () => null }));

import { FiltrosDaInboxNoCelular } from "@/components/mobile/telas/Conversas";

const ABAS = [
  { value: "unassigned" as const, label: "Fila", count: 3 },
  { value: "mine" as const, label: "Minhas", count: 0 },
  { value: "all" as const, label: "Todas", count: 12 },
  { value: "ai" as const, label: "Com a IA", count: 2 },
  { value: "closed" as const, label: "Fechadas", count: 40 },
  { value: "archived" as const, label: "Arquivadas", count: 5 },
];

function montar(tab: (typeof ABAS)[number]["value"] = "unassigned", semPasso = false) {
  const onTab = vi.fn();
  const onSemPasso = vi.fn();
  render(
    <FiltrosDaInboxNoCelular
      tab={tab}
      semPasso={semPasso}
      abas={ABAS}
      onTab={onTab}
      onSemPasso={onSemPasso}
      filtro={<button type="button">Filtros</button>}
      chipsAtivos={null}
    />,
  );
  return { onTab, onSemPasso };
}

describe("topo da lista no celular", () => {
  it("campo de busca e chips na ordem do protótipo, com contagem (zero não aparece)", () => {
    montar();
    expect(screen.getByRole("button", { name: "Buscar contato, conversa ou lead" })).toBeInTheDocument();
    const grupo = screen.getByRole("group", { name: "Filtrar conversas" });
    const nomes = [...grupo.querySelectorAll("button")].map((b) => b.textContent);
    expect(nomes).toEqual(["Filtros", "Fila3", "Minhas", "Todas12", "Com a IA2", "Sem próximo passo"]);
    expect(screen.getByRole("button", { name: "Fila3" })).toHaveAttribute("aria-pressed", "true");
  });

  it("chip troca a aba; Sem próximo passo liga o filtro", () => {
    const { onTab, onSemPasso } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Com a IA2" }));
    expect(onTab).toHaveBeenCalledWith("ai");
    fireEvent.click(screen.getByRole("button", { name: "Sem próximo passo" }));
    expect(onSemPasso).toHaveBeenCalledWith(true);
  });

  it("Fechadas e Arquivadas são linhas com contagem; a subtela tem voltar", () => {
    const { onTab } = montar();
    fireEvent.click(screen.getByRole("button", { name: /Fechadas.*40/ }));
    expect(onTab).toHaveBeenCalledWith("closed");
  });

  it("na subtela: título e voltar para Conversas, sem chips", () => {
    const { onTab } = montar("archived");
    expect(screen.getByRole("heading", { name: "Arquivadas" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Filtrar conversas" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Conversas" }));
    expect(onTab).toHaveBeenCalledWith("unassigned");
  });
});

describe("linha da conversa no celular", () => {
  it("a linha da Inbox usa as medidas do protótipo só abaixo de 760px", () => {
    const fonte = readFileSync("components/inbox/ConversationListItem.tsx", "utf8");
    for (const parte of ["NO_CELULAR.grade", "NO_CELULAR.avatar", "NO_CELULAR.nome", "NO_CELULAR.previa"]) {
      expect(fonte).toContain(parte);
    }
    const classes = readFileSync("components/mobile/telas/LinhaDaConversa.tsx", "utf8");
    for (const c of classes.match(/"[^"]+"/g) ?? []) {
      for (const classe of c.slice(1, -1).split(" ")) expect(classe.startsWith("mb:"), classe).toBe(true);
    }
  });
});
