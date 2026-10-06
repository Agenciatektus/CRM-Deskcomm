/**
 * A trilha "Grupo › Página" do cabeçalho.
 *
 * Com a barra em duas colunas, a coluna pode estar mostrando outro grupo (ou nem
 * aparecer, recolhida); a trilha é o lugar fixo que diz onde a pessoa está. O
 * que se prende aqui é que ela sai do REGISTRO, pelo mesmo critério da barra.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { TopBar } from "@/components/shell/TopBar";

let caminho = "/app/inbox";
vi.mock("next/navigation", () => ({ usePathname: () => caminho }));
// O resto do cabeçalho busca dado do servidor e não é o objeto destes casos.
vi.mock("@/components/shell/AlertsBell", () => ({ AlertsBell: () => null }));
vi.mock("@/components/shell/AvisoDePropostaEmDestaque", () => ({
  AvisoDePropostaEmDestaque: () => null,
}));
vi.mock("@/components/shell/MobileSidebar", () => ({ MobileSidebar: () => null }));
vi.mock("@/components/shell/TenantSwitcher", () => ({ TenantSwitcher: () => null }));
vi.mock("@/components/shell/UserMenu", () => ({ UserMenu: () => null }));
vi.mock("@/components/shell/SearchTrigger", () => ({ SearchTrigger: () => null }));

afterEach(() => {
  caminho = "/app/inbox";
  cleanup();
});

const trilha = () => screen.queryByRole("navigation", { name: "Onde você está" });

describe("a trilha do cabeçalho", () => {
  it("diz o grupo e a página da rota", () => {
    render(<TopBar />);
    const nav = trilha();
    expect(nav).not.toBeNull();
    const itens = within(nav!).getAllByRole("listitem").map((li) => li.textContent?.trim());
    // O separador "›" é aria-hidden: o leitor de tela ouve só grupo e página.
    expect(itens).toEqual(["Atendimento", "Inbox"]);
    expect(within(nav!).getByText("Inbox")).toHaveAttribute("aria-current", "page");
  });

  it("usa o destino mais longo: Evolução da IA é Análise, não Agentes", () => {
    caminho = "/app/ai/evolution";
    render(<TopBar />);
    expect(trilha()).toHaveTextContent("Análise›Evolução da IA");
  });

  it("dentro de uma tela, aponta a tela que a contém", () => {
    caminho = "/app/ai/cases/123";
    render(<TopBar />);
    expect(trilha()).toHaveTextContent("Agentes›Casos");
  });

  it("sem destino que case, não há trilha", () => {
    // O quadro de um funil não é destino fixo; inventar rótulo ali seria dizer o
    // nome de uma tela que o registro não conhece.
    caminho = "/app/pipelines/cb884866-edad-415e-a99f-0cb461e2933a";
    render(<TopBar />);
    expect(trilha()).toBeNull();
  });

  it("some abaixo de md, onde o cabeçalho disputa espaço com a busca", () => {
    render(<TopBar />);
    expect(trilha()?.className).toMatch(/\bhidden\b/);
    expect(trilha()?.className).toMatch(/\bmd:block\b/);
  });
});
